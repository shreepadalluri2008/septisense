# SeptiSense Clinical, Technical & Regulatory Limitations

> **REGULATORY NOTICE:** Educational and research prototype. Not clinically validated. Not a substitute for medical advice.

---

## 1. Population Domain Shift: ICU vs. Ambulatory Wearables

The sepsis prediction model (Model A) was trained and evaluated on 3,000 multi-hour patient trajectories from the **PhysioNet / Computing in Cardiology Challenge 2019** dataset, originating from ICU settings in two large tertiary hospital systems (Hospital System A and Hospital System B).

Deploying this model on a low-voltage wearable or ambulatory research prototype entails critical domain shifts:

1. **Acuity & Comorbidity Bias**:
   - ICU patients exhibit high underlying severity, surgical trauma, mechanical ventilation, and pharmacological interventions (e.g. vasopressors, inotropes, broad-spectrum antibiotics, IV fluid resuscitation).
   - Ambulatory individuals or healthy volunteers have drastically lower baseline risk and vastly different hemodynamic response curves.
2. **Prevalence Distortion**:
   - The ICU training cohort exhibited an hourly sepsis deterioration prevalence of approximately **1.8%**.
   - In ambulatory populations, the prevalence of acute sepsis is several orders of magnitude lower ($<0.05\%$). In such low-prevalence settings, even high-specificity models will generate a higher proportion of false alarms due to the **base-rate fallacy**.
3. **Cross-Hospital Shift**:
   - When Model A was trained on Hospital A and evaluated on Hospital B without retraining, AUROC dropped from **0.7205** to **0.6512**. This ~7% degradation demonstrates significant vulnerability to institutional variation, EHR logging practices, and clinical workflows.

---

## 2. Sensor Physical Limitations & Noise Profiles

| Sensor | Physical Vulnerability | Failure Mode | Mitigation in SeptiSense |
| :--- | :--- | :--- | :--- |
| **AD8232 (ECG)** | Electrode skin impedance, dry skin, sweat, motion artifact | Baseline drift, 50/60 Hz mains hum, EMG muscle tremor | Hardware bandpass (0.5–40 Hz), leads-off detection GPIO (`LOD+`/`LOD-`), real-time ECG SQI scoring |
| **MAX30102 (PPG)** | Peripheral vasoconstriction, hypothermia, motion, skin pigmentation | Low AC pulsatile signal, degraded SNR, missing pulse beats | Optical SQI checks AC/DC ratio; flags `finger_off` if IR amplitude drops below threshold |
| **DS18B20 (Temp)** | Ambient air temperature exposure, poor skin contact | Reading drifts toward room temperature rather than core temperature | SQI penalizes sudden thermal rate-of-change jumps ($>0.5^\circ\text{C}/\text{min}$) |

### Skin Pigmentation & Optical Perfusion (PPG)
Photoplethysmography measures light absorption by hemoglobin. Increased melanin density in deeper skin tones (Fitzpatrick skin types V and VI) increases optical absorption, attenuating red and infrared light penetration. While the MAX30102 dynamically adjusts LED current, optical SpO2 readings in darkly pigmented or hypoperfused individuals may experience degraded signal-to-noise ratios. SeptiSense flags these occurrences via the **Composite SQI** index rather than estimating through noisy signals.

---

## 3. Data Missingness & Imputation Caveats

1. **Forward-Fill (Causal Imputation)**:
   - In clinical retrospective datasets, vital signs are recorded intermittently (e.g. every 1 to 4 hours).
   - SeptiSense applies strictly causal **forward-fill imputation** to prevent future information leakage.
   - However, during real-time ingest, if a sensor disconnects or produces artifactual readings for extended periods, forward-filling stale values will cause the model to make predictions based on outdated physiological states.
2. **Buffer Latency**:
   - The ESP32 telemetry ring buffer stores up to 180 seconds of data during USB disconnections.
   - While this preserves continuous time-series continuity, backlogged records ingested in a burst may cause temporary processing latency before real-time synchronization is restored.

---

## 4. Alarm Fatigue & Decision Threshold Calibration

- In high-acuity environments, frequent non-actionable alarms induce **alarm fatigue**, leading clinicians to silence or ignore alerts.
- SeptiSense implements:
  - A **60-second debounce cache** per alert parameter to prevent repeating identical notifications.
  - A tuned operating threshold of $\tau = 0.0077$, achieving **80.26% sensitivity** but generating **13.04 false alarms per patient-day** in ICU validation cohorts.
- While acceptable for early-stage ICU research trials, 13 alarms/day is excessive for unmonitored home settings. Future research must incorporate contextual individualized baselines.

---

## 5. Regulatory & Clinical Boundary Mandate

1. **No Diagnostic Claim**: SeptiSense is strictly a research and educational prototype. It does not provide medical diagnoses, treatment recommendations, or drug prescriptions.
2. **No Clearance**: This software and hardware design have **NOT** been evaluated, cleared, or approved by the US Food and Drug Administration (FDA), European Medicines Agency (EMA), or any other national medical device regulatory body.
3. **Electrical Safety**: Standard USB host computers connected to unisolated AC mains introduce potential ground loop shock risks through ECG body electrodes. Users must strictly operate the host laptop on battery power with AC chargers unplugged, or use a certified medical-grade USB galvanic isolator.
