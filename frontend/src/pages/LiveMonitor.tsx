import React from "react";
import { ECGWaveform } from "../components/ECGWaveform";
import { VitalTile } from "../components/VitalTile";
import { RiskGauge } from "../components/RiskGauge";
import { TelemetryUpdateMessage, Reading, Alert, DeviceInfo } from "../types";
import { Activity, ShieldCheck, Cpu, Wifi, Radio, Clock, AlertTriangle, Pause, Play } from "lucide-react";

interface LiveMonitorProps {
  latestTelemetry: TelemetryUpdateMessage | null;
  historyReadings: Reading[];
  activeAlerts: Alert[];
  onAcknowledgeAlert: (alertId: number) => void;
  device?: DeviceInfo;
  isReplay: boolean;
  isFrozen: boolean;
  onToggleFreeze: () => void;
  onViewNotifications?: () => void;
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({
  latestTelemetry,
  historyReadings,
  activeAlerts,
  onAcknowledgeAlert,
  device,
  isReplay,
  isFrozen,
  onToggleFreeze,
  onViewNotifications
}) => {
  const vitals = latestTelemetry?.vitals;
  const flags = latestTelemetry?.flags || { leads_off: false, finger_off: false, adc_saturated: false };
  const sqi = latestTelemetry?.sqi || {
    overall: 100,
    ecg: 100,
    hr: 100,
    spo2: 100,
    temp: 100,
    reasons: ["Awaiting telemetry signal"]
  };
  const prediction = latestTelemetry?.prediction;

  // Active warnings count stored in the Notification Center
  const activeWarnings = activeAlerts.filter((a) => a.level === "warning");
  const criticalAlerts = activeAlerts.filter((a) => a.level !== "warning");

  // Extract recent vital history for sparklines
  const hrHist = historyReadings.map((r) => r.hr_bpm ?? 0).filter((v) => v > 0);
  const spo2Hist = historyReadings.map((r) => r.spo2_pct ?? 0).filter((v) => v > 0);
  const tempHist = historyReadings.map((r) => r.temp_c ?? 0).filter((v) => v > 0);
  const respHist = historyReadings.map((r) => r.resp_rate ?? 0).filter((v) => v > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Alert banners removed from Live Monitor — all notifications are handled in the Notification Center tab */}

      {/* Top Telemetry Header & Status Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Real-Time Bedside Telemetry
              {isReplay && (
                <span className="text-[11px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                  Replay Mode
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              Synchronized multi-channel physiological monitoring & 6h predictive inference
            </p>
          </div>
        </div>

        {/* Hardware & Notification Strip */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {/* Stored Warnings Shortcut Pill */}
          {activeWarnings.length > 0 && (
            <button
              type="button"
              onClick={onViewNotifications}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-sans font-semibold transition-all cursor-pointer shadow-sm"
              title="Warnings are safely archived in the Notification Center. Click to view."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{activeWarnings.length} Warning{activeWarnings.length > 1 ? "s" : ""} in Notification Hub</span>
            </button>
          )}

          {/* Header Freeze/Resume Shortcut Button */}
          <button
            type="button"
            onClick={onToggleFreeze}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-xs transition-all shadow cursor-pointer ${
              isFrozen
                ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-2 ring-emerald-400"
                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40"
            }`}
          >
            {isFrozen ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isFrozen ? "RESUME FEED" : "FREEZE MONITOR"}</span>
          </button>

          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>{device?.device_id || "ESP32-01"}</span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-400">Flexible Baud (1,15,200+)</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
            <Wifi className="w-4 h-4 text-cyan-400" />
            <span>RSSI: {latestTelemetry ? `${latestTelemetry.device_id ? "-58" : "--"} dBm` : "--"}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>
              {latestTelemetry ? new Date(latestTelemetry.ts_ms).toLocaleTimeString() : "--:--:--"}
            </span>
          </div>
        </div>
      </div>

      {/* Frozen Notice Banner */}
      {isFrozen && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
            <span>
              <strong>MONITOR FROZEN FOR CLINICAL INSPECTION:</strong> All incoming patient telemetry, vitals tiles, and waveforms are stopped at this exact snapshot. Click <strong>RESUME</strong> to continue live tracking.
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleFreeze}
            className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase tracking-wider text-xs transition-all shadow cursor-pointer shrink-0"
          >
            RESUME LIVE DATA
          </button>
        </div>
      )}

      {/* Primary ECG Waveform Display */}
      <ECGWaveform
        ecgSamples={latestTelemetry?.ecg_preview || []}
        heartRate={vitals?.hr_bpm ?? null}
        rhythmLabel={prediction?.rhythm_label || "Normal Sinus Rhythm"}
        leadsOff={flags.leads_off}
        overallSQI={sqi.overall}
        isFrozen={isFrozen}
        onToggleFreeze={onToggleFreeze}
      />

      {/* Grid of 4 Vitals Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <VitalTile
          type="hr"
          title="Heart Rate"
          value={vitals?.hr_bpm ?? null}
          unit="BPM"
          history={hrHist}
          sqi={sqi.hr}
          minNormal={60}
          maxNormal={100}
        />
        <VitalTile
          type="spo2"
          title="Blood Oxygen"
          value={vitals?.spo2_pct ?? null}
          unit="%"
          history={spo2Hist}
          sqi={sqi.spo2}
          minNormal={95}
          maxNormal={100}
        />
        <VitalTile
          type="temp"
          title="Core Temperature"
          value={vitals?.temp_c ?? null}
          unit="°C"
          history={tempHist}
          sqi={sqi.temp}
          minNormal={36.5}
          maxNormal={37.5}
        />
        <VitalTile
          type="resp"
          title="Respiration Rate"
          value={vitals?.resp_rate ?? null}
          unit="BrPM"
          history={respHist}
          sqi={sqi.ecg}
          minNormal={12}
          maxNormal={20}
        />
      </div>

      {/* Lower Row: Risk Gauge + Signal Quality Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sepsis 6h Deterioration Risk Gauge */}
        <div className="lg:col-span-1">
          <RiskGauge
            riskProbability={prediction?.risk_probability ?? null}
            horizonHours={prediction?.horizon_hours ?? 6}
            isAlert={prediction?.is_alert ?? false}
            insufficientData={prediction?.insufficient_data ?? false}
            topFeatures={prediction?.top_features}
          />
        </div>

        {/* Signal Quality Index (SQI) Deep Dive */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  Physical Signal Quality Index (SQI)
                </h3>
              </div>
              <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                Composite SQI: <strong className="text-emerald-400">{sqi.overall.toFixed(0)}%</strong>
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Real-time physical evidence analysis computed from ECG SNR, baseline drift, optical AC/DC pulsatile ratio, and sensor contact integrity.
            </p>

            {/* SQI Channels Progress Bars */}
            <div className="space-y-3.5">
              {[
                { label: "ECG Heart Monitor (AD8232)", value: sqi.ecg, note: flags.leads_off ? "Leads detached" : "Good baseline stability" },
                { label: "SpO₂ & Optical Pulse (MAX30102)", value: sqi.spo2, note: flags.finger_off ? "Finger detached" : "Clean optical plethysmogram" },
                { label: "Heart Rate Agreement (ECG + PPG)", value: sqi.hr, note: "ECG & Optical cross-correlation" },
                { label: "Temperature Sensor (MLX90614 IR)", value: sqi.temp, note: "Surface & core thermal tracking" }
              ].map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-300">{item.label}</span>
                    <span className="font-mono text-cyan-400 font-bold">{item.value.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.value >= 80 ? "bg-emerald-500" : item.value >= 50 ? "bg-amber-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Diagnostic Reasons */}
          <div className="mt-5 pt-4 border-t border-slate-800">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Signal Quality Assessment:
            </span>
            <div className="flex flex-wrap gap-2">
              {sqi.reasons && sqi.reasons.length > 0 ? (
                sqi.reasons.map((r, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-300 font-mono flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    {r}
                  </span>
                ))
              ) : (
                <span className="text-xs text-emerald-400 font-mono">All physical signal channels nominal.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
