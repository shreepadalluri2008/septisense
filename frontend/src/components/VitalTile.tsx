import React from "react";
import { Heart, Activity, Droplets, Thermometer, Wind, AlertTriangle, CheckCircle2 } from "lucide-react";

export type VitalType = "hr" | "spo2" | "temp" | "resp";

interface VitalTileProps {
  type: VitalType;
  title: string;
  value: number | null;
  unit: string;
  history?: number[];
  sqi: number;
  sqiReason?: string;
  minNormal?: number;
  maxNormal?: number;
}

export const VitalTile: React.FC<VitalTileProps> = ({
  type,
  title,
  value,
  unit,
  history = [],
  sqi,
  sqiReason,
  minNormal,
  maxNormal
}) => {
  // Determine clinical status band
  let status: "normal" | "warning" | "critical" = "normal";
  if (value === null) {
    status = "normal";
  } else if (type === "hr") {
    if (value < 45 || value > 135) status = "critical";
    else if (value < 60 || value > 100) status = "warning";
  } else if (type === "spo2") {
    if (value < 90) status = "critical";
    else if (value < 95) status = "warning";
  } else if (type === "temp") {
    if (value < 35.5 || value > 39.0) status = "critical";
    else if (value < 36.5 || value > 37.5) status = "warning";
  } else if (type === "resp") {
    if (value < 8 || value > 30) status = "critical";
    else if (value < 12 || value > 22) status = "warning";
  }

  // Visual styles per status
  const borderColors = {
    normal: "border-slate-800 hover:border-slate-700",
    warning: "border-amber-500/50 bg-amber-500/5",
    critical: "border-rose-500/70 bg-rose-500/10 animate-pulse"
  };

  const badgeColors = {
    normal: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    critical: "bg-rose-500/20 text-rose-400 border-rose-500/30"
  };

  // Sparkline coordinates
  const sparkPoints = (() => {
    if (!history || history.length < 2) return "";
    const cleanHist = history.filter((v) => v !== null && !isNaN(v));
    if (cleanHist.length < 2) return "";
    const min = Math.min(...cleanHist);
    const max = Math.max(...cleanHist);
    const range = max - min || 1;
    const width = 120;
    const height = 32;

    return cleanHist
      .map((val, idx) => {
        const x = (idx / (cleanHist.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  })();

  const renderIcon = () => {
    switch (type) {
      case "hr":
        return (
          <div
            className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20"
            style={{
              animation: value && value > 30 ? `pulse ${Math.max(0.35, 60 / value)}s infinite` : undefined
            }}
          >
            <Heart className="w-5 h-5 fill-current" />
          </div>
        );
      case "spo2":
        return (
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Droplets className="w-5 h-5 fill-current" />
          </div>
        );
      case "temp":
        return (
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Thermometer className="w-5 h-5" />
          </div>
        );
      case "resp":
        return (
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Wind className="w-5 h-5" />
          </div>
        );
    }
  };

  return (
    <div
      className={`relative bg-slate-900/90 border rounded-2xl p-5 shadow-lg transition-all ${borderColors[status]}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {renderIcon()}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {title}
            </h3>
            {minNormal !== undefined && maxNormal !== undefined && (
              <p className="text-[10px] text-slate-500">
                Normal: {minNormal}–{maxNormal} {unit}
              </p>
            )}
          </div>
        </div>

        {/* SQI Quality Pill */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
            sqi >= 80
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : sqi >= 50
              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          }`}
          title={sqiReason ? `SQI: ${sqi.toFixed(0)}% • ${sqiReason}` : `SQI: ${sqi.toFixed(0)}%`}
        >
          {sqi >= 80 ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-amber-400" />
          )}
          <span>SQI {sqi.toFixed(0)}%</span>
        </div>
      </div>

      {/* Main Measurement Value */}
      <div className="mt-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-4xl font-extrabold font-mono tracking-tight ${
              status === "critical"
                ? "text-rose-400"
                : status === "warning"
                ? "text-amber-300"
                : "text-slate-100"
            }`}
          >
            {value !== null && !isNaN(value) ? value.toFixed(type === "temp" ? 1 : 0) : "--"}
          </span>
          <span className="text-sm font-semibold text-slate-400">{unit}</span>
        </div>

        {/* Mini Sparkline */}
        {sparkPoints && (
          <div className="w-28 h-8 opacity-75">
            <svg className="w-full h-full overflow-visible">
              <polyline
                fill="none"
                stroke={status === "critical" ? "#f43f5e" : status === "warning" ? "#fbbf24" : "#38bdf8"}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparkPoints}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Warning reason footer if applicable */}
      {status !== "normal" && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
          <span className={status === "critical" ? "text-rose-400 font-semibold" : "text-amber-400"}>
            {status === "critical" ? "Critical physiological deviation" : "Borderline physiological value"}
          </span>
        </div>
      )}
    </div>
  );
};
