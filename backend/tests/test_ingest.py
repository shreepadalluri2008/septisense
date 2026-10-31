"""
Test Telemetry Ingest & Data Integrity
"""

import time
import json
import zlib
from backend.app.schemas import TelemetryPayload, TelemetryFlags
from backend.app.ingest import validate_crc32, process_telemetry_payload
from backend.app.models import Reading, QualityScore

def test_crc32_validation():
    packet = {
        "device_id": "esp32-01",
        "patient_id": 1,
        "ts_ms": 1730000000000,
        "hr_bpm": 78.0,
        "spo2_pct": 98.0,
        "temp_c": 36.8
    }
    raw_str = json.dumps(packet, sort_keys=True).encode("utf-8")
    crc = zlib.crc32(raw_str) & 0xffffffff
    
    assert validate_crc32(packet, crc) is True
    assert validate_crc32(packet, crc + 1) is False

def test_telemetry_post_endpoint(client):
    payload = {
        "device_id": "esp32-test",
        "patient_id": 1,
        "ts_ms": time.time() * 1000,
        "time_synced": True,
        "buffered": False,
        "hr_bpm": 82.5,
        "spo2_pct": 98.0,
        "temp_c": 37.1,
        "ecg": [2048] * 250,
        "ecg_fs": 250,
        "flags": {
            "leads_off": False,
            "finger_off": False,
            "adc_saturated": False
        },
        "rssi": -62
    }
    
    resp = client.post("/api/telemetry", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["patient_id"] == 1
    assert "overall_sqi" in data
    assert data["overall_sqi"] > 0

def test_physiological_bounds_filtering(db_session):
    # Impossible vitals: HR = 999, SpO2 = 150, Temp = 99
    payload = TelemetryPayload(
        device_id="esp32-test",
        patient_id=1,
        ts_ms=time.time() * 1000,
        hr_bpm=999.0,
        spo2_pct=150.0,
        temp_c=99.0,
        flags=TelemetryFlags()
    )
    res = process_telemetry_payload(db_session, payload)
    assert res["status"] == "ok"
    
    # Check that stored reading in DB sanitized impossible vitals to None
    reading = db_session.query(Reading).order_by(Reading.id.desc()).first()
    assert reading.hr_bpm is None
    assert reading.spo2_pct is None
    assert reading.temp_c is None

def test_buffered_telemetry_order(client):
    # Simulates link interruption: sending 3 buffered packets followed by live packet
    t0 = time.time() * 1000
    for i in range(3):
        p = {
            "device_id": "esp32-test",
            "patient_id": 1,
            "ts_ms": t0 + (i * 1000),
            "buffered": True,
            "hr_bpm": 70.0 + i,
            "spo2_pct": 97.0,
            "temp_c": 36.6,
            "flags": {"leads_off": False, "finger_off": False, "adc_saturated": False}
        }
        res = client.post("/api/telemetry", json=p)
        assert res.status_code == 200
        
    # Query readings list
    read_resp = client.get("/api/patients/1/readings?limit=10")
    assert read_resp.status_code == 200
    readings = read_resp.json()
    assert len(readings) == 3
    # Check chronological ordering
    assert readings[0]["ts_ms"] < readings[1]["ts_ms"] < readings[2]["ts_ms"]
    assert readings[0]["buffered"] is True
