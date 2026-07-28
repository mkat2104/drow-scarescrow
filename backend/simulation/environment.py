import numpy as np
from dataclasses import dataclass
from typing import List, Tuple, Dict

from backend.simulation.drone import Drone, DroneConfig
from backend.simulation.bird import Bird, BirdConfig, BirdState
from backend.simulation.farm import Farm, FarmConfig


@dataclass
class EnvConfig:
    """Top-level configuration for the simulation environment."""
    n_birds: int          = 5        # Number of birds per episode
    max_steps: int        = 1000     # Max steps before episode ends
    world_width: float    = 800.0
    world_height: float   = 600.0
    n_birds_in_state: int = 5        # How many nearest birds the agent observes

    # Rewards
    reward_scare:        float =  10.0   # Bird enters scare radius
    reward_scared_off:   float =  25.0   # Bird successfully leaves farm
    reward_all_cleared:  float = 100.0   # All birds scared off
    reward_step:         float =  -0.1   # Time penalty per step
    reward_low_energy:   float =  -2.0   # Penalty when energy < 20%
    reward_out_of_energy: float = -50.0  # Terminal penalty


class Environment:
    """
    Main simulation environment.

    Connects Drone, Bird, and Farm into a single RL-compatible loop.
    Follows a gym-like interface:
        obs  = env.reset()
        obs, reward, done, info = env.step(action)

    Observation vector:
        [drone_x, drone_y, drone_vx, drone_vy, drone_energy,   # 5
         bird1_dx, bird1_dy, bird1_dist, bird1_fleeing,        # 4 per bird
         bird2_dx, ...,                                         # × n_birds_in_state
         n_birds_remaining (normalised)]                        # 1
        Total: 5 + 4 * n_birds_in_state + 1
    """

    def __init__(self, config: EnvConfig = None, seed: int = None):
        self.config = config or EnvConfig()
        self.rng = np.random.default_rng(seed)

        # Build static environment
        self.farm = Farm(
            config=FarmConfig(
                width=self.config.world_width,
                height=self.config.world_height,
            ),
            rng=self.rng,
        )

        # Drone and birds are initialised on reset()
        self.drone: Drone = None
        self.birds: List[Bird] = []

        # Episode tracking
        self.steps = 0
        self.total_reward = 0.0
        self.birds_scared_off = 0
        self.done = False

        # Observation size
        self.obs_size = 5 + 4 * self.config.n_birds_in_state + 1
        self.n_actions = 9   # matches Drone.N_ACTIONS

    # ------------------------------------------------------------------
    # Gym-like interface
    # ------------------------------------------------------------------

    def reset(self) -> np.ndarray:
        """Reset environment for a new episode. Returns initial observation."""
        self.steps = 0
        self.total_reward = 0.0
        self.birds_scared_off = 0
        self.done = False

        # Spawn drone at farm center
        drone_pos = self.farm.drone_spawn()
        self.drone = Drone(
            start_x=float(drone_pos[0]),
            start_y=float(drone_pos[1]),
            config=DroneConfig(),
        )

        # Spawn birds at farm edges
        bird_spawns = self.farm.bird_spawns(self.config.n_birds)
        self.birds = [
            Bird(
                start_x=float(pos[0]),
                start_y=float(pos[1]),
                world_bounds=self.farm.bounds,
                config=BirdConfig(),
                rng=self.rng,
            )
            for pos in bird_spawns
        ]

        return self._get_observation()

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, dict]:
        """
        Advance simulation by one step.

        Args:
            action : integer in [0, 8]

        Returns:
            observation : np.ndarray
            reward      : float
            done        : bool
            info        : dict with episode diagnostics
        """
        if self.done:
            raise RuntimeError("Episode is done — call reset() first.")

        reward = 0.0

        # ── 1. Move drone ────────────────────────────────────────────
        self.drone.step(action, self.farm.bounds)

        # ── 2. Update birds ──────────────────────────────────────────
        n_currently_scared = 0
        for bird in self.active_birds:
            prev_state = bird.state
            bird.step(self.drone.position)

            # Bird just entered scare radius
            if (prev_state == BirdState.WANDERING and
                    bird.state == BirdState.FLEEING):
                reward += self.config.reward_scare

            # Bird successfully left the farm
            if (bird.state == BirdState.SCARED_OFF and
                    not bird.reward_given):
                reward += self.config.reward_scared_off
                bird.reward_given = True
                self.birds_scared_off += 1

            if bird.is_fleeing:
                n_currently_scared += 1

        # ── 3. Apply scare energy cost ───────────────────────────────
        self.drone.apply_scare_cost(n_currently_scared)

        # ── 4. Step penalty and energy warnings ─────────────────────
        reward += self.config.reward_step

        if self.drone.energy_ratio < 0.2:
            reward += self.config.reward_low_energy

        # ── 5. Terminal conditions ───────────────────────────────────
        # All birds cleared
        if self.birds_scared_off >= self.config.n_birds:
            reward += self.config.reward_all_cleared
            self.done = True

        # Drone out of energy
        if not self.drone.is_active:
            reward += self.config.reward_out_of_energy
            self.done = True

        # Max steps reached
        if self.steps >= self.config.max_steps:
            self.done = True

        self.steps += 1
        self.total_reward += reward

        obs  = self._get_observation()
        info = self._get_info()

        return obs, reward, self.done, info

    # ------------------------------------------------------------------
    # Observation builder
    # ------------------------------------------------------------------

    def _get_observation(self) -> np.ndarray:
        """
        Build the flat observation vector for the RL agent.
        Pads with zeros if fewer birds than n_birds_in_state are active.
        """
        w, h = self.config.world_width, self.config.world_height

        # Drone state (5 values)
        drone_vec = self.drone.get_state_vector() if self.drone else np.zeros(5)

        # Nearest N birds (4 values each)
        active = self.active_birds
        active_sorted = sorted(
            active,
            key=lambda b: np.linalg.norm(b.position - self.drone.position)
        )

        bird_vecs = []
        for i in range(self.config.n_birds_in_state):
            if i < len(active_sorted):
                vec = active_sorted[i].get_state_vector(self.drone.position, w, h)
            else:
                vec = np.zeros(4, dtype=np.float32)
            bird_vecs.append(vec)

        # Remaining birds ratio (1 value)
        remaining = np.array(
            [len(active) / self.config.n_birds],
            dtype=np.float32
        )

        return np.concatenate([drone_vec, *bird_vecs, remaining])

    # ------------------------------------------------------------------
    # Info / diagnostics
    # ------------------------------------------------------------------

    def _get_info(self) -> dict:
        return {
            "steps":            self.steps,
            "total_reward":     round(self.total_reward, 2),
            "birds_scared_off": self.birds_scared_off,
            "birds_remaining":  len(self.active_birds),
            "drone_energy":     round(self.drone.energy, 1),
            "drone_pos":        self.drone.position.tolist(),
        }

    def get_render_state(self) -> dict:
        """
        Return full world state as a dict for the API / React frontend.
        Called every frame by the FastAPI server.
        """
        return {
            "drone": {
                "x":      float(self.drone.position[0]),
                "y":      float(self.drone.position[1]),
                "energy": float(self.drone.energy),
                "active": self.drone.is_active,
            },
            "birds": [
                {
                    "x":     float(b.position[0]),
                    "y":     float(b.position[1]),
                    "state": b.state.name,
                }
                for b in self.birds
            ],
            "obstacles": self.farm.get_obstacle_data(),
            "info":      self._get_info(),
            "done":      self.done,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @property
    def active_birds(self) -> List[Bird]:
        """Birds still on the farm."""
        return [b for b in self.birds if b.is_active]

    def __repr__(self) -> str:
        return (
            f"Environment(birds={self.config.n_birds}, "
            f"max_steps={self.config.max_steps}, "
            f"obs_size={self.obs_size})"
        )