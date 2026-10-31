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

const API_BASE = "/api";

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
  getPatients: () => fetchJson<Patient[]>(`${API_BASE}/patients`),
  createPatient: (data: Partial<Patient>) =>
    fetchJson<Patient>(`${API_BASE}/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }),
  getPatient: (id: number) => fetchJson<Patient>(`${API_BASE}/patients/${id}`),
  updatePatient: (id: number, data: Partial<Patient>) =>
    fetchJson<Patient>(`${API_BASE}/patients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }),

  // Telemetry
  postTelemetry: (payload: any) =>
    fetchJson<any>(`${API_BASE}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  getReadings: (patientId: number, limit = 100) =>
    fetchJson<Reading[]>(`${API_BASE}/telemetry/readings/${patientId}?limit=${limit}`),
  getSQI: (patientId: number) =>
    fetchJson<any>(`${API_BASE}/telemetry/sqi/${patientId}`),

  // Predictions
  getPredictions: (patientId: number, limit = 50) =>
    fetchJson<PredictionRecord[]>(`${API_BASE}/patients/${patientId}/predictions?limit=${limit}`),
  getModelCard: () =>
    fetchJson<any>(`${API_BASE}/model/card`),

  // Alerts
  getAlerts: (patientId?: number, acknowledged?: boolean) => {
    const params = new URLSearchParams();
    if (patientId !== undefined) params.append("patient_id", patientId.toString());
    if (acknowledged !== undefined) params.append("acknowledged", acknowledged.toString());
    return fetchJson<Alert[]>(`${API_BASE}/alerts?${params.toString()}`);
  },
  acknowledgeAlert: (alertId: number, acknowledgedBy = "Clinician") =>
    fetchJson<Alert>(`${API_BASE}/alerts/${alertId}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged_by: acknowledgedBy })
    }),
  getThresholds: () => fetchJson<AlertThresholds>(`${API_BASE}/alerts/thresholds`),
  updateThresholds: (thresholds: AlertThresholds) =>
    fetchJson<AlertThresholds>(`${API_BASE}/alerts/thresholds`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(thresholds)
    }),

  // Devices & Serial
  getDevices: () => fetchJson<DeviceInfo[]>(`${API_BASE}/devices`),
  getSerialPorts: () => fetchJson<string[]>(`${API_BASE}/serial/ports`),
  getSerialStatus: () => fetchJson<SerialStatus>(`${API_BASE}/serial/status`),
  connectSerial: (port: string, baud = 921600) =>
    fetchJson<SerialStatus>(`${API_BASE}/serial/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, baud_rate: baud })
    }),
  disconnectSerial: () =>
    fetchJson<SerialStatus>(`${API_BASE}/serial/disconnect`, { method: "POST" }),

  // Replay
  getReplayStatus: () => fetchJson<ReplayStatus>(`${API_BASE}/replay/status`),
  startReplay: (patientId: number, recordId = "p000001", speedFactor = 1.0, loop = true) =>
    fetchJson<ReplayStatus>(`${API_BASE}/replay/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: patientId,
        record_id: recordId,
        speed_factor: speedFactor,
        loop
      })
    }),
  setReplaySpeed: (speedFactor: number) =>
    fetchJson<ReplayStatus>(`${API_BASE}/replay/speed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed_factor: speedFactor })
    }),
  stopReplay: () => fetchJson<ReplayStatus>(`${API_BASE}/replay/stop`, { method: "POST" }),

  // Care Guidance
  getCareGuidance: (patientId: number) =>
    fetchJson<CareGuidance>(`${API_BASE}/care/guidance/${patientId}`),

  // Medicines
  getMedicines: (patientId: number) =>
    fetchJson<Medicine[]>(`${API_BASE}/medicines/${patientId}`),
  createMedicine: (patientId: number, data: Partial<Medicine>) =>
    fetchJson<Medicine>(`${API_BASE}/medicines/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }),

  // Doctors & Appointments
  getDoctors: (patientId: number) =>
    fetchJson<Doctor[]>(`${API_BASE}/doctors/${patientId}`),
  createDoctor: (patientId: number, data: Partial<Doctor>) =>
    fetchJson<Doctor>(`${API_BASE}/doctors/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }),
  getAppointments: (patientId: number) =>
    fetchJson<Appointment[]>(`${API_BASE}/appointments/${patientId}`),
  createAppointment: (patientId: number, data: Partial<Appointment>) =>
    fetchJson<Appointment>(`${API_BASE}/appointments/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
};
