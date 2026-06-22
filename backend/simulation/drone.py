import numpy as np
from dataclasses import dataclass
from typing import Tuple


@dataclass
class DroneConfig:
    """Configuration parameters for the drone."""
    max_speed: float = 5.0          # Maximum speed (units/step)
    max_energy: float = 100.0       # Full battery capacity
    energy_drain_move: float = 0.2  # Energy used per step when moving
    energy_drain_idle: float = 0.05 # Energy used per step when stationary
    scare_radius: float = 50.0      # Radius within which birds are scared
    scare_energy_cost: float = 0.5  # Extra energy cost when actively scaring
    size: float = 10.0              # Drone radius (for collision/rendering)


class Drone:
    """
    Represents the autonomous scarecrow drone.

    State:
        position  : (x, y) in world coordinates
        velocity  : (vx, vy) current velocity
        energy    : remaining battery level (0–max_energy)
        is_active : whether the drone is operational

    Actions (discrete):
        0 = stay still
        1 = move up
        2 = move down
        3 = move left
        4 = move right
        5 = move up-left
        6 = move up-right
        7 = move down-left
        8 = move down-right
    """

    ACTION_DELTAS = {
        0: (0, 0),
        1: (0, 1),
        2: (0, -1),
        3: (-1, 0),
        4: (1, 0),
        5: (-1, 1),
        6: (1, 1),
        7: (-1, -1),
        8: (1, -1),
    }
    N_ACTIONS = len(ACTION_DELTAS)

    def __init__(
        self,
        start_x: float,
        start_y: float,
        config: DroneConfig = None,
    ):
        self.config = config or DroneConfig()
        self.start_pos = np.array([start_x, start_y], dtype=float)

        # Mutable state
        self.position = self.start_pos.copy()
        self.velocity = np.zeros(2, dtype=float)
        self.energy = self.config.max_energy
        self.is_active = True

        # Stats (reset each episode)
        self.total_distance = 0.0
        self.steps_taken = 0

    # ------------------------------------------------------------------
    # Core update
    # ------------------------------------------------------------------

    def step(self, action: int, world_bounds: Tuple[float, float, float, float]) -> dict:
        """
        Apply one action and update drone state.

        Args:
            action       : integer in [0, N_ACTIONS)
            world_bounds : (x_min, y_min, x_max, y_max)

        Returns:
            info dict with movement, energy_used, out_of_energy flag
        """
        if not self.is_active:
            return {"moved": False, "energy_used": 0.0, "out_of_energy": True}

        delta = np.array(self.ACTION_DELTAS[action], dtype=float)
        moving = np.any(delta != 0)

        # Scale delta to max_speed (diagonals normalised)
        if moving:
            delta = delta / np.linalg.norm(delta) * self.config.max_speed

        new_pos = self.position + delta
        new_pos = self._clamp_to_bounds(new_pos, world_bounds)

        actual_delta = new_pos - self.position
        dist = float(np.linalg.norm(actual_delta))

        self.velocity = actual_delta
        self.position = new_pos
        self.total_distance += dist
        self.steps_taken += 1

        # Energy drain
        energy_used = (
            self.config.energy_drain_move if moving
            else self.config.energy_drain_idle
        )
        self.energy = max(0.0, self.energy - energy_used)

        if self.energy <= 0:
            self.is_active = False

        return {
            "moved": moving,
            "distance": dist,
            "energy_used": energy_used,
            "out_of_energy": not self.is_active,
        }

    # ------------------------------------------------------------------
    # Scarecrow behaviour
    # ------------------------------------------------------------------

    def is_scaring(self, bird_position: np.ndarray) -> bool:
        """Return True if a bird is within scare radius."""
        return bool(
            np.linalg.norm(self.position - bird_position) <= self.config.scare_radius
        )

    def apply_scare_cost(self, n_birds_scared: int) -> float:
        """Deduct extra energy for actively scaring birds. Returns energy used."""
        if n_birds_scared == 0 or not self.is_active:
            return 0.0
        cost = self.config.scare_energy_cost * n_birds_scared
        self.energy = max(0.0, self.energy - cost)
        if self.energy <= 0:
            self.is_active = False
        return cost

    # ------------------------------------------------------------------
    # State for RL agent
    # ------------------------------------------------------------------

    def get_state_vector(self) -> np.ndarray:
        """
        Return a normalised state vector for the RL agent:
            [x, y, vx, vy, energy_ratio]
        All values in [0, 1] or [-1, 1] for stable training.
        """
        return np.array([
            self.position[0],
            self.position[1],
            self.velocity[0] / self.config.max_speed,
            self.velocity[1] / self.config.max_speed,
            self.energy / self.config.max_energy,
        ], dtype=np.float32)

    # ------------------------------------------------------------------
    # Episode management
    # ------------------------------------------------------------------

    def reset(self):
        """Reset drone to starting state for a new episode."""
        self.position = self.start_pos.copy()
        self.velocity = np.zeros(2, dtype=float)
        self.energy = self.config.max_energy
        self.is_active = True
        self.total_distance = 0.0
        self.steps_taken = 0

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _clamp_to_bounds(
        self,
        pos: np.ndarray,
        bounds: Tuple[float, float, float, float],
    ) -> np.ndarray:
        x_min, y_min, x_max, y_max = bounds
        return np.clip(pos, [x_min, y_min], [x_max, y_max])

    @property
    def energy_ratio(self) -> float:
        return self.energy / self.config.max_energy

    def __repr__(self) -> str:
        return (
            f"Drone(pos={self.position.round(1)}, "
            f"energy={self.energy:.1f}/{self.config.max_energy}, "
            f"active={self.is_active})"
        )