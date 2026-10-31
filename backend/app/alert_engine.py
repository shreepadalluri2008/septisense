"""
SeptiSense Alert Engine
Evaluates real-time physiological rules and ML risk scores.
Includes debounce mechanisms to avoid alert storms.
"""

import time
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from .models import Alert, Patient

# In-memory debounce cache: (patient_id, alert_key) -> last_fired_ts
_DEBOUNCE_CACHE: Dict[tuple, float] = {}
DEBOUNCE_INTERVAL_SEC = 60.0 # Suppress identical alert type for 60 seconds

def evaluate_reading_alerts(
    db: Session,
    patient: Patient,
    device_id: str,
    ts_ms: float,
    hr_bpm: Optional[float],
    spo2_pct: Optional[float],
    temp_c: Optional[float],
    leads_off: bool,
    leads_off_duration_sec: float = 0.0,
    risk_probability: Optional[float] = None,
    rhythm_class: Optional[int] = None,
    resp_rate: Optional[float] = None
) -> List[Alert]:
    """
    Evaluates physiological limits and generates debounced Alert records.
    """
    now_sec = time.time()
    generated_alerts = []
    
    def try_trigger_alert(key: str, level: str, reason: str, trigger_val: Optional[float] = None, thresh_val: Optional[float] = None):
        cache_key = (patient.id, key)
        last_fired = _DEBOUNCE_CACHE.get(cache_key, 0.0)
        
        # Debounce check
        if now_sec - last_fired < DEBOUNCE_INTERVAL_SEC:
            return
            
        _DEBOUNCE_CACHE[cache_key] = now_sec
        
        alert = Alert(
            patient_id=patient.id,
            device_id=device_id,
            ts_ms=ts_ms,
            level=level,
            reason=reason,
            trigger_value=trigger_val,
            threshold_value=thresh_val
        )
        db.add(alert)
        generated_alerts.append(alert)

    # 1. Hardware Leads-Off (duration > 10s)
    if leads_off and leads_off_duration_sec >= 10.0:
        try_trigger_alert(
            "leads_off", "warning",
            f"ECG leads detached for {leads_off_duration_sec:.0f} seconds",
            trigger_val=leads_off_duration_sec, thresh_val=10.0
        )

    # 2. Oxygen Saturation (SpO2)
    if spo2_pct is not None:
        if spo2_pct < 88.0:
            try_trigger_alert(
                "spo2_critical", "critical",
                f"Critical hypoxemia: SpO2 dropped to {spo2_pct:.1f}% (Limit: 88%)",
                trigger_val=spo2_pct, thresh_val=88.0
            )
        elif spo2_pct < 92.0:
            try_trigger_alert(
                "spo2_warning", "warning",
                f"Mild hypoxemia: SpO2 is {spo2_pct:.1f}% (Limit: 92%)",
                trigger_val=spo2_pct, thresh_val=92.0
            )

    # 3. Heart Rate (HR)
    if hr_bpm is not None:
        if hr_bpm > 130.0:
            try_trigger_alert(
                "hr_tachy_crit", "critical",
                f"Severe tachycardia: Heart rate at {hr_bpm:.0f} bpm (Limit: 130)",
                trigger_val=hr_bpm, thresh_val=130.0
            )
        elif hr_bpm > 105.0:
            try_trigger_alert(
                "hr_tachy_warn", "warning",
                f"Elevated heart rate: {hr_bpm:.0f} bpm (Limit: 105)",
                trigger_val=hr_bpm, thresh_val=105.0
            )
        elif hr_bpm < 40.0:
            try_trigger_alert(
                "hr_brady_crit", "critical",
                f"Severe bradycardia: Heart rate dropped to {hr_bpm:.0f} bpm (Limit: 40)",
                trigger_val=hr_bpm, thresh_val=40.0
            )
        elif hr_bpm < 50.0:
            try_trigger_alert(
                "hr_brady_warn", "warning",
                f"Low heart rate: {hr_bpm:.0f} bpm (Limit: 50)",
                trigger_val=hr_bpm, thresh_val=50.0
            )

    # 4. Temperature (Temp)
    if temp_c is not None:
        if temp_c > 38.8:
            try_trigger_alert(
                "temp_high_crit", "critical",
                f"High fever detected: Temperature at {temp_c:.1f}°C (Limit: 38.8°C)",
                trigger_val=temp_c, thresh_val=38.8
            )
        elif temp_c > 38.0:
            try_trigger_alert(
                "temp_fever_warn", "warning",
                f"Fever detected: Temperature at {temp_c:.1f}°C (Limit: 38.0°C)",
                trigger_val=temp_c, thresh_val=38.0
            )
        elif temp_c < 35.5:
            try_trigger_alert(
                "temp_hypo_crit", "critical",
                f"Hypothermia alert: Temperature dropped to {temp_c:.1f}°C (Limit: 35.5°C)",
                trigger_val=temp_c, thresh_val=35.5
            )
        elif temp_c < 36.0:
            try_trigger_alert(
                "temp_hypo_warn", "warning",
                f"Mild hypothermia: Temperature at {temp_c:.1f}°C (Limit: 36.0°C)",
                trigger_val=temp_c, thresh_val=36.0
            )

    # 5. Respiration Rate (Resp Rate)
    if resp_rate is not None:
        if resp_rate > 28.0:
            try_trigger_alert(
                "resp_tachy_crit", "critical",
                f"Severe tachypnea: Respiration rate at {resp_rate:.0f} bpm (Limit: 28)",
                trigger_val=resp_rate, thresh_val=28.0
            )
        elif resp_rate >= 22.0:
            try_trigger_alert(
                "resp_tachy_warn", "warning",
                f"Tachypnea risk (qSOFA criteria): Respiration rate at {resp_rate:.0f} bpm (Limit: 22)",
                trigger_val=resp_rate, thresh_val=22.0
            )
        elif resp_rate < 8.0:
            try_trigger_alert(
                "resp_brady_crit", "critical",
                f"Severe bradypnea: Respiration rate dropped to {resp_rate:.0f} bpm (Limit: 8)",
                trigger_val=resp_rate, thresh_val=8.0
            )

    # 6. Combined Cardiopulmonary Distress Risk
    if hr_bpm is not None and spo2_pct is not None:
        if hr_bpm > 105.0 and spo2_pct < 92.0:
            try_trigger_alert(
                "cardiopulm_distress", "critical",
                f"Cardiopulmonary distress: Concurrent tachycardia ({hr_bpm:.0f} bpm) and hypoxia ({spo2_pct:.1f}%)",
                trigger_val=hr_bpm, thresh_val=105.0
            )

    # 7. Sepsis Model A Deterioration Risk
    if risk_probability is not None:
        if risk_probability >= 0.35:
            try_trigger_alert(
                "sepsis_risk_critical", "critical",
                f"High estimated risk of sepsis-related deterioration ({risk_probability*100:.1f}%) in next 6h",
                trigger_val=risk_probability, thresh_val=0.35
            )
        elif risk_probability >= 0.15:
            try_trigger_alert(
                "sepsis_risk_warning", "warning",
                f"Elevated risk of sepsis-related deterioration ({risk_probability*100:.1f}%) in next 6h",
                trigger_val=risk_probability, thresh_val=0.15
            )

    # 8. ECG Rhythm Class (Model B)
    if rhythm_class == 1: # AF
        try_trigger_alert(
            "rhythm_af", "warning",
            "Possible irregular rhythm (AF pattern) detected on ECG",
            trigger_val=1.0, thresh_val=1.0
        )

    if generated_alerts:
        db.commit()
        for a in generated_alerts:
            db.refresh(a)
            
    return generated_alerts
