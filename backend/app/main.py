"""
SeptiSense FastAPI Application Entrypoint
"""

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import engine, Base
from .models import Patient, Device
from .ingest import register_ws_broadcaster
from .serial_service import serial_service
from .replay_service import replay_service
from .routers.websocket import manager

# Import routers
from .routers import (
    telemetry, patients, devices, alerts, predictions, care, replay, websocket
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database tables are created
    Base.metadata.create_all(bind=engine)
    
    # Register WebSocket broadcast callback into ingest pipeline
    register_ws_broadcaster(manager.threadsafe_broadcast)
    
    # Optional auto-connect serial port on startup if available
    auto_port = serial_service.auto_detect_port()
    if auto_port:
        print(f"[STARTUP] Auto-connecting to serial device: {auto_port}")
        serial_service.connect(auto_port, baud=settings.DEFAULT_BAUD)
    else:
        print("[STARTUP] No hardware serial device detected; ready for HTTP or Replay mode.")
        
    yield
    
    # Shutdown
    serial_service.disconnect()
    replay_service.stop_replay()
    print("[SHUTDOWN] SeptiSense backend stopped cleanly.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="IoT Patient Monitoring & Sepsis Early-Warning Research Platform",
    lifespan=lifespan
)

# CORS configuration for Frontend Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

reports_dir = Path(__file__).resolve().parent.parent.parent / "ml" / "reports"
if reports_dir.exists():
    app.mount("/reports", StaticFiles(directory=str(reports_dir)), name="reports")

# Mount all feature routers
app.include_router(telemetry.router)
app.include_router(patients.router)
app.include_router(devices.router)
app.include_router(alerts.router)
app.include_router(predictions.router)
app.include_router(care.router)
app.include_router(care.aux_router)
app.include_router(replay.router)
app.include_router(websocket.router)

@app.get("/api")
def root():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "regulatory_notice": settings.REGULATORY_NOTICE,
        "docs_url": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "serial_connected": serial_service.is_connected,
        "replay_active": replay_service.is_active,
        "regulatory_notice": settings.REGULATORY_NOTICE
    }

# Mount static React frontend build if dist folder exists (for production single-port deployment)
frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
else:
    @app.get("/")
    def fallback_root():
        return root()
