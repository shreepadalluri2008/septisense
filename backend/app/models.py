"""
SQLAlchemy Database Models for SeptiSense
"""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from .database import Base

class Patient(Base):
    __tablename__ = "patients"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    age = Column(Float, nullable=False, default=60.0)
    gender = Column(Integer, nullable=False, default=1) # 1: Male, 0: Female
    assigned_device_id = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    readings = relationship("Reading", back_populates="patient", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="patient", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="patient", cascade="all, delete-orphan")
    medicines = relationship("Medicine", back_populates="patient", cascade="all, delete-orphan")
    doctors = relationship("Doctor", back_populates="patient", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="patient", cascade="all, delete-orphan")

class Device(Base):
    __tablename__ = "devices"
    
    device_id = Column(String(50), primary_key=True)
    label = Column(String(100), nullable=False, default="ESP32 Edge Node")
    transport = Column(String(20), nullable=False, default="SERIAL_USB") # SERIAL_USB or WIFI
    baud_rate = Column(Integer, default=921600)
    serial_port = Column(String(50), nullable=True)
    last_seen_ts = Column(Float, nullable=True)
    rssi = Column(Integer, default=-60)
    packet_loss_pct = Column(Float, default=0.0)
    bad_crc_count = Column(Integer, default=0)
    buffered_count = Column(Integer, default=0)
    is_connected = Column(Boolean, default=False)

class Reading(Base):
    __tablename__ = "readings"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    device_id = Column(String(50), nullable=False)
    ts_ms = Column(Float, nullable=False, index=True)
    time_synced = Column(Boolean, default=True)
    buffered = Column(Boolean, default=False)
    is_replay = Column(Boolean, default=False)
    
    hr_bpm = Column(Float, nullable=True)
    spo2_pct = Column(Float, nullable=True)
    temp_c = Column(Float, nullable=True)
    ecg_hr = Column(Float, nullable=True)
    resp_rate = Column(Float, nullable=True)
    
    flags_json = Column(Text, default="{}") # leads_off, finger_off, adc_saturated
    rssi = Column(Integer, default=-60)
    
    patient = relationship("Patient", back_populates="readings")
    
    __table_args__ = (
        Index("idx_reading_patient_ts", "patient_id", "ts_ms"),
    )

class ECGChunk(Base):
    __tablename__ = "ecg_chunks"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    device_id = Column(String(50), nullable=False)
    ts_ms = Column(Float, nullable=False, index=True)
    fs = Column(Integer, default=250)
    ecg_samples_json = Column(Text, nullable=False) # 250 integer samples
    leads_off = Column(Boolean, default=False)
    finger_off = Column(Boolean, default=False)
    adc_saturated = Column(Boolean, default=False)

class QualityScore(Base):
    __tablename__ = "quality_scores"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    ts_ms = Column(Float, nullable=False, index=True)
    overall_sqi = Column(Float, nullable=False)
    ecg_sqi = Column(Float, nullable=False)
    hr_sqi = Column(Float, nullable=False)
    spo2_sqi = Column(Float, nullable=False)
    temp_sqi = Column(Float, nullable=False)
    reasons_json = Column(Text, default="[]") # List of plain language reasons

class Prediction(Base):
    __tablename__ = "predictions"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    ts_ms = Column(Float, nullable=False, index=True)
    risk_probability = Column(Float, nullable=True) # Null if insufficient data
    horizon_hours = Column(Integer, default=6)
    is_alert = Column(Boolean, default=False)
    insufficient_data = Column(Boolean, default=False)
    model_version = Column(String(50), default="1.0.0")
    
    rhythm_class = Column(Integer, nullable=True) # 0: Normal, 1: AF, 2: Other, 3: Noisy
    rhythm_label = Column(String(50), nullable=True)
    features_snapshot_json = Column(Text, default="{}")
    
    patient = relationship("Patient", back_populates="predictions")

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    device_id = Column(String(50), nullable=True)
    ts_ms = Column(Float, nullable=False, index=True)
    level = Column(String(20), nullable=False) # info, warning, critical
    reason = Column(String(255), nullable=False)
    trigger_value = Column(Float, nullable=True)
    threshold_value = Column(Float, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by = Column(String(50), nullable=True)
    
    patient = relationship("Patient", back_populates="alerts")

class Medicine(Base):
    __tablename__ = "medicines"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    dose = Column(String(50), nullable=False)
    frequency = Column(String(50), nullable=False)
    start_date = Column(String(30), nullable=True)
    end_date = Column(String(30), nullable=True)
    prescribing_doctor = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    schedule_times_json = Column(Text, default="[\"08:00\", \"20:00\"]")
    adherence_pct = Column(Float, default=100.0)
    
    patient = relationship("Patient", back_populates="medicines")

class Prescription(Base):
    __tablename__ = "prescriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    doctor_name = Column(String(100), nullable=False)
    date_issued = Column(String(30), nullable=False)
    notes = Column(Text, nullable=True)
    file_path = Column(String(255), nullable=True) # Photo upload path
    medicine_names_json = Column(Text, default="[]")

class Doctor(Base):
    __tablename__ = "doctors"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    specialty = Column(String(100), nullable=False, default="Internal Medicine")
    hospital_clinic = Column(String(150), nullable=True)
    phone = Column(String(30), nullable=True)
    email = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    
    patient = relationship("Patient", back_populates="doctors")
    appointments = relationship("Appointment", back_populates="doctor")

class Appointment(Base):
    __tablename__ = "appointments"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=True)
    appointment_time = Column(String(50), nullable=False)
    reason = Column(String(255), nullable=False)
    status = Column(String(30), default="UPCOMING") # UPCOMING, COMPLETED, CANCELLED
    notes = Column(Text, nullable=True)
    
    doctor = relationship("Doctor", back_populates="appointments")
    patient = relationship("Patient", back_populates="appointments")

class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(Integer, primary_key=True, index=True)
    ts_ms = Column(Float, nullable=False, default=lambda: datetime.utcnow().timestamp() * 1000)
    action = Column(String(100), nullable=False)
    details_json = Column(Text, default="{}")
