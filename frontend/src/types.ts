export interface Vitals {
  hr_bpm: number | null;
  spo2_pct: number | null;
  temp_c: number | null;
  ecg_hr: number | null;
  resp_rate: number | null;
}

export interface TelemetryFlags {
  leads_off: boolean;
  finger_off: boolean;
  adc_saturated: boolean;
}

export interface SQIScores {
  overall: number;
  ecg: number;
  hr: number;
  spo2: number;
  temp: number;
  reasons: string[];
}

export interface PredictionSummary {
  risk_probability: number | null;
  horizon_hours: number;
  is_alert: boolean;
  insufficient_data: boolean;
  rhythm_class: number;
  rhythm_label: string;
  top_features?: Record<string, number>;
}

export interface TelemetryUpdateMessage {
  type: string;
  patient_id: number;
  device_id: string;
  ts_ms: number;
  is_replay: boolean;
  vitals: Vitals;
  flags: TelemetryFlags;
  sqi: SQIScores;
  prediction: PredictionSummary;
  active_alerts_count: number;
  alerts?: Alert[];
  ecg_preview: number[];
}

export interface Reading {
  id: number;
  patient_id: number;
  device_id: string;
  ts_ms: number;
  time_synced: boolean;
  buffered: boolean;
  is_replay: boolean;
  hr_bpm: number | null;
  spo2_pct: number | null;
  temp_c: number | null;
  ecg_hr: number | null;
  resp_rate: number | null;
  flags_json: string;
  rssi: number;
}

export interface PredictionRecord {
  id: number;
  patient_id: number;
  ts_ms: number;
  risk_probability: number | null;
  horizon_hours: number;
  is_alert: boolean;
  insufficient_data: boolean;
  rhythm_class: number | null;
  rhythm_label: string | null;
  features_snapshot: Record<string, any>;
}

export interface Alert {
  id: number;
  patient_id: number;
  device_id: string | null;
  ts_ms: number;
  level: "info" | "warning" | "critical";
  reason: string;
  trigger_value: number | null;
  threshold_value: number | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface Patient {
  id: number;
  name: string;
  age: number;
  gender: number; // 1: Male, 0: Female
  assigned_device_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface DeviceInfo {
  device_id: string;
  label: string;
  transport: string;
  baud_rate: number;
  serial_port: string | null;
  last_seen_ts: number | null;
  rssi: number;
  packet_loss_pct: number;
  bad_crc_count: number;
  buffered_count: number;
  is_connected: boolean;
}

export interface SerialStatus {
  port: string | null;
  baud: number;
  is_connected: boolean;
  last_line_ts: number | null;
  lines_received: number;
  bad_crc_count: number;
}

export interface ReplayStatus {
  is_active: boolean;
  patient_id: number | null;
  record_id: string | null;
  current_hour: number;
  total_hours: number;
  speed_factor: number;
}

export interface Medicine {
  id: number;
  patient_id: number;
  name: string;
  dose: string;
  frequency: string;
  start_date: string | null;
  end_date: string | null;
  prescribing_doctor: string | null;
  notes: string | null;
  schedule_times: string[];
  adherence_pct: number;
}

export interface Doctor {
  id: number;
  patient_id: number;
  name: string;
  specialty: string;
  hospital_clinic: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number | null;
  appointment_time: string;
  reason: string;
  status: string;
  notes: string | null;
}

export interface CareGuidance {
  patient_id: number;
  triage_level: string;
  triage_code: number; // 1: Routine, 2: Warning, 3: Critical
  summary_message: string;
  reasons: string[];
  questions_for_doctor: string[];
  latest_vitals_summary: Record<string, any>;
  regulatory_notice: string;
}

export interface AlertThresholds {
  hr_min: number;
  hr_max: number;
  spo2_min: number;
  temp_min: number;
  temp_max: number;
  sepsis_risk_threshold: number;
}
