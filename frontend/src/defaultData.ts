import {
  Patient,
  Reading,
  PredictionRecord,
  Alert,
  DeviceInfo,
  SerialStatus,
  ReplayStatus,
  Medicine,
  Doctor,
  Appointment,
  CareGuidance,
  AlertThresholds,
  TelemetryUpdateMessage
} from "./types";

export const DEFAULT_PATIENTS: Patient[] = [
  {
    id: 1,
    name: "John Doe (ICU-04 - Sepsis Protocol)",
    age: 64,
    gender: 1,
    assigned_device_id: "ESP32-ICU-04",
    notes: "Post-op abdominal surgery. High-vigilance monitoring for sepsis deterioration trajectory.",
    created_at: new Date(Date.now() - 3600 * 24 * 1000).toISOString()
  },
  {
    id: 2,
    name: "Jane Smith (Step-Down Ward)",
    age: 58,
    gender: 0,
    assigned_device_id: "ESP32-SD-12",
    notes: "Post-surgical observation. Hemodynamically stable vitals.",
    created_at: new Date(Date.now() - 3600 * 48 * 1000).toISOString()
  },
  {
    id: 3,
    name: "PhysioNet Record p000001 (Clinical Sepsis Benchmark)",
    age: 72,
    gender: 1,
    assigned_device_id: "REPLAY-p000001",
    notes: "PhysioNet CinC Challenge 2019 reference clinical trajectory.",
    created_at: new Date(Date.now() - 3600 * 72 * 1000).toISOString()
  }
];

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  hr_min: 50,
  hr_max: 120,
  spo2_min: 90,
  temp_min: 36.0,
  temp_max: 38.5,
  sepsis_risk_threshold: 0.40
};

export const DEFAULT_SERIAL_STATUS: SerialStatus = {
  port: "WebSerial / USB",
  baud: 921600,
  is_connected: true,
  last_line_ts: Date.now(),
  lines_received: 1420,
  bad_crc_count: 0
};

export const DEFAULT_REPLAY_STATUS: ReplayStatus = {
  is_active: false,
  patient_id: 1,
  record_id: "p000001",
  current_hour: 14,
  total_hours: 40,
  speed_factor: 1.0
};

export function generateDefaultReadings(patientId: number, count = 60): Reading[] {
  const readings: Reading[] = [];
  const now = Date.now();
  const baseHr = patientId === 1 ? 88 : patientId === 2 ? 72 : 94;
  const baseSpo2 = patientId === 1 ? 95 : patientId === 2 ? 98 : 92;
  const baseTemp = patientId === 1 ? 38.1 : patientId === 2 ? 36.8 : 38.6;

  for (let i = count; i >= 0; i--) {
    const ts = now - i * 60000;
    const progress = (count - i) / count;
    const hrWobble = Math.sin(i * 0.3) * 4 + (Math.random() - 0.5) * 2;
    const hr = Math.round(baseHr + hrWobble + (patientId === 1 ? progress * 6 : 0));
    const spo2 = Math.round(baseSpo2 - (patientId === 1 ? progress * 1.5 : 0) + (Math.random() - 0.5));
    const temp = +(baseTemp + (patientId === 1 ? progress * 0.4 : 0) + (Math.random() - 0.5) * 0.1).toFixed(1);

    readings.push({
      id: 1000 + i,
      patient_id: patientId,
      device_id: "ESP32-ICU-04",
      ts_ms: ts,
      time_synced: true,
      buffered: false,
      is_replay: patientId === 3,
      hr_bpm: hr,
      spo2_pct: Math.min(100, Math.max(85, spo2)),
      temp_c: temp,
      ecg_hr: hr,
      resp_rate: patientId === 1 ? 22 : 16,
      flags_json: JSON.stringify({ leads_off: false, finger_off: false, adc_saturated: false }),
      rssi: -58
    });
  }
  return readings;
}

export function generateDefaultPredictions(patientId: number): PredictionRecord[] {
  const now = Date.now();
  const baseRisk = patientId === 1 ? 0.38 : patientId === 2 ? 0.08 : 0.62;
  const records: PredictionRecord[] = [];

  for (let i = 0; i < 20; i++) {
    const ts = now - i * 180000;
    const risk = +(baseRisk + (Math.sin(i) * 0.05)).toFixed(3);
    records.push({
      id: 500 + i,
      patient_id: patientId,
      ts_ms: ts,
      risk_probability: risk,
      horizon_hours: 6,
      is_alert: risk >= 0.40,
      insufficient_data: false,
      rhythm_class: 0,
      rhythm_label: "Normal Sinus Rhythm",
      features_snapshot: {
        HR: patientId === 1 ? 92 : 74,
        Temp: patientId === 1 ? 38.2 : 36.8,
        Resp: patientId === 1 ? 22 : 16,
        MAP: 84.0,
        ShockIndex: +( (patientId === 1 ? 92 : 74) / 115 ).toFixed(2),
        HR_Slope_6h: patientId === 1 ? 1.4 : -0.2
      }
    });
  }
  return records;
}

