import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix

# Updated ground truth and predicted severity values
ground_truth_severity_updated = [4, 4, 4, 4, 4, 4, 1, 4, 4, 1]
predicted_severity_updated = [2, 4, 2, 4, 4, 2, 2, 4, 4, 2]

# Generate the confusion matrix with updated values
severity_labels = [1, 2, 4]  # Mild (1), Moderate (2), Severe (4)
conf_matrix_updated = confusion_matrix(ground_truth_severity_updated, predicted_severity_updated, labels=severity_labels)

# Plotting the updated confusion matrix with percentages
plt.figure(figsize=(8, 6))
sns.heatmap(conf_matrix_updated, annot=False, fmt='d', cmap='coolwarm', xticklabels=['Mild', 'Moderate', 'Severe'], 
            yticklabels=['Mild', 'Moderate', 'Severe'], cbar_kws={'label': 'Count'})
plt.xlabel("Model-Predicted Severity")
plt.ylabel("Actual Severity")
plt.title("Enhanced Confusion Matrix of Severity Classification")

# Add counts and percentages to each cell separately
total_counts = np.sum(conf_matrix_updated)
for i in range(conf_matrix_updated.shape[0]):
    for j in range(conf_matrix_updated.shape[1]):
        count = conf_matrix_updated[i, j]
        percentage = (count / total_counts) * 100 if total_counts > 0 else 0
        plt.text(j + 0.5, i + 0.5, f"{count}\n{percentage:.1f}%", 
                 ha='center', va='center', color="black")

plt.tight_layout()
plt.show()
