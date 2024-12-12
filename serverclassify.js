import express from 'express';
import pkg from 'ws';
import { SpeechClient } from '@google-cloud/speech';
import { TranslationServiceClient } from '@google-cloud/translate';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import axios from 'axios';
import dotenv from 'dotenv';
import record from 'node-record-lpcm16';

dotenv.config();

process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Initialize Google Cloud Speech Client
const speechClient = new SpeechClient();

// Initialize Google Cloud Translation Client
const translateClient = new TranslationServiceClient();

const ttsClient = new TextToSpeechClient();

// to ensure dispatcher terminal gets launched only once
let isDispatcherTerminalLaunched = false;
// to detect caller language and further send to the dispatcher terminal
let detectedCallerLanguage = null;

// Track active call information
let activeCallSid = null;
let activeWebSocket = null;

// Set up Express server
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// add dispatcher response
app.post('/dispatcher-response', async (req, res) => {
  console.log('Received dispatcher response:', req.body);
  
  if (!req.body || !req.body.text) {
    console.error('Invalid request body received');
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { text, language, callSid } = req.body;
  console.log('\n--- Processing Dispatcher Response ---');
  console.log('Received text:', text);
  console.log('Language:', language);
  console.log('Call SID:', callSid);

  try {
    // Convert to speech
    const [ttsResponse] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode: language, ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'MP3' },
    });
    
    console.log('Text-to-Speech conversion completed');

    // Send audio response through the active WebSocket connection
    if (activeWebSocket) {
      activeWebSocket.send(JSON.stringify({
        event: 'dispatcher_audio',
        audio: ttsResponse.audioContent.toString('base64')
      }));
      console.log('Audio sent through WebSocket');
    } else {
      console.log('No active WebSocket connection found');
    }

    res.json({ success: true, message: 'Audio processed successfully' });
    console.log('Response sent successfully');
    console.log('-----------------------------------\n');

  } catch (error) {
    console.error('Error processing dispatcher response:', error);
    console.log('Error details:', error.message);
    console.log('-----------------------------------\n');
    res.status(500).json({ 
      error: 'Failed to process dispatcher response',
      details: error.message 
    });
  }
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
  
  // Store the active WebSocket connection
  activeWebSocket = webSocket;

  let speechStream;

  const request = {
    config: {
      encoding: 'MULAW',
      sampleRateHertz: 8000,
      languageCode: 'en-US',
      useEnhanced: true,
      enableAutomaticPunctuation: true,
      alternativeLanguageCodes: ['hi-IN', 'es-ES', 'fr-FR', 'de-DE'],
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
        console.log('Speech recognition language:', result.languageCode);
        console.log('Final Transcription:', result.alternatives[0].transcript);

        // Store the detected language and launch dispatcher terminal only once
        if (!isDispatcherTerminalLaunched) {
          detectedCallerLanguage = result.languageCode;
          try {
            const { spawn } = await import('child_process');
            console.log('Starting dispatcher terminal...');
            console.log(`Caller's detected language: ${detectedCallerLanguage}`);
            
            // Get the current directory path
            const currentDir = process.cwd();

            // spawn the terminal with specific commands and pass Call SID
            const terminal = spawn('osascript', [
              '-e', 
              `tell app "Terminal" to do script "cd '${currentDir}' && source emergencyenv/bin/activate && CALLER_LANGUAGE=${detectedCallerLanguage} CALL_SID=${activeCallSid} node dispatcher.js"`
            ]);

            isDispatcherTerminalLaunched = true;
            console.log('Dispatcher terminal launched successfully');

            terminal.on('error', (err) => {
              console.error('Failed to start dispatcher terminal:', err);
            });

          } catch (error) {
            console.error('Error launching dispatcher terminal:', error);
          }
        }

        // Handle translation and RAG processing
        if (result.languageCode !== 'en-us') {
          try {
            // Translate non-English speech to English
            const [translation] = await translateClient.translateText({
              parent: `projects/${process.env.GOOGLE_PROJECT_ID}/locations/global`,
              contents: [result.alternatives[0].transcript],
              mimeType: 'text/plain',
              sourceLanguageCode: result.languageCode,
              targetLanguageCode: 'en',
            });
            const translatedText = translation.translations[0].translatedText;
            console.log('Translated Text:', translatedText);

            // Process with RAG system
            const response = await axios.post('http://localhost:5001/generate', {
              transcript: translatedText,
            });
            console.log('Response from RAG:', response.data.response);
            console.log('Severity Classification:', response.data.severity);

          } catch (error) {
            console.error('Error in translation or RAG processing:', error);
          }
        } else {
          // Process English speech directly
          try {
            const response = await axios.post('http://localhost:5001/generate', {
              transcript: result.alternatives[0].transcript,
            });
            console.log('Response from RAG:', response.data.response);
            console.log('Severity Classification:', response.data.severity);
          } catch (error) {
            console.error('Error in RAG processing:', error);
          }
        }
      } else {
        // Handle interim results
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
        activeCallSid = msg.streamSid;  // Store the Call SID
        console.info('Twilio media stream connected');
        console.info('Call SID:', activeCallSid);
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
    if (activeWebSocket === webSocket) {
      activeWebSocket = null;
      activeCallSid = null;
    }
    console.log('Twilio media stream WebSocket disconnected');
  });
});
