"""
SeptiSense Care Guidance & Clinical Decision-Support Module
Rule-backed, model-assisted triage recommendations.
Adheres strictly to safety protocols:
- NEVER recommends, starts, stops, or modifies any drug or dose.
- NEVER outputs the words 'diagnosis' or 'you have sepsis'.
- Produces: Routine check-in / See a doctor within 24–48 h / Seek urgent care now.
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from .models import Patient, Reading, Prediction, Medicine, Appointment
from .config import settings

def evaluate_care_guidance(db: Session, patient_id: int) -> Dict[str, Any]:
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return {
            "patient_id": patient_id,
            "triage_level": "Routine Check-in",
            "triage_code": 1,
            "summary_message": "No patient record found.",
            "reasons": [],
            "questions_for_doctor": [],
            "latest_vitals_summary": {},
            "regulatory_notice": settings.REGULATORY_NOTICE
        }
        
    # Fetch recent readings (last 60 minutes)
    recent_readings = (
        db.query(Reading)
        .filter(Reading.patient_id == patient_id)
        .order_by(Reading.ts_ms.desc())
        .limit(60)
        .all()
    )
    
    # Fetch latest prediction
    latest_pred = (
        db.query(Prediction)
        .filter(Prediction.patient_id == patient_id)
        .order_by(Prediction.ts_ms.desc())
        .first()
    )
    
    # Fetch active medicines
    medicines = db.query(Medicine).filter(Medicine.patient_id == patient_id).all()
    
    reasons = []
    questions = []
    
    # Extract latest vitals
    cur_hr = None
    cur_spo2 = None
    cur_temp = None
    if recent_readings:
        for r in recent_readings:
            if cur_hr is None and r.hr_bpm is not None: cur_hr = r.hr_bpm
            if cur_spo2 is None and r.spo2_pct is not None: cur_spo2 = r.spo2_pct
            if cur_temp is None and r.temp_c is not None: cur_temp = r.temp_c
            
    vitals_summary = {
        "heart_rate_bpm": cur_hr,
        "spo2_percent": cur_spo2,
        "temperature_c": cur_temp,
        "sepsis_risk_6h_pct": round(latest_pred.risk_probability * 100, 1) if (latest_pred and latest_pred.risk_probability is not None) else None,
        "rhythm": latest_pred.rhythm_label if latest_pred else "Unknown"
    }

    # Evaluate Clinical Rules (from docs/RULES.md)
    is_urgent = False
    is_warning = False
    
    # Rule 1: Sepsis Model Risk
    if latest_pred and latest_pred.risk_probability is not None:
        risk_pct = latest_pred.risk_probability * 100
        if latest_pred.risk_probability >= 0.40:
            is_urgent = True
            reasons.append(f"Model estimated {risk_pct:.1f}% risk of sepsis-related deterioration within the next 6 hours (High risk)")
            questions.append(f"My monitoring system flagged an elevated 6-hour sepsis deterioration risk of {risk_pct:.0f}%. What clinical signs or lab work should we check?")
        elif latest_pred.risk_probability >= 0.15:
            is_warning = True
            reasons.append(f"Model estimated {risk_pct:.1f}% risk of sepsis-related deterioration within the next 6 hours (Moderate risk)")
            questions.append("My recent vital signs trend indicates increased physiological stress. Should my vitals monitoring frequency be adjusted?")

    # Rule 2: Hypoxia (SpO2)
    if cur_spo2 is not None:
        if cur_spo2 < 90.0:
            is_urgent = True
            reasons.append(f"Critically low oxygen saturation ({cur_spo2:.1f}% SpO2, WHO threshold < 90%)")
            questions.append(f"My oxygen levels recently dropped to {cur_spo2:.1f}%. Should we investigate pulmonary causes or check arterial blood gases?")
        elif cur_spo2 < 93.0:
            is_warning = True
            reasons.append(f"Mildly depressed oxygen saturation ({cur_spo2:.1f}% SpO2)")

    # Rule 3: Temperature (Hypothermia or High Fever)
    if cur_temp is not None:
        if cur_temp < 35.5:
            is_urgent = True
            reasons.append(f"Hypothermia ({cur_temp:.1f}°C, standard clinical warning < 35.5°C)")
        elif cur_temp > 38.8:
            is_urgent = True
            reasons.append(f"High fever ({cur_temp:.1f}°C)")
            questions.append(f"I recorded a temperature of {cur_temp:.1f}°C. Would you advise blood cultures or an antipyretic evaluation?")
        elif cur_temp > 38.0:
            is_warning = True
            reasons.append(f"Fever detected ({cur_temp:.1f}°C, exceeding standard SIRS criteria 38.0°C)")

    # Rule 4: Tachycardia / Bradycardia
    if cur_hr is not None:
        if cur_hr > 120.0:
            is_warning = True
            reasons.append(f"Significant resting tachycardia ({cur_hr:.0f} bpm, exceeding standard SIRS criteria 90 bpm)")
            questions.append(f"My resting heart rate has elevated to {cur_hr:.0f} bpm. Could this be related to infection or dehydration?")
        elif cur_hr < 45.0:
            is_warning = True
            reasons.append(f"Bradycardia ({cur_hr:.0f} bpm)")

    # Rule 5: Rhythm Irregularity (Model B)
    if latest_pred and latest_pred.rhythm_class in [1, 2]: # AF or Other
        is_warning = True
        reasons.append(f"ECG analysis flagged: {latest_pred.rhythm_label} (Possible irregular rhythm, see a doctor)")
        questions.append("My ECG waveform showed periods of rhythm irregularity. Would you recommend a 12-lead ECG or Holter monitoring?")

    # Add medicine review questions if medicines are logged
    if medicines:
        med_names = ", ".join([m.name for m in medicines[:3]])
        questions.append(f"I am currently taking: {med_names}. Are my current vital trends consistent with these medications?")

    # Formulate Recommendation Level
    if is_urgent:
        triage_level = "Seek Urgent Care Now"
        triage_code = 3
        summary_msg = (
            "Physiological indicators suggest urgent medical evaluation is required. "
            "If you feel confused, very weak, short of breath, or very unwell, call your local emergency number immediately."
        )
    elif is_warning:
        triage_level = "See a Doctor Within 24–48 Hours"
        triage_code = 2
        summary_msg = (
            "Trends over recent hours show abnormal vitals or rhythm irregularity. "
            "Schedule an evaluation with your physician within 24 to 48 hours."
        )
    else:
        triage_level = "Routine Check-in"
        triage_code = 1
        summary_msg = "Vitals are currently within expected ranges. Continue monitoring and attend routine appointments."
        reasons.append("Heart rate, oxygen saturation, and body temperature remain within stable physiological limits.")

    return {
        "patient_id": patient_id,
        "triage_level": triage_level,
        "triage_code": triage_code,
        "summary_message": summary_msg,
        "reasons": reasons,
        "questions_for_doctor": questions,
        "latest_vitals_summary": vitals_summary,
        "regulatory_notice": settings.REGULATORY_NOTICE
    }
