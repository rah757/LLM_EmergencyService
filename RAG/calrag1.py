import pandas as pd
import faiss
import openai
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from flask import Flask, request, jsonify
from flask_cors import CORS
from rouge_score import rouge_scorer
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

openai.api_key = os.getenv('OPENAI_API_KEY')

# Load and preprocess CSV data
def load_csv_data(file_path):
    data = pd.read_csv(file_path)
    data['combined_text'] = data.apply(lambda row: ' '.join(row.values.astype(str)), axis=1)
    return data

# Create TF-IDF embeddings
def create_embeddings(data):
    vectorizer = TfidfVectorizer()
    embeddings = vectorizer.fit_transform(data['combined_text']).toarray()
    return embeddings, vectorizer

# Build FAISS index
def build_faiss_index(embeddings):
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    return index

# Retrieve the closest entries based on the query
def retrieve_entries(query, index, data, vectorizer, k=5):
    query_vec = vectorizer.transform([query]).toarray()
    _, indices = index.search(query_vec, k)
    retrieved_texts = data.iloc[indices[0].astype(int)]['combined_text'].tolist()
    return retrieved_texts

# Query the GPT-3 model with the retrieved context
def chat_gpt(query, retrieved_texts):
    context = "\n".join(retrieved_texts)
    prompt = f"Context:\n{context}\n\nGiven the partial transcript: '{query}', predict what the speaker is most likely saying."
    
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=150,
        temperature=0.7
    )
    
    return response.choices[0]['message']['content'].strip()

# Calculate BLEU score with smoothing for short sentences
def calculate_bleu(reference, hypothesis):
    smoothie = SmoothingFunction().method1
    bleu = sentence_bleu([reference.split()], hypothesis.split(), smoothing_function=smoothie)
    print(f"BLEU score: {bleu}")  # Debug print statement
    return bleu

# Calculate ROUGE scores for evaluation
def calculate_rouge(reference, hypothesis):
    scorer = rouge_scorer.RougeScorer(['rouge1', 'rougeL'], use_stemmer=True)
    scores = scorer.score(reference, hypothesis)
    print(f"ROUGE scores: {scores}")  # Debug print statement
    return scores

# Severity classification based on keywords
def classify_severity(transcript):
    severe_keywords = ['gun', 'stabbing', 'shooting', 'fire', 'accident', 'emergency', 'death', 'killed','acid','attack','burning','bleeding','smoke','gunshot']
    mild_keywords = ['noise', 'neighbor', 'pet', 'minor','stole','disturbing','ranaway']

    transcript_lower = transcript.lower()

    # Check for severe keywords
    if any(keyword in transcript_lower for keyword in severe_keywords):
        print(f"Severity Level: 4 (Severe)")  # Debug print statement
        return 4  # Severe emergency

    # Check for mild keywords
    if any(keyword in transcript_lower for keyword in mild_keywords):
        print(f"Severity Level: 1 (Mild)")  # Debug print statement
        return 1  # Mild emergency

    # Default to moderate severity
    print(f"Severity Level: 2 (Moderate)")  # Debug print statement
    return 2  # Moderate emergency

# Load CSV, create embeddings, and build the FAISS index
csv_file = 'emergency.csv'
data = load_csv_data(csv_file)
embeddings, vectorizer = create_embeddings(data)
index = build_faiss_index(embeddings)

# API route to process the transcript, classify severity, and generate completion
@app.route('/generate', methods=['POST'])
def generate():
    request_data = request.get_json()
    transcript = request_data.get('transcript', '')

    if transcript:
        # Retrieve entries using FAISS
        retrieved_texts = retrieve_entries(transcript, index, data, vectorizer)
        
        # Generate a response from GPT-3
        response = chat_gpt(transcript, retrieved_texts)
        
        # Calculate BLEU and ROUGE scores
        bleu_score = calculate_bleu(transcript, response)
        rouge_scores = calculate_rouge(transcript, response)
        
        # Classify severity based on the transcript
        severity = classify_severity(transcript)
        
        # Return the GPT-3 response along with the evaluation scores and severity
        return jsonify({
            "completion": response,
            "bleu_score": bleu_score,
            "rouge_scores": {
                "rouge1": rouge_scores['rouge1'].fmeasure,
                "rougeL": rouge_scores['rougeL'].fmeasure
            },
            "severity_level": severity
        })
    else:
        return jsonify({"error": "Transcript not provided"}), 400

# Start the Flask app
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5001)
