import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.simulation.environment import Environment, EnvConfig
import numpy as np

env = Environment(seed=42)
print(env)
print(f"Observation size: {env.obs_size}")
print(f"Number of actions: {env.n_actions}")

# Reset and check observation
obs = env.reset()
print(f"\nInitial observation shape: {obs.shape}")
print(f"Initial observation: {obs.round(3)}")

# Run a few random steps
print("\nRunning 10 random steps...")
total_reward = 0
for i in range(10):
    action = np.random.randint(0, env.n_actions)
    obs, reward, done, info = env.step(action)
    total_reward += reward
    print(f"Step {i+1} | action={action} | reward={reward:.2f} | done={done} | birds_remaining={info['birds_remaining']}")
    if done:
        break

print(f"\nTotal reward after 10 steps: {total_reward:.2f}")
print(f"Info: {info}")

# Check render state for API
state = env.get_render_state()
print(f"\nRender state keys: {list(state.keys())}")
print(f"Drone: {state['drone']}")
print(f"Number of birds in state: {len(state['birds'])}")