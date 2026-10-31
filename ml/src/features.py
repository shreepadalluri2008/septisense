"""
SeptiSense Feature Engineering & Target Definition Module (Fully Vectorized)
Strict causal time-series feature engineering for sepsis early-warning risk.
Supports:
1. SENSOR_FEASIBLE features (HR, O2Sat, Temp, Resp, Age, Gender, SIRS markers + 1h, 3h, 6h dynamics)
2. FULL_VITALS features (all ICU vitals, labs, Shock Index, qSOFA markers)

Zero data leakage: only past observations (t' <= t) are ever used.
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Optional

SENSOR_VITALS = ["HR", "O2Sat", "Temp", "Resp"]

ALL_CLINICAL_COLS = [
    "HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp", "EtCO2",
    "BaseExcess", "HCO3", "FiO2", "pH", "PaCO2", "SaO2", "AST", "BUN",
    "Alkalinephos", "Calcium", "Chloride", "Creatinine", "Bilirubin_direct",
    "Glucose", "Lactate", "Magnesium", "Phosphate", "Potassium",
    "Bilirubin_total", "TroponinI", "Hct", "Hgb", "PTT", "WBC",
    "Fibrinogen", "Platelets", "Age", "Gender"
]

def define_early_warning_target(raw_labels: np.ndarray, horizon: int = 6) -> np.ndarray:
    """
    Defines early-warning target y_t for a single patient time-series:
    - y_t = 1 for t in [max(0, t_onset - horizon), t_onset - 1]
    - y_t = NaN for t >= t_onset (post-onset hours excluded from negative controls)
    - y_t = 0 for t < t_onset - horizon
    - For patients who never develop sepsis, y_t = 0 for all t
    """
    n = len(raw_labels)
    target = np.zeros(n, dtype=np.float32)
    onset_idx = np.where(raw_labels == 1)[0]
    
    if len(onset_idx) > 0:
        first_onset = onset_idx[0]
        start_ew = max(0, first_onset - horizon)
        target[start_ew:first_onset] = 1.0
        target[first_onset:] = np.nan
    else:
        target[:] = 0.0
        
    return target

def extract_patient_features_vectorized(
    df: pd.DataFrame,
    patient_id: str,
    feature_mode: str = "sensor_feasible",
    horizon: int = 6
) -> pd.DataFrame:
    """
    Computes rolling and physiological trend features for a patient using vectorized operations.
    Runs in ~1-2 ms per patient.
    """
    n = len(df)
    target = define_early_warning_target(df["SepsisLabel"].values, horizon=horizon)
    
    # Demographics
    age = float(df["Age"].dropna().iloc[0]) if "Age" in df.columns and len(df["Age"].dropna()) > 0 else 60.0
    gender = float(df["Gender"].dropna().iloc[0]) if "Gender" in df.columns and len(df["Gender"].dropna()) > 0 else 0.0
    iculos = df["ICULOS"].values if "ICULOS" in df.columns else np.arange(1, n + 1, dtype=float)
    
    res = {
        "patient_id": [patient_id] * n,
        "hour": np.arange(n),
        "target": target,
        "Age": [age] * n,
        "Gender": [gender] * n,
        "ICULOS": iculos
    }
    
    # Primary sensor columns
    active_cols = SENSOR_VITALS if feature_mode == "sensor_feasible" else [
        "HR", "O2Sat", "Temp", "Resp", "SBP", "MAP", "DBP", "WBC", "Platelets", "Creatinine", "Lactate", "Glucose", "BUN"
    ]
    
    for col in active_cols:
        if col not in df.columns:
            continue
            
        raw = df[col]
        # Missing indicator
        res[f"{col}_is_missing"] = raw.isna().astype(float).values
        
        # Forward fill within patient up to 6h
        ff = raw.ffill(limit=6)
        res[f"{col}_val"] = ff.values
        
        # Baseline (first valid value)
        first_valid = raw.dropna().iloc[0] if len(raw.dropna()) > 0 else np.nan
        res[f"{col}_delta_baseline"] = (ff - first_valid).fillna(0.0).values
        
        # Vectorized rolling stats (3h and 6h)
        for w in [3, 6]:
            res[f"{col}_mean_{w}h"] = ff.rolling(window=w, min_periods=1).mean().values
            res[f"{col}_min_{w}h"] = ff.rolling(window=w, min_periods=1).min().values
            res[f"{col}_max_{w}h"] = ff.rolling(window=w, min_periods=1).max().values
            res[f"{col}_std_{w}h"] = ff.rolling(window=w, min_periods=1).std().fillna(0.0).values
            res[f"{col}_missing_{w}h"] = raw.isna().astype(float).rolling(window=w, min_periods=1).sum().values
            
        # Differences over time (lag 1h, lag 3h, lag 6h)
        res[f"{col}_diff_1h"] = (ff - ff.shift(1)).fillna(0.0).values
        res[f"{col}_diff_3h"] = (ff - ff.shift(3)).fillna(0.0).values
        res[f"{col}_diff_6h"] = (ff - ff.shift(6)).fillna(0.0).values
        # Approximate slope over 6h: delta / 6
        res[f"{col}_slope_6h"] = (res[f"{col}_diff_6h"] / 6.0)

    # Sensor-feasible physiological flags (SIRS & vital limits)
    if "HR" in df.columns:
        hr_val = res.get("HR_val", df["HR"].values)
        res["HR_tachy_90"] = (hr_val > 90).astype(float)
        res["HR_tachy_110"] = (hr_val > 110).astype(float)
    if "Temp" in df.columns:
        temp_val = res.get("Temp_val", df["Temp"].values)
        res["Temp_fever_38"] = (temp_val > 38.0).astype(float)
        res["Temp_hypo_36"] = (temp_val < 36.0).astype(float)
    if "Resp" in df.columns:
        resp_val = res.get("Resp_val", df["Resp"].values)
        res["Resp_tachy_20"] = (resp_val > 20).astype(float)
        res["Resp_tachy_24"] = (resp_val > 24).astype(float)
    if "O2Sat" in df.columns:
        spo2_val = res.get("O2Sat_val", df["O2Sat"].values)
        res["O2Sat_hypo_92"] = (spo2_val < 92).astype(float)
        res["O2Sat_hypo_95"] = (spo2_val < 95).astype(float)

    # SIRS vitals score from sensor-feasible inputs
    if all(k in res for k in ["HR_tachy_90", "Temp_fever_38", "Temp_hypo_36", "Resp_tachy_20"]):
        res["SIRS_vitals_score"] = (
            res["HR_tachy_90"] + 
            np.maximum(res["Temp_fever_38"], res["Temp_hypo_36"]) + 
            res["Resp_tachy_20"]
        )

    # Full vitals clinical markers (if present in full_vitals mode)
    if feature_mode == "full_vitals":
        if "SBP" in res and "HR_val" in res:
            sbp = res.get("SBP_val", df.get("SBP", pd.Series(np.nan)).values)
            hr = res["HR_val"]
            # Shock Index = HR / SBP
            with np.errstate(divide='ignore', invalid='ignore'):
                si = np.where(sbp > 30, hr / sbp, 0.8)
            res["Shock_Index"] = np.nan_to_num(si, nan=0.8)
            res["SBP_hypo_100"] = (sbp < 100).astype(float)
        if "MAP" in res:
            map_val = res.get("MAP_val", df.get("MAP", pd.Series(np.nan)).values)
            res["MAP_hypo_65"] = (map_val < 65).astype(float)
        if "Resp_tachy_20" in res and "SBP_hypo_100" in res:
            res["qSOFA_vitals_score"] = res["Resp_tachy_20"] + res["SBP_hypo_100"]
            
    out_df = pd.DataFrame(res)
    return out_df
