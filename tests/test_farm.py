import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.simulation.farm import Farm, FarmConfig, Obstacle
import numpy as np

farm = Farm()
print(farm)
print("Bounds:", farm.bounds)
print("Center:", farm.center)

# Test collision detection
inside_barn = np.array([80.0, 70.0])
open_field  = np.array([400.0, 300.0])
print("Inside barn (expect True):", farm.is_obstacle(inside_barn))
print("Open field (expect False):", farm.is_obstacle(open_field))

# Test spawning
drone_pos = farm.drone_spawn()
print("Drone spawn:", drone_pos)

bird_positions = farm.bird_spawns(5)
print("Bird spawns:")
for i, pos in enumerate(bird_positions):
    print(f"  Bird {i+1}: {pos.round(1)}")

# Test obstacle data for API
print("Obstacle data:", farm.get_obstacle_data())