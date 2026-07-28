import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.simulation.bird import Bird
import numpy as np

bounds = (0, 0, 800, 600)
bird = Bird(start_x=400, start_y=300, world_bounds=bounds)
drone_far  = np.array([0.0, 0.0])
drone_near = np.array([410.0, 310.0])

print(bird)
bird.step(drone_far);  print("Far drone:", bird.state.name)   # expect WANDERING
bird.step(drone_near); print("Near drone:", bird.state.name)  # expect FLEEING