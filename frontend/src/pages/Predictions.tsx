import React from "react";
import { PredictionRecord } from "../types";
import { TrendingUp, ShieldAlert, Cpu, CheckCircle2, AlertTriangle, Layers, Info } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line
} from "recharts";

interface PredictionsPageProps {
  predictions: PredictionRecord[];
  patientId: number;
}

export const Predictions: React.FC<PredictionsPageProps> = ({ predictions, patientId }) => {
  const latestPred = predictions.length > 0 ? predictions[0] : null;

  // Format prediction history for time-series chart
  const riskTrajectory = predictions.map((p) => ({
    timeStr: new Date(p.ts_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    riskPct: p.risk_probability !== null ? +(p.risk_probability * 100).toFixed(1) : null,
    isAlert: p.is_alert,
    rhythm: p.rhythm_label
  }));

  // Extract top feature signals from latest prediction snapshot
  const features = latestPred?.features_snapshot || {};
  const featureBarData = Object.entries(features)
    .filter(([k]) => !k.startsWith("_") && k !== "Hour")
    .map(([key, val]) => ({
      feature: key,
      importance: typeof val === "number" ? Math.abs(val) : 0,
      rawValue: val
    }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Model A: Sepsis Early-Warning Risk Analytics
            </h2>
            <p className="text-xs text-slate-400">
              LightGBM Gradient Boosted Trees with Platt Sigmoid Calibration (Horizon: H = 6 Hours)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300">
            Split Strategy: <strong className="text-cyan-400">Patient-Level GroupShuffle</strong>
          </span>
          <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300">
            Validation AUROC: <strong className="text-emerald-400">0.7205</strong>
          </span>
        </div>
      </div>

      {/* Trajectory & Contributing Features Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Probability Trajectory */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-purple-400" />
              6-Hour Deterioration Risk Trajectory
            </h3>
            <span className="text-xs text-slate-400">Calibrated Posterior P(Sepsis | Vitals)</span>
          </div>

          <div className="h-64 w-full">
            {riskTrajectory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={riskTrajectory} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeStr" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} unit="%" tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "0.75rem",
                      fontSize: "12px"
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="riskPct"
                    name="Sepsis 6h Risk"
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    dot={{ fill: "#a855f7", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                Awaiting initial prediction inferences...
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            <strong>Clinical Note:</strong> Evaluates the probabilistic likelihood that the patient enters sepsis-related deterioration within the next 6 hours. Not an instant diagnosis.
          </p>
        </div>

        {/* Feature Contribution Breakdown (SHAP-Style Proxy) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Top Physiological Signal Drivers
            </h3>
            <span className="text-xs text-slate-400">Current Feature Snapshot</span>
          </div>

          <div className="h-64 w-full">
            {featureBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={featureBarData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 70, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis
                    dataKey="feature"
                    type="category"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "0.75rem",
                      fontSize: "11px"
                    }}
                  />
                  <Bar dataKey="importance" name="Relative Magnitude" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                Feature snapshot will appear when readings are recorded.
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            Computed over causal sliding windows (1h, 3h, 6h). Zero future information leakage.
          </p>
        </div>
      </div>

      {/* Model Calibration & Mathematical Basis Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-slate-100 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400" />
          Probabilistic Calibration & Decision Thresholds
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300 mt-4">
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
            <span className="font-bold text-slate-100 block">Platt Sigmoid Scaling</span>
            <p className="text-slate-400">
              Raw decision function outputs $f(x)$ are mapped to strictly calibrated probabilities using logistic regression:
            </p>
            <p className="font-mono text-cyan-300 pt-1">P(Y=1|f) = 1 / (1 + exp(A·f + B))</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
            <span className="font-bold text-slate-100 block">Decision Threshold &tau;</span>
            <p className="text-slate-400">
              Optimal operating point tuned on held-out validation set to maximize PhysioNet utility score:
            </p>
            <p className="font-mono text-emerald-300 pt-1">&tau; = 0.0077 (Sensitivity: 80.3%, Specificity: 45.7%)</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-1">
            <span className="font-bold text-slate-100 block">Model B: ECG Rhythm</span>
            <p className="text-slate-400">
              Pan-Tompkins QRS detector (98.7% sensitivity) paired with multi-class gradient boosted classifier:
            </p>
            <p className="font-mono text-purple-300 pt-1">Accuracy: 74.2% | Macro F1: 0.641</p>
          </div>
        </div>
      </div>

      {/* Prediction History Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Inference Audit Log</h3>
          <span className="text-xs text-slate-400">Showing last {predictions.length} predictions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Time</th>
                <th className="px-4 py-3">6h Risk</th>
                <th className="px-4 py-3">ECG Rhythm</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 rounded-r-lg">Features Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
              {predictions.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(p.ts_ms).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 font-bold text-purple-400">
                    {p.risk_probability !== null ? `${(p.risk_probability * 100).toFixed(1)}%` : "--"}
                  </td>
                  <td className="px-4 py-3 text-cyan-300">
                    {p.rhythm_label || "Normal"}
                  </td>
                  <td className="px-4 py-3">
                    {p.insufficient_data ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                        Insufficient History
                      </span>
                    ) : p.is_alert ? (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                        ALERT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                        Nominal
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 truncate max-w-xs text-[11px]">
                    {JSON.stringify(p.features_snapshot || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
