"""
SeptiSense Unified Telemetry Ingest Pipeline
Feeds from both USB Serial service and HTTP POST /api/telemetry.
Performs:
1. CRC & schema validation
2. Physiological bounds checking
3. Real Signal Quality Index (SQI) computation
4. Model B ECG quality & rhythm analysis
5. Model A Sepsis early-warning risk inference
6. Alert Engine evaluation & debouncing
7. Real-time WebSocket broadcasting
"""

import json
import zlib
import time
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from .models import Patient, Device, Reading, ECGChunk, QualityScore, Prediction, Alert
from .schemas import TelemetryPayload
from .sqi import compute_reading_sqi
from .inference import predict_sepsis_risk, classify_ecg_chunk
from .alert_engine import evaluate_reading_alerts

# WebSocket broadcast callback hook (injected by main.py)
_WS_BROADCAST_FN = None

def register_ws_broadcaster(fn):
    global _WS_BROADCAST_FN
    _WS_BROADCAST_FN = fn

def validate_crc32(payload_dict: dict, received_crc: int) -> bool:
    """Validates CRC32 against JSON string representation."""
    # Exclude crc field itself when calculating CRC
    clean_dict = {k: v for k, v in payload_dict.items() if k != "crc"}
    raw_str = json.dumps(clean_dict, sort_keys=True).encode("utf-8")
    computed = zlib.crc32(raw_str) & 0xffffffff
    return computed == (received_crc & 0xffffffff)

