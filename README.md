# LLM-based Real-Time Speech Reconstruction and Call Prioritization for Emergency Services

## Overview

This system aims to enhance emergency communication systems by improving response times, handling fragmented speech, overcoming language barriers, and prioritizing high-risk situations using automated speech recognition (ASR), translation, and Retrieval-Augmented Generation (RAG).

## Components

### 1. Data Loading and Preprocessing

- Loads emergency call transcripts from a CSV file and prepares them for TF-IDF vectorization.

### 2. Retrieval-Augmented Generation (RAG)

- Converts text data into TF-IDF embeddings for similarity matching.
- Uses FAISS for efficient retrieval and GPT-3 to generate responses.

### 3. Severity Classification

- Classifies severity based on keywords as **Mild**, **Moderate**, or **Severe**.

### 4. Evaluation Metrics

- Uses **BLEU** and **ROUGE** scores to evaluate the generated response.

## Steps to Compile the Code

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Up Environment Variables

Create a `.env` file with:

```dotenv
OPENAI_API_KEY=your_openai_api_key
GOOGLE_APPLICATION_CREDENTIALS=path_to_your_google_credentials_json
GOOGLE_PROJECT_ID=your_google_project_id
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
NGROK_AUTH_TOKEN=your_ngrok_auth_token
```

### 3. Prepare the Dataset

Ensure `emergency.csv` is in the project directory.

## Usage

### 1. Run the Flask API

```bash
python openairag.py
```

The API will start on `http://localhost:5001`.

### 2. Run the Node.js Server

```bash
node serverclassify.js
```

### 3. Expose the Local Server with ngrok

```bash
ngrok http 3000
```

Use the provided ngrok URL to set up the Twilio webhook for real-time interaction.

### 4. Interact with the System

Call the configured Twilio number. The call will be transcribed, translated if necessary, and sent to the Flask API at `http://localhost:5001/generate` to receive the response, severity classification, and evaluation metrics.

## Features Overview

- **Real-Time Transcription**: Supports live transcription using Twilio and Google Cloud Speech API.
- **Multilingual Support**: Recognizes and translates multiple languages to English.
- **Contextual Response Generation**: Uses RAG and GPT-3 for relevant responses.
- **Severity Detection**: Supports emergency prioritization based on severity.

