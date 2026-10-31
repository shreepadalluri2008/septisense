/**
 * HardwareLivePage.tsx
 *
 * 100% Portable ESP32 Hardware Live Dashboard integrated into SeptiSense.
 * Connects directly to any physical ESP32 sensor node plugged into ANY laptop
 * via USB (Web Serial API with flexible/adaptive baud rate) or via backend PySerial,
 * parses all ESP32 serial output formats (JSON, key-value printf lines, CSV),
 * and displays live human vitals, sepsis risk estimate, sensor quality table,
 * 4 real-time charts, alert history, configuration, and model card.
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
  Cpu,
  Settings,
  BarChart2,
  Info,
  Usb,
  Terminal
} from "lucide-react";
import {
  ParsedEsp32Reading,
  parseEsp32SerialLine,
  computePortableSepsisRisk,
  getActiveSensorUsage
} from "../utils/esp32Parser";
import { TelemetryUpdateMessage, SerialStatus } from "../types";

// ─── Type Definitions ────────────────────────────────────────────────────────

interface Sensor {
  hardware_ok: boolean;
  valid_pct: number;
  last_valid_s_ago: number | null;
}

interface Esp32Config {
  alert_enabled: boolean;
  alert_threshold: number;
  consecutive_required: number;
  cooldown_seconds: number;
  temp_offset_c: number;
}

interface HistoryPoint {
  ts: number; // epoch seconds
  hr: number | null;
  ecg_bpm: number | null;
  spo2: number | null;
  obj: number | null;
}

interface RiskPoint {
  ts: number;
  risk: number;
  level: "LOW" | "NORMAL" | "ELEVATED" | "HIGH";
}

interface Esp32Alert {
  id: number;
  ts: number;
  type: string;
  level: string;
  message: string;
  acknowledged: boolean;
}

export interface HardwareLivePageProps {
  latestTelemetry?: TelemetryUpdateMessage | null;
  serialStatus?: SerialStatus | null;
  onHardwareReading?: (reading: ParsedEsp32Reading) => void;
}

// ─── Chart Helper ────────────────────────────────────────────────────────────

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
  if (allVals.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px monospace";
    ctx.fillText("Waiting for live ESP32 sensor readings...", 14, H / 2);
    return;
  }

  const minVal = yMin !== undefined ? yMin : Math.min(...allVals) * 0.96;
  const maxVal = yMax !== undefined ? yMax : Math.max(...allVals) * 1.04;
  const range = Math.max(maxVal - minVal, 1);

  const toY = (v: number) => H - 6 - ((v - minVal) / range) * (H - 16);
  const toX = (i: number, total: number) =>
    total <= 1 ? W / 2 : (i / (total - 1)) * W;

  const drawLine = (pts: number[], clr: string) => {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.strokeStyle = clr;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    pts.forEach((v, i) => {
      const x = toX(i, pts.length);
      const y = toY(v);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (pts.length === 1) {
      ctx.fillStyle = clr;
      ctx.beginPath();
      ctx.arc(W / 2, toY(pts[0]), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawLine(data, color);
  if (data2 && data2.length) drawLine(data2, color2 || "#f59e0b");

  if (threshold !== undefined) {
    const ty = toY(threshold);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = threshColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(W, ty);
    ctx.stroke();
    ctx.restore();
  }

  if (label) {
    ctx.fillStyle = color;
    ctx.font = "11px monospace";
    ctx.fillText(label, 6, 13);
  }
  if (label2 && color2) {
    ctx.fillStyle = color2;
    ctx.font = "11px monospace";
    ctx.fillText(label2, 110, 13);
  }
}

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null || isNaN(v as number)) return "—";
  return Number(v).toFixed(decimals);
}

function timeSince(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "never";
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
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

// ─── Static Model Card Metadata (from ESP32 PhysioNet Sepsis Model) ──────────

const ESP32_MODEL_CARD = {
  meta: {
    dataset: "PhysioNet / Computing in Cardiology Challenge 2019",
    dataset_url: "https://physionet.org/content/challenge-2019/1.0.0/",
    label_definition: "Sepsis-3 onset within 6 hours (SepsisLabel = 1)",
    input_signals: ["HR (BPM)", "O2Sat (%)", "Temp (°C)"],
    split: "Patient-stratified train / validation / test split",
    trained_at: "2026-10-29 UTC"
  },
  results: [
    {
      set: "validation",
      patients: 400,
      prevalence: 0.018,
      auroc: 0.812,
      auroc_95ci: "0.785 – 0.839",
      auprc: 0.142,
      row_sensitivity: 0.76,
      row_specificity: 0.74,
      brier: 0.017
    },
    {
      set: "test (held-out)",
      patients: 400,
      prevalence: 0.019,
      auroc: 0.804,
      auroc_95ci: "0.776 – 0.831",
      auprc: 0.138,
      row_sensitivity: 0.75,
      row_specificity: 0.73,
      brier: 0.018
    }
  ]
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const HardwareLivePage: React.FC<HardwareLivePageProps> = ({
  latestTelemetry,
  serialStatus,
  onHardwareReading
}) => {
  const isWebSerialSupported =
    typeof navigator !== "undefined" && "serial" in navigator;

  // USB Web Serial state
  const [usbConnected, setUsbConnected] = useState(false);
  const [usbConnecting, setUsbConnecting] = useState(false);
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [usbError, setUsbError] = useState<string | null>(null);
  const [packetsReceived, setPacketsReceived] = useState<number>(0);
  const [lastPacketMs, setLastPacketMs] = useState<number | null>(null);
  const [rawSerialLines, setRawSerialLines] = useState<string[]>([]);
  const [showRawMonitor, setShowRawMonitor] = useState<boolean>(false);

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const keepReadingRef = useRef<boolean>(false);

  // Live merged ESP32 sensor state
  const [liveReading, setLiveReading] = useState<ParsedEsp32Reading>({
    hr: null,
    ecg_bpm: null,
    spo2: null,
    obj: null,
    amb: null,
    led: null,
    finger: null,
    lead_off: null
  });

  // Track last valid timestamps & valid counts per sensor
  const sensorStatsRef = useRef<{
    total: number;
    hrValid: number;
    hrLastMs: number | null;
    ecgValid: number;
    ecgLastMs: number | null;
    spo2Valid: number;
    spo2LastMs: number | null;
    tempValid: number;
    tempLastMs: number | null;
  }>({
    total: 0,
    hrValid: 0,
    hrLastMs: null,
    ecgValid: 0,
    ecgLastMs: null,
    spo2Valid: 0,
    spo2LastMs: null,
    tempValid: 0,
    tempLastMs: null
  });

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [riskHistory, setRiskHistory] = useState<RiskPoint[]>([]);
  const [alerts, setAlerts] = useState<Esp32Alert[]>([]);
  const [clock, setClock] = useState(new Date().toLocaleTimeString());
  const [backendModel, setBackendModel] = useState<any>(null);
  const [backendPred, setBackendPred] = useState<any>(null);
  const [backendDevice, setBackendDevice] = useState<any>(null);

  // Config state (persisted locally so it works portably on any laptop)
  const [cfgForm, setCfgForm] = useState<Esp32Config>(() => {
    try {
      const saved = localStorage.getItem("septisense_esp32_cfg");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      alert_enabled: true,
      alert_threshold: 0.0108,
      consecutive_required: 2,
      cooldown_seconds: 300,
      temp_offset_c: 2.0
    };
  });
  const [cfgSaved, setCfgSaved] = useState(false);
  const consecutiveHighRef = useRef<number>(0);
  const lastAlertMsRef = useRef<number>(0);
  const lastHistoryPushMsRef = useRef<number>(0);

  // Canvas refs
  const hrCanvasRef = useRef<HTMLCanvasElement>(null);
  const spo2CanvasRef = useRef<HTMLCanvasElement>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement>(null);
  const riskCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleClearReadings = useCallback(() => {
    setHistory([]);
    setRiskHistory([]);
    setPacketsReceived(0);
    setLiveReading({
      hr: null,
      ecg_bpm: null,
      spo2: null,
      obj: null,
      amb: null,
      led: null,
      finger: null,
      lead_off: null
    });
    sensorStatsRef.current = {
      total: 0,
      hrValid: 0,
      hrLastMs: null,
      ecgValid: 0,
      ecgLastMs: null,
      spo2Valid: 0,
      spo2LastMs: null,
      tempValid: 0,
      tempLastMs: null
    };
  }, []);

  // ── Handle incoming parsed reading from either Web Serial or Backend ──
  const ingestParsedReading = useCallback(
    (partial: Partial<ParsedEsp32Reading>, fromWebSocket = false) => {
      const nowMs = Date.now();
      const nowSec = nowMs / 1000;
      setLastPacketMs(nowMs);

      if (partial.raw_line) {
        setRawSerialLines((prev) => [...prev.slice(-29), partial.raw_line!]);
      }

      setLiveReading((prev) => {
        const fingerExplicitlyOff = partial.finger === false && partial.hr == null && partial.spo2 == null;
        const leadsExplicitlyOff = partial.lead_off === true && partial.ecg_bpm == null && fingerExplicitlyOff;

        const nextHr = fingerExplicitlyOff
          ? null
          : partial.hr !== undefined && partial.hr !== null
          ? partial.hr
          : prev.hr;

        const nextSpo2 = fingerExplicitlyOff
          ? null
          : partial.spo2 !== undefined && partial.spo2 !== null
          ? partial.spo2
          : prev.spo2;

        const nextEcg = leadsExplicitlyOff
          ? null
          : partial.ecg_bpm !== undefined && partial.ecg_bpm !== null
          ? partial.ecg_bpm
          : nextHr ?? prev.ecg_bpm;

        const nextObj =
          partial.obj !== undefined && partial.obj !== null ? partial.obj : prev.obj;

        const nextAmb =
          partial.amb !== undefined && partial.amb !== null ? partial.amb : prev.amb;

        const next: ParsedEsp32Reading = {
          hr: nextHr,
          ecg_bpm: nextEcg,
          spo2: nextSpo2,
          obj: nextObj,
          amb: nextAmb,
          led:
            partial.led !== undefined && partial.led !== null
              ? partial.led
              : nextObj !== null
              ? nextObj >= 25.0
              : prev.led,
          finger:
            partial.finger !== undefined && partial.finger !== null
              ? partial.finger
              : nextHr != null || nextSpo2 != null
              ? true
              : prev.finger,
          lead_off:
            partial.lead_off !== undefined && partial.lead_off !== null
              ? partial.lead_off
              : prev.lead_off,
          ecg_samples: partial.ecg_samples || prev.ecg_samples
        };

        const usage = getActiveSensorUsage(next);

        // Rate-limit history & parent forwarding to 1 Hz (900ms) and ONLY record when a human is using at least one sensor
        const shouldRecordSample =
          usage.anyActive && nowMs - lastHistoryPushMsRef.current >= 900;

        if (shouldRecordSample) {
          lastHistoryPushMsRef.current = nowMs;
          setPacketsReceived((c) => c + 1);

          // Update sensor stats only for active human sensor readings
          const st = sensorStatsRef.current;
          st.total += 1;
          if (next.hr !== null) {
            st.hrValid += 1;
            st.hrLastMs = nowMs;
          }
          if (next.ecg_bpm !== null || (next.ecg_samples && next.ecg_samples.length > 0)) {
            st.ecgValid += 1;
            st.ecgLastMs = nowMs;
          }
          if (next.spo2 !== null) {
            st.spo2Valid += 1;
            st.spo2LastMs = nowMs;
          }
          if (next.obj !== null && usage.tempActive) {
            st.tempValid += 1;
            st.tempLastMs = nowMs;
          }

          // Append to history (only active human readings)
          setHistory((h) => [
            ...h.slice(-119),
            {
              ts: nowSec,
              hr: next.hr,
              ecg_bpm: next.ecg_bpm ?? next.hr,
              spo2: next.spo2,
              obj: usage.tempActive ? next.obj : null
            }
          ]);

          // Compute risk
          const riskObj = computePortableSepsisRisk(
            next.hr,
            next.ecg_bpm,
            next.spo2,
            usage.tempActive ? next.obj : null,
            cfgForm.temp_offset_c,
            cfgForm.alert_threshold
          );
          if (riskObj.status === "ok" && riskObj.risk !== null) {
            setRiskHistory((rh) => [
              ...rh.slice(-119),
              { ts: nowSec, risk: riskObj.risk!, level: riskObj.level }
            ]);

            if (riskObj.risk >= cfgForm.alert_threshold) {
              consecutiveHighRef.current += 1;
              if (
                cfgForm.alert_enabled &&
                consecutiveHighRef.current >= cfgForm.consecutive_required &&
                nowMs - lastAlertMsRef.current >= cfgForm.cooldown_seconds * 1000
              ) {
                lastAlertMsRef.current = nowMs;
                setAlerts((al) => [
                  {
                    id: nowMs,
                    ts: nowSec,
                    type: "SEPSIS_RISK",
                    level: "HIGH",
                    message: `Estimated 6h risk ${(riskObj.risk! * 100).toFixed(1)}% exceeded threshold ${(cfgForm.alert_threshold * 100).toFixed(1)}% (HR=${next.hr ?? "—"}, SpO2=${next.spo2 ?? "—"}%, Temp=${next.obj ?? "—"}°C)`,
                    acknowledged: false
                  },
                  ...al.slice(0, 29)
                ]);
              }
            } else {
              consecutiveHighRef.current = 0;
            }
          }
        }

        // Forward to parent App.tsx ONLY when reading came from Web Serial (never re-forward WebSocket echo!)
        if (!fromWebSocket && onHardwareReading && (shouldRecordSample || !usage.anyActive)) {
          onHardwareReading(next);
        }

        return next;
      });
    },
    [cfgForm, onHardwareReading]
  );

  // ── Sync from backend WebSocket telemetry ONLY when Web Serial is NOT active and packet is not our own echo ──
  useEffect(() => {
    if (usbConnected) return;
    if (!latestTelemetry || latestTelemetry.is_replay) return;
    if (latestTelemetry.device_id === "esp32-usb-live") return;
    const v = latestTelemetry.vitals;
    if (v.hr_bpm !== null || v.spo2_pct !== null || v.temp_c !== null) {
      ingestParsedReading(
        {
          hr: v.hr_bpm,
          ecg_bpm: v.ecg_hr ?? v.hr_bpm,
          spo2: v.spo2_pct,
          obj: v.temp_c,
          led: v.temp_c !== null ? v.temp_c >= 25.0 : null,
          finger: !latestTelemetry.flags?.finger_off,
          lead_off: Boolean(latestTelemetry.flags?.leads_off),
          ecg_samples: latestTelemetry.ecg_preview
        },
        true
      );
    }
  }, [latestTelemetry, usbConnected, ingestParsedReading]);

  // ── Read loop from Web Serial port ──
  const openAndReadSerialPort = useCallback(
    async (port: any, baud: number) => {
      try {
        setUsbConnecting(true);
        setUsbError(null);
        if (port.readable) {
          try {
            await port.close();
          } catch {}
        }
        await port.open({ baudRate: baud });
        portRef.current = port;
        keepReadingRef.current = true;
        setUsbConnected(true);
        setUsbConnecting(false);

        const decoder = new TextDecoder();
        let buffer = "";

        while (port.readable && keepReadingRef.current) {
          const reader = port.readable.getReader();
          readerRef.current = reader;
          try {
            while (keepReadingRef.current) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  const parsed = parseEsp32SerialLine(trimmed);
                  if (parsed) {
                    ingestParsedReading(parsed);
                  } else {
                    setRawSerialLines((prev) => [...prev.slice(-29), trimmed]);
                  }
                }
              }
            }
          } catch (readErr: any) {
            if (keepReadingRef.current) {
              console.warn("Serial read error:", readErr);
            }
          } finally {
            try {
              reader.releaseLock();
            } catch {}
          }
        }
      } catch (err: any) {
        if (err?.name !== "NotFoundError") {
          setUsbError(
            err?.message ||
              "Could not open ESP32 USB port. Make sure Arduino Serial Monitor is closed."
          );
        }
        setUsbConnected(false);
      } finally {
        setUsbConnecting(false);
      }
    },
    [ingestParsedReading]
  );

  // ── Auto-connect to previously granted Web Serial USB port on page load ──
  useEffect(() => {
    if (!isWebSerialSupported) return;
    (navigator as any).serial
      .getPorts()
      .then((ports: any[]) => {
        if (ports && ports.length > 0 && !portRef.current) {
          openAndReadSerialPort(ports[0], baudRate);
        }
      })
      .catch(() => {});

    const handleConnectEvent = (e: any) => {
      if (e.target && !portRef.current) {
        openAndReadSerialPort(e.target, baudRate);
      }
    };
    const handleDisconnectEvent = () => {
      keepReadingRef.current = false;
      portRef.current = null;
      setUsbConnected(false);
    };

    (navigator as any).serial.addEventListener("connect", handleConnectEvent);
    (navigator as any).serial.addEventListener("disconnect", handleDisconnectEvent);
    return () => {
      (navigator as any).serial.removeEventListener("connect", handleConnectEvent);
      (navigator as any).serial.removeEventListener("disconnect", handleDisconnectEvent);
    };
  }, [isWebSerialSupported, baudRate, openAndReadSerialPort]);

  const handleConnectUsbClick = async () => {
    if (!isWebSerialSupported) {
      setUsbError(
        "Web Serial API requires Google Chrome, Microsoft Edge, or Brave on desktop."
      );
      return;
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await openAndReadSerialPort(port, baudRate);
    } catch (err: any) {
      if (err?.name !== "NotFoundError") {
        setUsbError(err?.message || "Failed to select ESP32 USB port.");
      }
    }
  };

  const handleDisconnectUsbClick = async () => {
    keepReadingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (portRef.current) {
        await portRef.current.close();
      }
    } catch {}
    portRef.current = null;
    setUsbConnected(false);
  };

  // Change baud rate on the fly if already connected
  const handleBaudChange = async (newBaud: number) => {
    setBaudRate(newBaud);
    if (usbConnected && portRef.current) {
      const port = portRef.current;
      await handleDisconnectUsbClick();
      setTimeout(() => {
        openAndReadSerialPort(port, newBaud);
      }, 200);
    }
  };

  // Clock timer
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  // Draw 4 charts whenever history or riskHistory updates
  const drawCharts = useCallback(() => {
    const hrVals = history.map((p) => p.hr).filter((v) => v != null) as number[];
    const ecgVals = history.map((p) => p.ecg_bpm).filter((v) => v != null) as number[];
    const spo2Vals = history.map((p) => p.spo2).filter((v) => v != null) as number[];
    const tempVals = history.map((p) => p.obj).filter((v) => v != null) as number[];
    const riskVals = riskHistory.map((p) => p.risk * 100);
    const thresholdPct = cfgForm.alert_threshold * 100;

    if (hrCanvasRef.current)
      drawChart(
        hrCanvasRef.current,
        hrVals,
        "#22d3ee",
        ecgVals,
        "#f59e0b",
        undefined,
        "#ef4444",
        "HR (SpO₂)",
        "HR (ECG)"
      );
    if (spo2CanvasRef.current)
      drawChart(
        spo2CanvasRef.current,
        spo2Vals,
        "#a78bfa",
        undefined,
        undefined,
        undefined,
        undefined,
        "SpO₂ %",
        undefined,
        85,
        100
      );
    if (tempCanvasRef.current)
      drawChart(
        tempCanvasRef.current,
        tempVals,
        "#f97316",
        undefined,
        undefined,
        undefined,
        undefined,
        "Temp °C"
      );
    if (riskCanvasRef.current)
      drawChart(
        riskCanvasRef.current,
        riskVals,
        "#ef4444",
        undefined,
        undefined,
        thresholdPct,
        "#f59e0b",
        "Risk %",
        undefined,
        0,
        Math.max(10, thresholdPct * 2, ...riskVals)
      );
  }, [history, riskHistory, cfgForm.alert_threshold]);

  useEffect(() => {
    drawCharts();
  }, [drawCharts]);

  useEffect(() => {
    const onResize = () => drawCharts();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawCharts]);

  // ── Poll integrated server.py backend endpoints (/api/status, /api/latest, /api/history, /api/model) ──
  useEffect(() => {
    let active = true;
    const pollBackend = async () => {
      try {
        const [stRes, latRes, histRes, predRes, alRes, modRes] = await Promise.all([
          fetch("/api/status").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/latest").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/history?minutes=60").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/esp32/predictions?limit=200").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/esp32/alerts?limit=30").then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch("/api/model").then((r) => (r.ok ? r.json() : null)).catch(() => null)
        ]);
        if (!active) return;
        if (modRes && modRes.metrics) {
          setBackendModel(modRes.metrics);
        }
        if (stRes?.devices?.[0]) {
          setBackendDevice(stRes.devices[0]);
        }
        // Only use backend telemetry/prediction if it arrived in the last 10 seconds and Web Serial is not already active
        const nowEpochSec = Date.now() / 1000;
        const latestTel = latRes?.telemetry;
        const isFreshBackendTel =
          latestTel &&
          latestTel.received &&
          nowEpochSec - Number(latestTel.received) <= 10;

        if (isFreshBackendTel && latRes?.prediction && latRes.prediction.status === "ok") {
          setBackendPred(latRes.prediction);
        } else if (!isFreshBackendTel) {
          setBackendPred(null);
        }

        if (isFreshBackendTel && !usbConnected) {
          const t = latestTel;
          ingestParsedReading(
            {
              hr: t.hr ?? null,
              ecg_bpm: t.ecg_bpm ?? null,
              spo2: t.spo2 ?? null,
              obj: t.obj ?? null,
              amb: t.amb ?? null,
              led: t.led !== undefined ? Boolean(t.led) : null,
              finger: t.finger !== undefined ? Boolean(t.finger) : null,
              lead_off: t.lead_off !== undefined ? Boolean(t.lead_off) : null
            },
            true
          );
        }
        if (Array.isArray(alRes) && alRes.length > 0) {
          setAlerts(
            alRes.map((a: any) => ({
              id: a.id,
              ts: a.ts,
              type: a.type,
              level: a.level,
              message: a.message,
              acknowledged: Boolean(a.acknowledged)
            }))
          );
        }
      } catch {}
    };
    pollBackend();
    const t = setInterval(pollBackend, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [usbConnected, ingestParsedReading]);

  const handleSaveCfg = () => {
    localStorage.setItem("septisense_esp32_cfg", JSON.stringify(cfgForm));
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alert_enabled: cfgForm.alert_enabled ? 1 : 0,
        alert_threshold: cfgForm.alert_threshold,
        consecutive_required: cfgForm.consecutive_required,
        cooldown_seconds: cfgForm.cooldown_seconds,
        temp_offset_c: cfgForm.temp_offset_c
      })
    }).catch(() => {});
    setCfgSaved(true);
    setTimeout(() => setCfgSaved(false), 2000);
  };

  const handleAck = (id: number) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
    fetch("/api/alerts/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    }).catch(() => {});
  };

  // Derived values
  const isDeviceConnected =
    usbConnected ||
    Boolean(serialStatus?.is_connected) ||
    Boolean(backendDevice?.connected) ||
    lastPacketMs !== null;
  const nowMs = Date.now();
  const st = sensorStatsRef.current;
  const totalCount = Math.max(1, st.total);
  const sensorUsage = getActiveSensorUsage(liveReading);

  const sensors: Record<string, Sensor> = {
    "temperature (MLX90614)": {
      hardware_ok: sensorUsage.tempActive || st.tempValid > 0 || isDeviceConnected,
      valid_pct: st.total > 0 ? st.tempValid / totalCount : 0,
      last_valid_s_ago: st.tempLastMs ? (nowMs - st.tempLastMs) / 1000 : null
    },
    "pulse_ox (MAX30102)": {
      hardware_ok: sensorUsage.spo2Active || st.hrValid > 0 || st.spo2Valid > 0 || isDeviceConnected,
      valid_pct: st.total > 0 ? Math.max(st.hrValid, st.spo2Valid) / totalCount : 0,
      last_valid_s_ago: st.hrLastMs
        ? (nowMs - st.hrLastMs) / 1000
        : st.spo2LastMs
        ? (nowMs - st.spo2LastMs) / 1000
        : null
    },
    "ecg (AD8232)": {
      hardware_ok: sensorUsage.heartActive || (!liveReading.lead_off && (st.ecgValid > 0 || isDeviceConnected)),
      valid_pct: st.total > 0 ? st.ecgValid / totalCount : 0,
      last_valid_s_ago: st.ecgLastMs ? (nowMs - st.ecgLastMs) / 1000 : null
    }
  };

  const localRiskCalc = computePortableSepsisRisk(
    liveReading.hr,
    liveReading.ecg_bpm,
    liveReading.spo2,
    sensorUsage.tempActive ? liveReading.obj : null,
    cfgForm.temp_offset_c,
    cfgForm.alert_threshold
  );
  const riskCalc =
    sensorUsage.anyActive && backendPred && backendPred.status === "ok" && backendPred.risk != null
      ? {
          status: "ok" as const,
          risk: Number(backendPred.risk),
          level: (backendPred.level || "LOW") as "LOW" | "ELEVATED" | "HIGH",
          inputs: backendPred.inputs || localRiskCalc.inputs,
          reason: `ML Model (HistGradientBoosting + Isotonic Calibration) · bins used: ${backendPred.bins_used ?? 1}`
        }
      : localRiskCalc;
  const riskPct = riskCalc.risk !== null ? riskCalc.risk * 100 : null;
  const thresholdPct = cfgForm.alert_threshold * 100;

  return (
    <div className="space-y-5">
      {/* ── Portable ESP32 USB Connection Header Bar (No URL Required) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-slate-100">
              ESP32 Hardware Live — Direct Portable USB Telemetry
            </p>
            <p className="text-[11px] text-slate-400">
              Shows ONLY the live readings of the person currently using the Temperature, Heart Monitor &amp; SpO₂ sensors
            </p>
          </div>
        </div>

        {/* Connectivity Pill + Baud Rate + Direct USB Connect Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isDeviceConnected
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                : "bg-rose-950/40 border-rose-500/30 text-rose-400"
            }`}
          >
            {isDeviceConnected ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>
              {isDeviceConnected
                ? `ESP32 Connected (${packetsReceived} human readings)`
                : "ESP32 USB Disconnected"}
            </span>
          </div>

          {/* Flexible Baud Rate Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">
            <span className="text-[11px] text-slate-400">Baud:</span>
            <select
              value={baudRate}
              onChange={(e) => handleBaudChange(Number(e.target.value))}
              className="bg-transparent text-xs font-mono font-semibold text-cyan-300 focus:outline-none cursor-pointer"
            >
              <option value={9600} className="bg-slate-900">9,600</option>
              <option value={57600} className="bg-slate-900">57,600</option>
              <option value={100000} className="bg-slate-900">1,00,000</option>
              <option value={115200} className="bg-slate-900">1,15,200 (ESP32 Default)</option>
              <option value={230400} className="bg-slate-900">2,30,400</option>
              <option value={460800} className="bg-slate-900">4,60,800</option>
              <option value={921600} className="bg-slate-900">9,21,600</option>
              <option value={1000000} className="bg-slate-900">10,00,000</option>
            </select>
          </div>

          {/* Connect / Disconnect USB Button */}
          {usbConnected ? (
            <button
              onClick={handleDisconnectUsbClick}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-bold transition-colors cursor-pointer"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>Disconnect USB</span>
            </button>
          ) : (
            <button
              onClick={handleConnectUsbClick}
              disabled={usbConnecting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold transition-all shadow-md shadow-cyan-500/20 cursor-pointer disabled:opacity-50"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>
                {usbConnecting ? "Connecting USB…" : "Connect ESP32 USB"}
              </span>
            </button>
          )}

          {/* Reset Session Readings Button */}
          <button
            onClick={handleClearReadings}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-amber-300 text-xs font-mono transition-colors cursor-pointer"
            title="Clear current person's readings for a fresh measurement session"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Session</span>
          </button>

          {/* Raw Serial Monitor Toggle */}
          <button
            onClick={() => setShowRawMonitor((s) => !s)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 text-xs font-mono transition-colors cursor-pointer"
            title="Toggle Live Raw USB Serial Monitor"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Serial Log</span>
          </button>

          {/* Clock */}
          <div className="flex items-center gap-1 text-slate-400 text-xs font-mono">
            <Clock className="w-3.5 h-3.5" />
            {clock}
          </div>
        </div>
      </div>

      {/* ── USB Error or Quick Connect Prompt ── */}
      {usbError && (
        <div className="flex items-start gap-3 bg-rose-950/30 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
          <span>{usbError}</span>
        </div>
      )}

      {!isDeviceConnected && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl px-4 py-3 text-cyan-200 text-xs">
          <div className="flex items-center gap-2.5">
            <Usb className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>
              <strong>Ready for Live Human Readings:</strong> Plug your ESP32 USB cable into this laptop, place your finger on the MAX30102 sensor / hold the MLX90614 temperature sensor, and click{" "}
              <strong>Connect ESP32 USB</strong> above (close Arduino Serial Monitor first so the port is free).
            </span>
          </div>
          <button
            onClick={handleConnectUsbClick}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
          >
            Select ESP32 USB Port
          </button>
        </div>
      )}

      {/* ── Collapsible Raw Serial Monitor ── */}
      {showRawMonitor && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs">
          <div className="flex items-center justify-between mb-2 text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold text-cyan-400">
              <Terminal className="w-3.5 h-3.5" /> Live ESP32 USB Serial Stream ({baudRate.toLocaleString()} baud)
            </span>
            <span>{rawSerialLines.length} recent lines</span>
          </div>
          <div className="h-32 overflow-y-auto bg-slate-900/90 rounded-lg p-2.5 space-y-1 text-[11px] text-emerald-300">
            {rawSerialLines.length === 0 ? (
              <p className="text-slate-500">
                No serial lines received yet. Click "Connect ESP32 USB" and ensure your ESP32 is transmitting over Serial.
              </p>
            ) : (
              rawSerialLines.map((ln, idx) => <div key={idx}>{ln}</div>)
            )}
          </div>
        </div>
      )}

      {/* ── Live 3-Sensor Human Contact Monitor (Temperature • Heart Monitor • SpO2) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Temperature Sensor (MLX90614) */}
        <div
          className={`rounded-xl p-3.5 border transition-all ${
            sensorUsage.tempActive
              ? "bg-orange-950/30 border-orange-500/50 shadow-md shadow-orange-500/10"
              : "bg-slate-900/70 border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-xs font-bold text-orange-300">
              <Thermometer className="w-4 h-4 text-orange-400" />
              1. Temperature Sensor (MLX90614)
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                sensorUsage.tempActive
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {sensorUsage.tempActive ? "In Use • Reading" : "Idle"}
            </span>
          </div>
          <div className="text-xs text-slate-300 font-mono">
            {liveReading.obj != null ? (
              <span>
                Surface: <strong className="text-orange-300">{fmt(liveReading.obj, 1)}°C</strong>
                {" • "}Core Est:{" "}
                <strong className="text-amber-300">
                  {fmt(liveReading.obj + cfgForm.temp_offset_c, 1)}°C
                </strong>
                {liveReading.amb != null ? ` • Amb: ${fmt(liveReading.amb, 1)}°C` : ""}
              </span>
            ) : (
              <span className="text-slate-500">Hold finger/wrist over MLX90614 IR sensor</span>
            )}
          </div>
        </div>

        {/* 2. Heart Monitor (AD8232 ECG + Optical Pulse) */}
        <div
          className={`rounded-xl p-3.5 border transition-all ${
            sensorUsage.heartActive
              ? "bg-cyan-950/30 border-cyan-500/50 shadow-md shadow-cyan-500/10"
              : "bg-slate-900/70 border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
              <Heart className="w-4 h-4 text-cyan-400" />
              2. Heart Monitor (ECG &amp; Pulse)
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                sensorUsage.heartActive
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {sensorUsage.heartActive ? "In Use • Reading" : "Idle"}
            </span>
          </div>
          <div className="text-xs text-slate-300 font-mono">
            {sensorUsage.heartActive ? (
              <span>
                Pulse HR: <strong className="text-cyan-300">{fmt(liveReading.hr, 0)} BPM</strong>
                {" • "}ECG HR:{" "}
                <strong className="text-amber-300">
                  {fmt(liveReading.ecg_bpm ?? liveReading.hr, 0)} BPM
                </strong>
              </span>
            ) : (
              <span className="text-slate-500">Place finger on MAX30102 or attach AD8232 leads</span>
            )}
          </div>
        </div>

        {/* 3. SpO2 Sensor (MAX30102) */}
        <div
          className={`rounded-xl p-3.5 border transition-all ${
            sensorUsage.spo2Active
              ? "bg-violet-950/30 border-violet-500/50 shadow-md shadow-violet-500/10"
              : "bg-slate-900/70 border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-xs font-bold text-violet-300">
              <BarChart2 className="w-4 h-4 text-violet-400" />
              3. SpO₂ Sensor (MAX30102)
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                sensorUsage.spo2Active
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {sensorUsage.spo2Active ? "In Use • Reading" : "Idle"}
            </span>
          </div>
          <div className="text-xs text-slate-300 font-mono">
            {sensorUsage.spo2Active && liveReading.spo2 != null ? (
              <span>
                Blood Oxygen: <strong className="text-violet-300">{fmt(liveReading.spo2, 0)}%</strong>
                {" • "}Finger Contact: <strong className="text-emerald-400">Detected ✓</strong>
              </span>
            ) : (
              <span className="text-slate-500">Place finger steadily on MAX30102 red LED</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Banners ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-300 text-xs">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            <strong>Research use only.</strong> Outputs are{" "}
            <em>estimated risk of sepsis-related deterioration</em>, not a clinical diagnosis.
          </span>
        </div>

        {cfgForm.temp_offset_c !== 0 && (
          <div className="flex items-center gap-2 bg-orange-950/30 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-300 text-xs">
            <Thermometer className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              The model was trained on core body temperature; the MLX90614 measures{" "}
              <strong>surface</strong> temperature (offset currently{" "}
              {cfgForm.temp_offset_c > 0 ? "+" : ""}
              {cfgForm.temp_offset_c.toFixed(1)} °C).
            </span>
          </div>
        )}
      </div>

      {/* ── 5 Vital Tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* HR (Pulse Ox) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
            <Heart className="w-3 h-3 text-cyan-400" />
            Heart Rate (Pulse Ox)
          </div>
          <div className="text-3xl font-extrabold text-cyan-300 font-mono">
            {fmt(liveReading.hr, 0)}
          </div>
          <div className="text-[10px] text-slate-500">
            {liveReading.hr != null
              ? "live human pulse (BPM)"
              : liveReading.finger
              ? "acquiring pulse..."
              : "place finger on sensor"}
          </div>
        </div>

        {/* HR (ECG) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
            <Activity className="w-3 h-3 text-amber-400" />
            Heart Rate (ECG)
          </div>
          <div className="text-3xl font-extrabold text-amber-300 font-mono">
            {fmt(liveReading.ecg_bpm ?? liveReading.hr, 0)}
          </div>
          <div className="text-[10px] text-slate-500">
            {liveReading.ecg_bpm != null || liveReading.hr != null
              ? liveReading.lead_off
                ? "optical pulse sync (BPM)"
                : "AD8232 ECG (BPM)"
              : "attach leads or finger"}
          </div>
        </div>

        {/* SpO₂ */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
            <BarChart2 className="w-3 h-3 text-violet-400" />
            SpO₂ (Estimate)
          </div>
          <div className="text-3xl font-extrabold text-violet-300 font-mono">
            {liveReading.spo2 != null ? `${fmt(liveReading.spo2, 0)}%` : "—"}
          </div>
          <div className="text-[10px] text-slate-500">
            {liveReading.spo2 != null ? "live optical SpO₂" : "place finger on sensor"}
          </div>
        </div>

        {/* Surface Temp (MLX90614) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
            <Thermometer className="w-3 h-3 text-orange-400" />
            Surface Temp (MLX90614)
          </div>
          <div className="text-3xl font-extrabold text-orange-300 font-mono">
            {liveReading.obj != null ? `${fmt(liveReading.obj, 1)}°C` : "—"}
          </div>
          <div className="text-[10px] text-slate-500">
            {liveReading.obj != null
              ? `Core est: ${fmt(liveReading.obj + cfgForm.temp_offset_c, 1)}°C (Amb ${fmt(liveReading.amb ?? 25.5, 1)}°C)`
              : "hold sensor to skin"}
          </div>
        </div>

        {/* Temperature LED & Finger */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-semibold">
            <Zap className="w-3 h-3 text-pink-400" />
            Temperature LED
          </div>
          <div className="text-2xl font-extrabold text-slate-100 font-mono">
            {liveReading.led === null ? "—" : liveReading.led ? "ON" : "OFF"}
          </div>
          <div className="text-[10px] text-slate-500 flex items-center gap-2">
            <span>ON ≥ 25°C, OFF ≤ 24°C</span>
            {liveReading.finger && (
              <span className="text-emerald-400 font-semibold">• Finger ✓</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Sepsis Risk Estimate & Data Quality Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sepsis Risk Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-400" />
              Estimated Risk of Sepsis-Related Deterioration (6h)
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${levelBadgeClass(
                riskCalc.level
              )}`}
            >
              {riskPct !== null ? riskCalc.level : "WAITING"}
            </span>
          </div>

          <div className="flex items-end gap-4">
            <div
              className={`text-5xl font-extrabold font-mono ${
                riskCalc.level === "HIGH"
                  ? "text-red-400"
                  : riskCalc.level === "ELEVATED"
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {riskPct != null ? riskPct.toFixed(1) : "—"}
              <span className="text-2xl text-slate-400 ml-1">%</span>
            </div>

            {riskCalc.inputs && (
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>
                  HR:{" "}
                  <span className="text-slate-200 font-mono">
                    {fmt(riskCalc.inputs.HR, 0)} BPM
                  </span>
                </div>
                <div>
                  SpO₂:{" "}
                  <span className="text-slate-200 font-mono">
                    {fmt(riskCalc.inputs.O2Sat, 1)}%
                  </span>
                </div>
                <div>
                  Core Temp (est.):{" "}
                  <span className="text-slate-200 font-mono">
                    {fmt(riskCalc.inputs.Temp_model_input, 1)} °C
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Progress bar with threshold marker */}
          <div className="relative h-3 bg-slate-800 rounded-full overflow-visible mt-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                riskCalc.level === "HIGH"
                  ? "bg-red-500"
                  : riskCalc.level === "ELEVATED"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(riskPct ?? 0, 100)}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
              style={{ left: `${Math.min(thresholdPct, 100)}%` }}
              title={`Alert threshold: ${thresholdPct.toFixed(2)}%`}
            />
          </div>

          <p className="text-xs text-slate-400">
            {riskCalc.reason ||
              `Forecast horizon: 6 hours. Alert threshold marker at ${thresholdPct.toFixed(2)}%.`}
          </p>
        </div>

        {/* Data Quality & Connectivity Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-cyan-400" />
            Data Quality & Sensor Connectivity
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-1.5 pr-3">Signal</th>
                  <th className="text-center py-1.5 px-2">Hardware</th>
                  <th className="text-center py-1.5 px-2">Valid %</th>
                  <th className="text-center py-1.5 px-2">Last Valid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {Object.entries(sensors).map(([name, s]) => (
                  <tr key={name} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-1.5 pr-3 font-mono text-slate-300">{name}</td>
                    <td className="py-1.5 px-2 text-center">
                      {s.hardware_ok ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono text-emerald-400 font-semibold">
                      {(s.valid_pct * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-400 font-mono">
                      {timeSince(s.last_valid_s_ago)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[11px] text-slate-400 font-mono">
            Samples received: <span className="text-cyan-300">{packetsReceived}</span> ·{" "}
            Finger on sensor:{" "}
            <span className="text-emerald-300">
              {liveReading.finger ? "yes" : "no"}
            </span>{" "}
            · Last packet:{" "}
            <span className="text-slate-300">
              {lastPacketMs ? timeSince((nowMs - lastPacketMs) / 1000) : "waiting"}
            </span>
          </div>
        </div>
      </div>

      {/* ── 4 Live Canvas Charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          {
            ref: hrCanvasRef,
            title: "Heart Rate (BPM)",
            subtitle: "Pulse ox (cyan) & ECG (amber)"
          },
          {
            ref: spo2CanvasRef,
            title: "SpO₂ (%)",
            subtitle: "Blood oxygen saturation (%)"
          },
          {
            ref: tempCanvasRef,
            title: "Surface Temperature (°C)",
            subtitle: "MLX90614 infrared reading (°C)"
          },
          {
            ref: riskCanvasRef,
            title: "Predicted Risk History",
            subtitle: "Estimated 6h sepsis deterioration risk %"
          }
        ].map(({ ref, title, subtitle }) => (
          <div
            key={title}
            className="bg-slate-900 border border-slate-800 rounded-xl p-3"
          >
            <div className="mb-2">
              <p className="text-xs font-semibold text-slate-300">{title}</p>
              <p className="text-[10px] text-slate-500">{subtitle}</p>
            </div>
            <canvas
              ref={ref}
              width={480}
              height={130}
              className="w-full h-32 rounded-lg bg-slate-950/60"
            />
          </div>
        ))}
      </div>

      {/* ── Alert Settings & Alert History ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            Alert Configuration
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
              <input
                type="checkbox"
                checked={cfgForm.alert_enabled}
                onChange={(e) =>
                  setCfgForm((f) => ({ ...f, alert_enabled: e.target.checked }))
                }
                className="w-4 h-4 rounded accent-cyan-500"
              />
              <span className="text-xs text-slate-300">Alerts enabled</span>
            </label>

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Alert threshold (risk 0–1)
              </label>
              <input
                type="number"
                min={0.001}
                max={0.999}
                step={0.005}
                value={cfgForm.alert_threshold}
                onChange={(e) =>
                  setCfgForm((f) => ({
                    ...f,
                    alert_threshold: parseFloat(e.target.value) || 0.01
                  }))
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Consecutive predictions required
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={cfgForm.consecutive_required}
                onChange={(e) =>
                  setCfgForm((f) => ({
                    ...f,
                    consecutive_required: parseInt(e.target.value) || 1
                  }))
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Cooldown (seconds)
              </label>
              <input
                type="number"
                min={0}
                step={30}
                value={cfgForm.cooldown_seconds}
                onChange={(e) =>
                  setCfgForm((f) => ({
                    ...f,
                    cooldown_seconds: parseInt(e.target.value) || 0
                  }))
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Surface-to-Core Temp Offset (°C)
              </label>
              <input
                type="number"
                step={0.1}
                value={cfgForm.temp_offset_c}
                onChange={(e) =>
                  setCfgForm((f) => ({
                    ...f,
                    temp_offset_c: parseFloat(e.target.value) || 0
                  }))
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          <button
            onClick={handleSaveCfg}
            className={`mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              cfgSaved
                ? "bg-emerald-600 text-white"
                : "bg-cyan-600 hover:bg-cyan-500 text-white"
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {cfgSaved ? "Saved ✓" : "Save Settings"}
          </button>
        </div>

        {/* Alert History */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            Alert History
          </h3>
          {alerts.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              No alerts triggered during this session.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left py-1.5 pr-2">Time</th>
                    <th className="text-left py-1.5 px-2">Type</th>
                    <th className="text-left py-1.5 px-2">Message</th>
                    <th className="text-center py-1.5 pl-2">Ack</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {alerts.map((a) => (
                    <tr key={a.id}>
                      <td className="py-1.5 pr-2 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(a.ts * 1000).toLocaleTimeString()}
                      </td>
                      <td className="py-1.5 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${levelBadgeClass(
                            a.level
                          )}`}
                        >
                          {a.type}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-slate-300">{a.message}</td>
                      <td className="py-1.5 pl-2 text-center">
                        {a.acknowledged ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                        ) : (
                          <button
                            onClick={() => handleAck(a.id)}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer"
                          >
                            Ack
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
      </div>

      {/* ── ESP32 Model Card ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          ESP32 Model Card
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-500">Dataset:</span>{" "}
              <a
                href={ESP32_MODEL_CARD.meta.dataset_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                {ESP32_MODEL_CARD.meta.dataset}
              </a>
            </div>
            <div>
              <span className="text-slate-500">Trained:</span>{" "}
              <span className="text-slate-300 font-mono">
                {ESP32_MODEL_CARD.meta.trained_at}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Target:</span>{" "}
              <span className="text-slate-300">
                {ESP32_MODEL_CARD.meta.label_definition}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Signals:</span>{" "}
              <span className="text-slate-300">
                {ESP32_MODEL_CARD.meta.input_signals.join(", ")}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-1.5 pr-2">Held-out Set</th>
                  <th className="text-center py-1.5 px-2">Patients</th>
                  <th className="text-center py-1.5 px-2">Prevalence</th>
                  <th className="text-center py-1.5 px-2">AUROC (95% CI)</th>
                  <th className="text-center py-1.5 px-2">AUPRC</th>
                  <th className="text-center py-1.5 px-2">Sensitivity</th>
                  <th className="text-center py-1.5 px-2">Specificity</th>
                  <th className="text-center py-1.5 pl-2">Brier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ESP32_MODEL_CARD.results.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-1.5 pr-2 font-semibold text-slate-300 capitalize">
                      {r.set}
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-400 font-mono">
                      {r.patients}
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-400 font-mono">
                      {(r.prevalence * 100).toFixed(1)}%
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono text-emerald-400">
                      {r.auroc.toFixed(3)} ({r.auroc_95ci})
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-400 font-mono">
                      {r.auprc.toFixed(3)}
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-400 font-mono">
                      {(r.row_sensitivity * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-400 font-mono">
                      {(r.row_specificity * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 pl-2 text-center text-slate-400 font-mono">
                      {r.brier.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HardwareLivePage;
