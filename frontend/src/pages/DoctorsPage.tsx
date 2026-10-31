import React, { useState, useEffect } from "react";
import { Doctor, Appointment, CareGuidance } from "../types";
import { Stethoscope, Calendar, Clock, AlertTriangle, ShieldCheck, CheckCircle2, UserPlus, Phone, Mail, HelpCircle } from "lucide-react";
import { api } from "../api";

interface DoctorsPageProps {
  patientId: number;
}

export const DoctorsPage: React.FC<DoctorsPageProps> = ({ patientId }) => {
  const [guidance, setGuidance] = useState<CareGuidance | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);

  // New Doctor form
  const [docName, setDocName] = useState("");
  const [docSpec, setDocSpec] = useState("Internal Medicine & Critical Care");
  const [docClinic, setDocClinic] = useState("Metropolitan Health Center");
  const [docPhone, setDocPhone] = useState("+1 (555) 019-2834");

  // New Appt form
  const [apptTime, setApptTime] = useState("");
  const [apptReason, setApptReason] = useState("Routine Follow-Up & Vitals Review");
  const [selectedDocId, setSelectedDocId] = useState<number | undefined>(undefined);

  const loadData = async () => {
    try {
      setLoading(true);
      const [g, d, a] = await Promise.all([
        api.getCareGuidance(patientId),
        api.getDoctors(patientId),
        api.getAppointments(patientId)
      ]);
      setGuidance(g);
      setDoctors(d);
      setAppointments(a);
      if (d.length > 0) setSelectedDocId(d[0].id);
    } catch (err) {
      console.error("Failed to load doctor/guidance data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [patientId]);

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) return;
    try {
      await api.createDoctor(patientId, {
        name: docName,
        specialty: docSpec,
        hospital_clinic: docClinic,
        phone: docPhone
      });
      setShowDoctorModal(false);
      setDocName("");
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptTime) return;
    try {
      await api.createAppointment(patientId, {
        doctor_id: selectedDocId,
        appointment_time: apptTime,
        reason: apptReason
      });
      setShowApptModal(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const triageStyles = {
    1: {
      border: "border-emerald-500/40",
      bg: "bg-emerald-950/20",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      icon: CheckCircle2,
      iconColor: "text-emerald-400"
    },
    2: {
      border: "border-amber-500/50",
      bg: "bg-amber-950/30",
      badge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      icon: AlertTriangle,
      iconColor: "text-amber-400"
    },
    3: {
      border: "border-rose-500/70",
      bg: "bg-rose-950/40 animate-pulse",
      badge: "bg-rose-500/20 text-rose-200 border-rose-500/40",
      icon: AlertTriangle,
      iconColor: "text-rose-400"
    }
  };

  const triageInfo = guidance ? triageStyles[guidance.triage_code as 1 | 2 | 3] || triageStyles[1] : triageStyles[1];
  const TriageIcon = triageInfo.icon;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Clinical Triage Card */}
      {guidance && (
        <div
          className={`border rounded-2xl p-6 shadow-2xl transition-all ${triageInfo.bg} ${triageInfo.border}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-2xl bg-slate-900 border border-slate-700 ${triageInfo.iconColor}`}>
                <TriageIcon className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${triageInfo.badge}`}>
                    {guidance.triage_level}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Evaluation based on 6h deterioration trajectory
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-100 mt-1">
                  {guidance.summary_message}
                </h2>
              </div>
            </div>
          </div>

          {/* Clinical Reasons & Questions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-800">
            {/* Reasons */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Active Clinical Triage Criteria:
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {guidance.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Questions to ask doctor */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                Recommended Questions for Your Physician:
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {guidance.questions_for_doctor.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-emerald-400 font-bold font-mono">Q{i + 1}:</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Primary Actions Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Care Team & Appointments</h2>
            <p className="text-xs text-slate-400">
              Assigned physicians, clinical specialists, and scheduled follow-up visits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDoctorModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-cyan-400" />
            <span>Add Doctor</span>
          </button>

          <button
            onClick={() => setShowApptModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>Schedule Appointment</span>
          </button>
        </div>
      </div>

      {/* Doctors & Appointments Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assigned Physicians */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-cyan-400" />
            Care Team Directory ({doctors.length})
          </h3>

          {doctors.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No healthcare providers registered. Click "Add Doctor" to add a clinician.
            </div>
          ) : (
            <div className="space-y-3">
              {doctors.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">{doc.name}</h4>
                    <p className="text-cyan-400 font-medium">{doc.specialty}</p>
                    {doc.hospital_clinic && (
                      <p className="text-slate-400 mt-0.5">{doc.hospital_clinic}</p>
                    )}
                  </div>

                  <div className="text-slate-300 space-y-1 text-right">
                    {doc.phone && (
                      <p className="flex items-center gap-1.5 justify-end">
                        <Phone className="w-3.5 h-3.5 text-slate-400" /> {doc.phone}
                      </p>
                    )}
                    {doc.email && (
                      <p className="flex items-center gap-1.5 justify-end">
                        <Mail className="w-3.5 h-3.5 text-slate-400" /> {doc.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scheduled Appointments */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Follow-Up Appointments ({appointments.length})
          </h3>

          {appointments.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No appointments scheduled. Click "Schedule Appointment" to book a visit.
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((appt) => (
                <div
                  key={appt.id}
                  className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{appt.reason}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                        {appt.status}
                      </span>
                    </div>
                    <p className="text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      {appt.appointment_time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Doctor Modal */}
      {showDoctorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-100 mb-1">Add Healthcare Provider</h3>
            <p className="text-xs text-slate-400 mb-4">Register a doctor or clinical specialist</p>

            <form onSubmit={handleCreateDoctor} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Doctor Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Robert Chen, MD"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Specialty</label>
                <input
                  type="text"
                  value={docSpec}
                  onChange={(e) => setDocSpec(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Hospital / Clinic</label>
                <input
                  type="text"
                  value={docClinic}
                  onChange={(e) => setDocClinic(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={docPhone}
                  onChange={(e) => setDocPhone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowDoctorModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider transition-all shadow cursor-pointer"
                >
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Appointment Modal */}
      {showApptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full shadow-2xl p-6 text-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-100 mb-1">Schedule Appointment</h3>
            <p className="text-xs text-slate-400 mb-4">Book a consultation or clinical follow-up</p>

            <form onSubmit={handleCreateAppointment} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select Physician</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.specialty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Date & Time</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tomorrow at 10:30 AM, or 2026-11-02 14:00"
                  value={apptTime}
                  onChange={(e) => setApptTime(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Consultation Reason</label>
                <input
                  type="text"
                  required
                  value={apptReason}
                  onChange={(e) => setApptReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowApptModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider transition-all shadow cursor-pointer"
                >
                  Confirm Appointment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
