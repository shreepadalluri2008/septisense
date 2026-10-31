"""
Test Alert Engine & Debounce Logic
"""

import time
from backend.app.alert_engine import evaluate_reading_alerts, DEBOUNCE_INTERVAL_SEC
from backend.app.models import Alert, Patient

def test_critical_alerts_generation(db_session):
    p = db_session.query(Patient).filter(Patient.id == 1).first()
    ts = time.time() * 1000
    
    # Severe tachycardia (135 bpm) and critical hypoxia (85% SpO2)
    alerts = evaluate_reading_alerts(
        db=db_session,
        patient=p,
        device_id="esp32-test",
        ts_ms=ts,
        hr_bpm=135.0,
        spo2_pct=85.0,
        temp_c=37.0,
        leads_off=False
    )
    
    assert len(alerts) >= 2
    levels = [a.level for a in alerts]
    assert "critical" in levels

def test_alert_debouncing(db_session):
    p = db_session.query(Patient).filter(Patient.id == 1).first()
    ts = time.time() * 1000
    
    # First invocation fires critical alert
    alerts1 = evaluate_reading_alerts(
        db=db_session,
        patient=p,
        device_id="esp32-test",
        ts_ms=ts,
        hr_bpm=140.0,
        spo2_pct=98.0,
        temp_c=37.0,
        leads_off=False
    )
    assert len(alerts1) == 1
    
    # Immediate second invocation (within debounce window) should NOT produce duplicate alert
    alerts2 = evaluate_reading_alerts(
        db=db_session,
        patient=p,
        device_id="esp32-test",
        ts_ms=ts + 1000,
        hr_bpm=141.0,
        spo2_pct=98.0,
        temp_c=37.0,
        leads_off=False
    )
    assert len(alerts2) == 0

def test_alert_acknowledgement(client, db_session):
    p = db_session.query(Patient).filter(Patient.id == 1).first()
    # Create an unacknowledged alert directly
    alert = Alert(
        patient_id=p.id,
        device_id="esp32-test",
        ts_ms=time.time() * 1000,
        level="critical",
        reason="Test Critical Deterioration Alert"
    )
    db_session.add(alert)
    db_session.commit()
    db_session.refresh(alert)
    
    ack_res = client.post(f"/api/alerts/{alert.id}/ack", json={"acknowledged_by": "Nurse Kelly"})
    assert ack_res.status_code == 200
    assert ack_res.json()["status"] == "acknowledged"
    
    db_session.refresh(alert)
    assert alert.acknowledged_at is not None
    assert alert.acknowledged_by == "Nurse Kelly"
