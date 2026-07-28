import numpy as np
from dataclasses import dataclass
from enum import Enum, auto
from typing import Tuple


class BirdState(Enum):
    WANDERING = auto()   # Pecking around randomly
    FLEEING   = auto()   # Panicking away from drone
    SCARED_OFF = auto()  # Has left the farm — episode reward granted


@dataclass
class BirdConfig:
    """Tunable parameters for bird behaviour."""
    wander_speed: float      = 1.5    # Units/step when wandering
    flee_speed: float        = 4.0    # Units/step when fleeing
    flee_radius: float       = 80.0   # Distance at which bird starts fleeing
    calm_radius: float       = 120.0  # Distance at which bird returns to wandering
    waypoint_threshold: float = 10.0  # Distance to consider waypoint "reached"
    size: float              = 6.0    # Bird radius (for rendering)


class Bird:
    """
    Represents a single bird on the farm.

    Behaviour:
        WANDERING  — moves toward a random waypoint; picks a new one on arrival
        FLEEING    — moves directly away from the drone at flee_speed
        SCARED_OFF — terminal state; bird has left the farm boundary

    The bird transitions between states based on its distance to the drone.
    All state-transition logic lives here; rewards live in environment.py.
    """

    def __init__(
        self,
        start_x: float,
        start_y: float,
        world_bounds: Tuple[float, float, float, float],
        config: BirdConfig = None,
        rng: np.random.Generator = None,
    ):
        self.config = config or BirdConfig()
        self.world_bounds = world_bounds          # (x_min, y_min, x_max, y_max)
        self.rng = rng or np.random.default_rng()

        self.start_pos = np.array([start_x, start_y], dtype=float)
        self.position  = self.start_pos.copy()
        self.velocity  = np.zeros(2, dtype=float)
        self.state     = BirdState.WANDERING
        self.waypoint  = self._random_waypoint()

        # Tracks whether a reward has been issued for this bird
        self.reward_given = False

    # ------------------------------------------------------------------
    # Main update — called once per simulation step
    # ------------------------------------------------------------------

    def step(self, drone_position: np.ndarray) -> BirdState:
        """
        Update bird position and state for one simulation step.

        Args:
            drone_position : current (x, y) of the drone

        Returns:
            Current BirdState after the update
        """
        if self.state == BirdState.SCARED_OFF:
            return self.state

        distance_to_drone = np.linalg.norm(self.position - drone_position)

        # ── State transitions ────────────────────────────────────────
        if self.state == BirdState.WANDERING and distance_to_drone <= self.config.flee_radius:
            self.state = BirdState.FLEEING

        elif self.state == BirdState.FLEEING and distance_to_drone > self.config.calm_radius:
            self.state = BirdState.WANDERING
            self.waypoint = self._random_waypoint()   # pick fresh destination

        # ── Movement ─────────────────────────────────────────────────
        if self.state == BirdState.WANDERING:
            self._wander()
        elif self.state == BirdState.FLEEING:
            self._flee(drone_position)

        # ── Boundary check ───────────────────────────────────────────
        if self._is_outside_bounds():
            self.state = BirdState.SCARED_OFF

        return self.state

    # ------------------------------------------------------------------
    # Movement helpers
    # ------------------------------------------------------------------

    def _wander(self):
        """Move toward current waypoint; pick a new one on arrival."""
        to_waypoint = self.waypoint - self.position
        dist = np.linalg.norm(to_waypoint)

        if dist < self.config.waypoint_threshold:
            self.waypoint = self._random_waypoint()
            return

        direction = to_waypoint / dist
        self.velocity = direction * self.config.wander_speed
        self.position = self.position + self.velocity

    def _flee(self, drone_position: np.ndarray):
        """Move directly away from the drone at flee speed."""
        away = self.position - drone_position
        dist = np.linalg.norm(away)

        if dist == 0:
            # Drone is exactly on the bird — flee in a random direction
            away = self.rng.uniform(-1, 1, size=2)
            dist = np.linalg.norm(away)

        direction = away / dist
        self.velocity = direction * self.config.flee_speed
        self.position = self.position + self.velocity

    # ------------------------------------------------------------------
    # State helpers
    # ------------------------------------------------------------------

    def _random_waypoint(self) -> np.ndarray:
        """Pick a random point inside the world bounds."""
        x_min, y_min, x_max, y_max = self.world_bounds
        return np.array([
            self.rng.uniform(x_min, x_max),
            self.rng.uniform(y_min, y_max),
        ], dtype=float)

    def _is_outside_bounds(self) -> bool:
        x_min, y_min, x_max, y_max = self.world_bounds
        x, y = self.position
        return x < x_min or x > x_max or y < y_min or y > y_max

    # ------------------------------------------------------------------
    # State vector for RL agent
    # ------------------------------------------------------------------

    def get_state_vector(
        self,
        drone_position: np.ndarray,
        world_w: float,
        world_h: float,
    ) -> np.ndarray:
        """
        Return a compact vector describing this bird relative to the drone.
        Used by the RL agent to observe nearby birds.

            [dx, dy, distance, is_fleeing]

        dx, dy are normalised to [-1, 1] by world dimensions.
        """
        dx = (self.position[0] - drone_position[0]) / world_w
        dy = (self.position[1] - drone_position[1]) / world_h
        dist = float(np.linalg.norm(self.position - drone_position))
        is_fleeing = float(self.state == BirdState.FLEEING)

        return np.array([dx, dy, dist, is_fleeing], dtype=np.float32)

    # ------------------------------------------------------------------
    # Episode management
    # ------------------------------------------------------------------

    def reset(self):
        """Reset bird to its starting state for a new episode."""
        self.position     = self.start_pos.copy()
        self.velocity     = np.zeros(2, dtype=float)
        self.state        = BirdState.WANDERING
        self.waypoint     = self._random_waypoint()
        self.reward_given = False

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_active(self) -> bool:
        """Bird is still on the farm and relevant to the simulation."""
        return self.state != BirdState.SCARED_OFF

    @property
    def is_fleeing(self) -> bool:
        return self.state == BirdState.FLEEING

    def __repr__(self) -> str:
        return (
            f"Bird(pos={self.position.round(1)}, "
            f"state={self.state.name})"
        )