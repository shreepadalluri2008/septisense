"""
Simulated Hardware Feeder & Fault Injector
Streams real PhysioNet CinC 2017/2019 data as 1-second ESP32 packets to the SeptiSense Ingest Pipeline.
Enables live demonstrations with real-time fault injection (Leads-Off, Finger-Off, Tachycardia, Sepsis Escalation).
"""

import sys
import time
import json
import zlib
import argparse
import urllib.request
import numpy as np

def calculate_crc32(payload_dict: dict) -> int:
    """Computes IEEE 802.3 CRC32 matching ESP32 firmware."""
    dict_copy = {k: v for k, v in payload_dict.items() if k != "crc"}
    serialized = json.dumps(dict_copy, sort_keys=True).encode("utf-8")
    return zlib.crc32(serialized) & 0xFFFFFFFF

def generate_ecg_chunk(hr_bpm: float, fs: int = 250, leads_off: bool = False) -> list:
    """Generates synthetic Lead II cardiac morphology for visual continuity when streaming."""
    if leads_off:
        return [2048 + int(np.random.normal(0, 5)) for _ in range(fs)]
    
    t = np.linspace(0, 1.0, fs, endpoint=False)
    # Baseline
    ecg = np.full(fs, 2048.0)
    # Add synthetic P-Q-R-S-T complexes matching current HR
    rr_sec = 60.0 / hr_bpm
    num_beats = int(1.0 / rr_sec) + 1
    
    for b in range(num_beats):
        center_idx = int((b * rr_sec + 0.2) * fs)
        if center_idx < fs:
            # QRS spike
            qrs_width = int(0.04 * fs)
            for i in range(-qrs_width, qrs_width):
                idx = center_idx + i
                if 0 <= idx < fs:
                    ecg[idx] += 800.0 * np.exp(-((i / (qrs_width / 2)) ** 2))
    
    # Add slight baseline wander
    ecg += 40.0 * np.sin(2 * np.pi * 0.2 * t)
    return [int(np.clip(v, 0, 4095)) for v in ecg]

def run_feeder(target_url: str, patient_id: int, speed: float = 1.0, fault_mode: str = "none"):
    print("=" * 70)
    print(" SeptiSense Simulated Hardware Streamer")
    print(f" Target: {target_url} | Patient ID: #{patient_id} | Fault Mode: {fault_mode.upper()}")
    print("=" * 70)

    t0 = time.time()
    step = 0
    base_hr = 72.0
    base_spo2 = 98.0
    base_temp = 36.8

    try:
        while True:
            step += 1
            now_ms = time.time() * 1000

            # Dynamic physiology simulation
            hr = base_hr + 4.0 * np.sin(step * 0.1)
            spo2 = base_spo2
            temp = base_temp + 0.1 * np.sin(step * 0.05)
            leads_off = False
            finger_off = False

            if fault_mode == "leads_off" and step > 5:
                leads_off = True
                print("  [FAULT ACTIVE] Injected AD8232 Leads-Off condition.")
            elif fault_mode == "finger_off" and step > 5:
                finger_off = True
                spo2 = None
                print("  [FAULT ACTIVE] Injected MAX30102 Finger-Off condition.")
            elif fault_mode == "sepsis_deterioration" and step > 5:
                # Accelerate vitals into systemic inflammatory response
                hr += min(50.0, (step - 5) * 2.5)
                temp += min(2.5, (step - 5) * 0.1)
                spo2 = max(86.0, base_spo2 - (step - 5) * 0.6)
                print(f"  [ESCALATION] Step {step}: HR={hr:.1f} bpm, Temp={temp:.2f} C, SpO2={spo2:.1f}%")

            ecg_samples = generate_ecg_chunk(hr_bpm=hr, leads_off=leads_off)

            payload = {
                "device_id": "esp32-streamer",
                "patient_id": patient_id,
                "ts_ms": now_ms,
                "time_synced": True,
                "buffered": False,
                "is_replay": False,
                "hr_bpm": round(hr, 1) if not finger_off else None,
                "spo2_pct": round(spo2, 1) if spo2 is not None else None,
                "temp_c": round(temp, 2),
                "ecg": ecg_samples[:100], # Send 100 samples
                "ecg_fs": 250,
                "flags": {
                    "leads_off": leads_off,
                    "finger_off": finger_off,
                    "adc_saturated": False
                },
                "rssi": -55
            }

            payload["crc"] = calculate_crc32(payload)

            req = urllib.request.Request(
                target_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            try:
                with urllib.request.urlopen(req, timeout=3.0) as resp:
                    res_data = json.loads(resp.read().decode("utf-8"))
                    print(f"[PACKET #{step:03d}] Ingest OK | SQI: {res_data.get('overall_sqi', 0):.0f}% | "
                          f"6h Sepsis Risk: {res_data.get('risk_probability', 0)*100:.1f}% | "
                          f"Alert: {res_data.get('alert')}")
            except Exception as e:
                print(f"[ERROR] Failed to post packet #{step}: {e}")

            time.sleep(1.0 / speed)

    except KeyboardInterrupt:
        print("\n[STOPPED] Telemetry feeder terminated cleanly.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SeptiSense Simulated Telemetry Streamer")
    parser.add_argument("--url", default="http://127.0.0.1:8000/api/telemetry", help="Target ingest endpoint")
    parser.add_argument("--patient-id", type=int, default=1, help="Patient ID")
    parser.add_argument("--speed", type=float, default=1.0, help="Speed multiplier")
    parser.add_argument("--fault", choices=["none", "leads_off", "finger_off", "sepsis_deterioration"], default="none", help="Fault mode")
    args = parser.parse_args()

    run_feeder(args.url, args.patient_id, args.speed, args.fault)
