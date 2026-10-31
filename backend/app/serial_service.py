"""
SeptiSense PySerial Background Service
Auto-detects ESP32 USB serial ports, auto-reconnects on cable disconnection/reconnection,
validates CRC32, and feeds the unified telemetry ingest pipeline.
"""

import sys
import glob
import time
import json
import zlib
import threading
from typing import List, Dict, Any, Optional
import serial
import serial.tools.list_ports

from .schemas import TelemetryPayload
from .database import SessionLocal
from .ingest import process_telemetry_payload

class SerialService:
    def __init__(self):
        self.port: Optional[str] = None
        self.baud: int = 921600
        self.ser: Optional[serial.Serial] = None
        self.is_running: bool = False
        self.is_connected: bool = False
        self.thread: Optional[threading.Thread] = None
        self.last_line_ts: Optional[float] = None
        self.lines_received: int = 0
        self.bad_crc_count: int = 0
        self.lock = threading.Lock()
        
    def list_available_ports(self) -> List[Dict[str, str]]:
        """Scans system for USB serial devices (ESP32, FTDI, CP210x, CH340)."""
        ports = []
        for p in serial.tools.list_ports.comports():
            dev_lower = p.device.lower()
            if "debug-console" in dev_lower or "bluetooth" in dev_lower:
                continue
            ports.append({
                "port": p.device,
                "description": p.description,
                "hwid": p.hwid
            })
            
        # Fallback macOS/Linux glob if list_ports returns empty
        if not ports and sys.platform.startswith("darwin"):
            for dev in glob.glob("/dev/cu.usb*") + glob.glob("/dev/cu.SLAB*"):
                ports.append({"port": dev, "description": "USB Serial Device", "hwid": dev})
        elif not ports and sys.platform.startswith("linux"):
            for dev in glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"):
                ports.append({"port": dev, "description": "USB Serial Device", "hwid": dev})
                
        return ports

    def auto_detect_port(self) -> Optional[str]:
        ports = self.list_available_ports()
        for p in ports:
            name = p["port"].lower()
            desc = p["description"].lower()
            if "debug-console" in name or "bluetooth" in name:
                continue
            if any(k in name or k in desc for k in ["usb", "uart", "cp210", "ch340", "ftdi", "esp", "slab", "wch"]):
                return p["port"]
        return None

    def connect(self, port: Optional[str] = None, baud: int = 921600) -> bool:
        with self.lock:
            if self.is_connected:
                self.disconnect()
                
            target_port = port if (port and port != "AUTO") else self.auto_detect_port()
            if not target_port:
                print("[SERIAL] No USB serial port found for auto-connect.")
                return False
                
            self.port = target_port
            self.baud = baud
            try:
                self.ser = serial.Serial(self.port, self.baud, timeout=1.0)
                self.is_connected = True
                self.is_running = True
                self.thread = threading.Thread(target=self._read_loop, daemon=True)
                self.thread.start()
                print(f"[SERIAL] Connected to {self.port} at {self.baud} baud.")
                return True
            except Exception as e:
                print(f"[SERIAL] Failed to connect to {self.port}: {e}")
                self.ser = None
                self.is_connected = False
                return False

    def disconnect(self):
        with self.lock:
            self.is_running = False
            self.is_connected = False
            if self.ser and self.ser.is_open:
                try:
                    self.ser.close()
                except Exception:
                    pass
            self.ser = None
            print("[SERIAL] Disconnected.")

    def get_status(self) -> Dict[str, Any]:
        return {
            "port": self.port,
            "baud": self.baud,
            "is_connected": self.is_connected,
            "last_line_ts": self.last_line_ts,
            "lines_received": self.lines_received,
            "bad_crc_count": self.bad_crc_count
        }

    def _read_loop(self):
        """Continuously reads newline-terminated JSON lines from the serial port."""
        while self.is_running and self.ser and self.ser.is_open:
            try:
                raw_bytes = self.ser.readline()
                if not raw_bytes:
                    continue
                    
                line_str = raw_bytes.decode("utf-8", errors="ignore").strip()
                if not line_str or not (line_str.startswith("{") and line_str.endswith("}")):
                    continue
                    
                self.lines_received += 1
                self.last_line_ts = time.time() * 1000
                
                # Parse JSON
                try:
                    data = json.loads(line_str)
                except json.JSONDecodeError:
                    self.bad_crc_count += 1
                    continue
                    
                # CRC32 validation if provided
                if "crc" in data:
                    received_crc = data["crc"]
                    clean_dict = {k: v for k, v in data.items() if k != "crc"}
                    calc_crc = zlib.crc32(json.dumps(clean_dict, sort_keys=True).encode("utf-8")) & 0xffffffff
                    if calc_crc != (received_crc & 0xffffffff):
                        self.bad_crc_count += 1
                        print(f"[SERIAL] CRC mismatch: calc={calc_crc}, received={received_crc}")
                        continue
                        
                payload = TelemetryPayload(**data)
                
                # Ingest into DB & pipeline via session
                db = SessionLocal()
                try:
                    process_telemetry_payload(db, payload)
                finally:
                    db.close()
                    
            except serial.SerialException as se:
                print(f"[SERIAL] Port error (possible cable disconnect): {se}")
                self.is_connected = False
                # Try auto-reconnecting after 2 seconds
                time.sleep(2.0)
                if self.is_running:
                    print("[SERIAL] Attempting auto-reconnect...")
                    self.connect(self.port, self.baud)
                break
            except Exception as e:
                print(f"[SERIAL] Read loop exception: {e}")
                time.sleep(0.1)

serial_service = SerialService()
