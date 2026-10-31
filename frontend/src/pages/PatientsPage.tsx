import React, { useState } from "react";
import { Patient } from "../types";
import { Users, UserPlus, Check, Cpu, Heart, Activity } from "lucide-react";

interface PatientsPageProps {
  patients: Patient[];
  selectedPatientId: number;
  onSelectPatient: (patientId: number) => void;
  onCreatePatient: (data: Partial<Patient>) => Promise<void>;
}

export const PatientsPage: React.FC<PatientsPageProps> = ({
  patients,
  selectedPatientId,
  onSelectPatient,
  onCreatePatient
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState<number>(65);
  const [gender, setGender] = useState<number>(1);
  const [deviceId, setDeviceId] = useState("esp32-01");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onCreatePatient({
        name,
        age,
        gender,
        assigned_device_id: deviceId,
        notes
      });
      setShowAddModal(false);
      setName("");
      setNotes("");
    } catch (err) {
      console.error("Failed to create patient", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Patient Directory & Cohort Management</h2>
            <p className="text-xs text-slate-400">
              Manage monitored individuals, assign hardware telemetry nodes, and isolate patient streams
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Monitored Patient</span>
        </button>
      </div>

      {/* Patient Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {patients.map((p) => {
          const isSelected = p.id === selectedPatientId;
          return (
            <div
              key={p.id}
              className={`bg-slate-900/90 border rounded-2xl p-6 shadow-xl transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? "border-cyan-500/80 shadow-cyan-500/10 ring-2 ring-cyan-500/30"
                  : "border-slate-800 hover:border-slate-700"
              }`}
              onClick={() => onSelectPatient(p.id)}
            >
              {isSelected && (
                <div className="absolute top-0 right-0 bg-cyan-500 text-slate-950 px-3 py-1 rounded-bl-xl text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow">
                  <Check className="w-3 h-3 stroke-[3]" /> Active Monitor
                </div>
              )}

              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-600/30 to-blue-600/30 border border-cyan-500/30 flex items-center justify-center font-bold text-cyan-300 text-base">
                    #{p.id}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-100">{p.name}</h3>
                    <p className="text-xs text-slate-400">
                      {p.age} years old • {p.gender === 1 ? "Male" : "Female"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" /> Assigned Node:
                    </span>
                    <span className="font-mono font-semibold text-slate-200">
                      {p.assigned_device_id || "Unassigned"}
                    </span>
                  </div>

                  {p.notes && (
                    <div className="p-2.5 rounded-lg bg-slate-800/40 text-slate-400 text-xs italic">
                      "{p.notes}"
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Enrolled: {new Date(p.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPatient(p.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  }`}
                >
                  {isSelected ? "Currently Viewing" : "Switch View"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Patient Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-100 mb-1">Enroll New Monitored Patient</h3>
            <p className="text-xs text-slate-400 mb-4">
              Add a patient record for demographic feature scaling and telemetry attribution
            </p>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Eleanor Vance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Age (Years)</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                  >
                    <option value={1}>Male</option>
                    <option value={0}>Female</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Assigned Telemetry Device</label>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Clinical Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Post-operative observation, healthy control volunteer"
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
                  {submitting ? "Saving..." : "Enroll Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
