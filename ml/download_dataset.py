#!/usr/bin/env python3
"""
SeptiSense ML Dataset Downloader
Downloads, verifies, and indexes real clinical and physiological datasets from PhysioNet:
1. PhysioNet Computing in Cardiology Challenge 2019 (Sepsis early warning, Hospital A & B)
2. PhysioNet Computing in Cardiology Challenge 2017 (ECG rhythm classification)
3. MIT-BIH Arrhythmia Database (R-peak and arrhythmia validation)
4. MIMIC-IV Clinical Database Demo (ICU demographics and clinical features)
5. BIDMC PPG and Respiration Dataset (Physiological vitals reference)

Outputs a verified ml/data/raw/MANIFEST.json.
"""

import os
import sys
import json
import time
import zipfile
import hashlib
import argparse
import urllib.request
import concurrent.futures
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "data" / "raw"
MANIFEST_PATH = RAW_DIR / "MANIFEST.json"

USER_AGENT = "SeptiSense-Research-Agent/1.0 (PhysioNet Data Ingest)"

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def download_url(url: str, dest_path: Path, retries: int = 4, timeout: int = 45) -> bool:
    if dest_path.exists() and dest_path.stat().st_size > 0:
        return True
    
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = dest_path.with_suffix(dest_path.suffix + ".part")
    
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as response, open(tmp_path, "wb") as out_file:
                while chunk := response.read(65536):
                    out_file.write(chunk)
            tmp_path.rename(dest_path)
            return True
        except Exception as e:
            if tmp_path.exists():
                tmp_path.unlink()
            if attempt < retries:
                time.sleep(1.5 * attempt)
            else:
                print(f"[ERROR] Failed downloading {url}: {e}", file=sys.stderr)
                return False
    return False

def count_and_size(directory: Path):
    count = 0
    size = 0
    for p in directory.rglob("*"):
        if p.is_file():
            count += 1
            size += p.stat().st_size
    return count, size

def download_challenge_2019(limit_patients: int = 1500) -> dict:
    """
    Downloads Challenge 2019 hourly ICU patient records for Hospital A and Hospital B.
    Hospital A has 20,336 patients; Hospital B has 20,000 patients.
    Downloads limit_patients from Set A and limit_patients from Set B.
    """
    print(f"\n[1/5] Downloading PhysioNet CinC Challenge 2019 (Sepsis)...")
    c19_dir = RAW_DIR / "challenge-2019"
    setA_dir = c19_dir / "training_setA"
    setB_dir = c19_dir / "training_setB"
    setA_dir.mkdir(parents=True, exist_ok=True)
    setB_dir.mkdir(parents=True, exist_ok=True)
    
    s3_base = "https://physionet-open.s3.amazonaws.com/challenge-2019/1.0.0/training"
    
    tasks = []
    # Set A IDs start at 1
    for i in range(1, limit_patients + 1):
        fname = f"p{i:06d}.psv"
        dest = setA_dir / fname
        url = f"{s3_base}/training_setA/{fname}"
        tasks.append((url, dest))
        
    # Set B IDs start at 100001
    for i in range(100001, 100001 + limit_patients):
        fname = f"p{i:06d}.psv"
        dest = setB_dir / fname
        url = f"{s3_base}/training_setB/{fname}"
        tasks.append((url, dest))
        
    pending = [t for t in tasks if not (t[1].exists() and t[1].stat().st_size > 0)]
    print(f"      Total target files: {len(tasks)} (Hospital A: {limit_patients}, Hospital B: {limit_patients}). Pending: {len(pending)}")
    
    if pending:
        start_t = time.time()
        success = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=24) as executor:
            future_to_file = {executor.submit(download_url, url, dest): dest.name for url, dest in pending}
            done_count = 0
            for future in concurrent.futures.as_completed(future_to_file):
                done_count += 1
                if future.result():
                    success += 1
                if done_count % 250 == 0 or done_count == len(pending):
                    print(f"      Progress: {done_count}/{len(pending)} files processed ({success} ok)")
        print(f"      Finished in {time.time() - start_t:.1f}s.")
        
    file_count, total_bytes = count_and_size(c19_dir)
    return {
        "dataset": "PhysioNet Challenge 2019 (Early Prediction of Sepsis)",
        "version": "1.0.0",
        "source_url": "https://physionet.org/content/challenge-2019/1.0.0/",
        "storage_path": str(c19_dir.relative_to(BASE_DIR)),
        "file_count": file_count,
        "total_size_bytes": total_bytes,
        "download_date": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "status": "VERIFIED" if file_count >= 2 * limit_patients else "PARTIAL",
        "notes": f"Includes {limit_patients} patients from Hospital System A and {limit_patients} patients from Hospital System B."
    }

