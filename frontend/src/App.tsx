import React, { useState, useEffect, useRef } from "react";
import { Navbar, NavTab } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { SafetyModal } from "./components/SafetyModal";

// Pages
import { LiveMonitor } from "./pages/LiveMonitor";
import { HistoryTrends } from "./pages/HistoryTrends";
import { Predictions } from "./pages/Predictions";
import { AlertsPage } from "./pages/AlertsPage";
import { PatientsPage } from "./pages/PatientsPage";
import { MedicinesPage } from "./pages/MedicinesPage";
import { DoctorsPage } from "./pages/DoctorsPage";
import { ModelCardPage } from "./pages/ModelCardPage";
import { SettingsDevicePage } from "./pages/SettingsDevicePage";
import { HardwareLivePage } from "./pages/HardwareLivePage";
import {
  ParsedEsp32Reading,
  computePortableSepsisRisk,
  synthesizeEcgWaveFromHr
} from "./utils/esp32Parser";

// Types & API
import {
  Patient,
  Reading,
  PredictionRecord,
  Alert,
  TelemetryUpdateMessage,
  SerialStatus,
  ReplayStatus,
  AlertThresholds
} from "./types";
import { api } from "./api";

export const App: React.FC = () => {
  // Navigation & Modal State
  const [currentTab, setCurrentTab] = useState<NavTab>("live");
  const [safetyModalOpen, setSafetyModalOpen] = useState<boolean>(() => {
    return localStorage.getItem("septisense_safety_ack") !== "true";
  });

  // Patient State
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number>(1);

  // Live Telemetry & Feed State
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryUpdateMessage | null>(null);
  const [historyReadings, setHistoryReadings] = useState<Reading[]>([]);
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [thresholds, setThresholds] = useState<AlertThresholds>({
    hr_min: 50,
    hr_max: 120,
    spo2_min: 90,
    temp_min: 36.0,
    temp_max: 38.5,
    sepsis_risk_threshold: 0.40
  });

  // Hardware Status State
  const [serialStatus, setSerialStatus] = useState<SerialStatus | null>(null);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(null);

  // Audio Alerts State: Start MUTED by default on site open to eliminate unwanted beep sounds on page load.
  // The user can explicitly toggle the volume button in the navbar when sound is desired.
  const [audioMuted, setAudioMuted] = useState<boolean>(true);
  const audioMutedRef = useRef<boolean>(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastAlarmTimeRef = useRef<number>(0);

  // Freeze / Resume State for Clinical Inspection
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const isFrozenRef = useRef<boolean>(false);

  // Keep refs in sync with state
  useEffect(() => {
    audioMutedRef.current = audioMuted;
    localStorage.setItem("septisense_audio_muted", audioMuted.toString());
  }, [audioMuted]);

  useEffect(() => {
    isFrozenRef.current = isFrozen;
  }, [isFrozen]);

  const handleToggleAudio = () => {
    const nextState = !audioMuted;
    setAudioMuted(nextState);
    audioMutedRef.current = nextState;
    localStorage.setItem("septisense_audio_muted", nextState.toString());

    if (nextState) {
      // Immediately silence any active audio context
      if (audioCtxRef.current && audioCtxRef.current.state === "running") {
        try {
          audioCtxRef.current.suspend();
        } catch (e) {
          console.warn("Error suspending audio context", e);
        }
      }
    } else {
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        try {
          audioCtxRef.current.resume();
        } catch (e) {
          console.warn("Error resuming audio context", e);
        }
      }
    }
  };

  const handleToggleFreeze = () => {
    const nextState = !isFrozen;
    setIsFrozen(nextState);
    isFrozenRef.current = nextState;
  };

  // Sound generator using Web Audio API
  const playAlarmTone = (frequency = 920, duration = 0.25) => {
    // ALWAYS check ref directly so stale closures never trigger audio
    if (audioMutedRef.current) return;

    // Rate-limit alarm tones (at most once every 3.5s) to prevent continuous buzzing at high replay speeds (5x, 10x, 60x)
    const now = Date.now();
    if (now - lastAlarmTimeRef.current < 3500) {
      return;
    }
    lastAlarmTimeRef.current = now;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio playback not permitted yet", e);
    }
  };

  // Load initial patient directory and thresholds
  useEffect(() => {
    api.getPatients()
      .then((data) => {
        setPatients(data);
        if (data.length > 0 && !data.find((p) => p.id === selectedPatientId)) {
          setSelectedPatientId(data[0].id);
        }
      })
      .catch(console.error);

    api.getThresholds()
      .then(setThresholds)
      .catch(console.error);
  }, []);

  // Fetch readings & predictions on patient switch
  const loadPatientData = async (patientId: number) => {
    try {
      const [r, p, a] = await Promise.all([
        api.getReadings(patientId, 100),
        api.getPredictions(patientId, 50),
        api.getAlerts(patientId)
      ]);
      setHistoryReadings(r);
      setPredictions(p);
      setAlerts(a);
    } catch (err) {
      console.error("Error loading patient data", err);
    }
  };

  useEffect(() => {
    loadPatientData(selectedPatientId);
  }, [selectedPatientId]);

  // Periodic hardware status polling (every 3 seconds)
  const refreshHardwareStatus = async () => {
    try {
      const [s, rep, a] = await Promise.all([
        api.getSerialStatus(),
        api.getReplayStatus(),
        api.getAlerts(selectedPatientId)
      ]);
      setSerialStatus(s);
      setReplayStatus(rep);
      setAlerts(a);
    } catch (err) {
      // Backend may be warming up
    }
  };

  useEffect(() => {
    refreshHardwareStatus();
    const interval = setInterval(refreshHardwareStatus, 3000);
    return () => clearInterval(interval);
  }, [selectedPatientId]);

  // WebSocket connection for real-time live push
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWebSocket = () => {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${wsProtocol}//${window.location.host}/ws/live/${selectedPatientId}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "TELEMETRY_UPDATE") {
            // When monitoring is frozen, ignore incoming data packets to keep current view static
            if (isFrozenRef.current) {
              return;
            }

            const update = msg as TelemetryUpdateMessage;
            setLatestTelemetry(update);

            // Synthesize reading record to append to sparklines
            const newReading: Reading = {
              id: Date.now(),
              patient_id: update.patient_id,
              device_id: update.device_id,
              ts_ms: update.ts_ms,
              time_synced: true,
              buffered: false,
              is_replay: update.is_replay,
              hr_bpm: update.vitals.hr_bpm,
              spo2_pct: update.vitals.spo2_pct,
              temp_c: update.vitals.temp_c,
              ecg_hr: update.vitals.ecg_hr,
              resp_rate: update.vitals.resp_rate,
              flags_json: JSON.stringify(update.flags),
              rssi: -58
            };
            setHistoryReadings((prev) => [...prev.slice(-120), newReading]);

            // If prediction exists, prepend to predictions
            if (update.prediction) {
              const newPred: PredictionRecord = {
                id: Date.now(),
                patient_id: update.patient_id,
                ts_ms: update.ts_ms,
                risk_probability: update.prediction.risk_probability,
                horizon_hours: update.prediction.horizon_hours,
                is_alert: update.prediction.is_alert,
                insufficient_data: update.prediction.insufficient_data,
                rhythm_class: update.prediction.rhythm_class,
                rhythm_label: update.prediction.rhythm_label,
                features_snapshot: update.prediction.top_features || {}
              };
              setPredictions((prev) => [newPred, ...prev.slice(0, 49)]);

              if (update.prediction.is_alert && !audioMutedRef.current) {
                playAlarmTone(920, 0.3);
              }
            }

            // Real-time synchronization of Critical & Warning Notifications
            if (msg.alerts && Array.isArray(msg.alerts) && msg.alerts.length > 0) {
              setAlerts((prev) => {
                const existingIds = new Set(prev.map((a) => a.id));
                const fresh = (msg.alerts as Alert[]).filter((a) => !existingIds.has(a.id));
                if (fresh.length > 0) {
                  return [...fresh, ...prev];
                }
                return prev;
              });
            }
          }
        } catch (e) {
          console.error("WS Parse error", e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = () => {
        setWsConnected(false);
        ws?.close();
      };
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [selectedPatientId]);

  // Alert Handlers
  const handleAcknowledgeAlert = async (alertId: number, name = "Clinician") => {
    try {
      await api.acknowledgeAlert(alertId, name);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, acknowledged_at: new Date().toISOString(), acknowledged_by: name }
            : a
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateThresholds = async (newThresholds: AlertThresholds) => {
    const updated = await api.updateThresholds(newThresholds);
    setThresholds(updated);
  };

  const handleCreatePatient = async (data: Partial<Patient>) => {
    const created = await api.createPatient(data);
    setPatients((prev) => [...prev, created]);
    setSelectedPatientId(created.id);
  };

  // Direct Portable USB Hardware Reading Handler (updates Live Monitor, History, Predictions, and Backend)
  const handleHardwareReading = (reading: ParsedEsp32Reading) => {
    if (isFrozenRef.current) return;

    const nowMs = Date.now();
    const hrVal = reading.hr ?? reading.ecg_bpm ?? null;
    const ecgHrVal = reading.ecg_bpm ?? reading.hr ?? null;
    const spo2Val = reading.spo2 ?? null;
    const tempVal = reading.obj ?? null;
    const leadsOff = Boolean(reading.lead_off);
    const fingerOff = reading.finger === false;

    const ecgPreview =
      reading.ecg_samples && reading.ecg_samples.length > 0
        ? reading.ecg_samples
        : synthesizeEcgWaveFromHr(hrVal, leadsOff);

    const riskCalc = computePortableSepsisRisk(
      reading.hr,
      reading.ecg_bpm,
      reading.spo2,
      reading.obj,
      2.0,
      thresholds.sepsis_risk_threshold
    );

    const riskProb = riskCalc.risk ?? 0.01;
    const isAlert = riskProb >= thresholds.sepsis_risk_threshold;

    const telemetryMsg: TelemetryUpdateMessage = {
      type: "TELEMETRY_UPDATE",
      patient_id: selectedPatientId,
      device_id: "esp32-01",
      ts_ms: nowMs,
      is_replay: false,
      vitals: {
        hr_bpm: hrVal,
        ecg_hr: ecgHrVal,
        spo2_pct: spo2Val,
        temp_c: tempVal,
        resp_rate: hrVal ? Math.round(hrVal / 4.5) : 16
      },
      flags: {
        leads_off: leadsOff,
        finger_off: fingerOff,
        adc_saturated: false
      },
      sqi: {
        overall: leadsOff && fingerOff ? 45 : 96,
        ecg: leadsOff ? 30 : 95,
        hr: hrVal !== null ? 98 : 60,
        spo2: spo2Val !== null ? 97 : 60,
        temp: tempVal !== null ? 99 : 60,
        reasons: ["Direct ESP32 USB Hardware Stream Active"]
      },
      prediction: {
        risk_probability: riskProb,
        horizon_hours: 6,
        is_alert: isAlert,
        insufficient_data: false,
        rhythm_class: 0,
        rhythm_label:
          hrVal && hrVal > 100
            ? "Sinus Tachycardia"
            : hrVal && hrVal < 60
            ? "Sinus Bradycardia"
            : "Normal Sinus Rhythm",
        top_features: {
          HR: hrVal ?? 0,
          O2Sat: spo2Val ?? 0,
          Temp: tempVal ?? 0
        }
      },
      ecg_preview: ecgPreview,
      active_alerts_count: alerts.filter((a) => !a.acknowledged_at).length
    };

    setWsConnected(true);
    setLatestTelemetry(telemetryMsg);

    const newReading: Reading = {
      id: nowMs,
      patient_id: selectedPatientId,
      device_id: "esp32-01",
      ts_ms: nowMs,
      time_synced: true,
      buffered: false,
      is_replay: false,
      hr_bpm: hrVal,
      spo2_pct: spo2Val,
      temp_c: tempVal,
      ecg_hr: ecgHrVal,
      resp_rate: hrVal ? Math.round(hrVal / 4.5) : 16,
      flags_json: JSON.stringify(telemetryMsg.flags),
      rssi: -45
    };
    setHistoryReadings((prev) => [...prev.slice(-120), newReading]);

    const newPred: PredictionRecord = {
      id: nowMs,
      patient_id: selectedPatientId,
      ts_ms: nowMs,
      risk_probability: riskProb,
      horizon_hours: 6,
      is_alert: isAlert,
      insufficient_data: false,
      rhythm_class: 0,
      rhythm_label: telemetryMsg.prediction?.rhythm_label || "Normal Sinus Rhythm",
      features_snapshot: telemetryMsg.prediction?.top_features || {}
    };
    setPredictions((prev) => [newPred, ...prev.slice(0, 49)]);

    // Also forward to backend server (both SeptiSense and server.py records schema) if reachable
    api
      .postTelemetry({
        patient_id: selectedPatientId,
        device_id: "septisense-01",
        sent_ms: nowMs,
        ts_ms: nowMs,
        hr_bpm: hrVal,
        spo2_pct: spo2Val,
        temp_c: tempVal,
        ecg: reading.ecg_samples,
        flags: telemetryMsg.flags,
        records: [
          {
            t: nowMs,
            mlx: 1,
            tOK: tempVal !== null ? 1 : 0,
            obj: tempVal,
            amb: reading.amb ?? 25.5,
            led: reading.led ? 1 : 0,
            max: 1,
            fin: !fingerOff ? 1 : 0,
            hrOK: hrVal !== null ? 1 : 0,
            hr: hrVal,
            spo2OK: spo2Val !== null ? 1 : 0,
            spo2: spo2Val,
            ecgOK: ecgHrVal !== null ? 1 : 0,
            ecg: ecgHrVal,
            ecgQ: 95,
            lo: leadsOff ? 1 : 0
          }
        ]
      })
      .catch(() => {});
  };

  const activeAlertCount = alerts.filter((a) => !a.acknowledged_at).length;
  const isReplayActive = replayStatus?.is_active || latestTelemetry?.is_replay || false;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Mandatory Electrical & Clinical Safety Modal */}
      <SafetyModal
        isOpen={safetyModalOpen}
        onConfirm={() => setSafetyModalOpen(false)}
      />

      {/* Main Top Navigation */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        patients={patients}
        selectedPatientId={selectedPatientId}
        onSelectPatient={setSelectedPatientId}
        wsConnected={wsConnected}
        isReplay={isReplayActive}
        activeAlertCount={activeAlertCount}
        audioMuted={audioMuted}
        onToggleAudio={handleToggleAudio}
        onOpenSafetyModal={() => setSafetyModalOpen(true)}
      />

      {/* Page Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === "live" && (
          <LiveMonitor
            latestTelemetry={latestTelemetry}
            historyReadings={historyReadings}
            activeAlerts={alerts.filter((a) => !a.acknowledged_at)}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            isReplay={isReplayActive}
            isFrozen={isFrozen}
            onToggleFreeze={handleToggleFreeze}
            onViewNotifications={() => setCurrentTab("alerts")}
          />
        )}

        {currentTab === "history" && (
          <HistoryTrends
            readings={historyReadings}
            predictions={predictions}
            patientId={selectedPatientId}
          />
        )}

        {currentTab === "predictions" && (
          <Predictions predictions={predictions} patientId={selectedPatientId} />
        )}

        {currentTab === "alerts" && (
          <AlertsPage
            alerts={alerts}
            thresholds={thresholds}
            onUpdateThresholds={handleUpdateThresholds}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            audioMuted={audioMuted}
            onToggleAudio={handleToggleAudio}
          />
        )}

        {currentTab === "patients" && (
          <PatientsPage
            patients={patients}
            selectedPatientId={selectedPatientId}
            onSelectPatient={setSelectedPatientId}
            onCreatePatient={handleCreatePatient}
          />
        )}

        {currentTab === "medicines" && (
          <MedicinesPage patientId={selectedPatientId} />
        )}

        {currentTab === "doctors" && (
          <DoctorsPage patientId={selectedPatientId} />
        )}

        {currentTab === "modelcard" && <ModelCardPage />}

        {currentTab === "settings" && (
          <SettingsDevicePage
            serialStatus={serialStatus}
            replayStatus={replayStatus}
            onRefreshStatus={refreshHardwareStatus}
            selectedPatientId={selectedPatientId}
            onHardwareReading={handleHardwareReading}
          />
        )}

        <div className={currentTab === "hardware" ? "block" : "hidden"}>
          <HardwareLivePage
            latestTelemetry={latestTelemetry}
            serialStatus={serialStatus}
            onHardwareReading={handleHardwareReading}
          />
        </div>
      </main>

      {/* Permanent Regulatory Disclaimer Footer */}
      <Footer />
    </div>
  );
};

export default App;
