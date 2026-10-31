#!/usr/bin/env bash
# ==============================================================================
# SeptiSense – One-Command Unified Development Launcher
# Starts FastAPI Backend (Port 8000) and Vite Frontend (Port 5173) concurrently.
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "========================================================================"
echo "  SeptiSense: IoT Patient Monitoring & Sepsis Early-Warning Platform   "
echo "  Educational and research prototype. Not clinically validated.         "
echo "========================================================================"

# 1. Check Python virtual environment
VENV_BIN="$PROJECT_ROOT/.venv/bin"
if [ ! -f "$VENV_BIN/python3" ]; then
    echo "[ERROR] Python virtual environment not found at .venv"
    echo "Please create a virtual environment first: python3 -m venv .venv"
    exit 1
fi

# 2. Check Node modules in frontend
if [ ! -d "$PROJECT_ROOT/frontend/node_modules" ]; then
    echo "[SETUP] Installing frontend npm dependencies..."
    (cd "$PROJECT_ROOT/frontend" && npm install)
fi

# 3. Ensure reports directory exists
mkdir -p "$PROJECT_ROOT/ml/reports"

# 4. Cleanup function on exit
cleanup() {
    echo ""
    echo "[SHUTDOWN] Stopping SeptiSense services..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
    echo "[SHUTDOWN] All services stopped cleanly."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 5. Launch FastAPI Backend
echo "[STARTUP] Launching FastAPI Backend on http://0.0.0.0:8000 ..."
PYTHONPATH="$PROJECT_ROOT" "$VENV_BIN/python3" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --log-level info &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 1.5

# 6. Launch Vite Frontend (0.0.0.0 for LAN + tunnel access)
echo "[STARTUP] Launching Vite Frontend on http://0.0.0.0:5173 ..."
(cd "$PROJECT_ROOT/frontend" && npm run dev -- --host 0.0.0.0 --port 5173) &
FRONTEND_PID=$!

# 7. Detect LAN IP
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo ""
echo "========================================================================"
echo "  SeptiSense Services Are Online:                                       "
echo "  • Web Dashboard (local):  http://127.0.0.1:5173                       "
echo "  • Web Dashboard (LAN):    http://${LAN_IP}:5173                       "
echo "  • Backend API:            http://127.0.0.1:8000                       "
echo "  • API Swagger Docs:       http://127.0.0.1:8000/docs                  "
echo "                                                                        "
echo "  Press Ctrl+C to shut down all services cleanly.                       "
echo "========================================================================"
echo ""

# Keep launcher process running to monitor child processes
wait