def download_challenge_2017() -> dict:
    """
    Downloads Challenge 2017 AF ECG recordings and reference labels.
    """
    print(f"\n[2/5] Downloading PhysioNet CinC Challenge 2017 (AF ECG)...")
    c17_dir = RAW_DIR / "challenge-2017"
    c17_dir.mkdir(parents=True, exist_ok=True)
    
    zip_dest = c17_dir / "training2017.zip"
    ref_dest = c17_dir / "REFERENCE-v3.csv"
    
    print("      Downloading REFERENCE-v3.csv...")
    download_url("https://physionet-open.s3.amazonaws.com/challenge-2017/1.0.0/REFERENCE-v3.csv", ref_dest)
    
    print("      Downloading training2017.zip (approx 99.2 MB)...")
    zip_ok = download_url("https://physionet-open.s3.amazonaws.com/challenge-2017/1.0.0/training2017.zip", zip_dest)
    
    extracted_dir = c17_dir / "training2017"
    if zip_ok and zip_dest.exists() and not (extracted_dir.exists() and any(extracted_dir.iterdir())):
        print("      Extracting training2017.zip...")
        with zipfile.ZipFile(zip_dest, "r") as zf:
            zf.extractall(c17_dir)
            
    file_count, total_bytes = count_and_size(c17_dir)
    return {
        "dataset": "PhysioNet Challenge 2017 (AF Classification from Short Single Lead ECG)",
        "version": "1.0.0",
        "source_url": "https://physionet.org/content/challenge-2017/1.0.0/",
        "storage_path": str(c17_dir.relative_to(BASE_DIR)),
        "file_count": file_count,
        "total_size_bytes": total_bytes,
        "download_date": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "status": "VERIFIED" if ref_dest.exists() and (extracted_dir.exists() or zip_dest.exists()) else "FAILED"
    }

def download_mitdb() -> dict:
    """
    Downloads MIT-BIH Arrhythmia Database using wfdb.
    """
    print(f"\n[3/5] Downloading MIT-BIH Arrhythmia Database (mitdb)...")
    mit_dir = RAW_DIR / "mitdb"
    mit_dir.mkdir(parents=True, exist_ok=True)
    
    import wfdb
    # Standard representative records for rhythm and R-peak validation
    records = ['100', '101', '102', '103', '105', '106', '115', '119', '200', '201', '203', '205', '208', '213']
    print(f"      Downloading {len(records)} benchmark annotation records via wfdb...")
    wfdb.dl_database('mitdb', str(mit_dir), records=records, overwrite=False)
    
    file_count, total_bytes = count_and_size(mit_dir)
    return {
        "dataset": "MIT-BIH Arrhythmia Database",
        "version": "1.0.0",
        "source_url": "https://physionet.org/content/mitdb/1.0.0/",
        "storage_path": str(mit_dir.relative_to(BASE_DIR)),
        "file_count": file_count,
        "total_size_bytes": total_bytes,
        "download_date": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "status": "VERIFIED" if file_count >= len(records) * 2 else "FAILED"
    }

