"""
Alerts Router
"""

from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert
from ..schemas import AlertResponse, AlertAckRequest

router = APIRouter(prefix="/api", tags=["Alerts"])

@router.get("/patients/{patient_id}/alerts", response_model=List[AlertResponse])
def get_patient_alerts(patient_id: int, unacknowledged_only: bool = False, limit: int = 100, db: Session = Depends(get_db)):
    query = db.query(Alert).filter(Alert.patient_id == patient_id)
    if unacknowledged_only:
        query = query.filter(Alert.acknowledged_at == None)
    alerts = query.order_by(Alert.ts_ms.desc()).limit(limit).all()
    return alerts

@router.get("/alerts", response_model=List[AlertResponse])
def get_alerts_query(patient_id: int = Query(None), unacknowledged_only: bool = False, limit: int = 100, db: Session = Depends(get_db)):
    if patient_id is not None:
        return get_patient_alerts(patient_id, unacknowledged_only, limit, db)
    return get_active_alerts(limit, db)

@router.post("/alerts/{alert_id}/ack")
def acknowledge_alert(alert_id: int, payload: AlertAckRequest, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged_at = datetime.utcnow()
    alert.acknowledged_by = payload.acknowledged_by
    db.commit()
    db.refresh(alert)
    return {"status": "acknowledged", "alert_id": alert.id, "acknowledged_at": alert.acknowledged_at}

@router.get("/alerts/active", response_model=List[AlertResponse])
def get_active_alerts(limit: int = 50, db: Session = Depends(get_db)):
    alerts = (
        db.query(Alert)
        .filter(Alert.acknowledged_at == None)
        .order_by(Alert.ts_ms.desc())
        .limit(limit)
        .all()
    )
    return alerts
