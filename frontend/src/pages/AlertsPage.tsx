import React, { useState, useMemo } from "react";
import { Alert, AlertThresholds } from "../types";
import {
  Bell,
  BellRing,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Volume2,
  VolumeX,
  ShieldAlert,
  Search,
  Download,
  CheckCheck,
  Filter,
  Clock,
  Activity
} from "lucide-react";

interface AlertsPageProps {
  alerts: Alert[];
  thresholds: AlertThresholds;
  onUpdateThresholds: (thresholds: AlertThresholds) => Promise<void>;
  onAcknowledgeAlert: (alertId: number, name?: string) => Promise<void>;
  audioMuted: boolean;
  onToggleAudio: () => void;
}

type NotificationFilter = "all" | "critical" | "warning" | "pending" | "acknowledged";

export const AlertsPage: React.FC<AlertsPageProps> = ({
  alerts,
  thresholds,
  onUpdateThresholds,
  onAcknowledgeAlert,
  audioMuted,
  onToggleAudio
}) => {
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [clinicianName, setClinicianName] = useState("Clinician On-Duty");
  const [bulkAcknowledging, setBulkAcknowledging] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);

  // Threshold form state
  const [formThresholds, setFormThresholds] = useState<AlertThresholds>(thresholds);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      await onUpdateThresholds(formThresholds);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to update thresholds", err);
    } finally {
      setSaving(false);
    }
  };

  // Metrics
  const criticalCount = alerts.filter((a) => a.level === "critical").length;
  const warningCount = alerts.filter((a) => a.level === "warning").length;
  const pendingCount = alerts.filter((a) => !a.acknowledged_at).length;
  const acknowledgedCount = alerts.filter((a) => a.acknowledged_at).length;

  // Filtered notifications
  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      // Tab filter
      if (activeFilter === "critical" && alert.level !== "critical") return false;
      if (activeFilter === "warning" && alert.level !== "warning") return false;
      if (activeFilter === "pending" && alert.acknowledged_at) return false;
      if (activeFilter === "acknowledged" && !alert.acknowledged_at) return false;

      // Text search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const reasonMatch = alert.reason.toLowerCase().includes(q);
        const levelMatch = alert.level.toLowerCase().includes(q);
        const triggerMatch = alert.trigger_value !== null && String(alert.trigger_value).includes(q);
        if (!reasonMatch && !levelMatch && !triggerMatch) return false;
      }
      return true;
    });
  }, [alerts, activeFilter, searchQuery]);

  // Bulk acknowledge all pending alerts
  const handleAcknowledgeAll = async () => {
    const unacked = alerts.filter((a) => !a.acknowledged_at);
    if (unacked.length === 0) return;
    setBulkAcknowledging(true);
    try {
      for (const a of unacked) {
        await onAcknowledgeAlert(a.id, clinicianName);
      }
    } catch (err) {
      console.error("Bulk acknowledge error", err);
    } finally {
      setBulkAcknowledging(false);
    }
  };

  // Export notifications as JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(alerts, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `septisense_notifications_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <BellRing className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100">Notification & Clinical Alerts Center</h2>
              <span className="text-[10px] font-mono uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded font-bold">
                Persistent Storage
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Centralized storage vault for all critical deterioration alarms and clinical warning notifications with audit trail
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowThresholds(!showThresholds)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              showThresholds
                ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{showThresholds ? "Hide Thresholds" : "Configure Thresholds"}</span>
          </button>

          <button
            onClick={onToggleAudio}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              audioMuted
                ? "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 shadow-sm"
            }`}
          >
            {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{audioMuted ? "Alarm Muted" : "Alarm Active"}</span>
          </button>
        </div>
      </div>

      {/* Metric Tiles: Notification Storage Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Stored */}
        <div
          onClick={() => setActiveFilter("all")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === "all"
              ? "bg-slate-800/90 border-cyan-500/50 shadow-lg shadow-cyan-950/20"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Stored</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-100 mt-2">{alerts.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">All events in vault</div>
        </div>

        {/* Critical Alerts */}
        <div
          onClick={() => setActiveFilter("critical")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === "critical"
              ? "bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/30"
              : "bg-slate-900/80 border-slate-800 hover:border-rose-900/40"
          }`}
        >
          <div className="flex items-center justify-between text-rose-400 text-xs font-medium">
            <span>Critical Alarms</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black font-mono text-rose-400 mt-2">{criticalCount}</div>
          <div className="text-[11px] text-rose-400/70 mt-1">Life-threatening emergencies</div>
        </div>

        {/* Warning Notifications */}
        <div
          onClick={() => setActiveFilter("warning")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === "warning"
              ? "bg-amber-950/40 border-amber-500/60 shadow-lg shadow-amber-950/30"
              : "bg-slate-900/80 border-slate-800 hover:border-amber-900/40"
          }`}
        >
          <div className="flex items-center justify-between text-amber-400 text-xs font-medium">
            <span>Warnings Stored</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-400 mt-2">{warningCount}</div>
          <div className="text-[11px] text-amber-400/70 mt-1">Deterioration risk indicators</div>
        </div>

        {/* Pending Action */}
        <div
          onClick={() => setActiveFilter("pending")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeFilter === "pending"
              ? "bg-slate-800/90 border-cyan-500/50 shadow-lg"
              : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Pending Action</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-100 mt-2">{pendingCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Awaiting clinician signature</div>
        </div>
      </div>

      {/* Optional Collapsible: Physiological Alarm Thresholds */}
      {showThresholds && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                Configurable Physiological Limit Thresholds
              </h3>
            </div>
            {saveSuccess && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" /> Thresholds saved successfully!
              </span>
            )}
          </div>

          <form onSubmit={handleSaveThresholds} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-xl space-y-1">
                <label className="text-xs font-semibold text-slate-300">Heart Rate Bradycardia Floor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="30"
                    max="100"
                    value={formThresholds.hr_min}
                    onChange={(e) =>
                      setFormThresholds({ ...formThresholds, hr_min: Number(e.target.value) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-slate-400 font-mono">BPM</span>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-xl space-y-1">
                <label className="text-xs font-semibold text-slate-300">Heart Rate Tachycardia Ceiling</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="80"
                    max="220"
                    value={formThresholds.hr_max}
                    onChange={(e) =>
                      setFormThresholds({ ...formThresholds, hr_max: Number(e.target.value) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-slate-400 font-mono">BPM</span>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-xl space-y-1">
                <label className="text-xs font-semibold text-slate-300">SpO2 Hypoxia Floor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="70"
                    max="98"
                    value={formThresholds.spo2_min}
                    onChange={(e) =>
                      setFormThresholds({ ...formThresholds, spo2_min: Number(e.target.value) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-slate-400 font-mono">%</span>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-xl space-y-1">
                <label className="text-xs font-semibold text-slate-300">Hypothermia Floor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="32"
                    max="37"
                    value={formThresholds.temp_min}
                    onChange={(e) =>
                      setFormThresholds({ ...formThresholds, temp_min: Number(e.target.value) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-slate-400 font-mono">°C</span>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-xl space-y-1">
                <label className="text-xs font-semibold text-slate-300">Hyperthermia / Fever Ceiling</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="37"
                    max="42"
                    value={formThresholds.temp_max}
                    onChange={(e) =>
                      setFormThresholds({ ...formThresholds, temp_max: Number(e.target.value) })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-slate-400 font-mono">°C</span>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 p-3.5 rounded-xl space-y-1">
                <label className="text-xs font-semibold text-slate-300">Sepsis 6h Deterioration Threshold</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="1.0"
                    value={formThresholds.sepsis_risk_threshold}
                    onChange={(e) =>
                      setFormThresholds({
                        ...formThresholds,
                        sepsis_risk_threshold: Number(e.target.value)
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-slate-400 font-mono">prob</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow cursor-pointer disabled:opacity-50"
              >
                {saving ? "Saving Changes..." : "Save Physiological Limits"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Notification Storage Area */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        {/* Controls Bar: Filters, Search, and Bulk Actions */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          {/* Tab Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Stored", count: alerts.length },
              { id: "critical", label: "Critical Alarms", count: criticalCount },
              { id: "warning", label: "Warnings", count: warningCount },
              { id: "pending", label: "Pending", count: pendingCount },
              { id: "acknowledged", label: "Resolved", count: acknowledgedCount }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id as NotificationFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === f.id
                    ? f.id === "critical"
                      ? "bg-rose-500 text-white shadow-md shadow-rose-950"
                      : f.id === "warning"
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-950"
                      : "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeFilter === f.id
                      ? "bg-slate-950/30 text-current"
                      : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reason or metric..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
              title="Download full JSON export of all stored notifications"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Export JSON</span>
            </button>

            {pendingCount > 0 && (
              <button
                onClick={handleAcknowledgeAll}
                disabled={bulkAcknowledging}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow cursor-pointer disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>{bulkAcknowledging ? "Signing..." : "Acknowledge All"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Clinician Signature Strip */}
        <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-800/40 px-4 py-2 rounded-xl border border-slate-800">
          <span>Active Clinician Signature:</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={clinicianName}
              onChange={(e) => setClinicianName(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-semibold focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Notifications Feed */}
        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mx-auto" />
            <p className="font-semibold text-slate-300">No matching notifications in storage.</p>
            <p>All clinical deterioration parameters and vital readings are within safe bounds.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert) => {
              const isCritical = alert.level === "critical";
              const isWarning = alert.level === "warning";
              const isAcked = !!alert.acknowledged_at;

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md ${
                    isAcked
                      ? "bg-slate-800/30 border-slate-800 text-slate-400 opacity-75"
                      : isCritical
                      ? "bg-rose-950/40 border-rose-500/50 text-rose-100 shadow-rose-950/30"
                      : isWarning
                      ? "bg-amber-950/30 border-amber-500/40 text-amber-100 shadow-amber-950/20"
                      : "bg-slate-800/60 border-slate-700 text-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        isAcked
                          ? "bg-slate-800 text-slate-500"
                          : isCritical
                          ? "bg-rose-500/20 text-rose-400 animate-pulse"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {isCritical ? (
                        <AlertCircle className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded tracking-wider ${
                            isAcked
                              ? "bg-slate-700 text-slate-300"
                              : isCritical
                              ? "bg-rose-500 text-white"
                              : "bg-amber-500 text-slate-950"
                          }`}
                        >
                          {alert.level}
                        </span>

                        <span className="font-mono text-xs text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(alert.ts_ms).toLocaleTimeString()}
                        </span>

                        <span className="text-[11px] text-slate-500 font-mono">
                          Patient #{alert.patient_id}
                        </span>

                        {isAcked && (
                          <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-sans">
                            <CheckCircle2 className="w-3 h-3" /> Signed by {alert.acknowledged_by || "Clinician"} at{" "}
                            {new Date(alert.acknowledged_at!).toLocaleTimeString()}
                          </span>
                        )}
                      </div>

                      <p
                        className={`text-sm font-semibold leading-snug ${
                          isAcked ? "text-slate-300 line-through decoration-slate-600" : "text-slate-100"
                        }`}
                      >
                        {alert.reason}
                      </p>

                      {alert.trigger_value !== null && alert.threshold_value !== null && (
                        <p className="text-xs text-slate-400 font-mono">
                          Measured Value:{" "}
                          <span
                            className={`font-bold ${
                              isCritical ? "text-rose-300" : "text-amber-300"
                            }`}
                          >
                            {alert.trigger_value}
                          </span>{" "}
                          • Physiological Safety Limit:{" "}
                          <span className="text-slate-300">{alert.threshold_value}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {!isAcked && (
                    <button
                      onClick={() => onAcknowledgeAlert(alert.id, clinicianName)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow cursor-pointer shrink-0 ${
                        isCritical
                          ? "bg-rose-500 hover:bg-rose-400 text-white"
                          : "bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200"
                      }`}
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Complete Historical Audit Trail Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Persistent Audit Trail & Escalation Log ({acknowledgedCount} Resolved)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Immutable Clinician Accountability Archive
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Trigger Time</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Clinical Condition & Reason</th>
                <th className="px-4 py-3">Value / Limit</th>
                <th className="px-4 py-3">Signed By</th>
                <th className="px-4 py-3 rounded-r-lg">Resolution Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-mono">
              {alerts
                .filter((a) => a.acknowledged_at)
                .slice(0, 25)
                .map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(a.ts_ms).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          a.level === "critical"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {a.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-sans">{a.reason}</td>
                    <td className="px-4 py-3">
                      {a.trigger_value ?? "--"} / {a.threshold_value ?? "--"}
                    </td>
                    <td className="px-4 py-3 text-cyan-300 font-sans">
                      {a.acknowledged_by || "Clinician"}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleTimeString() : "--"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {acknowledgedCount === 0 && (
            <div className="text-center py-6 text-slate-500 text-xs">
              No resolved notifications yet. Active alerts appear here once signed and acknowledged.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
