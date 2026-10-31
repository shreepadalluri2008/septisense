"""
Telemetry Router
Handles 1 Hz packet ingestion (HTTP fallback and manual push) and historical reading queries.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Reading, QualityScore
from ..schemas import TelemetryPayload, ReadingResponse
from ..ingest import process_telemetry_payload
import server as esp32_server

router = APIRouter(prefix="/api", tags=["Telemetry"])

@router.post("/telemetry")
def ingest_telemetry(body: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """
    Ingest a telemetry packet from ESP32 (supports both server.py batch 'records'
    format AND standard SeptiSense single-packet TelemetryPayload format).
    Feeds both the ESP32 hardware engine (server.py) and the unified SeptiSense pipeline.
    """
    stored = 0
    try:
        stored = esp32_server.ingest(body)
        esp32_server.inference_cycle()
    except Exception as e:
        print(f"[ESP32_SERVER] Ingest warning: {e}")

    # Extract latest record if batch 'records' array was sent by ESP32
    records = body.get("records")
    if isinstance(records, list) and len(records) > 0:
        last_rec = dict(records[-1])
        last_rec["device_id"] = body.get("device_id", "septisense-01")
        last_rec["patient_id"] = body.get("patient_id", 1)
        payload = TelemetryPayload(**last_rec)
    else:
        payload = TelemetryPayload(**body)

    res = process_telemetry_payload(db, payload)
    if isinstance(res, dict):
        res["stored"] = stored or 1
    return res

@router.get("/status")
def get_esp32_status():
    return esp32_server.status_payload()

@router.get("/latest")
def get_esp32_latest(device: Optional[str] = None):
    return esp32_server.latest_payload(device)

@router.get("/history")
def get_esp32_history(minutes: float = 30.0, device: Optional[str] = None):
    return esp32_server.history_payload(minutes, device)

@router.get("/esp32/predictions")
def get_esp32_predictions(limit: int = 200):
    return esp32_server.rows_payload("predictions", limit)

@router.get("/esp32/alerts")
def get_esp32_alerts(limit: int = 50):
    return esp32_server.rows_payload("alerts", limit)

@router.get("/config")
def get_esp32_config():
    return esp32_server.get_config()

@router.post("/config")
def update_esp32_config(body: Dict[str, Any] = Body(...)):
    with esp32_server.db() as c:
        for k, v in body.items():
            if k in esp32_server.CONFIG_LIMITS:
                lo, hi = esp32_server.CONFIG_LIMITS[k]
                v = min(max(float(v), lo), hi)
                c.execute(
                    "INSERT INTO config(key,value) VALUES(?,?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (k, v)
                )
    return esp32_server.get_config()

@router.post("/alerts/ack")
def ack_esp32_alert(body: Dict[str, Any] = Body(...)):
    with esp32_server.db() as c:
        c.execute("UPDATE alerts SET acknowledged=1 WHERE id=?", (int(body.get("id", -1)),))
    return {"ok": True}

@router.get("/model")
def get_esp32_model():
    return esp32_server.model_payload()

@router.get("/patients/{patient_id}/readings", response_model=List[ReadingResponse])
@router.get("/telemetry/readings/{patient_id}", response_model=List[ReadingResponse])
def get_patient_readings(
    patient_id: int,
    from_ts: Optional[float] = Query(None, alias="from"),
    to_ts: Optional[float] = Query(None, alias="to"),
    limit: int = Query(300, ge=1, le=5000),
    db: Session = Depends(get_db)
):
    """
    Queries stored 1 Hz physiological readings with optional time filtering.
    """
    query = db.query(Reading).filter(Reading.patient_id == patient_id)
    if from_ts is not None:
        query = query.filter(Reading.ts_ms >= from_ts)
    if to_ts is not None:
        query = query.filter(Reading.ts_ms <= to_ts)
        
    readings = query.order_by(Reading.ts_ms.desc()).limit(limit).all()
    return list(reversed(readings))

@router.get("/patients/{patient_id}/quality_scores")
@router.get("/telemetry/sqi/{patient_id}")
def get_patient_quality_scores(patient_id: int, limit: int = 50, db: Session = Depends(get_db)):
    """
    Returns latest Signal Quality Index (SQI) records.
    """
    scores = (
        db.query(QualityScore)
        .filter(QualityScore.patient_id == patient_id)
        .order_by(QualityScore.ts_ms.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(scores))
