import pandas as pd
import faiss
import openai
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Access the OpenAI API key from environment variables
openai_api_key = os.getenv('OPENAI_API_KEY')
openai.api_key = openai_api_key

# Load and Preprocess CSV Data
def load_csv_data(file_path):
    data = pd.read_csv(file_path)
    data['combined_text'] = data.apply(lambda row: ' '.join(row.values.astype(str)), axis=1)
    return data

# Create Embeddings for CSV Data Using TF-IDF
def create_embeddings(data):
    vectorizer = TfidfVectorizer()
    embeddings = vectorizer.fit_transform(data['combined_text']).toarray()
    return embeddings, vectorizer

# Build FAISS Index for Retrieval
def build_faiss_index(embeddings):
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    return index

# Retrieve Relevant Entries Based on a Query
def retrieve_entries(query, index, data, vectorizer, k=5):
    query_vec = vectorizer.transform([query]).toarray()
    _, indices = index.search(query_vec, k)
    
    # Ensure indices are treated as integers for indexing into the DataFrame
    retrieved_texts = data.iloc[indices[0].astype(int)]['combined_text'].tolist()  # Make sure data is a DataFrame
    return retrieved_texts

# Generate Completion Using OpenAI
# Generate Completion Using OpenAI
def chat_gpt(query, retrieved_texts):
    context = "\n".join(retrieved_texts)
    prompt = f"Context:\n{context}\n\nGiven the partial transcript: '{query}', predict what the speaker is most likely saying."
    print("Prompt for OpenAI:", prompt)  # Log the prompt being sent to OpenAI
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.7
        )
        
        # Additional logging to confirm the response structure
        print("Full response from OpenAI:", response)
        
        # Access the specific part of the response you need
        openai_response = response['choices'][0]['message']['content'].strip()
        print("Extracted OpenAI response:", openai_response)  # Ensure the response prints to the console
        return openai_response
        
    except Exception as e:
        print("Error in OpenAI API call:", e)  # Log any error with OpenAI API
        raise


# Load your CSV data (Make sure the file path is correct)
csv_file = 'emergency.csv'  # Example CSV file with text data
data = load_csv_data(csv_file)
embeddings, vectorizer = create_embeddings(data)
index = build_faiss_index(embeddings)

# Flask route to generate completion based on transcript
@app.route('/generate', methods=['POST'])
def generate():
    request_data = request.get_json()
    transcript = request_data.get('transcript', '')
    
    if transcript:
        # Step 1: Retrieve relevant texts using FAISS
        retrieved_texts = retrieve_entries(transcript, index, data, vectorizer)

        # Step 2: Generate a response using OpenAI
        response = chat_gpt(transcript, retrieved_texts)

        return jsonify({"completion": response})
    else:
        return jsonify({"error": "Transcript not provided"}), 400

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5001)
