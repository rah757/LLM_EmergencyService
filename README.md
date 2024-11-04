Components
1. Data Loading and Preprocessing
load_csv_data: Loads the emergency call transcripts and combines each row into a single text for TF-IDF vectorization.
2. Retrieval-Augmented Generation (RAG)
TF-IDF Embedding: Converts text data into TF-IDF embeddings for similarity matching.
FAISS Indexing: Builds a FAISS index for efficient retrieval.
Contextual Retrieval: Finds the top relevant entries based on similarity to the input transcript.
GPT-3 Query: Generates a predicted response using retrieved context and GPT-3.
3. Severity Classification
Keyword-Based Classification: Determines severity based on keywords like "fire," "gun," or "pet" to classify the transcript as Mild, Moderate, or Severe.
4. Evaluation Metrics
BLEU Score: Measures similarity between the generated response and the actual transcript.
ROUGE Score: Measures recall and overlap of phrases in the generated response versus the actual transcript.


Steps to compile the code 

Install the required dependencies:

Set up OpenAI API key:

Create a .env file in the root directory.
Add your OpenAI API key:

OPENAI_API_KEY=your_openai_api_key
Download or prepare the dataset:

Ensure you have the emergency.csv dataset file in the project directory.
Usage
Run the Flask API:
python calrag.py
The API will start on http://localhost:5001.
Interact with the system:

Send a POST request with a transcript to http://localhost:5001/generate to get the generated response, severity classification, and evaluation metrics.




