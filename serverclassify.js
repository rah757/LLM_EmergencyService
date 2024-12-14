import express from 'express';
import pkg from 'ws';
const { Server } = pkg;
import { SpeechClient } from '@google-cloud/speech';
import { TranslationServiceClient } from '@google-cloud/translate';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import axios from 'axios';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { PassThrough } from 'stream';
import fs from 'fs';

dotenv.config();

process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Initialize clients
const speechClient = new SpeechClient();
const translateClient = new TranslationServiceClient();
const ttsClient = new TextToSpeechClient();

// Global state
let isDispatcherTerminalLaunched = false;
let detectedCallerLanguage = null;
let activeCallSid = null;
let activeWebSocket = null;
let streamSid = null;
let currentSoxProcess = null;
let stdinEnded = false;

// Set up Express server
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic endpoints
app.get('/', (req, res) => {
  res.send('Twilio media stream transcriber');
});

app.post('/', (req, res) => {
  res.type('xml').send(
    `<Response>
        <Say>Connection established.</Say>
        <Connect>
          <Stream url='wss://${req.headers.host}' />
        </Connect>
     </Response>`
  );
});


app.post('/dispatcher-response', async (req, res) => {
  console.log('Received dispatcher response:', req.body);

  if (!req.body?.text) {
    console.error('Invalid request body received');
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { text, language } = req.body;
  console.log('\n--- Processing Dispatcher Response ---');
  console.log('Received text:', text);
  console.log('Language:', language);

  try {
    // Step 1: Convert text to speech
    console.log('Starting text-to-speech conversion...');
    const [ttsResponse] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode: language, ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 16000 },
    });
    console.log('Text-to-speech conversion completed');
    const ttsBuffer = Buffer.from(ttsResponse.audioContent);
    console.log(`Total TTS buffer size: ${ttsBuffer.length} bytes`);

    // Step 2: Generate unique filenames
    const uniqueId = uuidv4(); // Generate a unique identifier
    const inputFilePath = `./input_${uniqueId}.raw`;
    const outputFilePath = `./output_${uniqueId}.wav`;

    // Step 3: Write TTS buffer to a file
    fs.writeFileSync(inputFilePath, ttsBuffer);
    console.log(`TTS buffer written to ${inputFilePath}`);

    // Step 4: Start SoX process
    console.log('Starting SoX process...');
    const soxProcess = spawn('sox', [
      '-t', 'raw', '-r', '16000', '-e', 'signed-integer', '-b', '16', '-c', '1', inputFilePath, // Input
      '-t', 'wav', '-r', '8000', '-e', 'u-law', '-b', '8', '-c', '1', '-' // Output as raw stream
    ]);

    // Handle SoX stdout: Send audio chunks to Twilio WebSocket
    soxProcess.stdout.on('data', (chunk) => {
      if (activeWebSocket && activeWebSocket.readyState === activeWebSocket.OPEN) {
        const payload = chunk.toString('base64'); // Convert audio chunk to base64
        const mediaMessage = {
          event: 'media',
          streamSid, // Ensure streamSid is correctly set
          media: { payload },
        };
        // console.log('Sending media message to Twilio:', JSON.stringify(mediaMessage));
        activeWebSocket.send(JSON.stringify(mediaMessage), (err) => {
          if (err) {
            console.error('WebSocket send error:', err);
          } else {
            console.log('Media message sent successfully.');
          }
        });
      } else {
        console.warn('WebSocket not open. Skipping chunk processing.');
      }
    });

    // Handle SoX process close
    soxProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Audio processing completed successfully.');
      } else {
        console.error(`SoX process exited with code ${code}`);
      }

      // Cleanup temporary files
      if (fs.existsSync(inputFilePath)) {
        fs.unlinkSync(inputFilePath);
      }
    });

    // Handle SoX errors
    soxProcess.stderr.on('data', (data) => {
      console.error('SoX stderr:', data.toString());
    });

    soxProcess.stdin.on('error', (error) => {
      console.error('SoX stdin error:', error.message);
    });

    res.json({ success: true, message: 'Audio is being streamed to Twilio.' });
  } catch (error) {
    console.error('Error processing dispatcher response:', error);
    res.status(500).json({ error: 'Failed to process response' });
  }
});

  
// Set up WebSocket server
const server = app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
const wss = new Server({ server });

