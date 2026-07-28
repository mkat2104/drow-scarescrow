import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.simulation.drone import Drone, DroneConfig
import numpy as np

drone = Drone(start_x=400, start_y=300)
print(drone)

bounds = (0, 0, 800, 600)
for action in [4, 4, 1, 1, 8]:
    info = drone.step(action, bounds)
    print(f"Action {action} → pos={drone.position.round(1)}, energy={drone.energy:.1f}")

print("State vector:", drone.get_state_vector())
drone.reset()
print("After reset:", drone)