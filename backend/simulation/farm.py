import numpy as np
from dataclasses import dataclass, field
from typing import List, Tuple


@dataclass
class Obstacle:
    """A static rectangular obstacle on the farm (tree, fence, barn)."""
    x: float         # Top-left x
    y: float         # Top-left y
    width: float
    height: float
    label: str = "obstacle"

    @property
    def bounds(self) -> Tuple[float, float, float, float]:
        """Return (x_min, y_min, x_max, y_max)."""
        return (self.x, self.y, self.x + self.width, self.y + self.height)

    def contains(self, point: np.ndarray, margin: float = 0.0) -> bool:
        """Return True if point is inside this obstacle (with optional margin)."""
        x_min, y_min, x_max, y_max = self.bounds
        return (
            x_min - margin <= point[0] <= x_max + margin and
            y_min - margin <= point[1] <= y_max + margin
        )


@dataclass
class FarmConfig:
    """Configuration for the farm world."""
    width: float  = 800.0    # World width in units
    height: float = 600.0    # World height in units
    margin: float = 20.0     # Buffer from edge for spawning


class Farm:
    """
    Represents the static farm environment.

    Responsibilities:
        - World boundaries
        - Static obstacles (trees, fences, barn)
        - Valid spawn points for drone and birds
        - Collision detection against obstacles

    Nothing in Farm moves — all dynamic objects live in environment.py.
    """

    def __init__(
        self,
        config: FarmConfig = None,
        obstacles: List[Obstacle] = None,
        rng: np.random.Generator = None,
    ):
        self.config = config or FarmConfig()
        self.rng = rng or np.random.default_rng()

        # Build default obstacle layout if none provided
        self.obstacles: List[Obstacle] = obstacles if obstacles is not None else self._default_obstacles()

    # ------------------------------------------------------------------
    # World properties
    # ------------------------------------------------------------------

    @property
    def bounds(self) -> Tuple[float, float, float, float]:
        """Return (x_min, y_min, x_max, y_max) world boundary."""
        return (0.0, 0.0, self.config.width, self.config.height)

    @property
    def center(self) -> np.ndarray:
        return np.array([self.config.width / 2, self.config.height / 2])

    # ------------------------------------------------------------------
    # Collision detection
    # ------------------------------------------------------------------

    def is_obstacle(self, position: np.ndarray, margin: float = 5.0) -> bool:
        """Return True if position collides with any obstacle."""
        return any(obs.contains(position, margin) for obs in self.obstacles)

    def is_in_bounds(self, position: np.ndarray) -> bool:
        """Return True if position is within world boundaries."""
        x_min, y_min, x_max, y_max = self.bounds
        return (x_min <= position[0] <= x_max and
                y_min <= position[1] <= y_max)

    def clamp_to_bounds(self, position: np.ndarray) -> np.ndarray:
        """Clamp a position to stay within world bounds."""
        return np.clip(
            position,
            [0.0, 0.0],
            [self.config.width, self.config.height]
        )

    # ------------------------------------------------------------------
    # Spawn points
    # ------------------------------------------------------------------

    def random_spawn(self, max_attempts: int = 100) -> np.ndarray:
        """
        Return a random position inside the world that is not on an obstacle.
        Respects the spawn margin from edges.
        """
        m = self.config.margin
        for _ in range(max_attempts):
            pos = np.array([
                self.rng.uniform(m, self.config.width  - m),
                self.rng.uniform(m, self.config.height - m),
            ])
            if not self.is_obstacle(pos):
                return pos

        # Fallback to center if no valid spawn found
        return self.center.copy()

    def drone_spawn(self) -> np.ndarray:
        """Drone always starts in the center of the farm."""
        return self.center.copy()

    def bird_spawns(self, n_birds: int) -> List[np.ndarray]:
        """
        Return n spawn positions for birds, spread around the farm edges
        so they start away from the drone in the center.
        """
        spawns = []
        for _ in range(n_birds):
            pos = self._edge_spawn()
            spawns.append(pos)
        return spawns

    # ------------------------------------------------------------------
    # Default obstacle layout
    # ------------------------------------------------------------------

    def _default_obstacles(self) -> List[Obstacle]:
        """
        A simple default farm layout:
            - Barn in the top-left
            - Two tree clusters
            - A fence segment across the middle-right
        """
        w, h = self.config.width, self.config.height
        return [
            Obstacle(x=50,       y=50,       width=80,  height=60,  label="barn"),
            Obstacle(x=200,      y=150,      width=30,  height=30,  label="tree"),
            Obstacle(x=600,      y=100,      width=30,  height=30,  label="tree"),
            Obstacle(x=550,      y=400,      width=120, height=15,  label="fence"),
            Obstacle(x=150,      y=450,      width=15,  height=100, label="fence"),
        ]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _edge_spawn(self) -> np.ndarray:
        """
        Spawn near one of the four edges of the farm (but inside bounds).
        Birds start away from the center where the drone spawns.
        """
        m = self.config.margin
        w, h = self.config.width, self.config.height
        edge = self.rng.integers(0, 4)  # 0=top, 1=bottom, 2=left, 3=right

        if edge == 0:   # top
            pos = np.array([self.rng.uniform(m, w - m), self.rng.uniform(m, h * 0.25)])
        elif edge == 1: # bottom
            pos = np.array([self.rng.uniform(m, w - m), self.rng.uniform(h * 0.75, h - m)])
        elif edge == 2: # left
            pos = np.array([self.rng.uniform(m, w * 0.25), self.rng.uniform(m, h - m)])
        else:           # right
            pos = np.array([self.rng.uniform(w * 0.75, w - m), self.rng.uniform(m, h - m)])

        # Retry if landed on obstacle
        if self.is_obstacle(pos):
            return self.random_spawn()
        return pos

    def get_obstacle_data(self) -> List[dict]:
        """
        Return obstacle info as a list of dicts — used by the API
        to send static farm layout to the React frontend.
        """
        return [
            {"x": o.x, "y": o.y, "width": o.width, "height": o.height, "label": o.label}
            for o in self.obstacles
        ]

    def __repr__(self) -> str:
        return (
            f"Farm({self.config.width}x{self.config.height}, "
            f"{len(self.obstacles)} obstacles)"
        )