wss.on('connection', (webSocket) => {
  console.log('Twilio media stream WebSocket connected');
  activeWebSocket = webSocket;

  let speechStream = speechClient.streamingRecognize({
    config: {
      encoding: 'MULAW',
      sampleRateHertz: 8000,
      languageCode: 'en-US',
      useEnhanced: true,
      enableAutomaticPunctuation: true,
      alternativeLanguageCodes: ['hi-IN', 'es-ES', 'fr-FR', 'de-DE'],
    },
    interimResults: true,
  });

  // Handle speech recognition
  speechStream.on('data', async (data) => {
    if (data.results?.[0]?.isFinal) {
      const result = data.results[0];
      const transcript = result.alternatives[0]?.transcript?.trim();
      console.log('Speech recognition language:', result.languageCode);
      console.log('Final Transcription:', transcript);

      if (!transcript) {
        console.warn('Empty transcription received, skipping processing.');
        return;
      }

      // Launch dispatcher if first message
      if (!isDispatcherTerminalLaunched) {
        detectedCallerLanguage = result.languageCode;
        try {
          const { spawn } = await import('child_process');
          console.log('Starting dispatcher terminal...');
          console.log(`Caller's language: ${detectedCallerLanguage}`);

          const currentDir = process.cwd();
          const terminal = spawn('osascript', [
            '-e',
            `tell app "Terminal" to do script "cd '${currentDir}' && source emergencyenv/bin/activate && CALLER_LANGUAGE=${detectedCallerLanguage} CALL_SID=${activeCallSid} node tdispatcher.js"`
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

      // Handle translation and RAG
      if (result.languageCode !== 'en-us') {
        try {
          console.log('Translating transcript...');
          const [translation] = await translateClient.translateText({
            parent: `projects/${process.env.GOOGLE_PROJECT_ID}/locations/global`,
            contents: [transcript],
            mimeType: 'text/plain',
            sourceLanguageCode: result.languageCode,
            targetLanguageCode: 'en',
          });

          const translatedText = translation.translations[0]?.translatedText;
          console.log('Translated Text:', translatedText);

          try {
            console.log('Sending transcript to RAG service...');
            const response = await axios.post('http://localhost:5001/generate', {
              transcript: translatedText,
            });
            console.log('RAG Response:', response.data.response);
            console.log('Severity:', response.data.severity);
          } catch (error) {
            console.log('RAG service not available - continuing without RAG processing');
          }
        } catch (error) {
          console.error('Translation error:', error);
        }
      } else {
        try {
          console.log('Sending transcript to RAG service...');
          const response = await axios.post('http://localhost:5001/generate', {
            transcript: transcript,
          });
          console.log('RAG Response:', response.data.response);
          console.log('Severity:', response.data.severity);
        } catch (error) {
          console.log('RAG service not available - continuing without RAG processing');
        }
      }
    }
  });

  // Handle incoming WebSocket messages
  webSocket.on('message', (message) => {
    // console.log('Received WebSocket message:', message);
    const msg = JSON.parse(message);
    switch (msg.event) {
      case 'connected':
        console.info('Twilio stream connected');
        break;
      case 'start':
        streamSid = msg.start.streamSid;
        activeCallSid = msg.start.callSid;
        console.info('Stream started. CallSid:', activeCallSid);
        break;
      case 'media':
        if (speechStream && !speechStream.destroyed) {
          try {
            // console.log('Received media message, writing to speech stream...');
            speechStream.write(Buffer.from(msg.media.payload, 'base64'));
          } catch (error) {
            console.error('Error processing audio:', error);
          }
        } else {
          console.warn('Speech stream not available, skipping media message');
        }
        break;
      case 'stop':
        console.info('Twilio stream stopped');
        break;
    }
  });

  // Handle WebSocket closure
  webSocket.on('close', (code, reason) => {
    console.log(`WebSocket connection closed by Twilio with code ${code} and reason: ${reason}`);
    if (speechStream) speechStream.end();
    console.log('WebSocket disconnected');
  });

  // Handle WebSocket errors
  webSocket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle WebSocket server errors
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Cleanup on process exit
process.on('SIGINT', () => {
  console.log('Received SIGINT, cleaning up...');
  if (currentSoxProcess) {
    currentSoxProcess.kill();
  }
  process.exit(0);
});