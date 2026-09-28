import os
import sys
import torch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.ai.model import DQNModel

model = DQNModel(obs_size=26, n_actions=9)
print(model)

# Test forward pass with single observation and batch
x_single = torch.randn(26)
q_single = model(x_single)
print("Single forward shape:", q_single.shape)
assert q_single.shape == torch.Size([9])

x_batch = torch.randn(32, 26)
q_batch = model(x_batch)
print("Batch forward shape:", q_batch.shape)
assert q_batch.shape == torch.Size([32, 9])

print("DQNModel tests passed successfully!")
