/**
 * Universal Portable ESP32 Serial Line Parser & Live Risk Estimator
 *
 * Supports all ESP32 serial output formats (including the exact schema in server.py):
 *  1. server.py batch or single record JSON:
 *     {"device_id":"septisense-01","sent_ms":12000,"records":[{"t":11000,"mlx":1,"tOK":1,"obj":35.4,"amb":26.1,"led":1,"max":1,"fin":1,"hrOK":1,"hr":78,"spo2OK":1,"spo2":98,"ecgOK":1,"ecg":76,"ecgQ":90,"lo":0}]}
 *  2. Flat JSON from ESP32 (MLX90614 + MAX30102 + AD8232):
 *     {"hr": 78, "ecg_bpm": 76, "spo2": 98, "obj": 35.4, "amb": 26.1, "led": 1, "finger": 1, "lead_off": 0}
 *  3. SeptiSense TelemetryPayload JSON:
 *     {"hr_bpm": 78, "spo2_pct": 98, "temp_c": 36.6, "ecg_hr": 76, "ecg": [...]}
 *  4. Nested measurements JSON:
 *     {"measurements": {"heart_rate_bpm": 78, "spo2_percent": 98, "temperature_c": 36.6, "ecg": {"samples": [...]}}}
 *  5. Key-Value / Arduino Serial.print lines (MAX30102, MLX90614, AD8232, custom):
 *     - "HR: 78 bpm | ECG: 76 | SpO2: 98% | Temp: 35.4 C | Amb: 26.1 C | LED: ON"
 *     - "obj=35.4 amb=26.1 led=1 fin=1 hr=78 spo2=98 ecg=76 lo=0"
 *     - "IR=52340, BPM=78, Avg BPM=77, SpO2=98%"
 *     - "Ambient = 26.1*C   Object = 35.4*C"
 *  6. Comma-separated values:
 *     - "78,98,35.4" or "78,76,98,35.4,26.1"
 */

export interface ParsedEsp32Reading {
  hr: number | null;
  ecg_bpm: number | null;
  spo2: number | null;
  obj: number | null; // surface/object temperature (°C)
  amb: number | null; // ambient temperature (°C)
  led: boolean | null;
  finger: boolean | null;
  lead_off: boolean | null;
  mlx_ok?: boolean;
  max_ok?: boolean;
  ecg_samples?: number[];
  raw_line?: string;
}

function toFiniteNumber(val: any): number | null {
  if (val === null || val === undefined || val === "" || typeof val === "boolean") {
    return null;
  }
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return n;
}

function validHr(val: any): number | null {
  const n = toFiniteNumber(val);
  if (n === null || n < 30 || n > 240) return null;
  return Math.round(n * 10) / 10;
}

function validSpo2(val: any): number | null {
  const n = toFiniteNumber(val);
  if (n === null || n < 50 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

function validTemp(val: any): number | null {
  const n = toFiniteNumber(val);
  // Matches server.py num_or_none(obj, -20, 80)
  if (n === null || n < -20 || n > 80) return null;
  return Math.round(n * 100) / 100;
}

function toBool(val: any): boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val > 0;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (["1", "true", "on", "yes", "ok", "detected", "attached"].includes(s)) return true;
    if (["0", "false", "off", "no", "none", "detached"].includes(s)) return false;
  }
  return null;
}

/**
 * Parses a single line of serial text (JSON, key-value, or CSV) from the ESP32.
 * Returns null if no recognizable sensor reading is present in the line.
 */
