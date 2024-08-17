const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
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

app.use(express.static('public'));
app.use('/generated', express.static(path.join(__dirname, 'generated')));

if (!process.env.OPENAI_API_KEY) {
  console.error('API keys are not set in environment variables');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tasks = new Map();
let totalGeneratedImages = 0;

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
    const style = 'watercolor'; // Устанавливаем стиль акварель по умолчанию
    tasks.set(taskId, { status: 'processing', style });
    res.json({ taskId });
    sendStatusUpdate(taskId, 'Task created, starting processing');
    await processImageAsync(taskId, req.file.path, style);
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
    if (style === 'watercolor') {
      sendStatusUpdate(taskId, 'Applying Watercolor style...');
      processedImageUrl = await applyWatercolorStyle(imagePath, taskId);
      tasks.set(taskId, { status: 'applying style', progress: 75 });
      io.emit('taskUpdate', { taskId, status: 'applying style', progress: 75 });
      
      totalGeneratedImages++;
      io.emit('updateImageCount', totalGeneratedImages);
    }
    
    sendStatusUpdate(taskId, 'Processing completed');
    tasks.set(taskId, { status: 'completed', progress: 100 });
    io.emit('taskUpdate', { taskId, status: 'completed', progress: 100 });
    io.emit('cardGenerated', { taskId, cardUrl: processedImageUrl });
  } catch (error) {
    console.error(`Error processing image: ${error}`);
    tasks.set(taskId, { status: 'error', error: error.message });
    io.emit('taskUpdate', { taskId, status: 'error', error: error.message });
  }
}

async function applyWatercolorStyle(imagePath, taskId) {
  try {
    // Ensure 'generated' directory exists
    const generatedDir = path.join(__dirname, 'generated');
    if (!await fs.stat(generatedDir).catch(() => false)) {
      await fs.mkdir(generatedDir);
    }

    // Load image
    const imageBuffer = await sharp(imagePath).toBuffer();
    const base64Image = imageBuffer.toString('base64');

    // Create prompt for DALL-E to generate watercolor style image
    const dallePrompt = `Create a watercolor painting of the following image:`;

    // Send request to DALL-E
    const dalleResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: dallePrompt,
      n: 1,
      size: "1024x1024",
      image: base64Image,
    });

    // Get generated image URL
    const generatedImageUrl = dalleResponse.data[0].url;

    // Download generated image
    const generatedImageResponse = await fetch(generatedImageUrl);
    const generatedImageBuffer = await generatedImageResponse.buffer();

    // Save the generated image
    const outputPath = path.join(__dirname, 'generated', `${taskId}_watercolor.png`);
    await sharp(generatedImageBuffer).toFile(outputPath);

    return `/generated/${taskId}_watercolor.png`;
  } catch (error) {
    console.error('Error in applyWatercolorStyle:', error);
    throw error;
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
