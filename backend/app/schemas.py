"""
Pydantic Schemas for Request / Response Validation
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

# --- Telemetry & Vitals ---

class TelemetryFlags(BaseModel):
    leads_off: bool = False
    finger_off: bool = False
    adc_saturated: bool = False

class TelemetryPayload(BaseModel):
    device_id: str = "esp32-01"
    patient_id: int = 1
    ts_ms: float
    time_synced: bool = True
    buffered: bool = False
    is_replay: bool = False
    hr_bpm: Optional[float] = None
    spo2_pct: Optional[float] = None
    temp_c: Optional[float] = None
    ecg: Optional[List[int]] = None
    ecg_fs: int = 250
    flags: TelemetryFlags = Field(default_factory=TelemetryFlags)
    rssi: int = -60
    crc: Optional[int] = None # CRC32 validation field for Serial lines

class ReadingResponse(BaseModel):
    id: int
    patient_id: int
    device_id: str
    ts_ms: float
    time_synced: bool
    buffered: bool
    is_replay: bool
    hr_bpm: Optional[float]
    spo2_pct: Optional[float]
    temp_c: Optional[float]
    ecg_hr: Optional[float]
    resp_rate: Optional[float]
    flags_json: str
    rssi: int

    model_config = ConfigDict(from_attributes=True)

# --- Quality Scores (SQI) ---

class SQISummary(BaseModel):
    overall_sqi: float
    ecg_sqi: float
    hr_sqi: float
    spo2_sqi: float
    temp_sqi: float
    reasons: List[str]

# --- Predictions ---

class PredictionResponse(BaseModel):
    id: int
    patient_id: int
    ts_ms: float
    risk_probability: Optional[float]
    horizon_hours: int
    is_alert: bool
    insufficient_data: bool
    rhythm_class: Optional[int]
    rhythm_label: Optional[str]
    features_snapshot: Dict[str, Any]

# --- Alerts ---

class AlertCreate(BaseModel):
    patient_id: int
    device_id: Optional[str] = None
    level: str # info, warning, critical
    reason: str
    trigger_value: Optional[float] = None
    threshold_value: Optional[float] = None

class AlertResponse(BaseModel):
    id: int
    patient_id: int
    device_id: Optional[str]
    ts_ms: float
    level: str
    reason: str
    trigger_value: Optional[float]
    threshold_value: Optional[float]
    acknowledged_at: Optional[Any]
    acknowledged_by: Optional[str]

    model_config = ConfigDict(from_attributes=True)

class AlertAckRequest(BaseModel):
    acknowledged_by: str = "Clinician"

# --- Patients ---

class PatientCreate(BaseModel):
    name: str
    age: float = 60.0
    gender: int = 1 # 1: Male, 0: Female
    assigned_device_id: Optional[str] = "esp32-01"
    notes: Optional[str] = None

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[float] = None
    gender: Optional[int] = None
    assigned_device_id: Optional[str] = None
    notes: Optional[str] = None

class PatientResponse(BaseModel):
    id: int
    name: str
    age: float
    gender: int
    assigned_device_id: Optional[str]
    notes: Optional[str]
    created_at: Any

    model_config = ConfigDict(from_attributes=True)

# --- Devices & Serial ---

class DeviceResponse(BaseModel):
    device_id: str
    label: str
    transport: str
    baud_rate: int
    serial_port: Optional[str]
    last_seen_ts: Optional[float]
    rssi: int
    packet_loss_pct: float
    bad_crc_count: int
    buffered_count: int
    is_connected: bool

    model_config = ConfigDict(from_attributes=True)

class SerialConnectRequest(BaseModel):
    port: str
    baud_rate: int = 115200

class SerialStatusResponse(BaseModel):
    port: Optional[str]
    baud: int
    is_connected: bool
    last_line_ts: Optional[float]
    lines_received: int
    bad_crc_count: int

# --- Medicines & Prescriptions ---

class MedicineCreate(BaseModel):
    name: str
    dose: str
    frequency: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    prescribing_doctor: Optional[str] = None
    notes: Optional[str] = None
    schedule_times: List[str] = ["08:00", "20:00"]

class MedicineResponse(BaseModel):
    id: int
    patient_id: int
    name: str
    dose: str
    frequency: str
    start_date: Optional[str]
    end_date: Optional[str]
    prescribing_doctor: Optional[str]
    notes: Optional[str]
    schedule_times: List[str]
    adherence_pct: float

# --- Doctors & Appointments ---

class DoctorCreate(BaseModel):
    name: str
    specialty: str = "Internal Medicine"
    hospital_clinic: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None

class DoctorResponse(BaseModel):
    id: int
    patient_id: int
    name: str
    specialty: str
    hospital_clinic: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    notes: Optional[str]

    model_config = ConfigDict(from_attributes=True)

class AppointmentCreate(BaseModel):
    doctor_id: Optional[int] = None
    appointment_time: str
    reason: str
    notes: Optional[str] = None

class AppointmentResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: Optional[int]
    appointment_time: str
    reason: str
    status: str
    notes: Optional[str]

    model_config = ConfigDict(from_attributes=True)

# --- Care Guidance ---

class CareGuidanceResponse(BaseModel):
    patient_id: int
    triage_level: str # "Routine Check-in", "See a Doctor Within 24-48 Hours", "Seek Urgent Care Now"
    triage_code: int # 1: Routine, 2: Warning, 3: Critical
    summary_message: str
    reasons: List[str]
    questions_for_doctor: List[str]
    latest_vitals_summary: Dict[str, Any]
    regulatory_notice: str

# --- Replay ---

class ReplayStartRequest(BaseModel):
    patient_id: int = 1
    record_id: Optional[str] = "p000001"
    speed_factor: float = 1.0 # 1.0 = real-time 1s per hour, or 1s per second
    loop: bool = True

class ReplayStatusResponse(BaseModel):
    is_active: bool
    patient_id: Optional[int]
    record_id: Optional[str]
    current_hour: int
    total_hours: int
    speed_factor: float