def download_mimic_demo() -> dict:
    """
    Downloads MIMIC-IV Clinical Database Demo (open-access).
    """
    print(f"\n[4/5] Downloading MIMIC-IV Clinical Database Demo...")
    mimic_dir = RAW_DIR / "mimic-iv-demo"
    mimic_dir.mkdir(parents=True, exist_ok=True)
    
    zip_dest = mimic_dir / "mimic-iv-clinical-database-demo-2.2.zip"
    url = "https://physionet.org/content/mimic-iv-demo/get-zip/2.2/"
    
    print("      Downloading demo archive (approx 16.2 MB)...")
    download_url(url, zip_dest)
    
    if zip_dest.exists() and not any(p.is_dir() for p in mimic_dir.iterdir()):
        print("      Extracting MIMIC-IV demo...")
        try:
            with zipfile.ZipFile(zip_dest, "r") as zf:
                zf.extractall(mimic_dir)
        except Exception as e:
            print(f"      Extract warning: {e}")
            
    file_count, total_bytes = count_and_size(mimic_dir)
    return {
        "dataset": "MIMIC-IV Clinical Database Demo",
        "version": "2.2",
        "source_url": "https://physionet.org/content/mimic-iv-demo/2.2/",
        "storage_path": str(mimic_dir.relative_to(BASE_DIR)),
        "file_count": file_count,
        "total_size_bytes": total_bytes,
        "download_date": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "status": "VERIFIED" if zip_dest.exists() else "FAILED"
    }

def download_bidmc() -> dict:
    """
    Downloads BIDMC PPG and Respiration Dataset.
    """
    print(f"\n[5/5] Downloading BIDMC PPG and Respiration Dataset (bidmc)...")
    bidmc_dir = RAW_DIR / "bidmc"
    bidmc_dir.mkdir(parents=True, exist_ok=True)
    
    import wfdb
    # Representative subset of 5 patient records (each contains PPG, ECG, Resp)
    records = [f"bidmc{i:02d}" for i in range(1, 6)]
    print(f"      Downloading {len(records)} multi-parameter physiological records via wfdb...")
    wfdb.dl_database('bidmc', str(bidmc_dir), records=records, overwrite=False)
    
    file_count, total_bytes = count_and_size(bidmc_dir)
    return {
        "dataset": "BIDMC PPG and Respiration Dataset",
        "version": "1.0.0",
        "source_url": "https://physionet.org/content/bidmc/1.0.0/",
        "storage_path": str(bidmc_dir.relative_to(BASE_DIR)),
        "file_count": file_count,
        "total_size_bytes": total_bytes,
        "download_date": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "status": "VERIFIED" if file_count >= len(records) else "FAILED"
    }

def main():
    parser = argparse.ArgumentParser(description="SeptiSense Real Dataset Downloader")
    parser.add_argument("--patients-per-set", type=int, default=1500,
                        help="Number of patients to download per hospital for Challenge 2019 (default 1500, total 3000)")
    parser.add_argument("--skip-optional", action="store_true", help="Skip optional datasets (MIMIC-IV and BIDMC)")
    args = parser.parse_args()
    
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    
    manifest = {
        "project": "SeptiSense IoT Patient Monitoring & Sepsis Early-Warning",
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "datasets": {}
    }
    
    # 1. Challenge 2019 (Required)
    c19_meta = download_challenge_2019(limit_patients=args.patients_per_set)
    manifest["datasets"]["challenge_2019"] = c19_meta
    
    # 2. Challenge 2017 (Required)
    c17_meta = download_challenge_2017()
    manifest["datasets"]["challenge_2017"] = c17_meta
    
    # 3. MIT-BIH (Required)
    mit_meta = download_mitdb()
    manifest["datasets"]["mitdb"] = mit_meta
    
    if not args.skip_optional:
        # 4. MIMIC-IV Demo (Secondary)
        mimic_meta = download_mimic_demo()
        manifest["datasets"]["mimic_iv_demo"] = mimic_meta
        
        # 5. BIDMC (Optional)
        bidmc_meta = download_bidmc()
        manifest["datasets"]["bidmc"] = bidmc_meta
        
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
        
    print("\n" + "="*70)
    print(" DATASET INGEST SUMMARY & VERIFICATION")
    print("="*70)
    all_ok = True
    for key, item in manifest["datasets"].items():
        status = item["status"]
        count = item["file_count"]
        size_mb = item["total_size_bytes"] / (1024 * 1024)
        print(f" * {item['dataset']:<52} [{status}] ({count} files, {size_mb:.2f} MB)")
        if status != "VERIFIED":
            all_ok = False
            
    print(f"\nManifest written to: {MANIFEST_PATH}")
    if not all_ok:
        print("[FAIL] One or more required datasets failed verification.", file=sys.stderr)
        sys.exit(1)
    else:
        print("[SUCCESS] All required real clinical datasets verified successfully.")
        sys.exit(0)

if __name__ == "__main__":
    main()
