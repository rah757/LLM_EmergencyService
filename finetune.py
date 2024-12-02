from transformers import RagTokenizer, RagRetriever, RagTokenForGeneration, Trainer, TrainingArguments
from datasets import load_dataset

def fine_tune_rag(train_file):
    model_name = "facebook/rag-token-base"
    
    # Load the RAG tokenizer
    tokenizer = RagTokenizer.from_pretrained(model_name)

    # Load the retriever with the saved dataset
    retriever = RagRetriever.from_pretrained(
        model_name, 
        index_name="custom", 
        passages_path="UpdatedDataset",  # Path to the saved dataset
        index_path="index2"  # Path to the saved Faiss index
    )
    
    # Load the RAG model with the retriever
    model = RagTokenForGeneration.from_pretrained(model_name, retriever=retriever)

    # Load your dataset
    dataset = load_dataset('csv', data_files={'train': train_file})['train']

    # Preprocess and tokenize the dataset
    def preprocess_function(examples):
        # Tokenize the inputs (Q) and the outputs (A)
        inputs = tokenizer(examples['Q'], truncation=True, padding="max_length", max_length=512)
        labels = tokenizer(examples['A'], truncation=True, padding="max_length", max_length=512)

        # Convert labels (targets) to the format that the model expects
        inputs['labels'] = labels['input_ids']

        return inputs

    tokenized_datasets = dataset.map(preprocess_function, batched=True)

    # Define training arguments
    training_args = TrainingArguments(
        output_dir="./results",
        per_device_train_batch_size=1,  # Adjust this for GPU memory
        num_train_epochs=3,  # Set the number of epochs
        save_steps=10_000,  # Adjust based on your dataset size
        save_total_limit=2,
        logging_dir='./logs',
        logging_steps=200,
    )

    # Set up the trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets,  # Use the processed dataset
        tokenizer=tokenizer.generator,  # Use BART's generator tokenizer
    )~

    # Start fine-tuning
    trainer.train()

    # Save the fine-tuned model and tokenizer
    model.save_pretrained("./fine-tuned-rag")
    tokenizer.save_pretrained("./fine-tuned-rag")

if __name__ == "__main__":
    fine_tune_rag("emergency.csv")
