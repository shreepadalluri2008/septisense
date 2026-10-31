import React from "react";
import { AlertCircle, ShieldAlert, CheckCircle, Info } from "lucide-react";

interface RiskGaugeProps {
  riskProbability: number | null; // 0.0 to 1.0 (or percentage)
  horizonHours?: number;
  isAlert: boolean;
  insufficientData: boolean;
  topFeatures?: Record<string, number>;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  riskProbability,
  horizonHours = 6,
  isAlert,
  insufficientData,
  topFeatures
}) => {
  // Normalize probability to 0 - 100%
  const pct =
    riskProbability !== null && !isNaN(riskProbability)
      ? Math.min(100, Math.max(0, riskProbability * 100))
      : null;

  // Semicircle geometry (radius 80, center (100, 95))
  // Angle: 180 to 0 degrees (left to right)
  const radius = 75;
  const cx = 100;
  const cy = 90;

  // Arc path generator helper
  const describeArc = (startAngle: number, endAngle: number) => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy - radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy - radius * Math.sin(endRad);
    const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  // Needle angle for value: 0% -> 180 deg, 100% -> 0 deg
  const needleAngle = pct !== null ? 180 - (pct / 100) * 180 : 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleX = cx + (radius - 12) * Math.cos(needleRad);
  const needleY = cy - (radius - 12) * Math.sin(needleRad);

  const getRiskTier = () => {
    if (pct === null || insufficientData) return { label: "ACCUMULATING DATA", color: "text-slate-400" };
    if (pct >= 40) return { label: "HIGH RISK", color: "text-rose-400" };
    if (pct >= 15) return { label: "MODERATE RISK", color: "text-amber-400" };
    return { label: "LOW RISK", color: "text-emerald-400" };
  };

  const tier = getRiskTier();

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Early-Warning Risk Model
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Predictive deterioration horizon: <strong>H = {horizonHours} Hours</strong>
          </p>
        </div>

        {isAlert && (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
            ALERT TRIGGERED
          </span>
        )}
      </div>

      {/* Semicircle Gauge Area */}
      <div className="my-2 flex flex-col items-center justify-center">
        <svg viewBox="0 0 200 115" className="w-64 h-36">
          {/* Arc Background Segments */}
          {/* Low Risk Arc: 0 - 15% -> 180 to 153 deg */}
          <path
            d={describeArc(153, 180)}
            fill="none"
            stroke="#10b981"
            strokeWidth="14"
            strokeLinecap="round"
            className="opacity-40"
          />
          {/* Moderate Risk Arc: 15 - 40% -> 153 to 108 deg */}
          <path
            d={describeArc(108, 153)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="14"
            className="opacity-40"
          />
          {/* High Risk Arc: 40 - 100% -> 108 to 0 deg */}
          <path
            d={describeArc(0, 108)}
            fill="none"
            stroke="#ef4444"
            strokeWidth="14"
            strokeLinecap="round"
            className="opacity-40"
          />

          {/* Calibrated Needle */}
          {pct !== null && !insufficientData && (
            <>
              <line
                x1={cx}
                y1={cy}
                x2={needleX}
                y2={needleY}
                stroke="#f8fafc"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle cx={cx} cy={cy} r="6" fill="#38bdf8" />
            </>
          )}

          {/* Gauge Center Text */}
          <text
            x={cx}
            y={cy - 12}
            textAnchor="middle"
            className="text-2xl font-extrabold fill-slate-100 font-mono tracking-tight"
            style={{ fontSize: "22px" }}
          >
            {pct !== null && !insufficientData ? `${pct.toFixed(1)}%` : "--"}
          </text>
          <text
            x={cx}
            y={cy + 6}
            textAnchor="middle"
            className={`text-[9px] font-bold tracking-widest ${
              tier.color.replace("text-", "fill-")
            }`}
          >
            {tier.label}
          </text>
        </svg>

        {/* Mandatory Clinical Description */}
        <p className="text-center text-xs text-slate-300 font-medium px-4">
          Estimated risk of sepsis-related deterioration within the next {horizonHours} hours
        </p>

        {insufficientData && (
          <p className="text-[11px] text-amber-400/90 text-center mt-1 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            Baseline feature window accumulating (requires &gt; 3 hours of readings).
          </p>
        )}
      </div>

      {/* Top Feature Drivers (if provided) */}
      {topFeatures && Object.keys(topFeatures).length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-xs">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block mb-1.5">
            Key Feature Signals:
          </span>
          <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300 font-mono">
            {Object.entries(topFeatures).slice(0, 4).map(([name, val]) => (
              <div key={name} className="flex justify-between bg-slate-800/60 px-2 py-1 rounded">
                <span className="truncate pr-1 text-slate-400">{name}:</span>
                <span className="font-semibold text-cyan-300">{typeof val === "number" ? val.toFixed(1) : val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
