import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, AlertCircle } from "lucide-react";

interface ECGWaveformProps {
  ecgSamples: number[]; // stream of 250 Hz ADC or mV samples
  heartRate: number | null;
  rhythmLabel?: string;
  leadsOff: boolean;
  overallSQI: number;
  isFrozen?: boolean;
  onToggleFreeze?: () => void;
}

export const ECGWaveform: React.FC<ECGWaveformProps> = ({
  ecgSamples,
  heartRate,
  rhythmLabel = "Normal Rhythm",
  leadsOff,
  overallSQI,
  isFrozen: externalIsFrozen,
  onToggleFreeze
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Local fallback if not controlled by parent
  const [internalFrozen, setInternalFrozen] = useState(false);
  const isFrozen = externalIsFrozen !== undefined ? externalIsFrozen : internalFrozen;

  const handleToggle = () => {
    if (onToggleFreeze) {
      onToggleFreeze();
    } else {
      setInternalFrozen(!internalFrozen);
    }
  };

  // Calibration state:
  // Gain: 0.5x (5 mm/mV), 1.0x (10 mm/mV - Standard), 2.0x (20 mm/mV)
  const [gain, setGain] = useState<number>(1.0);
  // Speed: 1 = 25 mm/s (Standard 1.0 px/sample), 2 = 50 mm/s (Expanded 2.0 px/sample)
  const [speed, setSpeed] = useState<number>(1);

  const bufferRef = useRef<number[]>([]);

  // Maintain circular buffer of recent samples (up to 3000 samples = 12 seconds at 250 Hz)
  useEffect(() => {
    if (isFrozen) return;
    if (ecgSamples && ecgSamples.length > 0) {
      bufferRef.current.push(...ecgSamples);
      if (bufferRef.current.length > 3000) {
        bufferRef.current = bufferRef.current.slice(-3000);
      }
    }
  }, [ecgSamples, isFrozen]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const baseline = height / 2;

      // 1. Clear background
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, width, height);

      // 2. Draw Medical ECG Grid (Standard 1 mm minor = 10px, 5 mm major = 50px)
      // Minor grid lines (1 mm = 10px, 0.04s at 25 mm/s)
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = "rgba(16, 185, 129, 0.08)";
      ctx.beginPath();
      for (let x = 0; x < width; x += 10) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += 10) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Major grid lines (5 mm = 50px, 0.20s at 25 mm/s)
      ctx.lineWidth = 1.0;
      ctx.strokeStyle = "rgba(16, 185, 129, 0.22)";
      ctx.beginPath();
      for (let x = 0; x < width; x += 50) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += 50) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // 3. Draw Medical Calibration 1 mV Step Pulse at x = 15..50
      // At standard 1.0x (10 mm/mV), 10 mm = 100px on 10px/mm grid (2 large boxes)
      const calibHeight = 80 * gain; // 40px for 0.5x, 80px for 1x, 160px for 2x
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(15, baseline);
      ctx.lineTo(25, baseline);
      ctx.lineTo(25, baseline - calibHeight);
      ctx.lineTo(40, baseline - calibHeight);
      ctx.lineTo(40, baseline);
      ctx.lineTo(52, baseline);
      ctx.stroke();

      // 4. Draw ECG Waveform with Exact Speed & Gain Scaling
      // At 250 Hz:
      // speed === 1 (25 mm/s): dx = 1.0 px/sample (250 px/s = 25 mm/s)
      // speed === 2 (50 mm/s): dx = 2.0 px/sample (500 px/s = 50 mm/s)
      const dx = speed === 1 ? 1.0 : 2.0;
      const buffer = bufferRef.current;

      if (buffer.length > 1 && !leadsOff) {
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = isFrozen ? "#38bdf8" : "#10b981"; // Turns cyan when frozen
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();

        const xStart = 60;
        const availableWidth = width - xStart;
        const visibleSamples = Math.floor(availableWidth / dx);
        const startIndex = Math.max(0, buffer.length - visibleSamples);
        const count = Math.min(buffer.length - startIndex, visibleSamples);

        for (let i = 0; i < count; i++) {
          const sample = buffer[startIndex + i];
          const x = xStart + i * dx;
          // Scale sample centered around baseline
          const normOffset = (sample - 2048) * 0.10 * gain;
          const y = baseline - normOffset;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Glowing phosphor sweep cursor (active when running)
        if (!isFrozen && count > 0) {
          const lastIdx = count - 1;
          const lastX = xStart + lastIdx * dx;
          const lastSample = buffer[startIndex + lastIdx];
          const lastY = baseline - (lastSample - 2048) * 0.10 * gain;

          ctx.shadowColor = "#34d399";
          ctx.shadowBlur = 10;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0; // reset
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isFrozen, gain, speed, leadsOff]);

  return (
    <div className="relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Waveform Controls Header */}
      <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-slate-100 flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isFrozen ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
              }`}
            />
            Lead II Electrocardiogram (250 Hz)
          </span>

          <span className="text-xs px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            {rhythmLabel}
          </span>

          {overallSQI < 60 && (
            <span className="text-xs px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Low SQI: {overallSQI.toFixed(0)}%
            </span>
          )}

          {isFrozen && (
            <span className="text-xs px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold uppercase tracking-wider animate-pulse">
              PAUSED / FROZEN
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Gain selector: 0.5x, 1x, 2x */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 text-xs">
            <span className="text-slate-400 px-1 text-[11px] font-semibold">Gain:</span>
            {[
              { val: 0.5, label: "0.5x (5mm/mV)" },
              { val: 1.0, label: "1x (10mm/mV)" },
              { val: 2.0, label: "2x (20mm/mV)" }
            ].map((g) => (
              <button
                key={g.val}
                type="button"
                onClick={() => setGain(g.val)}
                className={`px-2.5 py-1 rounded font-mono text-xs cursor-pointer transition-all ${
                  gain === g.val
                    ? "bg-cyan-500 text-slate-950 font-extrabold shadow"
                    : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
                title={g.label}
              >
                {g.val}x
              </button>
            ))}
          </div>

          {/* Paper Speed selector: 25 mm/s vs 50 mm/s */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 text-xs">
            <span className="text-slate-400 px-1 text-[11px] font-semibold">Speed:</span>
            {[
              { val: 1, label: "25 mm/s" },
              { val: 2, label: "50 mm/s" }
            ].map((s) => (
              <button
                key={s.val}
                type="button"
                onClick={() => setSpeed(s.val)}
                className={`px-2.5 py-1 rounded font-mono text-xs cursor-pointer transition-all ${
                  speed === s.val
                    ? "bg-cyan-500 text-slate-950 font-extrabold shadow"
                    : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
                title={s.val === 1 ? "Standard clinical speed (25 mm/s)" : "High-speed expanded view (50 mm/s)"}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Freeze / Resume Button */}
          <button
            type="button"
            onClick={handleToggle}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all shadow-md ${
              isFrozen
                ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-2 ring-emerald-400"
                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40"
            }`}
            title={isFrozen ? "Resume real-time telemetry streaming" : "Freeze current patient data on screen"}
          >
            {isFrozen ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>RESUME</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>FREEZE</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="relative w-full h-64 bg-[#090d16]">
        <canvas
          ref={canvasRef}
          width={900}
          height={256}
          className="w-full h-full block"
        />

        {/* 1 mV calibration label */}
        <div className="absolute bottom-2 left-4 text-[11px] text-cyan-400/90 font-mono font-semibold bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
          1 mV = {(10 * gain).toFixed(0)} mm • Speed: {speed === 1 ? "25 mm/s" : "50 mm/s"}
        </div>

        {/* Frozen banner overlay */}
        {isFrozen && (
          <div className="absolute top-2 right-4 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-3 py-1 rounded-md text-xs font-bold font-mono shadow-lg backdrop-blur-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            TELEMETRY FROZEN (INSPECTION MODE)
          </div>
        )}

        {/* Leads-off warning overlay */}
        {leadsOff && (
          <div className="absolute inset-0 bg-rose-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-rose-500/60 rounded-xl px-5 py-4 max-w-md text-center shadow-2xl flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8 text-rose-400 animate-bounce" />
              <h4 className="text-base font-bold text-rose-200">LEADS OFF DETECTED</h4>
              <p className="text-xs text-rose-300/80">
                AD8232 Leads-Off comparator triggered (LOD+ / LOD- high). Verify physical attachment of RA, LA, and RL electrodes.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