export function generateDefaultAlerts(patientId: number): Alert[] {
  const now = Date.now();
  if (patientId === 1) {
    return [
      {
        id: 101,
        patient_id: 1,
        device_id: "ESP32-ICU-04",
        ts_ms: now - 15 * 60000,
        level: "warning",
        reason: "Elevated Heart Rate (>100 bpm) detected across 3-minute window",
        trigger_value: 104,
        threshold_value: 100,
        acknowledged_at: null,
        acknowledged_by: null
      },
      {
        id: 102,
        patient_id: 1,
        device_id: "ESP32-ICU-04",
        ts_ms: now - 35 * 60000,
        level: "warning",
        reason: "Temperature elevation (Febrile trajectory: 38.3 °C)",
        trigger_value: 38.3,
        threshold_value: 38.0,
        acknowledged_at: new Date(now - 20 * 60000).toISOString(),
        acknowledged_by: "Dr. Chen"
      }
    ];
  }
  return [];
}

export const DEFAULT_CARE_GUIDANCE: CareGuidance = {
  patient_id: 1,
  triage_level: "ELEVATED_VIGILANCE",
  triage_code: 2,
  summary_message: "Elevated heart rate, persistent pyrexia, and rising Shock Index indicate early systemic inflammatory response.",
  reasons: [
    "Heart rate persistently above 95 bpm across a 30-minute evaluation window.",
    "Core body temperature elevated at 38.2 °C.",
    "Shock Index approaching 0.80 post-abdominal surgery."
  ],
  questions_for_doctor: [
    "Should blood cultures and serum lactate be re-drawn at the 2-hour interval?",
    "Is crystalloid fluid resuscitation indicated given current mean arterial pressure?",
    "Should broad-spectrum empiric antimicrobials be escalated or continued?"
  ],
  latest_vitals_summary: {
    hr_bpm: 92,
    spo2_pct: 95,
    temp_c: 38.2,
    resp_rate: 22
  },
  regulatory_notice: "Investigational clinical decision support. Does not substitute for clinical diagnosis or physician judgment."
};

export const DEFAULT_MEDICINES: Medicine[] = [
  {
    id: 1,
    patient_id: 1,
    name: "Piperacillin-Tazobactam (Zosyn)",
    dose: "3.375 g IV",
    frequency: "Every 6 Hours",
    start_date: new Date(Date.now() - 3600 * 24 * 1000).toISOString().split("T")[0],
    end_date: null,
    prescribing_doctor: "Dr. Sarah Chen, MD",
    notes: "Broad-spectrum coverage for intra-abdominal sepsis protocol.",
    schedule_times: ["06:00", "12:00", "18:00", "00:00"],
    adherence_pct: 100
  },
  {
    id: 2,
    patient_id: 1,
    name: "Lactated Ringer's Solution",
    dose: "1000 mL IV",
    frequency: "Continuous Infusion 125 mL/hr",
    start_date: new Date(Date.now() - 3600 * 12 * 1000).toISOString().split("T")[0],
    end_date: null,
    prescribing_doctor: "Dr. Marcus Vance, DO",
    notes: "Target MAP >= 65 mmHg and urine output >= 0.5 mL/kg/hr.",
    schedule_times: ["Continuous"],
    adherence_pct: 100
  },
  {
    id: 3,
    patient_id: 1,
    name: "Acetaminophen (Paracetamol)",
    dose: "650 mg IV",
    frequency: "PRN Every 4-6 Hours",
    start_date: new Date(Date.now() - 3600 * 36 * 1000).toISOString().split("T")[0],
    end_date: null,
    prescribing_doctor: "Dr. Sarah Chen, MD",
    notes: "Temperature control if body temp exceeds 38.3 °C.",
    schedule_times: ["08:00", "14:00", "20:00"],
    adherence_pct: 95
  }
];

export const DEFAULT_DOCTORS: Doctor[] = [
  {
    id: 1,
    patient_id: 1,
    name: "Dr. Sarah Chen, MD",
    specialty: "Critical Care Intensivist",
    hospital_clinic: "St. Jude ICU, Floor 3",
    phone: "+1 (555) 492-3810",
    email: "s.chen@stjude-icu.org",
    notes: "Primary intensivist overseeing Sepsis Rapid Response protocol."
  },
  {
    id: 2,
    patient_id: 1,
    name: "Dr. Marcus Vance, DO",
    specialty: "Infectious Disease Specialist",
    hospital_clinic: "Clinical Microbiology Consultation",
    phone: "+1 (555) 492-7721",
    email: "m.vance@infections-center.org",
    notes: "Consulted for empiric antimicrobial stewardship."
  }
];

export const DEFAULT_APPOINTMENTS: Appointment[] = [
  {
    id: 1,
    patient_id: 1,
    doctor_id: 1,
    appointment_time: new Date(Date.now() + 3600 * 2 * 1000).toISOString(),
    reason: "Multidisciplinary Bedside ICU Rounds & Lactate Re-evaluation",
    status: "scheduled",
    notes: "Review 6-hour sepsis risk trajectory, blood gas, and vasopressor weaning."
  }
];

