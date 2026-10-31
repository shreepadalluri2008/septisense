"""
Test ML Inference Service
"""

import numpy as np
from backend.app.inference import predict_sepsis_risk, classify_ecg_chunk

def test_insufficient_data_handling():
    # Only 2 readings provided: must return insufficient_data=True
    scarce_readings = [
        {"hr_bpm": 75.0, "spo2_pct": 98.0, "temp_c": 36.8, "resp_rate": 16.0, "ts_ms": 1000},
        {"hr_bpm": 76.0, "spo2_pct": 98.0, "temp_c": 36.8, "resp_rate": 16.0, "ts_ms": 2000}
    ]
    res = predict_sepsis_risk(scarce_readings, patient_age=60.0, patient_gender=1)
    assert res["insufficient_data"] is True
    assert res["risk_probability"] is None
    assert "Insufficient data" in res["reason"]

def test_sepsis_risk_prediction():
    # 15 readings representing septic deterioration: Tachycardia, fever, tachypnea
    dense_readings = [
        {"hr_bpm": 95.0 + (i * 1.5), "spo2_pct": 94.0 - (i * 0.3), "temp_c": 38.2 + (i * 0.05), "resp_rate": 22.0, "ts_ms": i * 60000}
        for i in range(15)
    ]
    res = predict_sepsis_risk(dense_readings, patient_age=72.0, patient_gender=1)
    assert res["insufficient_data"] is False
    assert res["risk_probability"] is not None
    assert 0.0 <= res["risk_probability"] <= 1.0
    assert res["horizon_hours"] == 6
    assert "HR" in res["features_snapshot"]

def test_ecg_model_b_classification():
    # 5 seconds of 250 Hz signal (1250 samples)
    t = np.linspace(0, 5.0, 1250)
    # Synthetic QRS pulse train
    ecg_sig = [int(2048 + 500 * np.sin(2 * np.pi * 1.2 * ti)) for ti in t]
    
    res = classify_ecg_chunk(ecg_sig, fs=250)
    assert "rhythm_class" in res
    assert "rhythm_label" in res
    assert "clinical_presentation" in res
    assert res["rhythm_class"] in [0, 1, 2, 3]
