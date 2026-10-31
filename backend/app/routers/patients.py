"""
Patients CRUD Router
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Patient
from ..schemas import PatientCreate, PatientUpdate, PatientResponse

router = APIRouter(prefix="/api/patients", tags=["Patients"])

@router.get("", response_model=List[PatientResponse])
def list_patients(db: Session = Depends(get_db)):
    patients = db.query(Patient).order_by(Patient.id).all()
    # Ensure default patient exists if DB is completely fresh
    if not patients:
        default_p = Patient(id=1, name="John Doe (Sample)", age=64.0, gender=1, assigned_device_id="esp32-01", notes="Baseline monitoring")
        db.add(default_p)
        db.commit()
        db.refresh(default_p)
        patients = [default_p]
    return patients

@router.post("", response_model=PatientResponse)
def create_patient(payload: PatientCreate, db: Session = Depends(get_db)):
    patient = Patient(
        name=payload.name,
        age=payload.age,
        gender=payload.gender,
        assigned_device_id=payload.assigned_device_id,
        notes=payload.notes
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient

@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient

@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(patient_id: int, payload: PatientUpdate, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if payload.name is not None: patient.name = payload.name
    if payload.age is not None: patient.age = payload.age
    if payload.gender is not None: patient.gender = payload.gender
    if payload.assigned_device_id is not None: patient.assigned_device_id = payload.assigned_device_id
    if payload.notes is not None: patient.notes = payload.notes
    db.commit()
    db.refresh(patient)
    return patient
