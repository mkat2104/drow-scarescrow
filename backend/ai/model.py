import torch
import torch.nn as nn


class DQNModel(nn.Module):
    """
    Deep Q-Network (DQN) — maps state observations to Q-values.

    Architecture:
        Input  : obs_size (26 for our environment)
        Hidden : 128 → 64
        Output : n_actions (9 — one Q-value per action)

    The agent picks the action with the highest Q-value.
    During training, the network learns to predict cumulative
    future reward for each (state, action) pair.
    """

    def __init__(self, obs_size: int, n_actions: int, hidden_1: int = 128, hidden_2: int = 64):
        super().__init__()

        self.network = nn.Sequential(
            nn.Linear(obs_size, hidden_1),
            nn.ReLU(),
            nn.Linear(hidden_1, hidden_2),
            nn.ReLU(),
            nn.Linear(hidden_2, n_actions),
        )

        # Initialise weights with He initialisation (good for ReLU networks)
        self._init_weights()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Args:
            x : state tensor of shape (batch_size, obs_size)
                or (obs_size,) for single observations

        Returns:
            Q-values tensor of shape (batch_size, n_actions)
        """
        return self.network(x)

    def _init_weights(self):
        """He initialisation for all linear layers."""
        for layer in self.network:
            if isinstance(layer, nn.Linear):
                nn.init.kaiming_uniform_(layer.weight, nonlinearity='relu')
                nn.init.zeros_(layer.bias)

    def save(self, path: str):
        """Save model weights to disk."""
        torch.save(self.state_dict(), path)
        print(f"Model saved → {path}")

    def load(self, path: str, device: torch.device = None):
        """Load model weights from disk."""
        device = device or torch.device("cpu")
        self.load_state_dict(torch.load(path, map_location=device))
        self.eval()
        print(f"Model loaded ← {path}")

    def __repr__(self) -> str:
        total_params = sum(p.numel() for p in self.parameters())
        return (
            f"DQNModel("
            f"obs={self.network[0].in_features}, "
            f"actions={self.network[-1].out_features}, "
            f"params={total_params:,})"
        )