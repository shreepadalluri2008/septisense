import React, { useState, useEffect } from "react";
import { Medicine } from "../types";
import { Pill, Plus, CheckCircle2, Clock, AlertCircle, Info, ShieldAlert } from "lucide-react";
import { api } from "../api";

interface MedicinesPageProps {
  patientId: number;
}

export const MedicinesPage: React.FC<MedicinesPageProps> = ({ patientId }) => {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("Twice daily (BID)");
  const [times, setTimes] = useState("08:00, 20:00");
  const [doctor, setDoctor] = useState("Dr. Sarah Jenkins, MD");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadMeds = async () => {
    try {
      setLoading(true);
      const data = await api.getMedicines(patientId);
      setMedicines(data);
    } catch (err) {
      console.error("Failed to load medicines", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeds();
  }, [patientId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await api.createMedicine(patientId, {
        name,
        dose,
        frequency,
        schedule_times: times.split(",").map((s) => s.trim()),
        prescribing_doctor: doctor,
        notes
      });
      setShowAddModal(false);
      setName("");
      setDose("");
      setNotes("");
      loadMeds();
    } catch (err) {
      console.error("Failed to add medicine", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Disclaimer Banner */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold">MANDATORY MEDICATION PROTOCOL:</strong> The SeptiSense Care Assistant strictly does NOT prescribe, recommend, or modify pharmaceutical dosages. This module serves exclusively for adherence scheduling and clinician record-keeping.
        </div>
      </div>

      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20">
            <Pill className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Medication Schedule & Adherence</h2>
            <p className="text-xs text-slate-400">
              Track prescribed regimens, dosing intervals, and patient adherence timeline
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Prescribed Medication</span>
        </button>
      </div>

      {/* Medications List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading medication schedule...</div>
        ) : medicines.length === 0 ? (
          <div className="bg-slate-900/90 border border-dashed border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
            <Pill className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No medications logged for Patient #{patientId}. Click "Add Prescribed Medication" to enter an existing physician prescription.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {medicines.map((med) => (
              <div
                key={med.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-pink-400">
                      <Pill className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-slate-100">{med.name}</h3>
                      <p className="text-xs text-cyan-400 font-mono font-semibold">{med.dose}</p>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {med.adherence_pct}% Adherence
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                    <span className="text-slate-400">Frequency:</span>
                    <span className="font-semibold text-slate-200">{med.frequency}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                    <span className="text-slate-400">Schedule:</span>
                    <span className="font-mono text-cyan-300">
                      {med.schedule_times.join(" • ")}
                    </span>
                  </div>

                  {med.prescribing_doctor && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                      <span className="text-slate-400">Prescribing Doctor:</span>
                      <span className="text-slate-300">{med.prescribing_doctor}</span>
                    </div>
                  )}

                  {med.notes && (
                    <div className="p-2.5 rounded-lg bg-slate-800/40 text-slate-400 text-xs italic">
                      "{med.notes}"
                    </div>
                  )}
                </div>

                {/* Adherence Bar */}
                <div className="pt-2">
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>30-Day Dosing Compliance</span>
                    <span className="font-mono text-emerald-400">{med.adherence_pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${med.adherence_pct}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Medication Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-100 mb-1">Log Existing Prescription</h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter details from the patient's existing licensed prescription
            </p>

            <form onSubmit={handleAdd} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Medication Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amoxicillin, Piperacillin, Metoprolol"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Dose</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 500 mg, 25 mcg"
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Frequency</label>
                  <input
                    type="text"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Scheduled Times (comma-separated 24h)</label>
                <input
                  type="text"
                  value={times}
                  onChange={(e) => setTimes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Prescribing Doctor</label>
                <input
                  type="text"
                  value={doctor}
                  onChange={(e) => setDoctor(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Instructions / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Take with food, finish full 10-day course"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider transition-all shadow cursor-pointer disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Add Medication"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
