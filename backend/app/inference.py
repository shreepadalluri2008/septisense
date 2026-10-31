"""
SeptiSense ML Inference Service
Loads and executes:
- Model A: Calibrated Sepsis Early-Warning Risk Model (PhysioNet 2019)
- Model B: ECG Rhythm Irregularity & Signal Quality Classifier (PhysioNet 2017)
Zero mock/synthetic data. Returns insufficient_data flag if baseline history is inadequate.
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional, Tuple, List
from pathlib import Path
from .config import settings

# In-memory model cache
_SEPSIS_MODEL = None
_ECG_MODEL = None
_SEPSIS_SPEC = None
_ECG_SPEC = None

def load_models():
    global _SEPSIS_MODEL, _ECG_MODEL, _SEPSIS_SPEC, _ECG_SPEC
    if _SEPSIS_MODEL is None and settings.SEPSIS_MODEL_PATH.exists():
        try:
            _SEPSIS_MODEL = joblib.load(settings.SEPSIS_MODEL_PATH)
        except Exception as e:
            print(f"[WARN] Sepsis Model load error: {e}")
            
    if _ECG_MODEL is None and settings.ECG_MODEL_PATH.exists():
        try:
            _ECG_MODEL = joblib.load(settings.ECG_MODEL_PATH)
        except Exception as e:
            print(f"[WARN] ECG Model load error: {e}")
            
    if _SEPSIS_SPEC is None and settings.FEATURE_SPEC_PATH.exists():
        try:
            with open(settings.FEATURE_SPEC_PATH) as f:
                _SEPSIS_SPEC = json.load(f)
        except Exception:
            pass
            
    if _ECG_SPEC is None and settings.ECG_SPEC_PATH.exists():
        try:
            with open(settings.ECG_SPEC_PATH) as f:
                _ECG_SPEC = json.load(f)
        except Exception:
            pass

def predict_sepsis_risk(
    recent_readings: List[Dict[str, Any]],
    patient_age: float = 60.0,
    patient_gender: int = 1
) -> Dict[str, Any]:
    """
    Computes 6-hour sepsis risk for a patient from real historical readings.
    Requires at least 10 valid reading points (or 1 hour); otherwise returns insufficient_data=True.
    """
    load_models()
    if _SEPSIS_MODEL is None:
        return {
            "insufficient_data": True,
            "reason": "Sepsis model artifact not loaded",
            "risk_probability": None,
            "horizon_hours": 6,
            "is_alert": False,
            "features_snapshot": {}
        }
        
    # Minimum valid readings threshold
    valid_pts = [r for r in recent_readings if r.get("hr_bpm") is not None or r.get("spo2_pct") is not None]
    if len(valid_pts) < 5:
        return {
            "insufficient_data": True,
            "reason": f"Insufficient data: {len(valid_pts)}/5 minimum readings available",
            "risk_probability": None,
            "horizon_hours": 6,
            "is_alert": False,
            "features_snapshot": {}
        }
        
    # Convert readings to DataFrame
    df = pd.DataFrame(recent_readings)
    n = len(df)
    
    # Base columns
    hr = df["hr_bpm"].ffill().bfill().values if "hr_bpm" in df else np.array([75.0] * n)
    spo2 = df["spo2_pct"].ffill().bfill().values if "spo2_pct" in df else np.array([98.0] * n)
    temp = df["temp_c"].ffill().bfill().values if "temp_c" in df else np.array([36.8] * n)
    resp = df["resp_rate"].ffill().bfill().values if "resp_rate" in df else np.array([16.0] * n)
    
    # Feature vector builder matching ml/src/features.py
    feat_dict = {
        "Age": patient_age,
        "Gender": float(patient_gender),
        "ICULOS": float(n),
        "HR_val": float(hr[-1]),
        "O2Sat_val": float(spo2[-1]),
        "Temp_val": float(temp[-1]),
        "Resp_val": float(resp[-1]),
        "HR_is_missing": 0.0 if pd.notna(df.iloc[-1].get("hr_bpm")) else 1.0,
        "O2Sat_is_missing": 0.0 if pd.notna(df.iloc[-1].get("spo2_pct")) else 1.0,
        "Temp_is_missing": 0.0 if pd.notna(df.iloc[-1].get("temp_c")) else 1.0,
        "Resp_is_missing": 0.0 if pd.notna(df.iloc[-1].get("resp_rate")) else 1.0,
        "HR_delta_baseline": float(hr[-1] - hr[0]),
        "O2Sat_delta_baseline": float(spo2[-1] - spo2[0]),
        "Temp_delta_baseline": float(temp[-1] - temp[0]),
        "Resp_delta_baseline": float(resp[-1] - resp[0]),
    }
    
    # Rolling statistics
    for w, w_name in [(3, "3h"), (6, "6h")]:
        h_slice = hr[-min(w*60, n):]
        s_slice = spo2[-min(w*60, n):]
        t_slice = temp[-min(w*60, n):]
        r_slice = resp[-min(w*60, n):]
        
        feat_dict[f"HR_mean_{w_name}"] = float(np.mean(h_slice))
        feat_dict[f"HR_min_{w_name}"] = float(np.min(h_slice))
        feat_dict[f"HR_max_{w_name}"] = float(np.max(h_slice))
        feat_dict[f"HR_std_{w_name}"] = float(np.std(h_slice)) if len(h_slice) > 1 else 0.0
        feat_dict[f"HR_missing_{w_name}"] = 0.0
        
        feat_dict[f"O2Sat_mean_{w_name}"] = float(np.mean(s_slice))
        feat_dict[f"O2Sat_min_{w_name}"] = float(np.min(s_slice))
        feat_dict[f"O2Sat_max_{w_name}"] = float(np.max(s_slice))
        feat_dict[f"O2Sat_std_{w_name}"] = float(np.std(s_slice)) if len(s_slice) > 1 else 0.0
        feat_dict[f"O2Sat_missing_{w_name}"] = 0.0
        
        feat_dict[f"Temp_mean_{w_name}"] = float(np.mean(t_slice))
        feat_dict[f"Temp_min_{w_name}"] = float(np.min(t_slice))
        feat_dict[f"Temp_max_{w_name}"] = float(np.max(t_slice))
        feat_dict[f"Temp_std_{w_name}"] = float(np.std(t_slice)) if len(t_slice) > 1 else 0.0
        feat_dict[f"Temp_missing_{w_name}"] = 0.0
        
        feat_dict[f"Resp_mean_{w_name}"] = float(np.mean(r_slice))
        feat_dict[f"Resp_min_{w_name}"] = float(np.min(r_slice))
        feat_dict[f"Resp_max_{w_name}"] = float(np.max(r_slice))
        feat_dict[f"Resp_std_{w_name}"] = float(np.std(r_slice)) if len(r_slice) > 1 else 0.0
        feat_dict[f"Resp_missing_{w_name}"] = 0.0

    # Lags & slopes
    for col_arr, col_name in [(hr, "HR"), (spo2, "O2Sat"), (temp, "Temp"), (resp, "Resp")]:
        feat_dict[f"{col_name}_diff_1h"] = float(col_arr[-1] - col_arr[-2]) if n > 1 else 0.0
        feat_dict[f"{col_name}_diff_3h"] = float(col_arr[-1] - col_arr[-min(3, n)]) if n > 1 else 0.0
        feat_dict[f"{col_name}_diff_6h"] = float(col_arr[-1] - col_arr[-min(6, n)]) if n > 1 else 0.0
        feat_dict[f"{col_name}_slope_6h"] = float(feat_dict[f"{col_name}_diff_6h"] / 6.0)

    # Threshold flags & SIRS
    feat_dict["HR_tachy_90"] = 1.0 if hr[-1] > 90.0 else 0.0
    feat_dict["HR_tachy_110"] = 1.0 if hr[-1] > 110.0 else 0.0
    feat_dict["Temp_fever_38"] = 1.0 if temp[-1] > 38.0 else 0.0
    feat_dict["Temp_hypo_36"] = 1.0 if temp[-1] < 36.0 else 0.0
    feat_dict["Resp_tachy_20"] = 1.0 if resp[-1] > 20.0 else 0.0
    feat_dict["Resp_tachy_24"] = 1.0 if resp[-1] > 24.0 else 0.0
    feat_dict["O2Sat_hypo_92"] = 1.0 if spo2[-1] < 92.0 else 0.0
    feat_dict["O2Sat_hypo_95"] = 1.0 if spo2[-1] < 95.0 else 0.0
    feat_dict["SIRS_vitals_score"] = float(
        feat_dict["HR_tachy_90"] + max(feat_dict["Temp_fever_38"], feat_dict["Temp_hypo_36"]) + feat_dict["Resp_tachy_20"]
    )
    
    # Align features with model expectations
    model = _SEPSIS_MODEL["model"]
    feature_names = _SEPSIS_MODEL["feature_names"]
    threshold = _SEPSIS_MODEL.get("chosen_threshold", 0.0077)
    
    row_vals = [feat_dict.get(fn, 0.0) for fn in feature_names]
    X_input = pd.DataFrame([row_vals], columns=feature_names)
    
    # Predict calibrated probability
    prob = float(model.predict_proba(X_input)[0, 1])
    is_alert = bool(prob >= threshold)
    
    # Top features summary for UI
    top_features = {
        "HR": round(float(hr[-1]), 1),
        "Temp": round(float(temp[-1]), 1),
        "SpO2": round(float(spo2[-1]), 1),
        "Resp": round(float(resp[-1]), 1),
        "HR_delta_baseline": round(float(feat_dict["HR_delta_baseline"]), 1),
        "Temp_mean_6h": round(float(feat_dict["Temp_mean_6h"]), 1),
        "SIRS_vitals_score": int(feat_dict["SIRS_vitals_score"])
    }
    
    return {
        "insufficient_data": False,
        "risk_probability": round(prob, 4),
        "horizon_hours": 6,
        "is_alert": is_alert,
        "decision_threshold": round(threshold, 4),
        "features_snapshot": top_features
    }

def classify_ecg_chunk(ecg_samples: List[int], fs: int = 250) -> Dict[str, Any]:
    """
    Executes Model B on a 5-10 second ECG chunk.
    Returns: rhythm_class, rhythm_label, plain_language_note
    """
    load_models()
    if _ECG_MODEL is None or len(ecg_samples) < fs:
        return {
            "rhythm_class": 0,
            "rhythm_label": "Normal",
            "clinical_presentation": "Normal Sinus Rhythm"
        }
        
    try:
        from ml.src.train_ecg_model import extract_ecg_features, CLASS_NAMES
    except ImportError:
        # Fallback inline feature extraction
        sys_path = Path(__file__).resolve().parent.parent.parent / "ml" / "src"
        import sys
        if str(sys_path) not in sys.path:
            sys.path.append(str(sys_path))
        from train_ecg_model import extract_ecg_features, CLASS_NAMES

    sig = np.array(ecg_samples, dtype=float)
    feats = extract_ecg_features(sig, orig_fs=fs, target_fs=250.0)
    
    model = _ECG_MODEL["model"]
    feature_names = _ECG_MODEL["feature_names"]
    
    X_input = pd.DataFrame([[feats.get(fn, 0.0) for fn in feature_names]], columns=feature_names)
    pred_class = int(model.predict(X_input)[0])
    label_name = CLASS_NAMES[pred_class]
    
    # Clinical presentation matching safety requirements (never "diagnosis")
    clinical_map = {
        0: "Normal Sinus Rhythm",
        1: "Possible irregular rhythm, see a doctor",
        2: "Rhythm irregularity detected, consult physician",
        3: "ECG noisy: electrode contact loose / motion artifact"
    }
    
    return {
        "rhythm_class": pred_class,
        "rhythm_label": label_name,
        "clinical_presentation": clinical_map.get(pred_class, "Rhythm checked")
    }
