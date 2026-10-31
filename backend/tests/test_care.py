"""
Test Medicines, Doctors, Appointments & Care Guidance
"""

from backend.app.models import Medicine, Doctor, Appointment, Prediction

def test_medicines_crud(client):
    med_payload = {
        "name": "Amoxicillin",
        "dose": "500 mg",
        "frequency": "Three times daily (TID)",
        "start_date": "2026-10-30",
        "end_date": "2026-11-06",
        "prescribing_doctor": "Dr. Vance",
        "notes": "Take with meals",
        "schedule_times": ["08:00", "14:00", "20:00"]
    }
    
    post_res = client.post("/api/patients/1/medicines", json=med_payload)
    assert post_res.status_code == 200
    med_data = post_res.json()
    assert med_data["name"] == "Amoxicillin"
    assert med_data["patient_id"] == 1
    
    get_res = client.get("/api/patients/1/medicines")
    assert get_res.status_code == 200
    assert len(get_res.json()) >= 1

def test_doctors_and_appointments(client):
    doc_payload = {
        "name": "Dr. Robert Chen",
        "specialty": "Cardiology",
        "hospital_clinic": "City Health Hospital",
        "phone": "+1 555-0192",
        "email": "r.chen@cityhealth.org"
    }
    doc_res = client.post("/api/patients/1/doctors", json=doc_payload)
    assert doc_res.status_code == 200
    doc_id = doc_res.json()["id"]
    
    appt_payload = {
        "doctor_id": doc_id,
        "appointment_time": "2026-11-05 10:30 AM",
        "reason": "Holter rhythm follow-up"
    }
    appt_res = client.post("/api/patients/1/appointments", json=appt_payload)
    assert appt_res.status_code == 200
    assert appt_res.json()["status"] == "UPCOMING"

def test_care_guidance_rule_triage(client, db_session):
    # Seed a high risk prediction (45% risk)
    pred = Prediction(
        patient_id=1,
        ts_ms=100000,
        risk_probability=0.45,
        horizon_hours=6,
        is_alert=True,
        rhythm_class=1,
        rhythm_label="AF"
    )
    db_session.add(pred)
    db_session.commit()
    
    res = client.get("/api/patients/1/guidance")
    assert res.status_code == 200
    data = res.json()
    assert data["triage_code"] == 3 # Seek Urgent Care Now
    assert data["triage_level"] == "Seek Urgent Care Now"
    assert len(data["reasons"]) > 0
    assert len(data["questions_for_doctor"]) > 0
    assert "emergency" in data["summary_message"].lower()
