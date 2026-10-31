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
import re
import threading
from typing import List, Dict, Any, Optional
import serial
import serial.tools.list_ports

from .schemas import TelemetryPayload
from .database import SessionLocal
from .ingest import process_telemetry_payload

class SerialService:
    COMMON_BAUDS = [115200, 230400, 460800, 921600, 100000, 128000, 250000, 500000, 1000000, 9600, 57600]

    def __init__(self):
        self.port: Optional[str] = None
        self.baud: int = 115200
        self.ser: Optional[serial.Serial] = None
        self.is_running: bool = False
        self.is_connected: bool = False
        self.thread: Optional[threading.Thread] = None
        self.last_line_ts: Optional[float] = None
        self.lines_received: int = 0
        self.bad_crc_count: int = 0
        self.lock = threading.Lock()
        self._merged_state: Dict[str, Any] = {}
        self._watcher_thread = threading.Thread(target=self._hotplug_watcher, daemon=True)
        self._watcher_thread.start()

    def _hotplug_watcher(self):
        """Automatically connects as soon as an ESP32 USB cable is plugged into the host."""
        while True:
            try:
                if not self.is_connected:
                    detected = self.auto_detect_port()
                    if detected:
                        self.connect(port=detected, baud=0)
            except Exception:
                pass
            time.sleep(3.0)
        
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

    def auto_detect_baud(self, port: str) -> int:
        """Probes common ESP32 baud rates (100k+ to 1M) for valid JSON/ASCII lines."""
        for candidate in self.COMMON_BAUDS:
            try:
                with serial.Serial(port, candidate, timeout=0.6) as test_ser:
                    raw = test_ser.readline()
                    if raw:
                        decoded = raw.decode("utf-8", errors="ignore").strip()
                        if "{" in decoded or ":" in decoded or decoded.isprintable():
                            return candidate
            except Exception:
                continue
        return 115200

    def connect(self, port: Optional[str] = None, baud: int = 115200) -> bool:
        with self.lock:
            if self.is_connected:
                self.disconnect()
                
            target_port = port if (port and port != "AUTO") else self.auto_detect_port()
            if not target_port:
                print("[SERIAL] No USB serial port found for auto-connect.")
                return False
                
            self.port = target_port
            self.baud = self.auto_detect_baud(target_port) if baud <= 0 else baud
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

    def _parse_serial_line(self, line_str: str) -> Optional[Dict[str, Any]]:
        """Parses JSON, key-value text, or CSV lines emitted by any ESP32 sketch."""
        # 1. JSON object (even if prefixed by log tags)
        j_start = line_str.find("{")
        j_end = line_str.rfind("}")
        if j_start != -1 and j_end > j_start:
            try:
                data = json.loads(line_str[j_start : j_end + 1])
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass

        # 2. Key-Value text patterns (HR, SpO2, Temp/Obj, Amb, ECG)
        parsed: Dict[str, Any] = {}
        hr_m = re.search(r"(?:avg\s*bpm|heart\s*rate|hr_bpm|\bhr\b|\bbpm\b)\s*[:=]\s*(-?\d+(?:\.\d+)?)", line_str, re.I)
        if hr_m:
            v = float(hr_m.group(1))
            if 20 < v <= 260:
                parsed["hr_bpm"] = v

        ecg_m = re.search(r"(?:ecg_bpm|ecg_hr|ecg\s*bpm|\becg\b)\s*[:=]\s*(-?\d+(?:\.\d+)?)", line_str, re.I)
        if ecg_m:
            v = float(ecg_m.group(1))
            if 20 < v <= 260:
                parsed["ecg_hr"] = v

        spo2_m = re.search(r"(?:spo2_pct|spo2|o2sat|oxygen)\s*[:=]\s*(-?\d+(?:\.\d+)?)", line_str, re.I)
        if spo2_m:
            v = float(spo2_m.group(1))
            if 50 <= v <= 100:
                parsed["spo2_pct"] = v

        temp_m = re.search(r"(?:object\s*temp|surface\s*temp|body\s*temp|temp_c|temperature|\bobj\b|\btemp\b)\s*[:=]\s*(-?\d+(?:\.\d+)?)", line_str, re.I)
        if temp_m:
            v = float(temp_m.group(1))
            if 10 <= v <= 50:
                parsed["temp_c"] = v

        amb_m = re.search(r"(?:ambient\s*temp|ambient|\bamb\b)\s*[:=]\s*(-?\d+(?:\.\d+)?)", line_str, re.I)
        if amb_m:
            v = float(amb_m.group(1))
            if 5 <= v <= 60:
                parsed["amb_c"] = v

        if parsed:
            self._merged_state.update(parsed)
            return dict(self._merged_state)

        # 3. Pure CSV (3 to 5 numbers: hr, spo2, temp or hr, ecg, spo2, temp)
        parts = [p.strip() for p in re.split(r"[,\t;]+", line_str) if p.strip()]
        if 3 <= len(parts) <= 5 and all(re.match(r"^-?\d+(?:\.\d+)?$", p) for p in parts):
            nums = [float(p) for p in parts]
            if len(nums) == 3:
                if 20 < nums[0] <= 260:
                    parsed["hr_bpm"] = nums[0]
                if 50 <= nums[1] <= 100:
                    parsed["spo2_pct"] = nums[1]
                if 10 <= nums[2] <= 50:
                    parsed["temp_c"] = nums[2]
            else:
                if 20 < nums[0] <= 260:
                    parsed["hr_bpm"] = nums[0]
                if 20 < nums[1] <= 260:
                    parsed["ecg_hr"] = nums[1]
                if 50 <= nums[2] <= 100:
                    parsed["spo2_pct"] = nums[2]
                if 10 <= nums[3] <= 50:
                    parsed["temp_c"] = nums[3]
            if parsed:
                self._merged_state.update(parsed)
                return dict(self._merged_state)

        return None

    def _read_loop(self):
        """Continuously reads newline-terminated JSON or text lines from the serial port."""
        while self.is_running and self.ser and self.ser.is_open:
            try:
                raw_bytes = self.ser.readline()
                if not raw_bytes:
                    continue
                    
                line_str = raw_bytes.decode("utf-8", errors="ignore").strip()
                if not line_str:
                    continue
                    
                data = self._parse_serial_line(line_str)
                if not data:
                    continue

                self.lines_received += 1
                self.last_line_ts = time.time() * 1000
                    
                # CRC32 validation if provided
                if "crc" in data and data["crc"] is not None:
                    received_crc = data["crc"]
                    clean_dict = {k: v for k, v in data.items() if k != "crc"}
                    calc_crc = zlib.crc32(json.dumps(clean_dict, sort_keys=True).encode("utf-8")) & 0xffffffff
                    if calc_crc != (received_crc & 0xffffffff):
                        self.bad_crc_count += 1
                        print(f"[SERIAL] CRC mismatch: calc={calc_crc}, received={received_crc}")
                        continue
                        
                # Also ingest into ESP32 server.py engine & HistGradientBoosting model
                try:
                    import server as esp32_server
                    esp32_server.ingest(data)
                    esp32_server.inference_cycle()
                except Exception as se_err:
                    print(f"[SERIAL] ESP32 server ingest note: {se_err}")

                if isinstance(data.get("records"), list) and len(data["records"]) > 0:
                    last_rec = dict(data["records"][-1])
                    last_rec["device_id"] = data.get("device_id", "septisense-01")
                    payload = TelemetryPayload(**last_rec)
                else:
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
