"""
Telemetry Router
Handles 1 Hz packet ingestion (HTTP fallback and manual push) and historical reading queries.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Reading, QualityScore
from ..schemas import TelemetryPayload, ReadingResponse
from ..ingest import process_telemetry_payload

router = APIRouter(prefix="/api", tags=["Telemetry"])

@router.post("/telemetry")
def ingest_telemetry(payload: TelemetryPayload, db: Session = Depends(get_db)):
    """
    Ingest a 1-second telemetry packet from ESP32 (or fallback HTTP).
    Feeds the same unified processing pipeline as Serial ingest.
    """
    res = process_telemetry_payload(db, payload)
    return res

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
