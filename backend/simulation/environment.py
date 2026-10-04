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
    reward_approach:     float =   0.5   # Reward per step for moving closer to nearest bird
    reward_wall:         float =  -1.0   # Penalty per step for hugging the boundary


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

        # Mission & Tactical systems
        self.wave = 1
        self.crop_health = 100.0
        self.harvest_saved = 0.0
        self.charging_pad = np.array([400.0, 300.0], dtype=float)
        self.dock_radius = 45.0
        self.is_charging = False
        self.pulse_timer = 0

        # Shaping: track previous distance to nearest bird
        self._prev_nearest_dist: float = 0.0

        # Observation size
        self.obs_size = 5 + 4 * self.config.n_birds_in_state + 1
        self.n_actions = 9   # matches Drone.N_ACTIONS

    # ------------------------------------------------------------------
    # Gym-like interface
    # ------------------------------------------------------------------

    def reset(self, reset_progress: bool = True) -> np.ndarray:
        """Reset environment for a new episode. Returns initial observation."""
        self.steps = 0
        self.total_reward = 0.0
        self.birds_scared_off = 0
        self.done = False
        self.is_charging = False
        self.pulse_timer = 0

        if reset_progress:
            self.wave = 1
            self.crop_health = 100.0
            self.harvest_saved = 0.0

        # Spawn drone at farm center
        drone_pos = self.farm.drone_spawn()
        self.drone = Drone(
            start_x=float(drone_pos[0]),
            start_y=float(drone_pos[1]),
            config=DroneConfig(),
        )

        # Spawn birds for current wave (scales with wave)
        n_birds = min(3 + (self.wave - 1) * 2, 9)
        bird_spawns = self.farm.bird_spawns(n_birds)
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

        # Initialise shaping baseline
        if self.active_birds:
            dists = [np.linalg.norm(self.drone.position - b.position) for b in self.active_birds]
            self._prev_nearest_dist = float(min(dists))
        else:
            self._prev_nearest_dist = 0.0

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

        # ── Docking & Recharging ─────────────────────────────────────
        dist_to_pad = float(np.linalg.norm(self.drone.position - self.charging_pad))
        if dist_to_pad <= self.dock_radius:
            self.drone.recharge(2.0)
            self.is_charging = True
        else:
            self.is_charging = False

        # ── Acoustic Pulse Timer ─────────────────────────────────────
        if self.pulse_timer > 0:
            self.pulse_timer -= 1

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
                self.harvest_saved += 45.0

            if bird.is_fleeing:
                n_currently_scared += 1

        # Crop Health: Wandering birds feed on crops
        wandering_count = len([b for b in self.birds if b.state == BirdState.WANDERING])
        if wandering_count > 0:
            self.crop_health = max(0.0, self.crop_health - wandering_count * 0.02)

        # ── 3. Apply scare energy cost ───────────────────────────────
        self.drone.apply_scare_cost(n_currently_scared)

        # ── 4. Step penalty, energy warnings, and shaping ───────────────
        reward += self.config.reward_step

        if self.drone.energy_ratio < 0.2 and not self.is_charging:
            reward += self.config.reward_low_energy

        # Distance-based shaping: reward moving closer to nearest active bird
        active = self.active_birds
        if active:
            dists = [np.linalg.norm(self.drone.position - b.position) for b in active]
            nearest_dist = float(min(dists))
            progress = self._prev_nearest_dist - nearest_dist  # positive = getting closer
            reward += self.config.reward_approach * progress
            self._prev_nearest_dist = nearest_dist

        # Boundary wall penalty: penalise when drone is within 15 units of any wall
        margin = 15.0
        x, y = float(self.drone.position[0]), float(self.drone.position[1])
        x_min, y_min, x_max, y_max = self.farm.bounds
        if x < x_min + margin or x > x_max - margin or y < y_min + margin or y > y_max - margin:
            reward += self.config.reward_wall

        # ── 5. Wave Progression / Terminal conditions ─────────────────
        # All birds cleared in current wave: advance wave!
        if len(self.active_birds) == 0:
            reward += self.config.reward_all_cleared
            self.wave += 1
            self.harvest_saved += 120.0 + self.crop_health * 1.5
            self.drone.recharge(25.0)  # tactical reload bonus

            # Spawn next escalating wave
            n_next_wave = min(3 + (self.wave - 1) * 2, 9)
            bird_spawns = self.farm.bird_spawns(n_next_wave)
            self.birds = [
                Bird(
                    start_x=float(pos[0]),
                    start_y=float(pos[1]),
                    world_bounds=self.farm.bounds,
                    config=BirdConfig(
                        wander_speed=min(3.5, 1.5 + (self.wave - 1) * 0.2),
                        flee_speed=min(6.5, 4.0 + (self.wave - 1) * 0.3),
                    ),
                    rng=self.rng,
                )
                for pos in bird_spawns
            ]
            self.birds_scared_off = 0
            if self.active_birds:
                dists = [np.linalg.norm(self.drone.position - b.position) for b in self.active_birds]
                self._prev_nearest_dist = float(min(dists))

        # Terminal conditions:
        # Crop health depleted (failure)
        if self.crop_health <= 0:
            self.done = True

        # Drone completely out of energy and not charging
        if not self.drone.is_active and not self.is_charging:
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
        drone_vec = self.drone.get_state_vector(w, h) if self.drone else np.zeros(5, dtype=np.float32)

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

    def trigger_pulse(self):
        """Fire sonic acoustic deterrent wave."""
        self.pulse_timer = 10
        pulse_radius = 160.0
        for bird in self.active_birds:
            d = np.linalg.norm(bird.position - self.drone.position)
            if d <= pulse_radius:
                bird.state = BirdState.FLEEING
                # Give strong fleeing burst away from drone
                away = bird.position - self.drone.position
                norm = np.linalg.norm(away)
                if norm > 0:
                    bird.position = bird.position + (away / norm) * 20.0

    def _get_info(self) -> dict:
        return {
            "steps":            self.steps,
            "total_reward":     round(self.total_reward, 2),
            "birds_scared_off": self.birds_scared_off,
            "birds_remaining":  len(self.active_birds),
            "drone_energy":     round(self.drone.energy, 1),
            "drone_pos":        self.drone.position.tolist(),
            "wave":             self.wave,
            "crop_health":      round(self.crop_health, 1),
            "harvest_saved":    round(self.harvest_saved, 2),
            "is_charging":      self.is_charging,
        }

    def get_render_state(self) -> dict:
        """
        Return full world state as a dict for the API / React frontend.
        Called every frame by the FastAPI server.
        """
        return {
            "drone": {
                "x":           float(self.drone.position[0]),
                "y":           float(self.drone.position[1]),
                "energy":      float(self.drone.energy),
                "active":      self.drone.is_active,
                "is_charging": self.is_charging,
            },
            "birds": [
                {
                    "x":     float(b.position[0]),
                    "y":     float(b.position[1]),
                    "state": b.state.name,
                }
                for b in self.birds
            ],
            "charging_station": {
                "x":         float(self.charging_pad[0]),
                "y":         float(self.charging_pad[1]),
                "radius":    float(self.dock_radius),
                "is_docked": self.is_charging,
            },
            "crops": {
                "health":        round(self.crop_health, 1),
                "harvest_saved": round(self.harvest_saved, 2),
                "damage_rate":   round(len([b for b in self.birds if b.state == BirdState.WANDERING]) * 0.02, 3),
            },
            "wave":         self.wave,
            "pulse_active": self.pulse_timer > 0,
            "obstacles":    self.farm.get_obstacle_data(),
            "info":         self._get_info(),
            "done":         self.done,
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