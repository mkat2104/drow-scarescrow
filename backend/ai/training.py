import argparse
import os
from typing import Dict, List, Optional

import numpy as np

from backend.ai.agent import AgentConfig, DQNAgent
from backend.simulation.environment import EnvConfig, Environment


def train(
    n_episodes: int = 500,
    max_steps: int = 1000,
    checkpoint_frequency: int = 50,
    target_update_frequency: int = 10,
    save_dir: str = "models",
    render_log_frequency: int = 1,
) -> Dict[str, List[float]]:
    """
    Train a DQNAgent in the Drone Scarecrow Environment.

    Args:
        n_episodes: Total number of training episodes (default: 500).
        max_steps: Maximum steps allowed per episode (default: 1000).
        checkpoint_frequency: Save checkpoint every N episodes (default: 50).
        target_update_frequency: Update target network every N episodes (default: 10).
        save_dir: Directory where checkpoints and best model are saved.
        render_log_frequency: How often to print training progress (default: 1).

    Returns:
        history: Dictionary containing reward, loss, and birds_scared histories.
    """
    os.makedirs(save_dir, exist_ok=True)

    env_config = EnvConfig(max_steps=max_steps)
    env = Environment(config=env_config)

    agent_config = AgentConfig(
        epsilon_decay_episodes=300,
        target_update_episodes=target_update_frequency,
    )
    agent = DQNAgent(
        obs_size=env.obs_size,
        n_actions=env.n_actions,
        config=agent_config,
    )

    history = {
        "episode_rewards": [],
        "birds_scared": [],
        "losses": [],
        "epsilons": [],
    }

    best_reward = -float("inf")

    print("=" * 70)
    print(f"Starting DQN Training: {n_episodes} episodes on device: {agent.device}")
    print(f"Checkpoints will be saved to: {save_dir}/")
    print("=" * 70)

    for episode in range(1, n_episodes + 1):
        obs = env.reset()
        episode_reward = 0.0
        losses = []

        for step in range(max_steps):
            action = agent.select_action(obs, evaluate=False)
            next_obs, reward, done, info = env.step(action)

            agent.store_transition(obs, action, reward, next_obs, done)
            loss = agent.update()
            if loss is not None:
                losses.append(loss)

            episode_reward += reward
            obs = next_obs

            if done:
                break

        # Decay exploration rate once per episode
        agent.decay_epsilon()

        # Update target network periodically
        if episode % target_update_frequency == 0:
            agent.update_target_network()

        # Collect metrics
        birds_scared = info.get("birds_scared_off", 0)
        avg_loss = float(np.mean(losses)) if losses else 0.0

        history["episode_rewards"].append(episode_reward)
        history["birds_scared"].append(birds_scared)
        history["losses"].append(avg_loss)
        history["epsilons"].append(agent.epsilon)

        if episode % render_log_frequency == 0:
            print(
                f"Episode {episode:3d}/{n_episodes} | "
                f"Reward: {episode_reward:6.1f} | "
                f"Birds: {birds_scared}/{env.config.n_birds} | "
                f"ε: {agent.epsilon:.2f} | "
                f"Avg Loss: {avg_loss:.4f}"
            )

        # Periodic checkpoint
        if episode % checkpoint_frequency == 0:
            checkpoint_path = os.path.join(save_dir, f"checkpoint_ep{episode}.pth")
            agent.save(checkpoint_path)

        # Best model checkpoint based on reward
        if episode_reward > best_reward:
            best_reward = episode_reward
            best_model_path = os.path.join(save_dir, "best.pth")
            agent.save(best_model_path)

    print("=" * 70)
    print(f"Training completed! Best reward achieved: {best_reward:.2f}")
    print(f"Best model saved to: {os.path.join(save_dir, 'best.pth')}")
    print("=" * 70)

    return history


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train DQN Drone Scarecrow Agent")
    parser.add_argument("--episodes", type=int, default=500, help="Number of training episodes")
    parser.add_argument("--max-steps", type=int, default=1000, help="Max steps per episode")
    parser.add_argument("--checkpoint-freq", type=int, default=50, help="Checkpoint frequency")
    parser.add_argument("--save-dir", type=str, default="models", help="Model save directory")
    args = parser.parse_args()

    train(
        n_episodes=args.episodes,
        max_steps=args.max_steps,
        checkpoint_frequency=args.checkpoint_freq,
        save_dir=args.save_dir,
    )
