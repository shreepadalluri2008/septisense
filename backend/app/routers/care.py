"""
Medicines, Prescriptions, Doctors & Care Guidance Router
"""

import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Patient, Medicine, Prescription, Doctor, Appointment
from ..schemas import (
    MedicineCreate, MedicineResponse,
    DoctorCreate, DoctorResponse,
    AppointmentCreate, AppointmentResponse,
    CareGuidanceResponse
)
from ..care_guidance import evaluate_care_guidance

router = APIRouter(prefix="/api/patients/{patient_id}", tags=["Care & Prescriptions"])

# --- Medicines ---

@router.get("/medicines", response_model=List[MedicineResponse])
def list_patient_medicines(patient_id: int, db: Session = Depends(get_db)):
    meds = db.query(Medicine).filter(Medicine.patient_id == patient_id).all()
    res = []
    for m in meds:
        times = ["08:00", "20:00"]
        try:
            times = json.loads(m.schedule_times_json) if m.schedule_times_json else times
        except Exception:
            pass
        res.append(MedicineResponse(
            id=m.id,
            patient_id=m.patient_id,
            name=m.name,
            dose=m.dose,
            frequency=m.frequency,
            start_date=m.start_date,
            end_date=m.end_date,
            prescribing_doctor=m.prescribing_doctor,
            notes=m.notes,
            schedule_times=times,
            adherence_pct=m.adherence_pct
        ))
    return res

@router.post("/medicines", response_model=MedicineResponse)
def add_patient_medicine(patient_id: int, payload: MedicineCreate, db: Session = Depends(get_db)):
    med = Medicine(
        patient_id=patient_id,
        name=payload.name,
        dose=payload.dose,
        frequency=payload.frequency,
        start_date=payload.start_date,
        end_date=payload.end_date,
        prescribing_doctor=payload.prescribing_doctor,
        notes=payload.notes,
        schedule_times_json=json.dumps(payload.schedule_times),
        adherence_pct=100.0
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    return MedicineResponse(
        id=med.id,
        patient_id=med.patient_id,
        name=med.name,
        dose=med.dose,
        frequency=med.frequency,
        start_date=med.start_date,
        end_date=med.end_date,
        prescribing_doctor=med.prescribing_doctor,
        notes=med.notes,
        schedule_times=payload.schedule_times,
        adherence_pct=med.adherence_pct
    )

# --- Doctors ---

@router.get("/doctors", response_model=List[DoctorResponse])
def list_patient_doctors(patient_id: int, db: Session = Depends(get_db)):
    doctors = db.query(Doctor).filter(Doctor.patient_id == patient_id).all()
    if not doctors:
        default_doc = Doctor(
            patient_id=patient_id,
            name="Dr. Eleanor Vance, MD",
            specialty="Internal Medicine & Critical Care",
            hospital_clinic="St. Jude Memorial Hospital",
            phone="+1 (555) 234-5678",
            email="e.vance@stjude.org",
            notes="Primary consulting physician"
        )
        db.add(default_doc)
        db.commit()
        db.refresh(default_doc)
        doctors = [default_doc]
    return doctors

@router.post("/doctors", response_model=DoctorResponse)
def add_patient_doctor(patient_id: int, payload: DoctorCreate, db: Session = Depends(get_db)):
    doc = Doctor(
        patient_id=patient_id,
        name=payload.name,
        specialty=payload.specialty,
        hospital_clinic=payload.hospital_clinic,
        phone=payload.phone,
        email=payload.email,
        notes=payload.notes
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc

# --- Appointments ---

@router.get("/appointments", response_model=List[AppointmentResponse])
def list_patient_appointments(patient_id: int, db: Session = Depends(get_db)):
    appts = db.query(Appointment).filter(Appointment.patient_id == patient_id).order_by(Appointment.id.desc()).all()
    return appts

@router.post("/appointments", response_model=AppointmentResponse)
def add_patient_appointment(patient_id: int, payload: AppointmentCreate, db: Session = Depends(get_db)):
    appt = Appointment(
        patient_id=patient_id,
        doctor_id=payload.doctor_id,
        appointment_time=payload.appointment_time,
        reason=payload.reason,
        notes=payload.notes,
        status="UPCOMING"
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return appt

# --- "When to See a Doctor" Clinical Guidance ---

@router.get("/guidance", response_model=CareGuidanceResponse)
def get_care_guidance(patient_id: int, db: Session = Depends(get_db)):
    guidance = evaluate_care_guidance(db, patient_id)
    return guidance

# Auxiliary router supporting alternate frontend URL patterns
aux_router = APIRouter(prefix="/api", tags=["Care & Prescriptions Alias"])

@aux_router.get("/care/guidance/{patient_id}", response_model=CareGuidanceResponse)
def get_care_guidance_alias(patient_id: int, db: Session = Depends(get_db)):
    return evaluate_care_guidance(db, patient_id)

@aux_router.get("/medicines/{patient_id}", response_model=List[MedicineResponse])
def list_medicines_alias(patient_id: int, db: Session = Depends(get_db)):
    return list_patient_medicines(patient_id, db)

@aux_router.post("/medicines/{patient_id}", response_model=MedicineResponse)
def add_medicine_alias(patient_id: int, payload: MedicineCreate, db: Session = Depends(get_db)):
    return add_patient_medicine(patient_id, payload, db)

@aux_router.get("/doctors/{patient_id}", response_model=List[DoctorResponse])
def list_doctors_alias(patient_id: int, db: Session = Depends(get_db)):
    return list_patient_doctors(patient_id, db)

@aux_router.post("/doctors/{patient_id}", response_model=DoctorResponse)
def add_doctor_alias(patient_id: int, payload: DoctorCreate, db: Session = Depends(get_db)):
    return add_patient_doctor(patient_id, payload, db)

@aux_router.get("/appointments/{patient_id}", response_model=List[AppointmentResponse])
def list_appointments_alias(patient_id: int, db: Session = Depends(get_db)):
    return list_patient_appointments(patient_id, db)

@aux_router.post("/appointments/{patient_id}", response_model=AppointmentResponse)
def add_appointment_alias(patient_id: int, payload: AppointmentCreate, db: Session = Depends(get_db)):
    return add_patient_appointment(patient_id, payload, db)