export function parseEsp32SerialLine(line: string): Partial<ParsedEsp32Reading> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 1. Check if line contains a JSON object
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const obj = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));

      // Support server.py batch format: {"device_id":..., "records":[...]}
      let meas = obj;
      if (Array.isArray(obj.records) && obj.records.length > 0) {
        meas = obj.records[obj.records.length - 1];
      } else if (obj.measurements || obj.telemetry || obj.vitals) {
        meas = obj.measurements || obj.telemetry || obj.vitals;
      }

      const flags = obj.flags || meas.flags || {};
      const hrOK = meas.hrOK !== undefined ? Boolean(meas.hrOK) : true;
      const spo2OK = meas.spo2OK !== undefined ? Boolean(meas.spo2OK) : true;
      const ecgOK = meas.ecgOK !== undefined ? Boolean(meas.ecgOK) : true;
      const tOK = meas.tOK !== undefined ? Boolean(meas.tOK) : true;

      const hr = hrOK
        ? validHr(meas.hr) ??
          validHr(meas.hr_bpm) ??
          validHr(meas.heart_rate_bpm) ??
          validHr(meas.heart_rate) ??
          validHr(meas.bpm) ??
          validHr(meas.avg_bpm) ??
          validHr(obj.hr) ??
          validHr(obj.hr_bpm)
        : null;

      // In server.py ESP32 records, 'ecg' is a numeric BPM value!
      const numericEcg =
        !Array.isArray(meas.ecg) && typeof meas.ecg !== "object"
          ? validHr(meas.ecg)
          : null;

      const ecg_bpm = ecgOK
        ? numericEcg ??
          validHr(meas.ecg_bpm) ??
          validHr(meas.ecg_hr) ??
          validHr(obj.ecg_bpm) ??
          validHr(obj.ecg_hr)
        : null;

      const spo2 = spo2OK
        ? validSpo2(meas.spo2) ??
          validSpo2(meas.spo2_pct) ??
          validSpo2(meas.spo2_percent) ??
          validSpo2(meas.o2sat) ??
          validSpo2(obj.spo2) ??
          validSpo2(obj.spo2_pct)
        : null;

      const tempObj = tOK
        ? validTemp(meas.obj) ??
          validTemp(meas.temp_c) ??
          validTemp(meas.temperature_c) ??
          validTemp(meas.temp) ??
          validTemp(meas.object_temp) ??
          validTemp(meas.skin_temp) ??
          validTemp(obj.obj) ??
          validTemp(obj.temp_c) ??
          validTemp(obj.temp)
        : null;

      const amb = tOK
        ? validTemp(meas.amb) ??
          validTemp(meas.ambient) ??
          validTemp(meas.ambient_c) ??
          validTemp(meas.ambient_temp) ??
          validTemp(obj.amb)
        : null;

      const finger =
        toBool(meas.fin) ??
        toBool(meas.finger) ??
        toBool(meas.finger_present) ??
        (flags.finger_off !== undefined ? !Boolean(flags.finger_off) : null) ??
        toBool(obj.fin) ??
        toBool(obj.finger);

      const lead_off =
        toBool(meas.lo) ??
        toBool(meas.lead_off) ??
        toBool(flags.leads_off) ??
        (meas.ecg && typeof meas.ecg === "object" && meas.ecg.leads_attached !== undefined
          ? !Boolean(meas.ecg.leads_attached)
          : null) ??
        toBool(obj.lo) ??
        toBool(obj.lead_off);

      const led =
        toBool(meas.led) ??
        toBool(obj.led) ??
        (tempObj !== null ? tempObj >= 25.0 : null);

      const mlx_ok = toBool(meas.mlx) ?? toBool(meas.mlx_ok) ?? (tempObj !== null ? true : undefined);
      const max_ok = toBool(meas.max) ?? toBool(meas.max_ok) ?? (hr !== null || spo2 !== null ? true : undefined);

      let ecg_samples: number[] | undefined;
      if (Array.isArray(meas.ecg)) {
        ecg_samples = meas.ecg.map(Number).filter((n: number) => Number.isFinite(n));
      } else if (meas.ecg && Array.isArray(meas.ecg.samples)) {
        ecg_samples = meas.ecg.samples.map((v: number) => Math.round(v * 1000 + 2048));
      } else if (Array.isArray(obj.ecg_preview)) {
        ecg_samples = obj.ecg_preview;
      }

      if (
        hr !== null ||
        ecg_bpm !== null ||
        spo2 !== null ||
        tempObj !== null ||
        amb !== null ||
        finger !== null ||
        lead_off !== null ||
        mlx_ok !== undefined ||
        max_ok !== undefined ||
        (ecg_samples && ecg_samples.length > 0)
      ) {
        return {
          hr,
          ecg_bpm,
          spo2,
          obj: tempObj,
          amb,
          led,
          finger: finger ?? (hr !== null || spo2 !== null ? true : null),
          lead_off,
          mlx_ok: mlx_ok ?? undefined,
          max_ok: max_ok ?? undefined,
          ecg_samples,
          raw_line: trimmed
        };
      }
    } catch {
      // Fall through to text / regex parsing
    }
  }

  // 2. Key-Value / Printf text lines from Arduino / ESP32 Serial Monitor
  const result: Partial<ParsedEsp32Reading> = { raw_line: trimmed };
  let matched = false;

  const hrMatch =
    trimmed.match(/(?:avg\s*bpm|heart\s*rate|hr_bpm|\bhr\b|\bbpm\b)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  if (hrMatch) {
    const v = validHr(hrMatch[1]);
    if (v !== null) {
      result.hr = v;
      matched = true;
    }
  }

  const ecgMatch =
    trimmed.match(/(?:ecg_bpm|ecg_hr|ecg\s*bpm|\becg\b)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  if (ecgMatch) {
    const v = validHr(ecgMatch[1]);
    if (v !== null) {
      result.ecg_bpm = v;
      matched = true;
    }
  }

  const spo2Match =
    trimmed.match(/(?:spo2_pct|spo2|o2sat|oxygen)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  if (spo2Match) {
    const v = validSpo2(spo2Match[1]);
    if (v !== null) {
      result.spo2 = v;
      matched = true;
    }
  }

  const tempMatch =
    trimmed.match(/(?:object\s*temp|surface\s*temp|body\s*temp|temp_c|temperature|\bobj\b|\btemp\b)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  if (tempMatch) {
    const v = validTemp(tempMatch[1]);
    if (v !== null) {
      result.obj = v;
      matched = true;
    }
  }

  const ambMatch =
    trimmed.match(/(?:ambient\s*temp|ambient|\bamb\b)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  if (ambMatch) {
    const v = validTemp(ambMatch[1]);
    if (v !== null) {
      result.amb = v;
      matched = true;
    }
  }

  if (/no\s*finger/i.test(trimmed)) {
    result.finger = false;
    matched = true;
  } else {
    const fingerMatch = trimmed.match(/(?:finger(?:_present)?|\bfin\b)\s*[:=]\s*(true|false|yes|no|1|0|on|off)/i);
    if (fingerMatch) {
      result.finger = toBool(fingerMatch[1]);
      matched = true;
    }
  }

  if (/leads?\s*off/i.test(trimmed)) {
    result.lead_off = true;
    matched = true;
  } else if (/leads?\s*on/i.test(trimmed)) {
    result.lead_off = false;
    matched = true;
  } else {
    const leadMatch = trimmed.match(/(?:lead_?off|\blo\b)\s*[:=]\s*(true|false|yes|no|1|0)/i);
    if (leadMatch) {
      result.lead_off = toBool(leadMatch[1]);
      matched = true;
    }
  }

  const ledMatch = trimmed.match(/\bled\b\s*[:=]\s*(on|off|true|false|1|0)/i);
  if (ledMatch) {
    result.led = toBool(ledMatch[1]);
    matched = true;
  }

  if (matched) {
    if (result.led === undefined && result.obj !== undefined && result.obj !== null) {
      result.led = result.obj >= 25.0;
    }
    if (result.finger === undefined && (result.hr != null || result.spo2 != null)) {
      result.finger = true;
    }
    return result;
  }

  // 3. Fallback: Pure CSV of 3 to 5 numbers (e.g. "78,98,35.4" or "78,76,98,35.4,26.1")
  const parts = trimmed.split(/[,\t;]+/).map((s) => s.trim());
  if (parts.length >= 3 && parts.length <= 6 && parts.every((p) => /^-?\d+(?:\.\d+)?$/.test(p))) {
    const nums = parts.map(Number);
    if (parts.length === 3) {
      const hr = validHr(nums[0]);
      const spo2 = validSpo2(nums[1]);
      const obj = validTemp(nums[2]);
      if (hr !== null || spo2 !== null || obj !== null) {
        return {
          hr,
          ecg_bpm: null,
          spo2,
          obj,
          amb: null,
          led: obj !== null ? obj >= 25.0 : null,
          finger: hr !== null || spo2 !== null,
          lead_off: false,
          raw_line: trimmed
        };
      }
    } else if (parts.length >= 4) {
      const hr = validHr(nums[0]);
      const ecg_bpm = validHr(nums[1]);
      const spo2 = validSpo2(nums[2]);
      const obj = validTemp(nums[3]);
      const amb = parts.length >= 5 ? validTemp(nums[4]) : null;
      if (hr !== null || spo2 !== null || obj !== null) {
        return {
          hr,
          ecg_bpm,
          spo2,
          obj,
          amb,
          led: obj !== null ? obj >= 25.0 : null,
          finger: hr !== null || spo2 !== null,
          lead_off: false,
          raw_line: trimmed
        };
      }
    }
  }

  return null;
}

/**
 * Computes the estimated 6-hour sepsis deterioration risk (0..1)
 * from live HR, SpO2, and Temperature (with surface-to-core offset),
 * matching the ESP32 prototype's clinical feature scoring when running portably.
 */
export function computePortableSepsisRisk(
  hr: number | null,
  ecgBpm: number | null,
  spo2: number | null,
  surfaceTempC: number | null,
  tempOffsetC = 0.0,
  alertThreshold = 0.0122
): {
  status: "ok" | "waiting";
  risk: number | null;
  level: "LOW" | "ELEVATED" | "HIGH";
  inputs: { HR: number; O2Sat: number; Temp_model_input: number } | null;
  reason?: string;
} {
  const effectiveHr = hr ?? ecgBpm;
  if (effectiveHr === null && spo2 === null && surfaceTempC === null) {
    return {
      status: "waiting",
      risk: null,
      level: "LOW",
      inputs: null,
      reason: "Waiting for valid sensor readings from human subject..."
    };
  }

  const hrInput = effectiveHr ?? 78;
  const spo2Input = spo2 ?? 98;
  const rawTemp = surfaceTempC ?? 36.6;
  const modelTemp = Math.round((rawTemp + tempOffsetC) * 100) / 100;

  let logit = -4.6;
  if (hrInput > 90) logit += (hrInput - 90) * 0.065;
  if (hrInput > 110) logit += (hrInput - 110) * 0.05;
  if (hrInput < 55) logit += (55 - hrInput) * 0.05;

  if (spo2Input < 95) logit += (95 - spo2Input) * 0.28;
  if (spo2Input < 90) logit += (90 - spo2Input) * 0.35;

  if (modelTemp > 38.0) logit += (modelTemp - 38.0) * 1.1;
  if (modelTemp < 36.0) logit += (36.0 - modelTemp) * 0.45;

  const prob = 1 / (1 + Math.exp(-logit));
  const clamped = Math.max(0.002, Math.min(0.99, prob));

  const level: "LOW" | "ELEVATED" | "HIGH" =
    clamped >= alertThreshold
      ? "HIGH"
      : clamped >= alertThreshold * 0.5
      ? "ELEVATED"
      : "LOW";

  return {
    status: "ok",
    risk: clamped,
    level,
    inputs: {
      HR: Math.round(hrInput * 10) / 10,
      O2Sat: Math.round(spo2Input * 10) / 10,
      Temp_model_input: modelTemp
    }
  };
}

/**
 * Synthesizes a realistic 250Hz ECG preview waveform array aligned to the human's actual HR
 * when the ESP32 sends heart rate (HR / ECG BPM) without raw 250Hz ADC arrays.
 */
export function synthesizeEcgWaveFromHr(bpm: number | null, leadsOff = false): number[] {
  const N = 250;
  if (leadsOff || !bpm || bpm <= 20) {
    return Array.from({ length: N }, () => 2048);
  }
  const rrSec = 60.0 / Math.max(40, Math.min(200, bpm));
  const out: number[] = [];
  const phaseOffset = (Date.now() / 1000) % rrSec;
  for (let i = 0; i < N; i++) {
    const t = i / 250.0 + phaseOffset;
    const phase = (t % rrSec) / rrSec;
    let v = 0;
    if (phase < 0.04) v = Math.sin((phase / 0.04) * Math.PI) * 0.12;
    else if (phase >= 0.08 && phase < 0.10) v = -((phase - 0.08) / 0.02) * 0.18;
    else if (phase >= 0.10 && phase < 0.13) v = -0.18 + ((phase - 0.10) / 0.03) * 1.45;
    else if (phase >= 0.13 && phase < 0.16) v = 1.27 - ((phase - 0.13) / 0.03) * 1.55;
    else if (phase >= 0.16 && phase < 0.19) v = -0.28 + ((phase - 0.16) / 0.03) * 0.28;
    else if (phase >= 0.32 && phase < 0.50) v = Math.sin(((phase - 0.32) / 0.18) * Math.PI) * 0.22;
    out.push(Math.round(2048 + v * 750));
  }
  return out;
}
