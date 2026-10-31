#!/usr/bin/env python3
"""
SeptiSense Exploratory Data Analysis (EDA)
Computes real physiological distributions, missingness patterns, and sepsis prevalence
across Hospital System A and Hospital System B from PhysioNet CinC 2019,
as well as rhythm distribution from PhysioNet CinC 2017 ECG.
"""

import os
import json
import numpy as np
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
REPORTS_DIR = BASE_DIR / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

def analyze_sepsis_set(folder: Path, system_name: str, max_patients: int = 1500):
    files = sorted(list(folder.glob("*.psv")))[:max_patients]
    total_patients = len(files)
    total_hours = 0
    sepsis_patients = 0
    total_positive_hours = 0
    
    # Track vital values
    vitals = {"HR": [], "O2Sat": [], "Temp": [], "Resp": [], "Age": [], "Gender": []}
    missing_counts = {"HR": 0, "O2Sat": 0, "Temp": 0, "Resp": 0}
    los_list = []
    
    for f in files:
        df = pd.read_csv(f, sep="|")
        n_rows = len(df)
        total_hours += n_rows
        los_list.append(n_rows)
        
        has_sepsis = (df["SepsisLabel"] == 1).any()
        if has_sepsis:
            sepsis_patients += 1
            total_positive_hours += int((df["SepsisLabel"] == 1).sum())
            
        for col in ["HR", "O2Sat", "Temp", "Resp"]:
            if col in df.columns:
                valid = df[col].dropna()
                missing_counts[col] += (n_rows - len(valid))
                if len(valid) > 0:
                    # Sample up to 10 points per patient to avoid memory bloat
                    vitals[col].extend(valid.iloc[::max(1, len(valid)//10)].tolist())
                    
        if "Age" in df.columns and len(df["Age"].dropna()) > 0:
            vitals["Age"].append(float(df["Age"].dropna().iloc[0]))
        if "Gender" in df.columns and len(df["Gender"].dropna()) > 0:
            vitals["Gender"].append(float(df["Gender"].dropna().iloc[0]))
            
    summary = {
        "hospital_system": system_name,
        "patients_count": total_patients,
        "total_icu_hours": total_hours,
        "mean_los_hours": float(np.mean(los_list)) if los_list else 0.0,
        "median_los_hours": float(np.median(los_list)) if los_list else 0.0,
        "sepsis_patient_count": sepsis_patients,
        "sepsis_patient_prevalence_pct": round(float(sepsis_patients / total_patients * 100), 2) if total_patients else 0,
        "sepsis_positive_hours_pct": round(float(total_positive_hours / total_hours * 100), 2) if total_hours else 0,
        "missingness_rates_pct": {
            k: round(float(missing_counts[k] / total_hours * 100), 2) for k in missing_counts
        },
        "vitals_stats": {
            k: {
                "mean": round(float(np.mean(vals)), 2) if vals else None,
                "median": round(float(np.median(vals)), 2) if vals else None,
                "std": round(float(np.std(vals)), 2) if vals else None,
                "min": round(float(np.min(vals)), 2) if vals else None,
                "max": round(float(np.max(vals)), 2) if vals else None,
            }
            for k, vals in vitals.items() if k in ["HR", "O2Sat", "Temp", "Resp", "Age"]
        },
        "male_ratio_pct": round(float(np.mean(vitals["Gender"]) * 100), 1) if vitals["Gender"] else None
    }
    return summary

def analyze_ecg_dataset():
    ref_file = RAW_DIR / "challenge-2017" / "REFERENCE-v3.csv"
    if not ref_file.exists():
        return {"status": "REFERENCE-v3.csv not found"}
        
    df = pd.read_csv(ref_file, header=None, names=["record", "label"])
    counts = df["label"].value_counts().to_dict()
    total = len(df)
    
    label_map = {
        "N": "Normal Sinus Rhythm",
        "A": "Atrial Fibrillation (AF)",
        "O": "Other Rhythm Irregularity",
        "~": "Noisy / Uninterpretable"
    }
    
    dist = {}
    for code, count in counts.items():
        name = label_map.get(code, code)
        dist[f"{name} ({code})"] = {
            "count": int(count),
            "percentage": round(count / total * 100, 2)
        }
        
    return {
        "total_ecg_recordings": total,
        "rhythm_class_distribution": dist
    }

def main():
    print("="*70)
    print(" SeptiSense Clinical Data Exploratory Analysis")
    print("="*70)
    
    setA_dir = RAW_DIR / "challenge-2019" / "training_setA"
    setB_dir = RAW_DIR / "challenge-2019" / "training_setB"
    
    print("\n[1/3] Analyzing Hospital System A...")
    eda_a = analyze_sepsis_set(setA_dir, "Hospital System A")
    
    print("[2/3] Analyzing Hospital System B...")
    eda_b = analyze_sepsis_set(setB_dir, "Hospital System B")
    
    print("[3/3] Analyzing CinC 2017 ECG Recordings...")
    eda_ecg = analyze_ecg_dataset()
    
    eda_report = {
        "title": "SeptiSense Real Clinical Data EDA Summary",
        "hospital_system_A": eda_a,
        "hospital_system_B": eda_b,
        "ecg_challenge_2017": eda_ecg
    }
    
    out_file = REPORTS_DIR / "eda_summary.json"
    with open(out_file, "w") as f:
        json.dump(eda_report, f, indent=2)
        
    print(f"\nSaved comprehensive EDA report to: {out_file}\n")
    print("=== SUMMARY METRICS ===")
    print(f"Hospital A Patients: {eda_a['patients_count']} | Sepsis Prevalence: {eda_a['sepsis_patient_prevalence_pct']}% ({eda_a['sepsis_patient_count']} patients)")
    print(f"Hospital B Patients: {eda_b['patients_count']} | Sepsis Prevalence: {eda_b['sepsis_patient_prevalence_pct']}% ({eda_b['sepsis_patient_count']} patients)")
    print(f"Vitals Missingness (Hospital A): HR {eda_a['missingness_rates_pct']['HR']}%, O2Sat {eda_a['missingness_rates_pct']['O2Sat']}%, Temp {eda_a['missingness_rates_pct']['Temp']}%")
    print(f"Vitals Missingness (Hospital B): HR {eda_b['missingness_rates_pct']['HR']}%, O2Sat {eda_b['missingness_rates_pct']['O2Sat']}%, Temp {eda_b['missingness_rates_pct']['Temp']}%")
    print(f"Total Challenge 2017 ECG Recordings: {eda_ecg.get('total_ecg_recordings')}")
    for k, v in eda_ecg.get("rhythm_class_distribution", {}).items():
        print(f"  * {k}: {v['count']} ({v['percentage']}%)")

if __name__ == "__main__":
    main()
