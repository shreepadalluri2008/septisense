import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Brush
} from "recharts";
import { Reading, PredictionRecord } from "../types";
import { History, Download, Calendar, Activity, Droplets, Thermometer, TrendingUp } from "lucide-react";

interface HistoryTrendsProps {
  readings: Reading[];
  predictions: PredictionRecord[];
  patientId: number;
}

export const HistoryTrends: React.FC<HistoryTrendsProps> = ({
  readings,
  predictions,
  patientId
}) => {
  const [rangeHours, setRangeHours] = useState<number>(6); // 1, 6, 24, 168 (7d)
  const [activeSignal, setActiveSignal] = useState<"all" | "hr" | "spo2" | "temp" | "risk">("all");

  // Filter readings by selected range
  const now = readings.length > 0 ? readings[readings.length - 1].ts_ms : Date.now();
  const cutoff = now - rangeHours * 3600 * 1000;

  // Merge readings with corresponding predictions
  const predMap = new Map<number, number>();
  predictions.forEach((p) => {
    if (p.risk_probability !== null) {
      predMap.set(Math.floor(p.ts_ms / 5000) * 5000, p.risk_probability * 100);
    }
  });

  const chartData = readings
    .filter((r) => r.ts_ms >= cutoff)
    .map((r) => {
      const approxKey = Math.floor(r.ts_ms / 5000) * 5000;
      const risk = predMap.get(approxKey) ?? null;
      return {
        timestamp: r.ts_ms,
        timeStr: new Date(r.ts_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        dateStr: new Date(r.ts_ms).toLocaleDateString(),
        hr: r.hr_bpm,
        spo2: r.spo2_pct,
        temp: r.temp_c,
        resp: r.resp_rate,
        risk: risk
      };
    });

  // Export to CSV
  const exportCSV = () => {
    if (chartData.length === 0) return;
    const headers = ["Timestamp_ms", "Date", "Time", "HR_bpm", "SpO2_pct", "Temp_C", "Resp_Rate", "Sepsis_Risk_pct"];
    const rows = chartData.map((d) => [
      d.timestamp,
      d.dateStr,
      d.timeStr,
      d.hr ?? "",
      d.spo2 ?? "",
      d.temp ?? "",
      d.resp ?? "",
      d.risk !== null ? d.risk.toFixed(2) : ""
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `septisense_patient_${patientId}_history.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Controls Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Physiological Trends Explorer</h2>
            <p className="text-xs text-slate-400">
              Multi-signal retrospective analysis with clinical threshold reference lines
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Signal Filter Pills */}
          <div className="flex bg-slate-800 rounded-xl p-1 text-xs">
            {(
              [
                { id: "all", label: "All Signals" },
                { id: "hr", label: "Heart Rate" },
                { id: "spo2", label: "SpO2" },
                { id: "temp", label: "Temperature" },
                { id: "risk", label: "Sepsis Risk" }
              ] as const
            ).map((sig) => (
              <button
                key={sig.id}
                onClick={() => setActiveSignal(sig.id)}
                className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                  activeSignal === sig.id
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {sig.label}
              </button>
            ))}
          </div>

          {/* Range buttons */}
          <div className="flex bg-slate-800 rounded-xl p-1 text-xs">
            {[
              { h: 1, label: "1h" },
              { h: 6, label: "6h" },
              { h: 24, label: "24h" },
              { h: 168, label: "7d" }
            ].map((r) => (
              <button
                key={r.h}
                onClick={() => setRangeHours(r.h)}
                className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                  rangeHours === r.h
                    ? "bg-indigo-600 text-white font-bold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Export CSV button */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Trends Chart Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Displaying <strong>{chartData.length}</strong> recorded data points over the last{" "}
            <strong>{rangeHours} hour(s)</strong>
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-rose-400 inline-block" /> Heart Rate (BPM)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-cyan-400 inline-block" /> SpO2 (%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-amber-400 inline-block" /> Core Temp (°C)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-purple-400 inline-block" /> Sepsis 6h Risk (%)
            </span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
            <History className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No historical telemetry recorded for this time window yet.</p>
            <p className="text-xs text-slate-600 mt-1">
              Connect serial hardware or start Replay mode to stream real PhysioNet records.
            </p>
          </div>
        ) : (
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="timeStr"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#94a3b8"
                  fontSize={11}
                  domain={[30, 160]}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#c084fc"
                  fontSize={11}
                  domain={[0, 100]}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)"
                  }}
                />

                {/* Clinical Reference Thresholds */}
                <ReferenceLine
                  yAxisId="left"
                  y={100}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                  label={{ value: "HR Tachycardia (>100)", fill: "#f43f5e", fontSize: 10, position: "insideTopLeft" }}
                />
                <ReferenceLine
                  yAxisId="left"
                  y={90}
                  stroke="#38bdf8"
                  strokeDasharray="4 4"
                  label={{ value: "SpO2 Hypoxia (<90%)", fill: "#38bdf8", fontSize: 10, position: "insideBottomLeft" }}
                />
                <ReferenceLine
                  yAxisId="right"
                  y={40}
                  stroke="#ec4899"
                  strokeDasharray="3 3"
                  label={{ value: "Sepsis Alert Cut (40%)", fill: "#ec4899", fontSize: 10, position: "insideTopRight" }}
                />

                {/* Lines */}
                {(activeSignal === "all" || activeSignal === "hr") && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="hr"
                    name="Heart Rate (BPM)"
                    stroke="#fb7185"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                {(activeSignal === "all" || activeSignal === "spo2") && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="spo2"
                    name="SpO2 (%)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                {(activeSignal === "all" || activeSignal === "temp") && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="temp"
                    name="Temp (°C)"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                {(activeSignal === "all" || activeSignal === "risk") && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="risk"
                    name="Sepsis 6h Risk (%)"
                    stroke="#c084fc"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}

                <Brush dataKey="timeStr" height={25} stroke="#38bdf8" fill="#0f172a" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
