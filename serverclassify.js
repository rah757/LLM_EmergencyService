import express from 'express';
import pkg from 'ws';
import { SpeechClient } from '@google-cloud/speech';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Explicitly set the Google credentials path
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Initialize Google Cloud Speech Client
const speechClient = new SpeechClient();

// Set up Express server
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Twilio media stream transcriber');
});

app.post('/', (req, res) => {
  res.type('xml').send(
    `<Response>
        <Say>
          Speak to see your audio transcribed in the console.
        </Say>
        <Connect>
          <Stream url='wss://${req.headers.host}' />
        </Connect>
      </Response>`
  );
});

console.log('Listening on port 3000');

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

// Set up WebSocket server
const { Server } = pkg;
const wss = new Server({ server });

wss.on('connection', (webSocket) => {
  console.log('Twilio media stream WebSocket connected');

  let speechStream;

  // Configuration for Google Cloud Speech API
  const request = {
    config: {
      encoding: 'MULAW',
      sampleRateHertz: 8000, 
      languageCode: 'hi-IN',
      alternativeLanguageCodes: ['en-US', 'ml-IN'], // List of alternative language codes
    },
    interimResults: true, 
  };

  // Initialize the Google Speech Stream
  speechStream = speechClient.streamingRecognize(request);

  // Handle responses from Google Speech API
  speechStream.on('data', async (data) => {
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      if (result.isFinal) {
        console.log('Final Transcription:', result.alternatives[0].transcript);
        try {
          // Send the final transcript to the Python Flask API for RAG and classification
          const response = await axios.post('http://localhost:5001/generate', {
            transcript: result.alternatives[0].transcript  // Sending the final transcript as payload
          });
          
          // Log the response from the RAG model and severity classification
          console.log('Response from RAG:', response.data.response);
          console.log('Severity Classification:', response.data.severity);
        } catch (error) {
          console.error('Error sending transcript to RAG:', error);
        }
      } else {
        console.log('Interim Transcription:', result.alternatives[0].transcript);
      }
    } else {
      console.log('No transcription result received');
    }
  });

  speechStream.on('error', (err) => {
    console.error('Google Speech API Stream Error:', err);
    speechStream.end();
  });

  speechStream.on('end', () => {
    console.log('Google Speech API Stream ended');
  });

  // Handle incoming WebSocket messages
  webSocket.on('message', (message) => {
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
        if (speechStream && !speechStream.destroyed) {
          try {
            speechStream.write(audioChunk);
          } catch (error) {
            console.error('Error writing to Google Speech API Stream:', error);
          }
        }
        break;
      case 'stop':
        console.info('Twilio media stream stopped');
        break;
    }
  });

  // Handle WebSocket close event
  webSocket.on('close', () => {
    if (speechStream) {
      speechStream.end();
    }
    console.log('Twilio media stream WebSocket disconnected');
  });
});
