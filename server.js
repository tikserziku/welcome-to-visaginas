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

if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY || !process.env.FACEBOOK_APP_ID) {
  console.error('API keys or Facebook App ID are not set in environment variables');
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

app.get('/facebook-app-id', (req, res) => {
  res.json({ appId: process.env.FACEBOOK_APP_ID });
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

async function applyPicassoStyle(imagePath, taskId) {
  // Здесь должна быть реализация применения стиля Пикассо
  // Это может включать вызов API Anthropic или OpenAI
  // Для примера, мы просто возвращаем путь к исходному изображению
  return imagePath;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
