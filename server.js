const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const fetch = require('node-fetch');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const upload = multer({ dest: 'uploads/' });

if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) {
  console.error('API keys are not set in environment variables');
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.static('public'));
app.use('/generated', express.static(path.join(__dirname, 'generated')));

const tasks = new Map();

io.on('connection', (socket) => {
  console.log('User connected');
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

function sendStatusUpdate(taskId, message) {
  console.log(`[${taskId}] ${message}`);
  io.emit('statusUpdate', { taskId, message });
}

app.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    sendStatusUpdate('', 'Starting upload processing');
    if (!req.file) {
      throw new Error('File was not uploaded');
    }
    const taskId = uuidv4();
    const style = req.body.style || 'normal';
    tasks.set(taskId, { status: 'processing', style });
    res.json({ taskId });
    sendStatusUpdate(taskId, 'Task created, starting processing');
    processImageAsync(taskId, req.file.path, style);
  } catch (error) {
    console.error('Upload processing error:', error);
    res.status(400).json({ error: error.message });
  }
});

async function processImageAsync(taskId, imagePath, style) {
  try {
    sendStatusUpdate(taskId, `Starting image processing, style: ${style}`);
    
    tasks.set(taskId, { status: 'analyzing', progress: 25 });
    io.emit('taskUpdate', { taskId, status: 'analyzing', progress: 25 });
    
    let processedImageUrl = '';
    if (style === 'picasso') {
      sendStatusUpdate(taskId, 'Applying Picasso style...');
      processedImageUrl = await applyPicassoStyle(imagePath, taskId);
      tasks.set(taskId, { status: 'applying style', progress: 75 });
      io.emit('taskUpdate', { taskId, status: 'applying style', progress: 75 });
    }
    
    sendStatusUpdate(taskId, 'Processing completed');
    tasks.set(taskId, { status: 'completed' });
    io.emit('taskUpdate', { taskId, status: 'completed' });
    io.emit('cardGenerated', { taskId, cardUrl: processedImageUrl });
  } catch (error) {
    console.error(`Error processing image for task ${taskId}:`, error);
    tasks.set(taskId, { status: 'error', error: error.message });
    io.emit('taskUpdate', { taskId, status: 'error', error: error.message });
    sendStatusUpdate(taskId, `Error: ${error.message}`);
  } finally {
    try {
      await fs.unlink(imagePath);
      sendStatusUpdate(taskId, `Temporary file ${imagePath} deleted`);
    } catch (unlinkError) {
      console.error('Error deleting temporary file:', unlinkError);
    }
  }
}

async function applyPicassoStyle(imagePath, taskId) {
  try {
    sendStatusUpdate(taskId, 'Starting Picasso style application');
    
    sendStatusUpdate(taskId, 'Processing image');
    const imageBuffer = await sharp(imagePath)
      .jpeg()
      .toBuffer();
    
    const base64Image = imageBuffer.toString('base64');
    sendStatusUpdate(taskId, 'Image converted to base64');

    sendStatusUpdate(taskId, 'Starting analysis with Anthropic');
    const analysisMessage = await anthropic.beta.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Image
              }
            },
            {
              type: "text",
              text: "Analyze this image and describe its key elements and overall composition. Focus on aspects that would be important to recreate in a Picasso-style painting."
            }
          ]
        }
      ]
    });

    sendStatusUpdate(taskId, 'Anthropic analysis completed, creating prompt for OpenAI');
    const imageAnalysis = analysisMessage.content[0].text;

    const imagePrompt = `Create a new image in the style of Pablo Picasso based on the following description: ${imageAnalysis}. 
    The image should incorporate cubist elements and bold, abstract shapes typical of Picasso's style.`;

    sendStatusUpdate(taskId, 'Starting image generation with OpenAI');
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
    });

    const picassoImageUrl = imageResponse.data[0].url;
    const picassoImageBuffer = await downloadImage(picassoImageUrl);

    const generatedDir = path.join(__dirname, 'generated');
    await fs.mkdir(generatedDir, { recursive: true });
    
    const outputFileName = `${taskId}-picasso.png`;
    const outputPath = path.join(generatedDir, outputFileName);
    await fs.writeFile(outputPath, picassoImageBuffer);
    
    sendStatusUpdate(taskId, `Picasso style successfully applied, file saved: ${outputPath}`);
    return `/generated/${outputFileName}`;
  } catch (error) {
    sendStatusUpdate(taskId, `Error applying Picasso style: ${error.message}`);
    throw error;
  }
}

async function downloadImage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error downloading image:', error);
    throw error;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
