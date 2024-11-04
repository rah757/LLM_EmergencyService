import matplotlib.pyplot as plt
import numpy as np

# Data for each test case
test_cases = [
    "Somebody into my house",
    "Someone took my son",
    "Missing after morning run",
    "Need ambulance, not responding",
    "Lady bleeding on street",
    "Back pain, not moving",
    "Mother fell down",
    "Neighbor with gunshot",
    "Kidnapped in car",
    "Dog hurt, unable to help"
]

# Recall values (from provided ROUGE scores)
recall_values = [1.0, 0.8571, 0.4286, 0.7778, 0.5385, 1.0, 0.2857, 1.0, 0.875, 1.0]

# F1 Score values (calculated from ROUGE F-measure)
f1_scores = [0.6667, 0.8276, 0.2769, 0.6364, 0.3684, 0.2222, 0.1667, 0.7586, 0.4828, 0.2]

# Plotting Recall and F1 Score for each test case
x = np.arange(len(test_cases))  # the label locations
width = 0.35  # the width of the bars

fig, ax = plt.subplots(figsize=(12, 6))
rects1 = ax.bar(x - width/2, recall_values, width, label='Recall', color='#FFD700')
rects2 = ax.bar(x + width/2, f1_scores, width, label='F1 Score', color='#FFA500')

# Add some text for labels, title and custom x-axis tick labels, etc.
ax.set_xlabel('Test Cases')
ax.set_ylabel('Scores')
ax.set_title('Recall and F1 Scores by Test Case')
ax.set_xticks(x)
ax.set_xticklabels(test_cases, rotation=45, ha="right")
ax.legend()

# Display the values on top of the bars
def autolabel(rects):
    """Attach a text label above each bar in *rects*, displaying its height."""
    for rect in rects:
        height = rect.get_height()
        ax.annotate(f'{height:.2f}',
                    xy=(rect.get_x() + rect.get_width() / 2, height),
                    xytext=(0, 3),  # 3 points vertical offset
                    textcoords="offset points",
                    ha='center', va='bottom')

autolabel(rects1)
autolabel(rects2)

fig.tight_layout()
plt.show()
