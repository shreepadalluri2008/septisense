import React, { useState } from "react";
import { ShieldAlert, BatteryCharging, CheckCircle2, AlertTriangle, Cpu } from "lucide-react";

interface SafetyModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  canDismiss?: boolean;
}

export const SafetyModal: React.FC<SafetyModalProps> = ({ isOpen, onConfirm, canDismiss = false }) => {
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);
  const [check4, setCheck4] = useState(false);

  if (!isOpen) return null;

  const allChecked = check1 && check2 && check3 && check4;

  const handleAcknowledge = () => {
    if (allChecked) {
      localStorage.setItem("septisense_safety_ack", "true");
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-amber-950/60 border-b border-amber-500/30 px-6 py-5 flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-amber-200">
              Mandatory Electrical & Clinical Safety Protocol
            </h2>
            <p className="text-xs text-amber-400/80">
              Strict research prototype compliance protocol – confirmation required before live telemetry ingestion.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-sm text-slate-300">
          <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-rose-200">
              <strong>CRITICAL ELECTRICAL ISOLATION NOTICE:</strong> Electrocardiogram (ECG) electrodes form a low-impedance galvanic path to the human body. Connecting an unisolated host computer connected to AC mains power introduces dangerous mains ground loop shock hazards.
            </p>
          </div>

          <div className="space-y-3.5">
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-amber-500/40 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={check1}
                onChange={(e) => setCheck1(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-400 bg-slate-900 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                  Host Laptop Battery Operation Mandate
                </span>
                <p className="text-xs text-slate-400">
                  I confirm the host laptop is operating <strong>strictly on internal battery power</strong> with the AC mains charger completely unplugged, OR a medical-grade USB galvanic isolator (e.g. ADuM3160) is inline.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-amber-500/40 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={check2}
                onChange={(e) => setCheck2(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-400 bg-slate-900 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  Low-Voltage Transducer Boundaries
                </span>
                <p className="text-xs text-slate-400">
                  I confirm all connected hardware comprises only low-voltage 3.3V DC transducers (AD8232, MAX30102, DS18B20) powered directly from the ESP32 regulated rail. No external high-voltage sources are connected.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-amber-500/40 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={check3}
                onChange={(e) => setCheck3(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-400 bg-slate-900 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-100">
                  Healthy Volunteer & Educational Scope
                </span>
                <p className="text-xs text-slate-400">
                  I confirm this setup is deployed exclusively for educational demonstration, bench research, or non-invasive evaluation on healthy adult volunteers.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-amber-500/40 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={check4}
                onChange={(e) => setCheck4(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-400 bg-slate-900 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-100">
                  Non-Diagnostic Probabilistic Estimation Acknowledgment
                </span>
                <p className="text-xs text-slate-400">
                  I understand SeptiSense outputs <em>probabilistic sepsis-related deterioration risk estimates</em> over a 6-hour predictive horizon, NOT clinical diagnoses. This software is not FDA/CE cleared.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/80 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {allChecked ? "All safety conditions met" : "All 4 checkboxes required to proceed"}
          </span>
          <button
            onClick={handleAcknowledge}
            disabled={!allChecked}
            className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center gap-2 ${
              allChecked
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 cursor-pointer font-semibold"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            I Understand & Confirm Safe Setup
          </button>
        </div>
      </div>
    </div>
  );
};
