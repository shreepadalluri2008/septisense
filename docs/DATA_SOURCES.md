# SeptiSense Clinical & Physiological Data Sources

All training and validation data utilized by SeptiSense are real, authentic, legal, and publicly accessible biomedical datasets distributed by PhysioNet under open licenses. **No synthetic, mocked, or fabricated patient data is used in ML training or evaluation.**

---

## 1. PhysioNet/Computing in Cardiology Challenge 2019
- **Title**: Early Prediction of Sepsis from Clinical Data (PhysioNet/CinC Challenge 2019)
- **Version**: 1.0.0
- **URL**: [https://physionet.org/content/challenge-2019/1.0.0/](https://physionet.org/content/challenge-2019/1.0.0/)
- **License**: Open Data Commons Public Domain Dedication and License (PDDL) v1.0
- **Citation**: 
  > Reyna, M., Josef, C., Jeter, R., Shashikumar, S., Moody, B., Westover, M. B., Sharma, A., Nemati, S., & Clifford, G. (2019). Early Prediction of Sepsis from Clinical Data: The PhysioNet/Computing in Cardiology Challenge 2019. *Critical Care Medicine*, 48(2), 210-217.
- **Description**: Hourly physiological and clinical measurements collected from intensive care units (ICUs) across two distinct hospital systems (Hospital System A: 20,336 patients; Hospital System B: 20,000 patients). Used for training and held-out cross-hospital evaluation of Model A (Sepsis Early-Warning Risk).
- **Format**: Pipe-separated values (`.psv`), hourly sampled vitals (HR, O2Sat, Temp, SBP, MAP, DBP, Resp, etc.) with binary `SepsisLabel`.

---

## 2. PhysioNet/Computing in Cardiology Challenge 2017
- **Title**: AF Classification from a Short Single Lead ECG Recording (PhysioNet/CinC Challenge 2017)
- **Version**: 1.0.0
- **URL**: [https://physionet.org/content/challenge-2017/1.0.0/](https://physionet.org/content/challenge-2017/1.0.0/)
- **License**: Open Data Commons Public Domain Dedication and License (PDDL) v1.0
- **Citation**:
  > Clifford, G. D., Liu, C., Moody, B., Lehman, L. H., Silva, I., Li, Q., Johnson, A. E. W., & Mark, R. G. (2017). AF Classification from a Short Single Lead ECG Recording: The PhysioNet/Computing in Cardiology Challenge 2017. *Computing in Cardiology*, 44.
- **Description**: 8,528 single-lead short ECG recordings (sampled at 300 Hz, durations 9–60 seconds) classified into four categories:
  - `N`: Normal sinus rhythm
  - `A`: Atrial Fibrillation (AF)
  - `O`: Other rhythm irregularity
  - `~`: Noisy / unclassified recording
- **Use in SeptiSense**: Training Model B (ECG Signal Quality & Rhythm Classifier) and validating real-time Signal Quality Index (SQI) computation.

---

## 3. MIT-BIH Arrhythmia Database
- **Title**: MIT-BIH Arrhythmia Database
- **Version**: 1.0.0
- **URL**: [https://physionet.org/content/mitdb/1.0.0/](https://physionet.org/content/mitdb/1.0.0/)
- **License**: PhysioNet Open Data License
- **Citation**:
  > Moody, G. B., & Mark, R. G. (2001). The impact of the MIT-BIH Arrhythmia Database. *IEEE Engineering in Medicine and Biology Magazine*, 20(3), 45-50.
  > Goldberger, A., Amaral, L., Glass, L., Hausdorff, J., Ivanov, P. C., Mark, R., Mietus, J. E., Moody, G. B., Peng, C. K., & Stanley, H. E. (2000). PhysioBank, PhysioToolkit, and PhysioNet: Components of a new research resource for complex physiologic signals. *Circulation*, 101(23), e215-e220.
- **Description**: 48 half-hour two-channel ambulatory ECG recordings, fully annotated by expert cardiologists. Used for benchmarking firmware R-peak detector against ground-truth beat annotations (sensitivity and positive predictivity).

---

## 4. MIMIC-IV Clinical Database Demo
- **Title**: MIMIC-IV Clinical Database Demo
- **Version**: 2.2
- **URL**: [https://physionet.org/content/mimic-iv-demo/2.2/](https://physionet.org/content/mimic-iv-demo/2.2/)
- **License**: PhysioNet Credentialed Health Data License 1.5.0 (Demo subset released openly for educational and testing purposes)
- **Citation**:
  > Johnson, A., Bulgarelli, L., Pollard, T., Horng, S., Celi, L. A., & Mark, R. (2023). MIMIC-IV (version 2.2). *PhysioNet*. https://doi.org/10.13026/6mm1-ek67.
- **Description**: De-identified ICU clinical records used for validating demographic integration (Age, Gender) and extended lab references.

---

## 5. BIDMC PPG and Respiration Dataset
- **Title**: BIDMC PPG and Respiration Dataset
- **Version**: 1.0.0
- **URL**: [https://physionet.org/content/bidmc/1.0.0/](https://physionet.org/content/bidmc/1.0.0/)
- **License**: Open Data Commons Public Domain Dedication and License (PDDL) v1.0
- **Citation**:
  > Pimentel, M. A., Johnson, A. E., Charlton, P. H., Birrenkott, D., Watkinson, P. J., Tarassenko, L., & Clifton, D. A. (2016). Toward a Robust Estimation of Respiratory Rate From Pulse Oximeters. *IEEE Transactions on Biomedical Engineering*, 64(8), 1914-1923.
- **Description**: Contains 53 8-minute recordings of physiological signals (PPG, ECG, Respiration rate, Heart rate, and SpO2) acquired from critically ill patients, sampled at 125 Hz.
