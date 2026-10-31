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
import { api, getWsBase } from "./api";
import {
  DEFAULT_PATIENTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_SERIAL_STATUS,
  DEFAULT_REPLAY_STATUS,
  generateDefaultReadings,
  generateDefaultPredictions,
  generateDefaultAlerts,
  createSyntheticTelemetry
} from "./defaultData";

export const App: React.FC = () => {
  // Navigation & Modal State
  const [currentTab, setCurrentTab] = useState<NavTab>("live");
  const [safetyModalOpen, setSafetyModalOpen] = useState<boolean>(() => {
    return localStorage.getItem("septisense_safety_ack") !== "true";
  });

  // Patient State
  const [patients, setPatients] = useState<Patient[]>(DEFAULT_PATIENTS);
  const [selectedPatientId, setSelectedPatientId] = useState<number>(1);

  // Live Telemetry & Feed State
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryUpdateMessage | null>(() => createSyntheticTelemetry(1, 0));
  const [historyReadings, setHistoryReadings] = useState<Reading[]>(() => generateDefaultReadings(1, 60));
  const [predictions, setPredictions] = useState<PredictionRecord[]>(() => generateDefaultPredictions(1));
  const [alerts, setAlerts] = useState<Alert[]>(() => generateDefaultAlerts(1));
  const [thresholds, setThresholds] = useState<AlertThresholds>(DEFAULT_THRESHOLDS);

  // Hardware Status State
  const [serialStatus, setSerialStatus] = useState<SerialStatus | null>(DEFAULT_SERIAL_STATUS);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus | null>(DEFAULT_REPLAY_STATUS);

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
      try {
        const url = getWsBase(selectedPatientId);
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
    } catch (err) {
      setWsConnected(false);
      reconnectTimeout = setTimeout(connectWebSocket, 3000);
    }
  };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [selectedPatientId]);

  // Autonomous simulation tick: when WebSocket is disconnected (e.g. running standalone on GitHub Pages),
  // simulate continuous physiological vitals & realistic ECG sweep so dashboard is 100% alive and responsive
  useEffect(() => {
    if (wsConnected) return;
    let tick = 1;
    const simInterval = setInterval(() => {
      if (isFrozenRef.current) return;
      const syn = createSyntheticTelemetry(selectedPatientId, tick++);
      setLatestTelemetry(syn);
      const newReading: Reading = {
        id: Date.now(),
        patient_id: syn.patient_id,
        device_id: syn.device_id,
        ts_ms: syn.ts_ms,
        time_synced: true,
        buffered: false,
        is_replay: syn.is_replay,
        hr_bpm: syn.vitals.hr_bpm,
        spo2_pct: syn.vitals.spo2_pct,
        temp_c: syn.vitals.temp_c,
        ecg_hr: syn.vitals.ecg_hr,
        resp_rate: syn.vitals.resp_rate,
        flags_json: JSON.stringify(syn.flags),
        rssi: -58
      };
      setHistoryReadings((prev) => [...prev.slice(-120), newReading]);
    }, 1000);

    return () => clearInterval(simInterval);
  }, [wsConnected, selectedPatientId]);

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
          />
        )}
      </main>

      {/* Permanent Regulatory Disclaimer Footer */}
      <Footer />
    </div>
  );
};

export default App;
