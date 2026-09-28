import random
from collections import deque
from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

from backend.ai.model import DQNModel


class ReplayBuffer:
    """
    Experience Replay Buffer for DQN.

    Stores past transitions (state, action, reward, next_state, done)
    and allows uniform random sampling to break temporal correlations
    between consecutive training steps.
    """

    def __init__(self, capacity: int = 10000):
        self.buffer = deque(maxlen=capacity)

    def push(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        done: bool,
    ):
        """Add a transition tuple to the buffer."""
        self.buffer.append((state, action, reward, next_state, done))

    def sample(
        self, batch_size: int, device: torch.device
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Sample a random mini-batch and return PyTorch tensors ready for computation.
        """
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)

        states_tensor = torch.tensor(np.array(states), dtype=torch.float32, device=device)
        actions_tensor = torch.tensor(actions, dtype=torch.int64, device=device)
        rewards_tensor = torch.tensor(rewards, dtype=torch.float32, device=device)
        next_states_tensor = torch.tensor(np.array(next_states), dtype=torch.float32, device=device)
        dones_tensor = torch.tensor(dones, dtype=torch.float32, device=device)

        return states_tensor, actions_tensor, rewards_tensor, next_states_tensor, dones_tensor

    def __len__(self) -> int:
        return len(self.buffer)


@dataclass
class AgentConfig:
    """Hyperparameters and configuration for DQNAgent."""
    learning_rate: float = 1e-3
    gamma: float = 0.99
    epsilon_start: float = 1.0
    epsilon_end: float = 0.01
    epsilon_decay_episodes: int = 300
    buffer_capacity: int = 10000
    batch_size: int = 64
    target_update_episodes: int = 10
    max_grad_norm: float = 1.0


class DQNAgent:
    """
    DQN Agent implementing:
    - Epsilon-greedy action selection
    - Experience replay buffer
    - Target network with periodic hard updates
    - Bellman update with Huber (Smooth L1) loss & gradient clipping
    """

    def __init__(
        self,
        obs_size: int = 26,
        n_actions: int = 9,
        config: Optional[AgentConfig] = None,
        device: Optional[torch.device] = None,
    ):
        self.obs_size = obs_size
        self.n_actions = n_actions
        self.config = config or AgentConfig()

        # Select computing device (MPS / CUDA / CPU)
        if device is not None:
            self.device = device
        elif torch.cuda.is_available():
            self.device = torch.device("cuda")
        elif torch.backends.mps.is_available():
            self.device = torch.device("mps")
        else:
            self.device = torch.device("cpu")

        # Networks: Policy network and Target network
        self.policy_net = DQNModel(obs_size, n_actions).to(self.device)
        self.target_net = DQNModel(obs_size, n_actions).to(self.device)
        self.update_target_network()
        self.target_net.eval()

        # Optimizer and Loss
        self.optimizer = optim.Adam(self.policy_net.parameters(), lr=self.config.learning_rate)
        self.criterion = nn.SmoothL1Loss()

        # Replay Buffer
        self.replay_buffer = ReplayBuffer(capacity=self.config.buffer_capacity)

        # Exploration rate
        self.epsilon = self.config.epsilon_start
        # Calculate linear epsilon decay per episode
        self.epsilon_decay_step = (
            self.config.epsilon_start - self.config.epsilon_end
        ) / max(1, self.config.epsilon_decay_episodes)

    def select_action(self, state: np.ndarray, evaluate: bool = False) -> int:
        """
        Choose an action using epsilon-greedy exploration.

        Args:
            state: Observation vector of shape (obs_size,)
            evaluate: If True, always choose greedy action (no random exploration)

        Returns:
            action: integer in [0, n_actions - 1]
        """
        if not evaluate and random.random() < self.epsilon:
            return random.randint(0, self.n_actions - 1)

        with torch.no_grad():
            state_tensor = torch.tensor(
                state, dtype=torch.float32, device=self.device
            ).unsqueeze(0)
            q_values = self.policy_net(state_tensor)
            return int(q_values.argmax(dim=1).item())

    def store_transition(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        done: bool,
    ):
        """Add transition to replay buffer."""
        self.replay_buffer.push(state, action, reward, next_state, done)

    def update(self) -> Optional[float]:
        """
        Sample a batch from replay buffer and perform one gradient descent step.

        Returns:
            loss: float value of the loss if updated, or None if buffer has insufficient samples.
        """
        if len(self.replay_buffer) < self.config.batch_size:
            return None

        states, actions, rewards, next_states, dones = self.replay_buffer.sample(
            self.config.batch_size, self.device
        )

        # Compute Q(s, a) using policy network
        current_q = self.policy_net(states).gather(1, actions.unsqueeze(1)).squeeze(1)

        # Compute target Q-values: r + gamma * max_a' Q_target(s', a') * (1 - done)
        with torch.no_grad():
            next_q = self.target_net(next_states).max(dim=1)[0]
            target_q = rewards + self.config.gamma * next_q * (1.0 - dones)

        # Compute loss
        loss = self.criterion(current_q, target_q)

        # Gradient step
        self.optimizer.zero_grad()
        loss.backward()

        # Gradient clipping to prevent exploding gradients
        if self.config.max_grad_norm > 0:
            nn.utils.clip_grad_norm_(self.policy_net.parameters(), self.config.max_grad_norm)

        self.optimizer.step()

        return float(loss.item())

    def decay_epsilon(self):
        """Decay epsilon once per episode."""
        self.epsilon = max(self.config.epsilon_end, self.epsilon - self.epsilon_decay_step)

    def update_target_network(self):
        """Hard update: copy weights from policy_net to target_net."""
        self.target_net.load_state_dict(self.policy_net.state_dict())

    def save(self, path: str):
        """Save policy network weights to disk."""
        self.policy_net.save(path)

    def load(self, path: str):
        """Load policy network weights from disk."""
        self.policy_net.load(path, device=self.device)
        self.update_target_network()
