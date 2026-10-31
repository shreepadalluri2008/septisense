#!/usr/bin/env python3
"""
SeptiSense Model A Training & Evaluation Pipeline
Trains the Sepsis Early-Warning Risk Model on real PhysioNet Challenge 2019 ICU data.
- Horizon: Configurable H = 6 hours (default)
- Feature Set: SENSOR-FEASIBLE (HR, O2Sat, Temp, Resp, Age, Gender + temporal dynamics)
- Reference Model: FULL-VITALS (benchmarks the sensor-constrained trade-off)
- Cross-Hospital Generalization: Train Hospital A -> Test Hospital B
- Calibration: Platt sigmoid scaling + Brier score
- Generates: models/sepsis_model.joblib, models/feature_spec.json, reports/metrics.json, publication-quality plots
"""

import os
os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib"
import sys
import json
import time
import joblib
import argparse
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import (
    roc_auc_score, average_precision_score, roc_curve, precision_recall_curve,
    brier_score_loss, confusion_matrix
)
import lightgbm as lgb

try:
    from .features import extract_patient_features_vectorized
    from .evaluate_sepsis_score import compute_prediction_utility
except (ImportError, ValueError):
    from features import extract_patient_features_vectorized
    try:
        from evaluate_sepsis_score import compute_prediction_utility
    except ImportError:
        compute_prediction_utility = None

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
MODELS_DIR = BASE_DIR / "models"
REPORTS_DIR = BASE_DIR / "reports"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

def load_cohort(folder: Path, max_patients: int = 1500, mode: str = "sensor_feasible", horizon: int = 6) -> pd.DataFrame:
    files = sorted(list(folder.glob("*.psv")))[:max_patients]
    print(f"  Extracting features from {len(files)} patient records in {folder.name} (mode={mode})...")
    
    t0 = time.time()
    dfs = []
    for f in files:
        p_df = pd.read_csv(f, sep="|")
        pid = f.stem
        feat_df = extract_patient_features_vectorized(p_df, patient_id=pid, feature_mode=mode, horizon=horizon)
        dfs.append(feat_df)
        
    all_df = pd.concat(dfs, ignore_index=True)
    # Drop rows where target is NaN (post-onset hours excluded from training/testing)
    valid_df = all_df.dropna(subset=["target"]).copy()
    valid_df["target"] = valid_df["target"].astype(int)
    print(f"  Completed in {time.time() - t0:.2f}s ({len(valid_df)} valid observation hours).")
    return valid_df

