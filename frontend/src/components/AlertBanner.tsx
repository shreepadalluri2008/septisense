import React from "react";
import { AlertTriangle, CheckCircle, BellRing, X } from "lucide-react";
import { Alert } from "../types";

interface AlertBannerProps {
  alerts: Alert[];
  onAcknowledge: (alertId: number) => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alerts, onAcknowledge }) => {
  const unacknowledged = alerts.filter((a) => !a.acknowledged_at);
  if (unacknowledged.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {unacknowledged.map((alert) => {
        const isCritical = alert.level === "critical";
        return (
          <div
            key={alert.id}
            className={`rounded-2xl p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all shadow-lg ${
              isCritical
                ? "bg-rose-950/80 border-rose-500/60 text-rose-100 shadow-rose-950/50 animate-pulse"
                : "bg-amber-950/70 border-amber-500/50 text-amber-100 shadow-amber-950/40"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                  isCritical ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                }`}
              >
                <BellRing className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      isCritical ? "bg-rose-500 text-white" : "bg-amber-500 text-slate-950"
                    }`}
                  >
                    {alert.level}
                  </span>
                  <span className="text-xs text-slate-300 font-mono">
                    {new Date(alert.ts_ms).toLocaleTimeString()}
                  </span>
                </div>
                <p className="font-semibold text-sm mt-1">{alert.reason}</p>
                {alert.trigger_value !== null && alert.threshold_value !== null && (
                  <p className="text-xs opacity-90 mt-0.5">
                    Triggered: <span className="font-mono font-bold">{alert.trigger_value}</span> (Limit:{" "}
                    <span className="font-mono">{alert.threshold_value}</span>)
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => onAcknowledge(alert.id)}
              className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide uppercase bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 text-white transition-all shadow cursor-pointer shrink-0"
            >
              Acknowledge
            </button>
          </div>
        );
      })}
    </div>
  );
};
