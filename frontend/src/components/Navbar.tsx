import React from "react";
import {
  Activity,
  Radio,
  BatteryCharging,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  History,
  TrendingUp,
  Users,
  Pill,
  Stethoscope,
  Cpu,
  Settings,
  HelpCircle,
  Zap
} from "lucide-react";
import { Patient } from "../types";

export type NavTab =
  | "live"
  | "history"
  | "predictions"
  | "alerts"
  | "patients"
  | "medicines"
  | "doctors"
  | "modelcard"
  | "settings"
  | "hardware";

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  patients: Patient[];
  selectedPatientId: number;
  onSelectPatient: (patientId: number) => void;
  wsConnected: boolean;
  isReplay: boolean;
  activeAlertCount: number;
  audioMuted: boolean;
  onToggleAudio: () => void;
  onOpenSafetyModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  patients,
  selectedPatientId,
  onSelectPatient,
  wsConnected,
  isReplay,
  activeAlertCount,
  audioMuted,
  onToggleAudio,
  onOpenSafetyModal
}) => {
  const tabs = [
    { id: "live" as NavTab, label: "Live Monitor", icon: Activity },
    { id: "history" as NavTab, label: "History & Trends", icon: History },
    { id: "predictions" as NavTab, label: "6h Risk Prediction", icon: TrendingUp },
    {
      id: "alerts" as NavTab,
      label: "Notification Center",
      icon: BellRing,
      badge: activeAlertCount > 0 ? activeAlertCount : undefined
    },
    { id: "patients" as NavTab, label: "Patients", icon: Users },
    { id: "medicines" as NavTab, label: "Medications", icon: Pill },
    { id: "doctors" as NavTab, label: "Care & Triage", icon: Stethoscope },
    { id: "modelcard" as NavTab, label: "Model Card", icon: Cpu },
    { id: "settings" as NavTab, label: "Device & Replay", icon: Settings },
    { id: "hardware" as NavTab, label: "ESP32 Hardware Live", icon: Zap }
  ];

  const currentPatient = patients.find((p) => p.id === selectedPatientId);

  return (
    <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur sticky top-0 z-40">
      {/* Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                SeptiSense
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                IoT Platform
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-none">
              Physiological Telemetry & Sepsis Early-Warning
            </p>
          </div>
        </div>

        {/* Replay Banner Badge */}
        {isReplay && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold animate-pulse">
            <Radio className="w-3.5 h-3.5 text-amber-400" />
            <span>REPLAY – historical PhysioNet data, not live</span>
          </div>
        )}

        {/* Patient Selector & Controls */}
        <div className="flex items-center gap-3">
          {/* Patient dropdown */}
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 py-1.5">
            <span className="text-xs text-slate-400">Patient:</span>
            <select
              value={selectedPatientId}
              onChange={(e) => onSelectPatient(Number(e.target.value))}
              className="bg-transparent text-sm font-semibold text-slate-200 focus:outline-none cursor-pointer"
            >
              {patients.length > 0 ? (
                patients.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                    #{p.id} – {p.name} ({p.age}y)
                  </option>
                ))
              ) : (
                <option value={1} className="bg-slate-900 text-slate-200">
                  #1 – Default Patient
                </option>
              )}
            </select>
          </div>

          {/* WebSocket Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border ${
              wsConnected
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                : "bg-rose-950/40 border-rose-500/30 text-rose-400"
            }`}
            title={wsConnected ? "WebSocket Live Stream Active (1 Hz)" : "WebSocket Disconnected"}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                wsConnected ? "bg-emerald-400 animate-ping" : "bg-rose-400"
              }`}
            />
            <span className="hidden sm:inline">{wsConnected ? "LIVE 1Hz" : "OFFLINE"}</span>
          </div>

          {/* Electrical Safety Badge */}
          <button
            onClick={onOpenSafetyModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
            title="View Electrical & Clinical Safety Protocol"
          >
            <BatteryCharging className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Battery Mandate</span>
          </button>

          {/* Quick Notification Center Bell */}
          <button
            onClick={() => onSelectTab("alerts")}
            className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
              activeAlertCount > 0
                ? "bg-rose-500/15 border-rose-500/40 text-rose-400 hover:bg-rose-500/25"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
            title={`Notification Center (${activeAlertCount} active)`}
          >
            <BellRing className={`w-4 h-4 ${activeAlertCount > 0 ? "animate-bounce" : ""}`} />
            {activeAlertCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {activeAlertCount > 9 ? "9+" : activeAlertCount}
              </span>
            )}
          </button>

          {/* Audio Mute/Unmute */}
          <button
            onClick={onToggleAudio}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              audioMuted
                ? "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
            }`}
            title={audioMuted ? "Alarm sound is muted. Click to enable sound." : "Alarm sound is active. Click to mute."}
          >
            {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="border-t border-slate-800/80 bg-slate-950/40 overflow-x-auto scrollbar-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 py-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? "bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
