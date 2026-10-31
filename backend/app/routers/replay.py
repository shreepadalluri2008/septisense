"""
Replay Mode Router
Streams real PhysioNet Challenge records through the live ingest pipeline.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..schemas import ReplayStartRequest, ReplayStatusResponse
from ..replay_service import replay_service

router = APIRouter(prefix="/api/replay", tags=["Replay Mode"])

class ReplaySpeedRequest(BaseModel):
    speed_factor: float = 1.0

@router.post("/start", response_model=ReplayStatusResponse)
def start_replay(payload: ReplayStartRequest):
    ok = replay_service.start_replay(
        patient_id=payload.patient_id,
        record_id=payload.record_id or "p000001",
        speed_factor=payload.speed_factor,
        loop=payload.loop
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to start replay stream. Verify real PhysioNet records are in ml/data/raw/challenge-2019/.")
    return replay_service.get_status()

@router.post("/speed", response_model=ReplayStatusResponse)
def set_replay_speed(payload: ReplaySpeedRequest):
    replay_service.set_speed(payload.speed_factor)
    return replay_service.get_status()

@router.post("/stop", response_model=ReplayStatusResponse)
def stop_replay():
    replay_service.stop_replay()
    return replay_service.get_status()

@router.get("/status", response_model=ReplayStatusResponse)
def get_replay_status():
    return replay_service.get_status()
