import matplotlib.pyplot as plt
import numpy as np

# Test cases
test_cases = [
    "Heart Attack", "Acid Attack", "Leg Broken", "Smoke", 
    "Noise Neighbor", "Cat Ran Away", "Lost Bicycle", "Dog Barking", "Gun Shot"
]

# BLEU scores
bleu_scores = [
    0.0109, 0.0083, 0.0083, 0.0123, 0.1619, 0.0607, 0.0033, 0, 0.0109
]

# ROUGE Precision (using one of the two values from provided data)
rouge_precision = [
    0.2857, 0.1304, 0.1304, 0.1875, 0.55, 0.3889, 0.0615, 0.2308, 0.2609
]

# Create a bar plot for BLEU and ROUGE Precision scores
fig, ax = plt.subplots(figsize=(10, 6))

bar_width = 0.35
index = np.arange(len(test_cases))

# Plot BLEU scores
bar1 = ax.bar(index, bleu_scores, bar_width, label='BLEU Score')

# Plot ROUGE Precision scores
bar2 = ax.bar(index + bar_width, rouge_precision, bar_width, label='ROUGE Precision')

# Add labels, title, and legend
ax.set_xlabel('Test Cases')
ax.set_ylabel('Scores')
ax.set_title('BLEU and ROUGE Precision Scores by Test Case')
ax.set_xticks(index + bar_width / 2)
ax.set_xticklabels(test_cases, rotation=45, ha='right')
ax.legend()

# Display the plot
plt.tight_layout()
plt.show()
