import { createServer } from 'http';
import express from 'express';
import pkg from 'ws';
import 'dotenv/config';
import * as assemblyai from 'assemblyai'; 
import axios from 'axios'; 

const { RealtimeTranscriber } = assemblyai;
const { Server: WebSocketServer } = pkg;

const app = express();
const server = createServer(app);

app.get('/', (_, res) => res.type('text').send('Twilio media stream transcriber'));

app.post('/', async (req, res) => {
  res.type('xml').send(
    `<Response>
        <Say>Speak to see your audio transcribed in the console.</Say>
        <Connect>
          <Stream url='wss://${req.headers.host}' />
        </Connect>
      </Response>`
  );
});

console.log('Listening on port 3000');

const wss = new WebSocketServer({ server });

wss.on('connection', async (ws) => {
  console.log('Twilio media stream WebSocket connected');

  const transcriber = new RealtimeTranscriber({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
    encoding: "pcm_mulaw",
    sampleRate: 8000,
  });

  transcriber.on("open", ({ sessionId, expiresAt }) => {
    console.log('Session ID:', sessionId, 'Expires at:', expiresAt);
  });

  transcriber.on("close", (code, reason) => {
    console.log('Closed', code, reason);
  });

  transcriber.on("transcript.partial", (transcript) => {
    console.log('Partial transcript:', transcript.text);
  });

  transcriber.on("transcript.final", async (transcript) => {
    console.log('Final transcript:', transcript.text);

    try {
      // Send final transcript to Flask API for RAG completion
      const response = await axios.post('http://localhost:5001/generate', {
        transcript: transcript.text  
      });
      
      console.log('Response from RAG:', response.data.completion);
    } catch (error) {
      console.error('Error sending transcript to RAG:', error);
    }
  });

  transcriber.on("error", (error) => {
    console.error('Error', error);
  });

  await transcriber.connect();

  ws.on('message', async (message) => {
    const msg = JSON.parse(message);
    switch (msg.event) {
      case 'connected':
        console.info('Twilio media stream connected');
        break;
      case 'start':
        console.info('Twilio media stream started');
        break;
      case 'media':
        const audioChunk = Buffer.from(msg.media.payload, 'base64');
        transcriber.sendAudio(audioChunk);
        break;
      case 'stop':
        console.info('Twilio media stream stopped');
        break;
    }
  });

  ws.on('close', async () => {
    console.log('Twilio media stream WebSocket disconnected');
    await transcriber.close();
  });
});

server.listen(3000);
