import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.api import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    print("✓ GET /health passed")


def test_farm():
    response = client.get("/farm")
    assert response.status_code == 200
    data = response.json()
    assert "bounds" in data
    assert "obstacles" in data
    assert len(data["obstacles"]) > 0
    print(f"✓ GET /farm passed (obstacles: {len(data['obstacles'])})")


def test_state():
    response = client.get("/state")
    assert response.status_code == 200
    data = response.json()
    assert "drone" in data
    assert "birds" in data
    assert "info" in data
    assert "done" in data
    print("✓ GET /state passed")


def test_step():
    # Agent mode
    response = client.post("/step", json={"mode": "agent"})
    assert response.status_code == 200
    data = response.json()
    assert "action_taken" in data
    assert "reward" in data

    # Manual mode with explicit action
    response2 = client.post("/step", json={"mode": "manual", "action": 4})
    assert response2.status_code == 200
    assert response2.json()["action_taken"] == 4
    print("✓ POST /step passed")


def test_reset():
    response = client.post("/reset")
    assert response.status_code == 200
    data = response.json()
    assert data["info"]["steps"] == 0
    print("✓ POST /reset passed")


def test_load_model():
    # Not found case
    response = client.post("/load-model", json={"path": "nonexistent_model.pth"})
    assert response.status_code == 404

    # If models/best.pth exists, test loading it
    if os.path.exists("models/best.pth"):
        response2 = client.post("/load-model", json={"path": "models/best.pth"})
        assert response2.status_code == 200
        assert response2.json()["status"] == "ok"
    print("✓ POST /load-model passed")


if __name__ == "__main__":
    test_health()
    test_farm()
    test_state()
    test_step()
    test_reset()
    test_load_model()
    print("\nAll API endpoint tests passed successfully!")
