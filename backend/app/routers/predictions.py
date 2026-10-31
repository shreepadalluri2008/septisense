"""
Predictions & Model Card Router
"""

import json
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Prediction
from ..schemas import PredictionResponse
from ..config import settings

router = APIRouter(prefix="/api", tags=["Predictions & Model Card"])

@router.get("/patients/{patient_id}/predictions", response_model=List[PredictionResponse])
def get_patient_predictions(patient_id: int, limit: int = 100, db: Session = Depends(get_db)):
    preds = (
        db.query(Prediction)
        .filter(Prediction.patient_id == patient_id)
        .order_by(Prediction.ts_ms.desc())
        .limit(limit)
        .all()
    )
    result = []
    for p in reversed(preds):
        feats = {}
        try:
            feats = json.loads(p.features_snapshot_json) if p.features_snapshot_json else {}
        except Exception:
            pass
        result.append(PredictionResponse(
            id=p.id,
            patient_id=p.patient_id,
            ts_ms=p.ts_ms,
            risk_probability=p.risk_probability,
            horizon_hours=p.horizon_hours,
            is_alert=p.is_alert,
            insufficient_data=p.insufficient_data,
            rhythm_class=p.rhythm_class,
            rhythm_label=p.rhythm_label,
            features_snapshot=feats
        ))
    return result

@router.get("/model/card")
def get_model_card():
    """
    Returns authentic held-out test performance and architecture specifications
    from ml/reports/metrics.json and feature specs.
    """
    metrics_data = {}
    if settings.METRICS_JSON_PATH.exists():
        with open(settings.METRICS_JSON_PATH) as f:
            metrics_data = json.load(f)
            
    sepsis_spec = {}
    if settings.FEATURE_SPEC_PATH.exists():
        with open(settings.FEATURE_SPEC_PATH) as f:
            sepsis_spec = json.load(f)
            
    ecg_spec = {}
    if settings.ECG_SPEC_PATH.exists():
        with open(settings.ECG_SPEC_PATH) as f:
            ecg_spec = json.load(f)
            
    return {
        "project": "SeptiSense IoT Patient Monitoring & Sepsis Early-Warning",
        "regulatory_notice": settings.REGULATORY_NOTICE,
        "metrics": metrics_data,
        "model_a_sepsis": {
            "name": "Model A: Sepsis Early-Warning Risk",
            "horizon": "6 hours",
            "training_source": "PhysioNet CinC Challenge 2019 (Hospital Systems A & B)",
            "split_strategy": "Patient-Level GroupShuffleSplit (Zero Row Leakage)",
            "spec": sepsis_spec
        },
        "model_b_ecg": {
            "name": "Model B: ECG Signal Quality & Rhythm Classifier",
            "training_source": "PhysioNet CinC Challenge 2017 & MIT-BIH Arrhythmia Database",
            "sampling_frequency": 250,
            "spec": ecg_spec
        }
    }
