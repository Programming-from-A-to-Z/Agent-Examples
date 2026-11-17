// Programming from A to Z
// https://github.com/Programming-from-A-to-Z/A2Z-F26

// The same server as Ollama-Examples: it passes chat requests from the
// p5.js sketch in public/ along to Ollama. The agent loop is in the sketch.

import express from 'express';
import { Ollama } from 'ollama';

// you can connect to an external Ollama instance or your local one
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

app.post('/api/chat', async (request, response) => {
  // The browser sends everything Ollama needs (model, messages, tools, etc.)
  const reply = await ollama.chat(request.body);
  response.json(reply);
});

app.listen(3001, () => {
  console.log('http://localhost:3001');
});