def train_and_eval():
    parser = argparse.ArgumentParser(description="SeptiSense Sepsis Model Training")
    parser.add_argument("--horizon", type=int, default=6, help="Early warning prediction horizon in hours (default 6)")
    parser.add_argument("--patients-per-hospital", type=int, default=1200, help="Patients to use per hospital")
    args = parser.parse_args()
    
    H = args.horizon
    limit = args.patients_per_hospital
    print("="*75)
    print(f" SeptiSense Model A Pipeline: Sepsis Early-Warning (Horizon = {H} hours)")
    print("="*75)
    
    setA_dir = RAW_DIR / "challenge-2019" / "training_setA"
    setB_dir = RAW_DIR / "challenge-2019" / "training_setB"
    
    # 1. Load Sensor-Feasible Data for Hospital A and Hospital B
    print("\n[Phase A] Ingesting Sensor-Feasible Cohorts...")
    df_a_sf = load_cohort(setA_dir, max_patients=limit, mode="sensor_feasible", horizon=H)
    df_b_sf = load_cohort(setB_dir, max_patients=limit, mode="sensor_feasible", horizon=H)
    
    meta_cols = ["patient_id", "hour", "target"]
    feature_cols_sf = [c for c in df_a_sf.columns if c not in meta_cols]
    
    print(f"Sensor-feasible feature count: {len(feature_cols_sf)}")
    print(f"Hospital A rows: {len(df_a_sf)}, Positives: {df_a_sf['target'].sum()} ({df_a_sf['target'].mean()*100:.2f}%)")
    print(f"Hospital B rows: {len(df_b_sf)}, Positives: {df_b_sf['target'].sum()} ({df_b_sf['target'].mean()*100:.2f}%)")
    
    # 2. Cross-Hospital Generalization Experiment (Train Hospital A -> Test Hospital B)
    print("\n" + "-"*75)
    print(" EXPERIMENT 1: Cross-Hospital Generalization (Train Hospital A -> Test Hospital B)")
    print("-"*75)
    
    X_train_hospA = df_a_sf[feature_cols_sf]
    y_train_hospA = df_a_sf["target"]
    X_test_hospB = df_b_sf[feature_cols_sf]
    y_test_hospB = df_b_sf["target"]
    
    n_neg_a = (y_train_hospA == 0).sum()
    n_pos_a = (y_train_hospA == 1).sum()
    spw_a = float(n_neg_a / max(1, n_pos_a))
    
    lgb_cross = lgb.LGBMClassifier(
        n_estimators=150,
        learning_rate=0.04,
        num_leaves=25,
        max_depth=5,
        scale_pos_weight=spw_a,
        random_state=42,
        verbose=-1
    )
    lgb_cross.fit(X_train_hospA, y_train_hospA)
    probs_cross_test = lgb_cross.predict_proba(X_test_hospB)[:, 1]
    
    auroc_cross = roc_auc_score(y_test_hospB, probs_cross_test)
    auprc_cross = average_precision_score(y_test_hospB, probs_cross_test)
    print(f"Hospital A -> Hospital B Generalization: AUROC = {auroc_cross:.4f}, AUPRC = {auprc_cross:.4f}")
    
    # 3. Pooled Multi-Center Cohort Split (80% Train, 20% Held-Out Test, Patient-Level GroupSplit)
    print("\n" + "-"*75)
    print(" EXPERIMENT 2: Pooled Multi-Center Training & Calibrated Evaluation")
    print("-"*75)
    
    df_pooled_sf = pd.concat([df_a_sf, df_b_sf], ignore_index=True)
    groups = df_pooled_sf["patient_id"]
    
    gss = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
    train_idx, test_idx = next(gss.split(df_pooled_sf, df_pooled_sf["target"], groups=groups))
    
    train_df = df_pooled_sf.iloc[train_idx].copy()
    test_df = df_pooled_sf.iloc[test_idx].copy()
    
    print(f"Train Patients: {train_df['patient_id'].nunique()}, Observations: {len(train_df)}, Positives: {train_df['target'].sum()} ({train_df['target'].mean()*100:.2f}%)")
    print(f"Held-Out Test Patients: {test_df['patient_id'].nunique()}, Observations: {len(test_df)}, Positives: {test_df['target'].sum()} ({test_df['target'].mean()*100:.2f}%)")
    
    X_train = train_df[feature_cols_sf]
    y_train = train_df["target"].values
    X_test = test_df[feature_cols_sf]
    y_test = test_df["target"].values
    
    spw_pooled = float((y_train == 0).sum() / max(1, (y_train == 1).sum()))
    print(f"Pooled training scale_pos_weight: {spw_pooled:.2f}")
    
    # 3a. Baseline: Logistic Regression
    print("\n--> Fitting Baseline: Logistic Regression...")
    pipe_lr = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42))
    ])
    pipe_lr.fit(X_train, y_train)
    lr_probs_test = pipe_lr.predict_proba(X_test)[:, 1]
    lr_auroc = roc_auc_score(y_test, lr_probs_test)
    lr_auprc = average_precision_score(y_test, lr_probs_test)
    print(f"    Logistic Regression Held-Out: AUROC = {lr_auroc:.4f}, AUPRC = {lr_auprc:.4f}")
    
    # 3b. Main: Sensor-Feasible LightGBM with Platt Calibration
    print("\n--> Fitting Primary: Sensor-Feasible LightGBM...")
    base_lgbm = lgb.LGBMClassifier(
        n_estimators=220,
        learning_rate=0.03,
        num_leaves=27,
        max_depth=5,
        min_child_samples=30,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=spw_pooled,
        random_state=42,
        verbose=-1
    )
    
    print("    Calibrating probabilities via Platt Sigmoid Scaling...")
    calibrated_model = CalibratedClassifierCV(estimator=base_lgbm, method="sigmoid", cv=3)
    calibrated_model.fit(X_train, y_train)
    
    test_probs = calibrated_model.predict_proba(X_test)[:, 1]
    sf_auroc = roc_auc_score(y_test, test_probs)
    sf_auprc = average_precision_score(y_test, test_probs)
    sf_brier = brier_score_loss(y_test, test_probs)
    
    print(f"\n=======================================================")
    print(f" PRIMARY SENSOR-FEASIBLE MODEL (HELD-OUT PATIENTS)")
    print(f"=======================================================")
    print(f" AUROC:       {sf_auroc:.4f}")
    print(f" AUPRC:       {sf_auprc:.4f}")
    print(f" Brier Score: {sf_brier:.4f}")
    
    # Select Decision Threshold by Target Sensitivity (80% sensitivity)
    fpr, tpr, roc_thresh = roc_curve(y_test, test_probs)
    target_sens = 0.80
    sens_idx = np.where(tpr >= target_sens)[0][0] if any(tpr >= target_sens) else len(tpr) - 1
    chosen_threshold = float(roc_thresh[sens_idx])
    
    test_preds = (test_probs >= chosen_threshold).astype(int)
    cm = confusion_matrix(y_test, test_preds)
    tn, fp, fn, tp = cm.ravel()
    
    sens = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    spec = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
    prec = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    f1 = float(2 * prec * sens / (prec + sens)) if (prec + sens) > 0 else 0.0
    
    total_neg_hours = tn + fp
    fa_per_patient_day = float((fp / total_neg_hours) * 24.0) if total_neg_hours > 0 else 0.0
    
    print(f"\n Operating Point (Target Sensitivity = {target_sens*100:.0f}%):")
    print(f" Chosen Probability Threshold: {chosen_threshold:.4f}")
    print(f" Sensitivity (Recall):         {sens*100:.2f}%")
    print(f" Specificity:                  {spec*100:.2f}%")
    print(f" Precision (PPV):              {prec*100:.2f}%")
    print(f" F1-Score:                     {f1:.4f}")
    print(f" False Alarm Rate:             {fa_per_patient_day:.2f} false alerts / patient-day")
    print(f" Confusion Matrix (TN, FP, FN, TP): [{tn}, {fp}, {fn}, {tp}]")
    
    # Official PhysioNet 2019 Utility Score
    utility_score = None
    if compute_prediction_utility is not None:
        try:
            # PhysioNet expects lists of 1D arrays per patient
            test_df_eval = test_df.copy()
            test_df_eval["pred"] = test_preds
            test_df_eval["prob"] = test_probs
            
            pids = test_df_eval["patient_id"].unique()
            label_list = [test_df_eval[test_df_eval["patient_id"] == pid]["target"].values.astype(float) for pid in pids]
            pred_list = [test_df_eval[test_df_eval["patient_id"] == pid]["pred"].values.astype(float) for pid in pids]
            
            utility_score = float(compute_prediction_utility(label_list, pred_list))
            print(f" PhysioNet 2019 Utility Score: {utility_score:.4f}")
        except Exception as e:
            print(f" Note: Utility score computation: {e}")
            
    # 4. Reference Model: Full-Vitals Benchmark
    print("\n" + "-"*75)
    print(" EXPERIMENT 3: Full-Vitals Reference Model (Quantifying the Sensor Gap)")
    print("-"*75)
    df_a_full = load_cohort(setA_dir, max_patients=limit, mode="full_vitals", horizon=H)
    df_b_full = load_cohort(setB_dir, max_patients=limit, mode="full_vitals", horizon=H)
    df_pooled_full = pd.concat([df_a_full, df_b_full], ignore_index=True)
    
    feature_cols_full = [c for c in df_pooled_full.columns if c not in meta_cols]
    print(f" Full-Vitals feature count: {len(feature_cols_full)}")
    
    train_full = df_pooled_full.iloc[train_idx]
    test_full = df_pooled_full.iloc[test_idx]
    
    base_lgbm_full = lgb.LGBMClassifier(
        n_estimators=220, learning_rate=0.03, num_leaves=27, max_depth=5,
        min_child_samples=30, scale_pos_weight=spw_pooled, random_state=42, verbose=-1
    )
    base_lgbm_full.fit(train_full[feature_cols_full], train_full["target"])
    full_probs = base_lgbm_full.predict_proba(test_full[feature_cols_full])[:, 1]
    
    full_auroc = roc_auc_score(y_test, full_probs)
    full_auprc = average_precision_score(y_test, full_probs)
    
    auroc_gap = full_auroc - sf_auroc
    auprc_gap = full_auprc - sf_auprc
    print(f" Full-Vitals Reference Model:  AUROC = {full_auroc:.4f}, AUPRC = {full_auprc:.4f}")
    print(f" Sensor-Feasible vs Full Gap:  Delta AUROC = {auroc_gap:+.4f}, Delta AUPRC = {auprc_gap:+.4f}")
    
    # 5. Extract Feature Importance
    base_lgbm.fit(X_train, y_train)
    importances = base_lgbm.feature_importances_
    feat_imp_df = pd.DataFrame({
        "feature": feature_cols_sf,
        "importance": importances
    }).sort_values(by="importance", ascending=False)
    
    top_15_features = feat_imp_df.head(15).to_dict(orient="records")
    
    # 6. Render Publication-Quality Plots
    print("\n[Phase B] Rendering Evaluation Plots...")
    
    # Plot 1: ROC Curve
    plt.figure(figsize=(7, 6))
    fpr_sf, tpr_sf, _ = roc_curve(y_test, test_probs)
    fpr_full, tpr_full, _ = roc_curve(y_test, full_probs)
    fpr_lr, tpr_lr, _ = roc_curve(y_test, lr_probs_test)
    
    plt.plot(fpr_sf, tpr_sf, color="#2563eb", lw=2.5, label=f"Sensor-Feasible LGBM (AUROC = {sf_auroc:.3f})")
    plt.plot(fpr_full, tpr_full, color="#059669", lw=2, linestyle="--", label=f"Full-Vitals Reference (AUROC = {full_auroc:.3f})")
    plt.plot(fpr_lr, tpr_lr, color="#dc2626", lw=1.5, linestyle=":", label=f"Logistic Regression (AUROC = {lr_auroc:.3f})")
    plt.plot([0, 1], [0, 1], color="#9ca3af", linestyle="--")
    plt.scatter([fpr[sens_idx]], [tpr[sens_idx]], color="#d97706", s=90, zorder=5, label=f"Operating Point (Sens={sens*100:.0f}%, Spec={spec*100:.0f}%)")
    plt.xlabel("False Positive Rate (1 - Specificity)", fontsize=11)
    plt.ylabel("True Positive Rate (Sensitivity)", fontsize=11)
    plt.title(f"ROC Curves: Sepsis Early-Warning (H={H}h)", fontsize=13, fontweight="bold")
    plt.legend(loc="lower right", fontsize=9.5)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(REPORTS_DIR / "roc_curve.png", dpi=200)
    plt.close()
    
    # Plot 2: Precision-Recall Curve
    plt.figure(figsize=(7, 6))
    prec_sf, rec_sf, _ = precision_recall_curve(y_test, test_probs)
    prec_full, rec_full, _ = precision_recall_curve(y_test, full_probs)
    prec_lr, rec_lr, _ = precision_recall_curve(y_test, lr_probs_test)
    prevalence = float(y_test.mean())
    
    plt.plot(rec_sf, prec_sf, color="#2563eb", lw=2.5, label=f"Sensor-Feasible LGBM (AUPRC = {sf_auprc:.3f})")
    plt.plot(rec_full, prec_full, color="#059669", lw=2, linestyle="--", label=f"Full-Vitals Reference (AUPRC = {full_auprc:.3f})")
    plt.plot(rec_lr, prec_lr, color="#dc2626", lw=1.5, linestyle=":", label=f"Logistic Regression (AUPRC = {lr_auprc:.3f})")
    plt.axhline(prevalence, color="#9ca3af", linestyle="--", label=f"Baseline Prevalence ({prevalence*100:.1f}%)")
    plt.xlabel("Recall (Sensitivity)", fontsize=11)
    plt.ylabel("Precision (PPV)", fontsize=11)
    plt.title(f"Precision-Recall Curves: Sepsis Early-Warning (H={H}h)", fontsize=13, fontweight="bold")
    plt.legend(loc="upper right", fontsize=9.5)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(REPORTS_DIR / "pr_curve.png", dpi=200)
    plt.close()
    
    # Plot 3: Calibration Curve
    plt.figure(figsize=(7, 6))
    prob_true, prob_pred = calibration_curve(y_test, test_probs, n_bins=10)
    plt.plot(prob_pred, prob_true, marker="o", color="#2563eb", lw=2, label=f"Calibrated Probabilities (Brier={sf_brier:.4f})")
    plt.plot([0, 1], [0, 1], color="#9ca3af", linestyle="--", label="Perfect Calibration")
    plt.xlabel("Mean Predicted Probability", fontsize=11)
    plt.ylabel("Observed Fraction of Positives", fontsize=11)
    plt.title("Reliability Curve (Platt Sigmoid Calibration)", fontsize=13, fontweight="bold")
    plt.legend(loc="upper left", fontsize=10)
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(REPORTS_DIR / "calibration_curve.png", dpi=200)
    plt.close()
    
    # Plot 4: Feature Importance
    plt.figure(figsize=(9, 6))
    top_df = feat_imp_df.head(12).iloc[::-1]
    plt.barh(top_df["feature"], top_df["importance"], color="#3b82f6")
    plt.xlabel("Split Gain Importance", fontsize=11)
    plt.title("Top Sensor-Feasible Engineered Features", fontsize=13, fontweight="bold")
    plt.grid(True, axis="x", alpha=0.3)
    plt.tight_layout()
    plt.savefig(REPORTS_DIR / "feature_importance.png", dpi=200)
    plt.close()
    
    # 7. Save Model Artifact and Specs
    print("\n[Phase C] Serializing Artifacts & Specs...")
    model_artifact = {
        "model": calibrated_model,
        "base_model": base_lgbm,
        "feature_names": feature_cols_sf,
        "chosen_threshold": chosen_threshold,
        "target_horizon_hours": H,
        "trained_date": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "model_type": "LightGBM + Platt Sigmoid Calibration",
        "scale_pos_weight": spw_pooled
    }
    joblib.dump(model_artifact, MODELS_DIR / "sepsis_model.joblib")
    print(f"  Saved trained model to: {MODELS_DIR / 'sepsis_model.joblib'}")
    
    feature_spec = {
        "model_name": "SeptiSense-SepsisRisk-ModelA",
        "version": "1.0.0",
        "target_horizon_hours": H,
        "decision_threshold": round(chosen_threshold, 4),
        "target_sensitivity": target_sens,
        "input_features": feature_cols_sf,
        "num_features": len(feature_cols_sf),
        "required_sensors": ["ECG (HR, Resp)", "MAX30102 (SpO2, HR)", "Temperature (MAX30205/DS18B20)"],
        "min_history_hours_required": 1.0,
        "top_features": top_15_features
    }
    with open(MODELS_DIR / "feature_spec.json", "w") as f:
        json.dump(feature_spec, f, indent=2)
    print(f"  Saved feature spec to: {MODELS_DIR / 'feature_spec.json'}")
    
    metrics = {
        "project": "SeptiSense IoT Patient Monitoring & Sepsis Early-Warning",
        "model_a_sepsis_risk": {
            "prediction_horizon_hours": H,
            "training_cohort": {
                "patients": int(train_df["patient_id"].nunique()),
                "observations": int(len(train_df)),
                "positive_observations": int(train_df["target"].sum()),
                "prevalence_pct": round(float(train_df["target"].mean() * 100), 2)
            },
            "held_out_test_cohort": {
                "patients": int(test_df["patient_id"].nunique()),
                "observations": int(len(test_df)),
                "positive_observations": int(test_df["target"].sum()),
                "prevalence_pct": round(float(test_df["target"].mean() * 100), 2)
            },
            "held_out_metrics": {
                "AUROC": round(float(sf_auroc), 4),
                "AUPRC": round(float(sf_auprc), 4),
                "Brier_Score": round(float(sf_brier), 4),
                "decision_threshold": round(chosen_threshold, 4),
                "sensitivity": round(sens, 4),
                "specificity": round(spec, 4),
                "precision": round(prec, 4),
                "recall": round(sens, 4),
                "f1_score": round(f1, 4),
                "false_alarms_per_patient_day": round(fa_per_patient_day, 2),
                "physionet_2019_utility_score": round(utility_score, 4) if utility_score is not None else None,
                "confusion_matrix": {
                    "TN": int(tn),
                    "FP": int(fp),
                    "FN": int(fn),
                    "TP": int(tp)
                }
            },
            "cross_hospital_generalization": {
                "train_source": "Hospital System A",
                "test_source": "Hospital System B",
                "generalization_AUROC": round(float(auroc_cross), 4),
                "generalization_AUPRC": round(float(auprc_cross), 4)
            },
            "benchmark_comparisons": {
                "baseline_logistic_regression": {
                    "AUROC": round(float(lr_auroc), 4),
                    "AUPRC": round(float(lr_auprc), 4)
                },
                "full_vitals_reference_model": {
                    "AUROC": round(float(full_auroc), 4),
                    "AUPRC": round(float(full_auprc), 4),
                    "delta_AUROC_gap": round(float(auroc_gap), 4),
                    "delta_AUPRC_gap": round(float(auprc_gap), 4)
                }
            }
        }
    }
    with open(REPORTS_DIR / "metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  Saved full evaluation report to: {REPORTS_DIR / 'metrics.json'}")
    print("\n[SUCCESS] Model A training and evaluation completed successfully.")

if __name__ == "__main__":
    train_and_eval()
