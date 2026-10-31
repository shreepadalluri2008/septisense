"""
Devices & Serial Management Router
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Device
from ..schemas import DeviceResponse, SerialConnectRequest, SerialStatusResponse
from ..serial_service import serial_service

router = APIRouter(prefix="/api", tags=["Devices & Serial"])

@router.get("/devices", response_model=List[DeviceResponse])
def list_devices(db: Session = Depends(get_db)):
    devices = db.query(Device).all()
    if not devices:
        default_dev = Device(
            device_id="esp32-01",
            label="ESP32 SeptiSense Node (Primary)",
            transport="SERIAL_USB",
            baud_rate=921600,
            is_connected=serial_service.is_connected
        )
        db.add(default_dev)
        db.commit()
        db.refresh(default_dev)
        devices = [default_dev]
    return devices

@router.get("/serial/ports")
def get_available_serial_ports():
    ports = serial_service.list_available_ports()
    auto_port = serial_service.auto_detect_port()
    return {
        "ports": ports,
        "auto_detected_port": auto_port,
        "current_status": serial_service.get_status()
    }

@router.post("/serial/connect")
def connect_serial_port(payload: SerialConnectRequest):
    ok = serial_service.connect(port=payload.port, baud=payload.baud_rate)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Failed to connect to serial port {payload.port}")
    return {"status": "connected", "port": payload.port, "baud": payload.baud_rate}

@router.post("/serial/disconnect")
def disconnect_serial_port():
    serial_service.disconnect()
    return {"status": "disconnected"}

@router.get("/serial/status", response_model=SerialStatusResponse)
def get_serial_status():
    return serial_service.get_status()
