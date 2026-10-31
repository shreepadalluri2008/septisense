"""
Test Replay Service
"""

import time

def test_replay_lifecycle(client):
    # Start Replay
    start_payload = {
        "patient_id": 1,
        "record_id": "p000001",
        "speed_factor": 5.0,
        "loop": False
    }
    res = client.post("/api/replay/start", json=start_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["is_active"] is True
    assert data["patient_id"] == 1
    
    # Check status
    time.sleep(1.0)
    status_res = client.get("/api/replay/status")
    assert status_res.status_code == 200
    st = status_res.json()
    assert st["current_hour"] >= 1
    
    # Stop Replay
    stop_res = client.post("/api/replay/stop")
    assert stop_res.status_code == 200
    assert stop_res.json()["is_active"] is False

def test_model_card_endpoint(client):
    res = client.get("/api/model/card")
    assert res.status_code == 200
    data = res.json()
    assert "metrics" in data
    assert "model_a_sepsis" in data
    assert "model_b_ecg" in data
    assert "regulatory_notice" in data
