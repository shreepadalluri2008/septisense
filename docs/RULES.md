# SeptiSense Clinical Rules & Early Deterioration Thresholds

This document specifies the rule-backed triage logic and physiological thresholds implemented in the SeptiSense alert engine and Care Guidance module. 

> **Important Clinical & Regulatory Notice**:
> SeptiSense is an educational and research prototype. It is NOT a diagnostic device and has not been clinically validated. It does not replace medical consultation, clinical judgment, or emergency services. Never use the word "diagnosis"; use "estimated risk of sepsis-related deterioration within the next N hours".

---

## 1. Physiological Alert Thresholds

All thresholds are derived from standard clinical triage consensus criteria:
- **Systemic Inflammatory Response Syndrome (SIRS)** (Bone et al., *Chest* 1992)
- **quick Sequential Organ Failure Assessment (qSOFA)** (Singer et al., *JAMA* 2016)
- **National Early Warning Score 2 (NEWS2)** (Royal College of Physicians, 2017)

| Parameter | Normal Range | Warning Band | Critical Alert Band | Clinical Reference |
| :--- | :--- | :--- | :--- | :--- |
| **Heart Rate (HR)** | 60–90 bpm | 91–110 bpm or 50–59 bpm | $> 120\text{ bpm}$ or $< 40\text{ bpm}$ | SIRS criteria $> 90\text{ bpm}$; NEWS2 score 3 for HR $\ge 131$ or $\le 40$. |
| **Oxygen Saturation ($\text{SpO}_2$)** | 95–100% | 92–94% | $< 90\%$ | WHO Pulse Oximetry guidelines; NEWS2 score 3 for $\le 91\%$. |
| **Core Body Temperature** | 36.5–37.5 °C | 37.6–38.2 °C or 35.5–36.4 °C | $> 38.5\text{ °C}$ (High fever) or $< 35.5\text{ °C}$ (Hypothermia) | SIRS criteria $> 38.3\text{ °C}$ or $< 36.0\text{ °C}$. Hypothermia carries high sepsis mortality. |
| **Respiratory Rate (Resp)** | 12–18 bpm | 19–21 bpm | $\ge 22\text{ bpm}$ or $< 8\text{ bpm}$ | qSOFA criteria $\ge 22\text{ bpm}$; NEWS2 score 3 for $\ge 25$ or $\le 8$. |
| **Sepsis Model A Risk** | $< 0.0077$ ($< 15\%$) | $15\% - 40\%$ | $\ge 40\%$ | Calibrated early-warning risk threshold from Model A on PhysioNet 2019. |

---

## 2. Signal Quality Index (SQI 0–100) Formulation

SeptiSense rejects hardcoded or faked accuracy values. For every sample, a measurable SQI is computed per sensor channel:

### A. ECG SQI
- **Leads-Off Detection**: If hardware leads-off pins (`LO+`, `LO-`) trigger, $\text{SQI}_{\text{ECG}} = 0$, reason = *"ECG lead detached"*.
- **ADC Saturation**: If $> 5\%$ of samples in a 1-second window reach 0 or 4095 ADC counts, $\text{SQI}_{\text{ECG}}$ penalised by 40, reason = *"ADC saturated / motion clipping"*.
- **Spectral QRS Energy**: Ratio of bandpass energy (5–18 Hz) to high-frequency noise (>35 Hz) and low-frequency baseline drift (<1 Hz).
- **R-Peak Regularity**: Coefficient of variation ($\text{CV}_{\text{RR}}$) plausibility.

### B. Heart Rate Cross-Sensor Agreement
- Compares electrical HR (from ECG R-peaks) against optical HR (from MAX30102 PPG):
  $$\Delta_{\text{HR}} = |\text{HR}_{\text{ECG}} - \text{HR}_{\text{PPG}}|$$
  - $\Delta_{\text{HR}} \le 4\text{ bpm}$: $\text{SQI}_{\text{HR}} = 95 - 100\%$ (Excellent agreement).
  - $5 \le \Delta_{\text{HR}} \le 12\text{ bpm}$: $\text{SQI}_{\text{HR}} = 70 - 85\%$ (Moderate agreement).
  - $\Delta_{\text{HR}} > 12\text{ bpm}$: $\text{SQI}_{\text{HR}} < 50\%$ (Sensor discrepancy / optical artifact).

### C. Pulse Oximetry ($\text{SpO}_2$) SQI
- **Finger Detection**: Optical AC/DC amplitude $> \text{threshold}$. If finger off, $\text{SQI} = 0$, reason = *"Finger not detected on sensor"*.
- **Physiological Sanity**: Rejects impossible values ($< 60\%$ or $> 100\%$).

### D. Temperature SQI
- **Plausibility**: Range must fall within 30.0–43.0 °C.
- **Rate-of-Change Limit**: Body temperature cannot physically shift $> 0.5\text{ °C}$ in 30 seconds; rapid shifts flag sensor dislodgement.

---

## 3. "When to See a Doctor" Triage Logic

The backend Care Guidance module outputs one of three rule-backed recommendation levels:

1. **Seek Urgent Care Now (Level 3 - Critical)**
   - Triggered when:
     - Model A 6-hour sepsis risk $\ge 40\%$, OR
     - $\text{SpO}_2 < 90\%$, OR
     - Core Temp $< 35.5\text{ °C}$ or $> 39.0\text{ °C}$ combined with $\text{HR} > 110\text{ bpm}$, OR
     - Sustained arrhythmia / possible AF detected on ECG alongside abnormal vitals.
   - User-Facing Message:
     > **Urgent Action Needed**: Physiological indicators suggest urgent medical evaluation is required. If you feel confused, very weak, short of breath, or very unwell, call your local emergency number immediately.

2. **See a Doctor Within 24–48 Hours (Level 2 - Warning)**
   - Triggered when:
     - Model A 6-hour sepsis risk is $15\% - 40\%$, OR
     - Sustained moderate tachycardia ($\text{HR} > 100\text{ bpm}$) for $> 2$ hours, OR
     - Low-grade fever ($38.0 - 38.5\text{ °C}$), OR
     - Model B detected possible irregular rhythm (AF / Other) on clean ECG.
   - User-Facing Message:
     > **Medical Review Recommended**: Trends over recent hours show abnormal vitals or rhythm irregularity. Schedule an evaluation with your physician within 24 to 48 hours.

3. **Routine Check-in (Level 1 - Stable)**
   - Vitals remain within baseline physiological limits, Model A risk $< 15\%$, and rhythm is normal sinus.
