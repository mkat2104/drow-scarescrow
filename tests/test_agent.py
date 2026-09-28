import os
import sys
import tempfile
import numpy as np
import torch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.ai.agent import DQNAgent, AgentConfig, ReplayBuffer


def test_agent_initialization():
    agent = DQNAgent(obs_size=26, n_actions=9)
    assert agent.obs_size == 26
    assert agent.n_actions == 9
    assert agent.epsilon == 1.0
    print("✓ Agent initialization passed")


def test_select_action():
    agent = DQNAgent(obs_size=26, n_actions=9)
    state = np.random.randn(26).astype(np.float32)

    # In exploration (epsilon=1.0)
    action = agent.select_action(state, evaluate=False)
    assert 0 <= action < 9

    # In exploitation (evaluate=True)
    greedy_action = agent.select_action(state, evaluate=True)
    assert 0 <= greedy_action < 9
    print(f"✓ Action selection passed (sampled: {action}, greedy: {greedy_action})")


def test_replay_buffer_and_update():
    config = AgentConfig(batch_size=8, buffer_capacity=100)
    agent = DQNAgent(obs_size=26, n_actions=9, config=config, device=torch.device("cpu"))

    # Buffer starts empty
    assert len(agent.replay_buffer) == 0
    assert agent.update() is None

    # Push 10 transitions
    for _ in range(10):
        s = np.random.randn(26).astype(np.float32)
        a = np.random.randint(0, 9)
        r = float(np.random.randn())
        s_next = np.random.randn(26).astype(np.float32)
        done = False
        agent.store_transition(s, a, r, s_next, done)

    assert len(agent.replay_buffer) == 10
    loss = agent.update()
    assert loss is not None
    assert isinstance(loss, float)
    print(f"✓ Replay buffer and update passed (loss: {loss:.4f})")


def test_epsilon_decay():
    config = AgentConfig(epsilon_start=1.0, epsilon_end=0.01, epsilon_decay_episodes=10)
    agent = DQNAgent(obs_size=26, n_actions=9, config=config)

    initial_eps = agent.epsilon
    agent.decay_epsilon()
    assert agent.epsilon < initial_eps

    for _ in range(15):
        agent.decay_epsilon()

    assert np.isclose(agent.epsilon, 0.01)
    print("✓ Epsilon decay passed")


def test_save_and_load():
    with tempfile.TemporaryDirectory() as tmp_dir:
        model_path = os.path.join(tmp_dir, "test_model.pth")
        agent1 = DQNAgent(obs_size=26, n_actions=9, device=torch.device("cpu"))
        agent1.save(model_path)

        agent2 = DQNAgent(obs_size=26, n_actions=9, device=torch.device("cpu"))
        agent2.load(model_path)

        state = np.random.randn(26).astype(np.float32)
        a1 = agent1.select_action(state, evaluate=True)
        a2 = agent2.select_action(state, evaluate=True)
        assert a1 == a2
        print("✓ Save and load weights passed")


if __name__ == "__main__":
    test_agent_initialization()
    test_select_action()
    test_replay_buffer_and_update()
    test_epsilon_decay()
    test_save_and_load()
    print("\nAll DQNAgent tests passed successfully!")
