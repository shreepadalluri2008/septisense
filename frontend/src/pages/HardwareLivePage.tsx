/**
 * HardwareLivePage.tsx
 *
 * Integrates the ESP32 hardware live dashboard directly into SeptiSense.
 * Polls the ESP32 / Cloudflare tunnel every 3 seconds and renders vitals,
 * risk gauge, data-quality table, 4 charts, alert history, config form,
 * and model card — all in the existing dark-slate Tailwind design system.
 *
 * The ESP32 base URL is user-configurable via the header input so the user
 * can update it whenever the Cloudflare tunnel restarts.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback
} from "react";
import {
  Wifi,
  WifiOff,
  AlertTriangle,
  Activity,
  Thermometer,
  Heart,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Save,
  Bell,
  BellOff,
  ChevronRight,
  Cpu,
  Settings,
  BarChart2,
  Info,
  Layers
} from "lucide-react";

// ─── Type Definitions ────────────────────────────────────────────────────────

interface Sensor {
  hardware_ok: boolean;
  valid_pct: number;
  last_valid_s_ago: number;
}

interface Device {
  device_id: string;
  source: string;
  last_seen_s_ago: number;
  connected: boolean;
  samples_5min: number;
  sensors: Record<string, Sensor>;
}

interface Esp32Config {
  alert_enabled: boolean;
  alert_threshold: number;
  consecutive_required: number;
  cooldown_seconds: number;
  temp_offset_c: number;
  offline_seconds?: number;
}

interface Esp32Status {
  server_time: string;
  bin_seconds: number;
  demo_time_compression: number;
  model_loaded: boolean;
  horizon_hours: number;
  config: Esp32Config;
  devices: Device[];
}

interface Esp32Prediction {
  status: string;
  risk: number | null;
  level: string;
  ts: string;
  bins_used: number;
  bin_seconds: number;
  inputs: { HR: number; O2Sat: number; Temp_model_input: number } | null;
  reason?: string;
}

interface Esp32Telemetry {
  hr: number | null;
  ecg_bpm: number | null;
  spo2: number | null;
  obj: number | null;
  amb: number | null;
  led: string;
  finger: boolean;
  lead_off: boolean;
}

interface Esp32Latest {
  telemetry: Esp32Telemetry;
  prediction: Esp32Prediction;
}

interface HistoryPoint {
  ts: string;
  hr: number | null;
  ecg_bpm: number | null;
  spo2: number | null;
  obj: number | null;
}

interface Esp32Alert {
  id: number;
  ts: string;
  type: string;
  level: string;
  message: string;
  acknowledged: boolean;
}

interface ModelMetric {
  set: string;
  patients: number;
  prevalence: number;
  auroc: number;
  auroc_95ci: string;
  auprc: number;
  row_sensitivity: number;
  row_specificity: number;
  brier: number;
}

interface ModelMeta {
  dataset: string;
  dataset_url: string;
  label_definition: string;
  input_signals: string[];
  split: string;
  trained_at: string;
  sample_patients_limit?: number;
}

interface Esp32Model {
  loaded: boolean;
  error?: string;
  metrics?: {
    meta: ModelMeta;
    results: ModelMetric[];
  };
}

// ─── Chart Helpers ───────────────────────────────────────────────────────────

function drawChart(
  canvas: HTMLCanvasElement,
  data: number[],
  color: string,
  data2?: number[],
  color2?: string,
  threshold?: number,
  threshColor = "#ef4444",
  label = "",
  label2 = "",
  yMin?: number,
  yMax?: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const allVals = [...data, ...(data2 || [])].filter((v) => v != null && !isNaN(v));
  const minVal = yMin !== undefined ? yMin : allVals.length ? Math.min(...allVals) * 0.96 : 0;
  const maxVal = yMax !== undefined ? yMax : allVals.length ? Math.max(...allVals) * 1.04 : 1;
  const range = maxVal - minVal || 1;

  const toY = (v: number) => H - 2 - ((v - minVal) / range) * (H - 4);
  const toX = (i: number, total: number) => (i / (total - 1 || 1)) * W;

  const drawLine = (pts: number[], clr: string) => {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.strokeStyle = clr;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    pts.forEach((v, i) => {
      const x = toX(i, pts.length);
      const y = toY(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  // Fill under primary line
  if (data.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    data.forEach((v, i) => ctx.lineTo(toX(i, data.length), toY(v)));
    ctx.lineTo(W, H);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color.replace(")", ", 0.2)").replace("rgb(", "rgba(").replace("#", "rgba(") + "33");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fill();
  }

  drawLine(data, color);
  if (data2 && data2.length) drawLine(data2, color2 || "#f59e0b");

  // Threshold dashed line
  if (threshold !== undefined) {
    const ty = toY(threshold);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = threshColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(W, ty);
    ctx.stroke();
    ctx.restore();
  }

  // Labels
  if (label) {
    ctx.fillStyle = color;
    ctx.font = "10px monospace";
    ctx.fillText(label, 4, 12);
  }
  if (label2 && color2) {
    ctx.fillStyle = color2;
    ctx.font = "10px monospace";
    ctx.fillText(label2, 4, 24);
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null || isNaN(v as number)) return "—";
  return Number(v).toFixed(decimals);
}

function timeSince(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function levelBadgeClass(level: string): string {
  switch (level?.toUpperCase()) {
    case "HIGH":
      return "bg-red-500/20 text-red-400 border border-red-500/40";
    case "ELEVATED":
      return "bg-amber-500/20 text-amber-400 border border-amber-500/40";
    default:
      return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40";
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_ESP32_URL = "https://air-fit-hair-adjustment.trycloudflare.com";

export const HardwareLivePage: React.FC = () => {
  const [esp32Url, setEsp32Url] = useState(
    () => localStorage.getItem("esp32_url") || DEFAULT_ESP32_URL
  );
  const [urlInput, setUrlInput] = useState(esp32Url);

  const [status, setStatus] = useState<Esp32Status | null>(null);
  const [latest, setLatest] = useState<Esp32Latest | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [predictions, setPredictions] = useState<Esp32Prediction[]>([]);
  const [alerts, setAlerts] = useState<Esp32Alert[]>([]);
  const [cfg, setCfg] = useState<Esp32Config | null>(null);
  const [model, setModel] = useState<Esp32Model | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(new Date().toLocaleTimeString());
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgSaved, setCfgSaved] = useState(false);
  const [ackingId, setAckingId] = useState<number | null>(null);

  // Config form state
  const [cfgForm, setCfgForm] = useState<Esp32Config>({
    alert_enabled: true,
    alert_threshold: 0.5,
    consecutive_required: 2,
    cooldown_seconds: 300,
    temp_offset_c: 0
  });

  // Canvas refs for 4 charts
  const hrCanvasRef = useRef<HTMLCanvasElement>(null);
  const spo2CanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const riskCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Fetch all endpoints ──
  const refresh = useCallback(async () => {
    const base = esp32Url.replace(/\/$/, "");
    try {
      const [s, l, h, p, a, m] = await Promise.all([
        fetch(`${base}/api/status`).then((r) => r.json()).catch(() => null),
        fetch(`${base}/api/latest`).then((r) => r.json()).catch(() => null),
        fetch(`${base}/api/history?minutes=60`).then((r) => r.json()).catch(() => null),
        fetch(`${base}/api/predictions?limit=300`).then((r) => r.json()).catch(() => null),
        fetch(`${base}/api/alerts?limit=30`).then((r) => r.json()).catch(() => null),
        fetch(`${base}/api/model`).then((r) => r.json()).catch(() => null)
      ]);
      setStatus(s);
      setLatest(l);
      setHistory(h?.points || []);
      setPredictions(Array.isArray(p) ? p : []);
      setAlerts(Array.isArray(a) ? a : []);
      setModel(m);
      if (s?.config && !cfgSaving) {
        setCfg(s.config);
        setCfgForm(s.config);
      }
      setError(null);
      setLoading(false);
    } catch (e: any) {
      setError(`Cannot reach ESP32 backend: ${e.message}`);
      setLoading(false);
    }
  }, [esp32Url, cfgSaving]);

  // ── Auto-refresh every 3s ──
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  // ── Clock ──
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Draw Charts ──
  const drawCharts = useCallback(() => {
    const hrVals = history.map((p) => p.hr).filter((v) => v != null) as number[];
    const ecgVals = history.map((p) => p.ecg_bpm).filter((v) => v != null) as number[];
    const spo2Vals = history.map((p) => p.spo2).filter((v) => v != null) as number[];
    const tempVals = history.map((p) => p.obj).filter((v) => v != null) as number[];
    const riskVals = predictions.map((p) => (p.risk ?? 0) * 100).filter((v) => v != null);
    const threshold = (cfg?.alert_threshold ?? 0.5) * 100;

    if (hrCanvasRef.current)
      drawChart(hrCanvasRef.current, hrVals, "#22d3ee", ecgVals, "#f59e0b", undefined, "#ef4444", "HR (SpO₂)", "HR (ECG)");
    if (spo2CanvasRef.current)
      drawChart(spo2CanvasRef.current, spo2Vals, "#a78bfa", undefined, undefined, undefined, undefined, "SpO₂ %", undefined, 85, 100);
    if (tempCanvasRef.current)
      drawChart(tempCanvasRef.current, tempVals, "#f97316", undefined, undefined, undefined, undefined, "Temp °C");
    if (riskCanvasRef.current)
      drawChart(riskCanvasRef.current, riskVals, "#ef4444", undefined, undefined, threshold, "#f59e0b", "Risk %", undefined, 0, 100);
  }, [history, predictions, cfg]);

  useEffect(() => {
    drawCharts();
  }, [drawCharts]);

  // Resize → redraw
  useEffect(() => {
    const onResize = () => drawCharts();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawCharts]);

  // ── Config save ──
  const handleSaveCfg = async () => {
    setCfgSaving(true);
    try {
      const base = esp32Url.replace(/\/$/, "");
      await fetch(`${base}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfgForm)
      });
      setCfgSaved(true);
      setTimeout(() => setCfgSaved(false), 2000);
    } catch (e) {
      alert("Failed to save config");
    }
    setCfgSaving(false);
  };

  // ── Alert ACK ──
  const handleAck = async (id: number) => {
    setAckingId(id);
    try {
      const base = esp32Url.replace(/\/$/, "");
      await fetch(`${base}/api/alerts/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
      );
    } catch (e) {
      alert("Failed to acknowledge alert");
    }
    setAckingId(null);
  };

  // ── URL update ──
  const applyUrl = () => {
    const trimmed = urlInput.trim().replace(/\/$/, "");
    setEsp32Url(trimmed);
    localStorage.setItem("esp32_url", trimmed);
  };

  // ── Derived values ──
  const device = status?.devices?.[0] ?? null;
  const tele = latest?.telemetry ?? null;
  const pred = latest?.prediction ?? null;
  const risk = pred?.risk != null ? pred.risk * 100 : null;
  const riskLevel = pred?.level ?? "UNKNOWN";
  const threshold = (cfg?.alert_threshold ?? 0.5) * 100;
  const isDemo = (status?.demo_time_compression ?? 1) > 1;
  const isSimulated = device?.source === "simulated";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Header Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-slate-100">ESP32 Hardware Live</p>
            <p className="text-[11px] text-slate-400">Real-time vitals from physical sensor node</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Device connectivity pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              device?.connected
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                : "bg-rose-950/40 border-rose-500/30 text-rose-400"
            }`}
          >
            {device?.connected ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            <span>
              {device ? `${device.device_id}` : "No device"}
              {device?.connected ? " ● Connected" : " ● Offline"}
            </span>
          </div>

          {/* Clock */}
          <div className="flex items-center gap-1 text-slate-400 text-xs font-mono">
            <Clock className="w-3.5 h-3.5" />
            {clock}
          </div>

          {/* Refresh manually */}
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
            title="Refresh now"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ESP32 URL input */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-slate-500 whitespace-nowrap">ESP32 URL:</label>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyUrl()}
            placeholder="https://..."
            className="flex-1 min-w-0 sm:w-72 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
          />
          <button
            onClick={applyUrl}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="flex items-start gap-3 bg-rose-950/30 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-300 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !error && (
        <div className="flex items-center justify-center h-32 text-slate-400 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Connecting to ESP32…
        </div>
      )}

      {!loading && (
        <>
          {/* ── Banners ── */}
          <div className="space-y-2">
            {/* Not validated */}
            <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-300 text-xs">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                <strong>Research use only.</strong> This hardware integration has not been validated for clinical decision-making. Outputs are <em>estimated risk of sepsis-related deterioration</em>, not a diagnosis.
              </span>
            </div>

            {!status?.model_loaded && (
              <div className="flex items-center gap-2 bg-rose-950/30 border border-rose-500/30 rounded-lg px-3 py-2 text-rose-300 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Model not loaded on ESP32 server. Risk predictions unavailable.</span>
              </div>
            )}

            {isDemo && (
              <div className="flex items-center gap-2 bg-blue-950/30 border border-blue-500/30 rounded-lg px-3 py-2 text-blue-300 text-xs">
                <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Demo mode active — time compressed {status?.demo_time_compression}×</span>
              </div>
            )}

            {isSimulated && (
              <div className="flex items-center gap-2 bg-purple-950/30 border border-purple-500/30 rounded-lg px-3 py-2 text-purple-300 text-xs">
                <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Simulated sensor data — not from physical hardware</span>
              </div>
            )}

            {cfgForm.temp_offset_c !== 0 && (
              <div className="flex items-center gap-2 bg-orange-950/30 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-300 text-xs">
                <Thermometer className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Temperature offset active: {cfgForm.temp_offset_c > 0 ? "+" : ""}{cfgForm.temp_offset_c} °C applied to MLX90614 readings</span>
              </div>
            )}
          </div>

          {/* ── Vital Tiles ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* HR (SpO₂ pulse ox) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
                <Heart className="w-3 h-3 text-cyan-400" />
                HR (Pulse Ox)
              </div>
              <div className="text-3xl font-extrabold text-cyan-300 font-mono">
                {fmt(tele?.hr, 0)}
              </div>
              <div className="text-[10px] text-slate-500">bpm</div>
            </div>

            {/* HR (ECG) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
                <Activity className="w-3 h-3 text-amber-400" />
                HR (ECG)
              </div>
              <div className="text-3xl font-extrabold text-amber-300 font-mono">
                {fmt(tele?.ecg_bpm, 0)}
              </div>
              <div className="text-[10px] text-slate-500">bpm</div>
            </div>

            {/* SpO₂ */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
                <BarChart2 className="w-3 h-3 text-violet-400" />
                SpO₂
              </div>
              <div className="text-3xl font-extrabold text-violet-300 font-mono">
                {fmt(tele?.spo2, 1)}
              </div>
              <div className="text-[10px] text-slate-500">%</div>
            </div>

            {/* Surface Temp */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
                <Thermometer className="w-3 h-3 text-orange-400" />
                Surface Temp
              </div>
              <div className="text-3xl font-extrabold text-orange-300 font-mono">
                {fmt(tele?.obj, 1)}
              </div>
              <div className="text-[10px] text-slate-500">°C</div>
            </div>

            {/* LED / Finger */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
                <Zap className="w-3 h-3 text-pink-400" />
                Sensor
              </div>
              <div className="text-sm font-bold text-slate-200 mt-1">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    tele?.finger
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-700/50 text-slate-400 border border-slate-600"
                  }`}
                >
                  {tele?.finger ? "Finger ✓" : "No Finger"}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                LED: <span className="text-slate-300 font-mono">{tele?.led ?? "—"}</span>
                {tele?.lead_off && <span className="ml-2 text-rose-400 font-semibold">⚡ Lead off</span>}
              </div>
            </div>
          </div>

          {/* ── Risk Section ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-400" />
                Sepsis Risk Estimate
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${levelBadgeClass(riskLevel)}`}>
                {riskLevel}
              </span>
            </div>

            {/* Big risk number */}
            <div className="flex items-end gap-4">
              <div
                className={`text-6xl font-extrabold font-mono ${
                  riskLevel === "HIGH"
                    ? "text-red-400"
                    : riskLevel === "ELEVATED"
                    ? "text-amber-400"
                    : "text-emerald-400"
                }`}
              >
                {risk != null ? risk.toFixed(1) : "—"}
                <span className="text-2xl text-slate-400 ml-1">%</span>
              </div>

              {pred?.inputs && (
                <div className="text-xs text-slate-400 space-y-0.5">
                  <div>HR: <span className="text-slate-200 font-mono">{fmt(pred.inputs.HR, 0)}</span></div>
                  <div>SpO₂: <span className="text-slate-200 font-mono">{fmt(pred.inputs.O2Sat, 1)}</span></div>
                  <div>Temp: <span className="text-slate-200 font-mono">{fmt(pred.inputs.Temp_model_input, 1)} °C</span></div>
                </div>
              )}
            </div>

            {/* Progress bar with threshold marker */}
            {risk != null && (
              <div className="relative h-3 bg-slate-800 rounded-full overflow-visible">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    risk >= threshold
                      ? "bg-red-500"
                      : risk >= threshold * 0.7
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(risk, 100)}%` }}
                />
                {/* Threshold marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                  style={{ left: `${threshold}%` }}
                  title={`Alert threshold: ${threshold.toFixed(0)}%`}
                />
                <div
                  className="absolute -top-5 text-[9px] text-amber-400 font-semibold"
                  style={{ left: `${threshold}%`, transform: "translateX(-50%)" }}
                >
                  {threshold.toFixed(0)}%
                </div>
              </div>
            )}

            {pred?.reason && (
              <p className="text-xs text-slate-400 italic">{pred.reason}</p>
            )}

            {pred?.status && (
              <p className="text-[10px] text-slate-500">
                Status: <span className="font-mono text-slate-300">{pred.status}</span>
                {pred.bins_used != null && (
                  <> · Bins used: <span className="font-mono">{pred.bins_used}</span> × {pred.bin_seconds}s</>
                )}
              </p>
            )}
          </div>

          {/* ── Data Quality Table ── */}
          {device && Object.keys(device.sensors).length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-400" />
                Sensor Data Quality
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th className="text-left py-1.5 pr-3">Sensor</th>
                      <th className="text-center py-1.5 px-2">Hardware</th>
                      <th className="text-center py-1.5 px-2">Valid %</th>
                      <th className="text-center py-1.5 px-2">Last Valid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {Object.entries(device.sensors).map(([name, s]) => (
                      <tr key={name} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-1.5 pr-3 font-mono text-slate-300">{name}</td>
                        <td className="py-1.5 px-2 text-center">
                          {s.hardware_ok ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-400 mx-auto" />
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span
                            className={`font-mono font-semibold ${
                              s.valid_pct >= 80
                                ? "text-emerald-400"
                                : s.valid_pct >= 50
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            {(s.valid_pct * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-400 font-mono">
                          {timeSince(s.last_valid_s_ago)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                Device: <span className="font-mono text-slate-400">{device.device_id}</span> ·
                Source: <span className="font-mono text-slate-400">{device.source}</span> ·
                Samples (5 min): <span className="font-mono text-slate-400">{device.samples_5min}</span> ·
                Last seen: <span className="font-mono text-slate-400">{timeSince(device.last_seen_s_ago)}</span>
              </div>
            </div>
          )}

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { ref: hrCanvasRef, title: "Heart Rate", subtitle: "Pulse ox (cyan) & ECG (amber)" },
              { ref: spo2CanvasRef, title: "SpO₂", subtitle: "Blood oxygen saturation (%)" },
              { ref: tempCanvasRef, title: "Surface Temperature", subtitle: "MLX90614 (°C)" },
              { ref: riskCanvasRef, title: "Sepsis Risk History", subtitle: "Estimated risk % over time" }
            ].map(({ ref, title, subtitle }) => (
              <div key={title} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <div className="mb-2">
                  <p className="text-xs font-semibold text-slate-300">{title}</p>
                  <p className="text-[10px] text-slate-500">{subtitle}</p>
                </div>
                <canvas
                  ref={ref}
                  width={480}
                  height={120}
                  className="w-full h-28 rounded-lg bg-slate-950/60"
                />
              </div>
            ))}
          </div>

          {/* ── Alert Settings Form ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-400" />
              Alert Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Alert enabled */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfgForm.alert_enabled}
                  onChange={(e) => setCfgForm((f) => ({ ...f, alert_enabled: e.target.checked }))}
                  className="w-4 h-4 rounded accent-cyan-500"
                />
                <span className="text-sm text-slate-300">Alerts enabled</span>
              </label>

              {/* Threshold */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Risk threshold (0–1)</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={cfgForm.alert_threshold}
                  onChange={(e) => setCfgForm((f) => ({ ...f, alert_threshold: parseFloat(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              {/* Consecutive required */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Consecutive bins required</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={cfgForm.consecutive_required}
                  onChange={(e) => setCfgForm((f) => ({ ...f, consecutive_required: parseInt(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              {/* Cooldown */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Cooldown (seconds)</label>
                <input
                  type="number"
                  min={0}
                  step={30}
                  value={cfgForm.cooldown_seconds}
                  onChange={(e) => setCfgForm((f) => ({ ...f, cooldown_seconds: parseInt(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              {/* Temp offset */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Temperature offset (°C)</label>
                <input
                  type="number"
                  step={0.1}
                  value={cfgForm.temp_offset_c}
                  onChange={(e) => setCfgForm((f) => ({ ...f, temp_offset_c: parseFloat(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleSaveCfg}
              disabled={cfgSaving}
              className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                cfgSaved
                  ? "bg-emerald-600 text-white"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Save className="w-4 h-4" />
              {cfgSaving ? "Saving…" : cfgSaved ? "Saved ✓" : "Save Config"}
            </button>
          </div>

          {/* ── Alert History ── */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Alert History
              {alerts.filter((a) => !a.acknowledged).length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                  {alerts.filter((a) => !a.acknowledged).length} unacked
                </span>
              )}
            </h3>
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No alerts recorded</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th className="text-left py-1.5 pr-3">Time</th>
                      <th className="text-left py-1.5 px-2">Type</th>
                      <th className="text-center py-1.5 px-2">Level</th>
                      <th className="text-left py-1.5 px-2">Message</th>
                      <th className="text-center py-1.5 pl-2">Ack</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {alerts.map((a) => (
                      <tr key={a.id} className={`hover:bg-slate-800/30 transition-colors ${!a.acknowledged ? "bg-rose-950/10" : ""}`}>
                        <td className="py-1.5 pr-3 font-mono text-slate-400 whitespace-nowrap">
                          {new Date(a.ts).toLocaleTimeString()}
                        </td>
                        <td className="py-1.5 px-2 text-slate-300 font-mono">{a.type}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${levelBadgeClass(a.level)}`}>
                            {a.level}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 max-w-xs truncate">{a.message}</td>
                        <td className="py-1.5 pl-2 text-center">
                          {a.acknowledged ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                          ) : (
                            <button
                              onClick={() => handleAck(a.id)}
                              disabled={ackingId === a.id}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {ackingId === a.id ? "…" : "Ack"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Model Card ── */}
          {model && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                ESP32 Model Card
              </h3>
              {!model.loaded && (
                <p className="text-sm text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {model.error ?? "Model not loaded on ESP32 server"}
                </p>
              )}
              {model.loaded && model.metrics && (
                <div className="space-y-4">
                  {/* Meta */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-500">Dataset:</span> <a href={model.metrics.meta.dataset_url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{model.metrics.meta.dataset}</a></div>
                    <div><span className="text-slate-500">Trained:</span> <span className="text-slate-300 font-mono">{model.metrics.meta.trained_at}</span></div>
                    <div><span className="text-slate-500">Label:</span> <span className="text-slate-300">{model.metrics.meta.label_definition}</span></div>
                    <div><span className="text-slate-500">Split:</span> <span className="text-slate-300 font-mono">{model.metrics.meta.split}</span></div>
                    {model.metrics.meta.input_signals?.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-slate-500">Signals:</span>{" "}
                        <span className="text-slate-300">{model.metrics.meta.input_signals.join(", ")}</span>
                      </div>
                    )}
                  </div>

                  {/* Metrics table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-800">
                          <th className="text-left py-1.5 pr-2">Set</th>
                          <th className="text-center py-1.5 px-2">Patients</th>
                          <th className="text-center py-1.5 px-2">Prevalence</th>
                          <th className="text-center py-1.5 px-2">AUROC</th>
                          <th className="text-center py-1.5 px-2">AUPRC</th>
                          <th className="text-center py-1.5 px-2">Sensitivity</th>
                          <th className="text-center py-1.5 px-2">Specificity</th>
                          <th className="text-center py-1.5 pl-2">Brier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {model.metrics.results.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-1.5 pr-2 font-semibold text-slate-300 capitalize">{r.set}</td>
                            <td className="py-1.5 px-2 text-center text-slate-400 font-mono">{r.patients}</td>
                            <td className="py-1.5 px-2 text-center text-slate-400 font-mono">{(r.prevalence * 100).toFixed(1)}%</td>
                            <td className="py-1.5 px-2 text-center font-mono">
                              <span className={r.auroc >= 0.8 ? "text-emerald-400" : r.auroc >= 0.7 ? "text-amber-400" : "text-rose-400"}>
                                {r.auroc.toFixed(3)}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-center text-slate-400 font-mono">{r.auprc?.toFixed(3) ?? "—"}</td>
                            <td className="py-1.5 px-2 text-center text-slate-400 font-mono">{(r.row_sensitivity * 100).toFixed(0)}%</td>
                            <td className="py-1.5 px-2 text-center text-slate-400 font-mono">{(r.row_specificity * 100).toFixed(0)}%</td>
                            <td className="py-1.5 pl-2 text-center text-slate-400 font-mono">{r.brier?.toFixed(3) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-600">
                    AUROC 95% CI: {model.metrics.results[0]?.auroc_95ci ?? "—"}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HardwareLivePage;
