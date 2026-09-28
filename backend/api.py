import os
import sys
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure project root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.ai.agent import DQNAgent
from backend.simulation.environment import EnvConfig, Environment

app = FastAPI(
    title="Drone Scarecrow Simulator API",
    description="REST API streaming drone simulation state to React frontend",
    version="1.0.0",
)

# Enable CORS for frontend clients (e.g. Vercel deployment and local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------------
# State Management (Singleton Environment & Agent)
# ----------------------------------------------------------------------
class SimulationManager:
    """Manages server-side singleton simulation and DQN agent instance."""

    def __init__(self):
        self.env = Environment()
        self.agent = DQNAgent(
            obs_size=self.env.obs_size,
            n_actions=self.env.n_actions,
        )
        self.current_obs = self.env.reset()
        self.model_loaded = False
        self.model_path: Optional[str] = None

        # Automatically load best model if already present on disk
        default_model = "models/best.pth"
        if os.path.exists(default_model):
            try:
                self.agent.load(default_model)
                self.model_loaded = True
                self.model_path = default_model
                print(f"Loaded existing model from {default_model}")
            except Exception as e:
                print(f"Warning: Failed to load {default_model}: {e}")

    def reset(self) -> Dict[str, Any]:
        """Reset the simulation environment."""
        self.current_obs = self.env.reset()
        return self.get_state()

    def get_state(self) -> Dict[str, Any]:
        """Return the current render state dictionary."""
        state = self.env.get_render_state()
        state["model_loaded"] = self.model_loaded
        state["model_path"] = self.model_path
        return state

    def step(self, action: Optional[int] = None, mode: str = "agent") -> Dict[str, Any]:
        """Advance the simulation by one step."""
        if self.env.done:
            self.reset()

        if mode == "agent" or action is None:
            # Greedy action chosen by agent
            chosen_action = self.agent.select_action(self.current_obs, evaluate=True)
        else:
            chosen_action = int(action)

        next_obs, reward, done, info = self.env.step(chosen_action)
        self.current_obs = next_obs

        state = self.get_state()
        state["action_taken"] = chosen_action
        state["reward"] = reward
        return state

    def load_model(self, path: str) -> bool:
        """Load weights from specified checkpoint file."""
        if not os.path.exists(path):
            return False
        self.agent.load(path)
        self.model_loaded = True
        self.model_path = path
        return True


sim_manager = SimulationManager()


# ----------------------------------------------------------------------
# Request / Response Models
# ----------------------------------------------------------------------
class StepRequest(BaseModel):
    action: Optional[int] = Field(
        None, ge=0, le=8, description="Action index (0-8) if in manual mode"
    )
    mode: str = Field(
        "agent", description="'agent' for autonomous AI control, 'manual' for user input"
    )


class LoadModelRequest(BaseModel):
    path: str = Field("models/best.pth", description="File path to .pth checkpoint")


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------
@app.get("/health")
def health_check():
    """Health check endpoint for deployment monitoring."""
    return {"status": "ok"}


@app.get("/farm")
def get_farm():
    """Return static farm layout, dimensions, and obstacles."""
    return {
        "bounds": sim_manager.env.farm.bounds,
        "width": sim_manager.env.farm.config.width,
        "height": sim_manager.env.farm.config.height,
        "obstacles": sim_manager.env.farm.get_obstacle_data(),
    }


@app.get("/state")
def get_state():
    """Return the current simulation frame for frontend rendering."""
    return sim_manager.get_state()


@app.post("/reset")
def reset_simulation():
    """Reset the simulation environment and return initial state."""
    return sim_manager.reset()


@app.post("/step")
def step_simulation(request: Optional[StepRequest] = None):
    """Advance simulation one step with agent or manual action."""
    action = request.action if request else None
    mode = request.mode if request else "agent"
    return sim_manager.step(action=action, mode=mode)


@app.post("/load-model")
def load_model(request: LoadModelRequest):
    """Load a trained model checkpoint."""
    success = sim_manager.load_model(request.path)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Model checkpoint not found at path: {request.path}",
        )
    return {
        "status": "ok",
        "message": f"Successfully loaded model from {request.path}",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.api:app", host="0.0.0.0", port=port, reload=True)
