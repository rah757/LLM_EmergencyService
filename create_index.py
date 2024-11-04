from datasets import load_from_disk
from transformers import DPRQuestionEncoder, DPRQuestionEncoderTokenizer
import torch

# Load the dataset you saved earlier
dataset = load_from_disk("Dataset")  # Replace with your actual dataset path

# Load the same encoder model that RAG uses to generate embeddings
model_name = "facebook/dpr-question_encoder-single-nq-base"  # The encoder used by the RAG model
tokenizer = DPRQuestionEncoderTokenizer.from_pretrained(model_name)
model = DPRQuestionEncoder.from_pretrained(model_name)

# Function to generate embeddings for a given text
def embed_text(texts):
    inputs = tokenizer(texts, padding=True, truncation=True, return_tensors="pt")
    with torch.no_grad():
        embeddings = model(**inputs).pooler_output  # Use pooler_output to get sentence embeddings
    return embeddings

# Generate embeddings for the 'A' column
embeddings = []
for example in dataset['A']:  # 'A' column contains text data
    embedding = embed_text([example]).squeeze(0).numpy().tolist()  # Flatten each embedding and convert to list
    embeddings.append(embedding)

# Rename the columns to match the expected format
dataset = dataset.rename_column("Q", "title")  # Rename 'Q' to 'title'
dataset = dataset.rename_column("A", "text")   # Rename 'A' to 'text'

# Add the embeddings as a new column in the dataset
dataset = dataset.add_column("embeddings", embeddings)

# Add a Faiss index based on the new embeddings column
dataset.add_faiss_index(column="embeddings")

# Save the Faiss 5
dataset.get_index("embeddings").save("index2")  # Save the index to disk

# Drop the Faiss index before saving the dataset itself
dataset.drop_index("embeddings")  # No need to reassign, drop_index works in-place

# Now save the dataset without the index to a new directory
dataset.save_to_disk("UpdatedDataset")  # Save the updated dataset to a different directory
