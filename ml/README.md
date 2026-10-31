# SeptiSense ML Pipeline: Data Ingest, Training & Evaluation

This directory contains the machine learning pipelines for SeptiSense:
1. **Model A (Sepsis Early-Warning Risk Model)**: Built using real hourly ICU vitals from the PhysioNet Computing in Cardiology Challenge 2019. It predicts the probability of sepsis-related clinical deterioration within the next $H$ hours (default $H=6\text{h}$) strictly using past measurements and sensor-feasible features (HR, SpO2, Temperature, Age, Gender, and temporal dynamics).
2. **Model B (ECG Signal Quality & Rhythm Classifier)**: Built using PhysioNet CinC Challenge 2017 single-lead ECG recordings (`training2017`) and the MIT-BIH Arrhythmia Database (`mitdb`) to classify rhythm (Normal, possible AF, Other, Noisy) and compute continuous Signal Quality Indices (SQI).

## Real Datasets Used (No Synthetic Data)

All datasets are authentic, legal, publicly accessible clinical databases from PhysioNet:
- **PhysioNet/CinC Challenge 2019**: Early Prediction of Sepsis from Clinical Data (Hospital Systems A and B).
- **PhysioNet/CinC Challenge 2017**: AF Classification from a Short Single Lead ECG Recording.
- **MIT-BIH Arrhythmia Database (`mitdb`)**: Standard annotated ambulatory 2-channel ECG records.
- **MIMIC-IV Clinical Database Demo v2.2**: Demo ICU cohort.
- **BIDMC PPG and Respiration Dataset (`bidmc`)**: Physiological vitals benchmark.

## Quickstart

### 1. Ingest Raw Datasets
Run the automated downloader:
```bash
python3 ml/download_dataset.py
```
This fetches real data from PhysioNet, validates file integrity, extracts archives into `ml/data/raw/`, and generates `ml/data/raw/MANIFEST.json`.

### 2. Run MATLAB Export (Optional)
If running MATLAB workflows alongside Python:
```matlab
% In MATLAB, navigate to ml/matlab/
ReadPhysionetData
```
This script exports the 2017 ECG `.mat` signals to standardized CSV / NPY arrays.

### 3. Train Model A (Sepsis Risk)
```bash
python3 ml/src/train_sepsis_model.py
```

### 4. Train Model B (ECG Quality & Rhythm)
```bash
python3 ml/src/train_ecg_model.py
```