/**
 * Generates a realistic 250 Hz P-QRS-T electrocardiogram sample segment (1 second = 250 samples)
 */
export function generateRealisticECGSamples(hr: number = 78, tick: number = 0): number[] {
  const fs = 250;
  const samples: number[] = new Array(fs);
  const rrInterval = fs * (60 / hr); // samples per beat

  for (let i = 0; i < fs; i++) {
    const totalSample = tick * fs + i;
    const phase = (totalSample % rrInterval) / rrInterval; // 0.0 to 1.0 within beat

    let mv = 0.0;

    // P-wave: around phase 0.15 - 0.25
    if (phase >= 0.15 && phase <= 0.25) {
      const p = (phase - 0.20) / 0.05;
      mv += 0.15 * Math.exp(-0.5 * (p * 3) ** 2);
    }
    // PR segment baseline: 0.25 - 0.35
    // Q-wave: sharp dip around 0.35
    else if (phase >= 0.34 && phase <= 0.37) {
      const q = (phase - 0.355) / 0.015;
      mv -= 0.20 * Math.exp(-0.5 * (q * 4) ** 2);
    }
    // R-wave: sharp tall spike around 0.38 - 0.42
    else if (phase >= 0.37 && phase <= 0.43) {
      const r = (phase - 0.40) / 0.02;
      mv += 1.45 * Math.exp(-0.5 * (r * 3.5) ** 2);
    }
    // S-wave: sharp negative deflection around 0.42 - 0.46
    else if (phase >= 0.43 && phase <= 0.47) {
      const s = (phase - 0.45) / 0.02;
      mv -= 0.35 * Math.exp(-0.5 * (s * 4) ** 2);
    }
    // T-wave: gentle broad dome around 0.55 - 0.75
    else if (phase >= 0.55 && phase <= 0.75) {
      const t = (phase - 0.65) / 0.10;
      mv += 0.32 * Math.exp(-0.5 * (t * 2.8) ** 2);
    }

    // Add mild physiological noise (50 Hz notch filtered & baseline wander)
    const baselineWander = 0.04 * Math.sin(totalSample * 0.005);
    const emgNoise = (Math.random() - 0.5) * 0.03;

    samples[i] = +(mv + baselineWander + emgNoise).toFixed(3);
  }

  return samples;
}

/**
 * Creates a synthetic live telemetry packet for instant autonomous dashboard operation
 */
export function createSyntheticTelemetry(patientId: number, tick: number): TelemetryUpdateMessage {
  const baseHr = patientId === 1 ? 88 : patientId === 2 ? 72 : 94;
  const baseSpo2 = patientId === 1 ? 95 : patientId === 2 ? 98 : 92;
  const baseTemp = patientId === 1 ? 38.1 : patientId === 2 ? 36.8 : 38.6;

  const hrWobble = Math.round(Math.sin(tick * 0.2) * 3 + (Math.random() - 0.5) * 1.5);
  const currentHr = baseHr + hrWobble;
  const currentSpo2 = Math.min(100, Math.max(88, baseSpo2 + Math.round((Math.random() - 0.5) * 0.8)));
  const currentTemp = +(baseTemp + Math.sin(tick * 0.05) * 0.15).toFixed(1);
  const respRate = patientId === 1 ? 22 : 16;
  const risk = patientId === 1 ? 0.38 : patientId === 2 ? 0.07 : 0.64;

  const ecgSamples = generateRealisticECGSamples(currentHr, tick);

  return {
    type: "TELEMETRY_UPDATE",
    patient_id: patientId,
    device_id: patientId === 3 ? "REPLAY-p000001" : "ESP32-ICU-04",
    ts_ms: Date.now(),
    is_replay: patientId === 3,
    vitals: {
      hr_bpm: currentHr,
      spo2_pct: currentSpo2,
      temp_c: currentTemp,
      ecg_hr: currentHr,
      resp_rate: respRate
    },
    flags: {
      leads_off: false,
      finger_off: false,
      adc_saturated: false
    },
    sqi: {
      overall: 94,
      ecg: 96,
      hr: 95,
      spo2: 92,
      temp: 98,
      reasons: ["Adequate signal quality (SNR > 18 dB)"]
    },
    prediction: {
      risk_probability: risk,
      horizon_hours: 6,
      is_alert: risk >= 0.40,
      insufficient_data: false,
      rhythm_class: 0,
      rhythm_label: "Normal Sinus Rhythm",
      top_features: {
        HR: currentHr,
        Temp: currentTemp,
        Resp: respRate,
        ShockIndex: +(currentHr / 115).toFixed(2),
        HR_Slope_6h: patientId === 1 ? 1.4 : -0.2
      }
    },
    active_alerts_count: patientId === 1 ? 1 : 0,
    alerts: generateDefaultAlerts(patientId),
    ecg_preview: ecgSamples
  };
}
