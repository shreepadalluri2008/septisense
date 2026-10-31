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
  AlertThresholds
} from "./types";
import {
  DEFAULT_PATIENTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_SERIAL_STATUS,
  DEFAULT_REPLAY_STATUS,
  DEFAULT_CARE_GUIDANCE,
  DEFAULT_MEDICINES,
  DEFAULT_DOCTORS,
  DEFAULT_APPOINTMENTS,
  generateDefaultReadings,
  generateDefaultPredictions,
  generateDefaultAlerts
} from "./defaultData";

export function getBackendBase(): string {
  const custom = localStorage.getItem("septisense_backend_url");
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, "");
  }
  return "";
}

export function setBackendBase(url: string): void {
  if (!url || !url.trim()) {
    localStorage.removeItem("septisense_backend_url");
  } else {
    localStorage.setItem("septisense_backend_url", url.trim().replace(/\/+$/, ""));
  }
}

export function getApiBase(): string {
  const base = getBackendBase();
  return base ? `${base}/api` : "/api";
}

export function getWsBase(patientId: number): string {
  const base = getBackendBase();
  if (base) {
    const wsProto = base.startsWith("https") ? "wss:" : "ws:";
    const host = base.replace(/^https?:\/\//, "");
    return `${wsProto}//${host}/ws/live/${patientId}`;
  }
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}/ws/live/${patientId}`;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
  }
  return res.json();
}

export const api = {
  // Patients
  getPatients: async (): Promise<Patient[]> => {
    try {
      return await fetchJson<Patient[]>(`${getApiBase()}/patients`);
    } catch {
      return DEFAULT_PATIENTS;
    }
  },
  createPatient: (data: Partial<Patient>) =>
    fetchJson<Patient>(`${getApiBase()}/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).catch(() => {
      const newP: Patient = {
        id: Date.now(),
        name: data.name || "New Patient",
        age: data.age || 50,
        gender: data.gender ?? 1,
        assigned_device_id: data.assigned_device_id || "ESP32-NEW",
        notes: data.notes || "Added in standalone session",
        created_at: new Date().toISOString()
      };
      return newP;
    }),
  getPatient: async (id: number): Promise<Patient> => {
    try {
      return await fetchJson<Patient>(`${getApiBase()}/patients/${id}`);
    } catch {
      return DEFAULT_PATIENTS.find((p) => p.id === id) || DEFAULT_PATIENTS[0];
    }
  },
  updatePatient: (id: number, data: Partial<Patient>) =>
    fetchJson<Patient>(`${getApiBase()}/patients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).catch(() => ({ ...DEFAULT_PATIENTS[0], ...data })),

  // Telemetry
  postTelemetry: (payload: any) =>
    fetchJson<any>(`${getApiBase()}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => ({ status: "received_offline" })),
  getReadings: async (patientId: number, limit = 100): Promise<Reading[]> => {
    try {
      return await fetchJson<Reading[]>(`${getApiBase()}/telemetry/readings/${patientId}?limit=${limit}`);
    } catch {
      return generateDefaultReadings(patientId, limit);
    }
  },
  getSQI: async (patientId: number) => {
    try {
      return await fetchJson<any>(`${getApiBase()}/telemetry/sqi/${patientId}`);
    } catch {
      return { overall: 94, ecg: 96, hr: 95, spo2: 92, temp: 98, reasons: ["Optimal physiological signal"] };
    }
  },

  // Predictions
  getPredictions: async (patientId: number, limit = 50): Promise<PredictionRecord[]> => {
    try {
      return await fetchJson<PredictionRecord[]>(`${getApiBase()}/patients/${patientId}/predictions?limit=${limit}`);
    } catch {
      return generateDefaultPredictions(patientId);
    }
  },
  getModelCard: async () => {
    try {
      return await fetchJson<any>(`${getApiBase()}/model/card`);
    } catch {
      return {
        model_name: "SeptiSense Dual-Engine Inference Pipeline",
        version: "1.2.0-clinical",
        task: "Sepsis Early-Warning Trajectory & ECG Rhythm Classification",
        model_a: {
          algorithm: "LightGBM Gradient-Boosted Decision Trees",
          training_dataset: "PhysioNet CinC Challenge 2019 (40,336 ICU patients)",
          features_used: 42,
          calibration: "Isotonic Regression",
          optimal_threshold: 0.40,
          horizon_hours: 6
        },
        model_b: {
          algorithm: "LightGBM Multi-class Classifier",
          training_dataset: "CinC 2017 & MIT-BIH Arrhythmia Database",
          sampling_rate_hz: 250,
          classes: ["Normal Sinus Rhythm", "Possible Atrial Fibrillation", "Other Arrhythmia", "Noisy / Motion Artifact"]
        },
        intended_use: "Research and clinical investigational decision support. Does not replace physician diagnosis.",
        hardware_safety: "Mandates battery operation or USB galvanic isolator (IEC 60601-1)."
      };
    }
  },

  // Alerts
  getAlerts: async (patientId?: number, acknowledged?: boolean): Promise<Alert[]> => {
    try {
      const params = new URLSearchParams();
      if (patientId !== undefined) params.append("patient_id", patientId.toString());
      if (acknowledged !== undefined) params.append("acknowledged", acknowledged.toString());
      return await fetchJson<Alert[]>(`${getApiBase()}/alerts?${params.toString()}`);
    } catch {
      return generateDefaultAlerts(patientId || 1);
    }
  },
  acknowledgeAlert: (alertId: number, acknowledgedBy = "Clinician") =>
    fetchJson<Alert>(`${getApiBase()}/alerts/${alertId}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged_by: acknowledgedBy })
    }).catch(() => ({
      id: alertId,
      patient_id: 1,
      device_id: "ESP32-ICU-04",
      ts_ms: Date.now(),
      level: "warning",
      reason: "Acknowledged locally",
      trigger_value: null,
      threshold_value: null,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: acknowledgedBy
    })),
  getThresholds: async (): Promise<AlertThresholds> => {
    try {
      return await fetchJson<AlertThresholds>(`${getApiBase()}/alerts/thresholds`);
    } catch {
      return DEFAULT_THRESHOLDS;
    }
  },
  updateThresholds: (thresholds: AlertThresholds) =>
    fetchJson<AlertThresholds>(`${getApiBase()}/alerts/thresholds`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(thresholds)
    }).catch(() => thresholds),

  // Devices & Serial
  getDevices: async (): Promise<DeviceInfo[]> => {
    try {
      return await fetchJson<DeviceInfo[]>(`${getApiBase()}/devices`);
    } catch {
      return [
        {
          device_id: "ESP32-ICU-04",
          label: "Bedside Monitor Unit #4",
          transport: "WebSerial / USB-UART",
          baud_rate: 921600,
          serial_port: "/dev/ttyUSB0",
          last_seen_ts: Date.now(),
          rssi: -58,
          packet_loss_pct: 0.02,
          bad_crc_count: 0,
          buffered_count: 0,
          is_connected: true
        }
      ];
    }
  },
  getSerialPorts: async (): Promise<string[]> => {
    try {
      return await fetchJson<string[]>(`${getApiBase()}/serial/ports`);
    } catch {
      return ["WebSerial (Browser Native)", "/dev/cu.usbserial-0001", "COM3"];
    }
  },
  getSerialStatus: async (): Promise<SerialStatus> => {
    try {
      return await fetchJson<SerialStatus>(`${getApiBase()}/serial/status`);
    } catch {
      return DEFAULT_SERIAL_STATUS;
    }
  },
  connectSerial: (port: string, baud = 921600) =>
    fetchJson<SerialStatus>(`${getApiBase()}/serial/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, baud_rate: baud })
    }).catch(() => ({ ...DEFAULT_SERIAL_STATUS, port, baud })),
  disconnectSerial: () =>
    fetchJson<SerialStatus>(`${getApiBase()}/serial/disconnect`, { method: "POST" })
      .catch(() => ({ ...DEFAULT_SERIAL_STATUS, is_connected: false })),

  // Replay
  getReplayStatus: async (): Promise<ReplayStatus> => {
    try {
      return await fetchJson<ReplayStatus>(`${getApiBase()}/replay/status`);
    } catch {
      return DEFAULT_REPLAY_STATUS;
    }
  },
  startReplay: (patientId: number, recordId = "p000001", speedFactor = 1.0, loop = true) =>
    fetchJson<ReplayStatus>(`${getApiBase()}/replay/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: patientId, record_id: recordId, speed_factor: speedFactor, loop })
    }).catch(() => ({ is_active: true, patient_id: patientId, record_id: recordId, current_hour: 1, total_hours: 40, speed_factor: speedFactor })),
  setReplaySpeed: (speedFactor: number) =>
    fetchJson<ReplayStatus>(`${getApiBase()}/replay/speed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed_factor: speedFactor })
    }).catch(() => ({ ...DEFAULT_REPLAY_STATUS, speed_factor: speedFactor })),
  stopReplay: () => fetchJson<ReplayStatus>(`${getApiBase()}/replay/stop`, { method: "POST" }).catch(() => DEFAULT_REPLAY_STATUS),

  // Care Guidance
  getCareGuidance: async (patientId: number): Promise<CareGuidance> => {
    try {
      return await fetchJson<CareGuidance>(`${getApiBase()}/care/guidance/${patientId}`);
    } catch {
      return { ...DEFAULT_CARE_GUIDANCE, patient_id: patientId };
    }
  },

  // Medicines
  getMedicines: async (patientId: number): Promise<Medicine[]> => {
    try {
      return await fetchJson<Medicine[]>(`${getApiBase()}/medicines/${patientId}`);
    } catch {
      return DEFAULT_MEDICINES;
    }
  },
  createMedicine: (patientId: number, data: Partial<Medicine>) =>
    fetchJson<Medicine>(`${getApiBase()}/medicines/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).catch(() => ({ id: Date.now(), patient_id: patientId, ...data } as Medicine)),

  // Doctors & Appointments
  getDoctors: async (patientId: number): Promise<Doctor[]> => {
    try {
      return await fetchJson<Doctor[]>(`${getApiBase()}/doctors/${patientId}`);
    } catch {
      return DEFAULT_DOCTORS;
    }
  },
  createDoctor: (patientId: number, data: Partial<Doctor>) =>
    fetchJson<Doctor>(`${getApiBase()}/doctors/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).catch(() => ({ id: Date.now(), patient_id: patientId, ...data } as Doctor)),
  getAppointments: async (patientId: number): Promise<Appointment[]> => {
    try {
      return await fetchJson<Appointment[]>(`${getApiBase()}/appointments/${patientId}`);
    } catch {
      return DEFAULT_APPOINTMENTS;
    }
  },
  createAppointment: (patientId: number, data: Partial<Appointment>) =>
    fetchJson<Appointment>(`${getApiBase()}/appointments/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).catch(() => ({ id: Date.now(), patient_id: patientId, ...data } as Appointment))
};
