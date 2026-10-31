"""
WebSocket Live Telemetry Push Router
Streams 1 Hz vitals, waveforms, real-time SQI, and active alerts to connected browser dashboards.
"""

import json
import asyncio
from typing import Dict, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["WebSocket"])

class ConnectionManager:
    def __init__(self):
        # Maps patient_id -> list of active WebSocket connections
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.loop: asyncio.AbstractEventLoop = None

    async def connect(self, websocket: WebSocket, patient_id: int):
        await websocket.accept()
        if patient_id not in self.active_connections:
            self.active_connections[patient_id] = []
        self.active_connections[patient_id].append(websocket)
        # Record event loop for thread-safe cross-thread broadcasting from serial/replay threads
        self.loop = asyncio.get_event_loop()

    def disconnect(self, websocket: WebSocket, patient_id: int):
        if patient_id in self.active_connections:
            if websocket in self.active_connections[patient_id]:
                self.active_connections[patient_id].remove(websocket)
            if not self.active_connections[patient_id]:
                del self.active_connections[patient_id]

    async def broadcast_to_patient(self, patient_id: int, message: dict):
        if patient_id in self.active_connections:
            dead_conns = []
            for connection in self.active_connections[patient_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception:
                    dead_conns.append(connection)
            for dc in dead_conns:
                self.disconnect(dc, patient_id)

    def threadsafe_broadcast(self, patient_id: int, message: dict):
        """Called from synchronous background ingest threads (Serial or Replay)."""
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast_to_patient(patient_id, message), self.loop)

manager = ConnectionManager()

@router.websocket("/ws/live/{patient_id}")
async def websocket_live_stream(websocket: WebSocket, patient_id: int):
    await manager.connect(websocket, patient_id)
    try:
        # Send initial handshake message
        await websocket.send_text(json.dumps({
            "type": "HANDSHAKE_OK",
            "patient_id": patient_id,
            "message": "Connected to SeptiSense Live Telemetry Stream."
        }))
        while True:
            # Keep connection open; receive optional client pings
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, patient_id)
    except Exception:
        manager.disconnect(websocket, patient_id)