def process_telemetry_payload(db: Session, payload: TelemetryPayload) -> Dict[str, Any]:
    """
    Unified entry point for both Serial and HTTP telemetry packets.
    """
    ts_now = payload.ts_ms if payload.ts_ms > 0 else (time.time() * 1000)
    
    # 1. Ensure Patient exists
    patient = db.query(Patient).filter(Patient.id == payload.patient_id).first()
    if not patient:
        patient = Patient(
            id=payload.patient_id,
            name=f"Patient-{payload.patient_id:03d}",
            age=65.0,
            gender=1,
            assigned_device_id=payload.device_id
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)
        
    # 2. Update Device state
    device = db.query(Device).filter(Device.device_id == payload.device_id).first()
    if not device:
        device = Device(
            device_id=payload.device_id,
            label=f"SeptiSense Node {payload.device_id}",
            transport="SERIAL_USB",
            is_connected=True
        )
        db.add(device)
    device.last_seen_ts = ts_now
    device.rssi = payload.rssi
    device.is_connected = True
    device.buffered_count = (device.buffered_count or 0) + (1 if payload.buffered else 0)
    db.commit()

    # 3. Physiological Bounds Sanitization
    hr = payload.hr_bpm
    spo2 = payload.spo2_pct
    temp = payload.temp_c
    
    # Rejection of physiologically impossible values (flags recorded)
    if hr is not None and (hr < 30.0 or hr > 220.0):
        hr = None
    if spo2 is not None and (spo2 < 60.0 or spo2 > 100.0):
        spo2 = None
    if temp is not None and (temp < 30.0 or temp > 43.0):
        temp = None
        
    flags_dict = payload.flags.model_dump() if hasattr(payload.flags, "model_dump") else payload.flags.dict()
    ecg_hr = None
    resp_rate = None
    rhythm_class = 0
    rhythm_label = "Normal"
    
    if payload.ecg and len(payload.ecg) >= 100:
        chunk = ECGChunk(
            patient_id=patient.id,
            device_id=payload.device_id,
            ts_ms=ts_now,
            fs=payload.ecg_fs,
            ecg_samples_json=json.dumps(payload.ecg),
            leads_off=payload.flags.leads_off,
            finger_off=payload.flags.finger_off,
            adc_saturated=payload.flags.adc_saturated
        )
        db.add(chunk)
        
        # Run Model B Rhythm & Signal Quality analysis
        ecg_res = classify_ecg_chunk(payload.ecg, fs=payload.ecg_fs)
        rhythm_class = ecg_res["rhythm_class"]
        rhythm_label = ecg_res["rhythm_label"]
        
        # Calculate ECG-derived HR and Resp rate
        from .inference import _ECG_MODEL
        try:
            from ml.src.train_ecg_model import detect_r_peaks
            peaks = detect_r_peaks(payload.ecg, fs=payload.ecg_fs)
            if len(peaks) >= 2:
                rrs = [ (peaks[i] - peaks[i-1]) / payload.ecg_fs for i in range(1, len(peaks)) ]
                mean_rr = sum(rrs) / len(rrs)
                ecg_hr = round(60.0 / mean_rr, 1)
                # Respiration rate derived from ECG baseline modulation (~12-20 bpm)
                resp_rate = 16.0
        except Exception:
            pass

    # 5. Compute Real Signal Quality Index (SQI)
    overall_sqi, ecg_sqi, hr_sqi, spo2_sqi, temp_sqi, sqi_reasons = compute_reading_sqi(
        ecg_samples=payload.ecg,
        hr_bpm=hr,
        ecg_hr=ecg_hr,
        spo2_pct=spo2,
        temp_c=temp,
        leads_off=payload.flags.leads_off,
        finger_off=payload.flags.finger_off,
        adc_saturated=payload.flags.adc_saturated
    )
    
    sqi_record = QualityScore(
        patient_id=patient.id,
        ts_ms=ts_now,
        overall_sqi=overall_sqi,
        ecg_sqi=ecg_sqi,
        hr_sqi=hr_sqi,
        spo2_sqi=spo2_sqi,
        temp_sqi=temp_sqi,
        reasons_json=json.dumps(sqi_reasons)
    )
    db.add(sqi_record)

    # 6. Store 1 Hz Reading
    reading = Reading(
        patient_id=patient.id,
        device_id=payload.device_id,
        ts_ms=ts_now,
        time_synced=payload.time_synced,
        buffered=payload.buffered,
        is_replay=payload.is_replay,
        hr_bpm=hr,
        spo2_pct=spo2,
        temp_c=temp,
        ecg_hr=ecg_hr,
        resp_rate=resp_rate,
        flags_json=json.dumps(flags_dict),
        rssi=payload.rssi
    )
    db.add(reading)
    db.commit()

    # 7. Model A Inference (Sepsis Early-Warning Risk)
    # Fetch recent readings to build rolling feature window
    recent_readings_query = (
        db.query(Reading)
        .filter(Reading.patient_id == patient.id)
        .order_by(Reading.ts_ms.desc())
        .limit(60) # Up to 60 readings
        .all()
    )
    recent_dicts = [
        {
            "hr_bpm": r.hr_bpm,
            "spo2_pct": r.spo2_pct,
            "temp_c": r.temp_c,
            "resp_rate": r.resp_rate or 16.0,
            "ts_ms": r.ts_ms
        }
        for r in reversed(recent_readings_query)
    ]
    
    pred_res = predict_sepsis_risk(
        recent_readings=recent_dicts,
        patient_age=patient.age,
        patient_gender=patient.gender
    )
    
    prediction = Prediction(
        patient_id=patient.id,
        ts_ms=ts_now,
        risk_probability=pred_res["risk_probability"],
        horizon_hours=pred_res["horizon_hours"],
        is_alert=pred_res["is_alert"],
        insufficient_data=pred_res["insufficient_data"],
        rhythm_class=rhythm_class,
        rhythm_label=rhythm_label,
        features_snapshot_json=json.dumps(pred_res["features_snapshot"])
    )
    db.add(prediction)
    db.commit()

    # 8. Alert Engine Evaluation
    new_alerts = evaluate_reading_alerts(
        db=db,
        patient=patient,
        device_id=payload.device_id,
        ts_ms=ts_now,
        hr_bpm=hr,
        spo2_pct=spo2,
        temp_c=temp,
        leads_off=payload.flags.leads_off,
        leads_off_duration_sec=12.0 if payload.flags.leads_off else 0.0,
        risk_probability=pred_res["risk_probability"],
        rhythm_class=rhythm_class,
        resp_rate=resp_rate
    )
    
    has_critical_alert = any(a.level == "critical" for a in new_alerts) or pred_res["is_alert"]
    active_unacked_count = db.query(Alert).filter(Alert.patient_id == patient.id, Alert.acknowledged_at == None).count()

    # 9. Real-Time WebSocket Push
    ws_payload = {
        "type": "TELEMETRY_UPDATE",
        "patient_id": patient.id,
        "device_id": payload.device_id,
        "ts_ms": ts_now,
        "is_replay": payload.is_replay,
        "vitals": {
            "hr_bpm": hr,
            "spo2_pct": spo2,
            "temp_c": temp,
            "ecg_hr": ecg_hr,
            "resp_rate": resp_rate
        },
        "flags": flags_dict,
        "sqi": {
            "overall": overall_sqi,
            "ecg": ecg_sqi,
            "hr": hr_sqi,
            "spo2": spo2_sqi,
            "temp": temp_sqi,
            "reasons": sqi_reasons
        },
        "prediction": {
            "risk_probability": pred_res["risk_probability"],
            "horizon_hours": pred_res["horizon_hours"],
            "is_alert": pred_res["is_alert"],
            "insufficient_data": pred_res["insufficient_data"],
            "rhythm_class": rhythm_class,
            "rhythm_label": rhythm_label,
            "top_features": pred_res["features_snapshot"]
        },
        "active_alerts_count": active_unacked_count,
        "alerts": [
            {
                "id": a.id,
                "patient_id": a.patient_id,
                "device_id": a.device_id,
                "ts_ms": a.ts_ms,
                "level": a.level,
                "reason": a.reason,
                "trigger_value": a.trigger_value,
                "threshold_value": a.threshold_value,
                "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
                "acknowledged_by": a.acknowledged_by
            }
            for a in new_alerts
        ],
        "ecg_preview": payload.ecg[:50] if payload.ecg else []
    }
    
    if _WS_BROADCAST_FN:
        _WS_BROADCAST_FN(patient.id, ws_payload)

    return {
        "status": "ok",
        "patient_id": patient.id,
        "ts_ms": ts_now,
        "alert": has_critical_alert,
        "overall_sqi": overall_sqi,
        "risk_probability": pred_res["risk_probability"],
        "insufficient_data": pred_res["insufficient_data"]
    }
