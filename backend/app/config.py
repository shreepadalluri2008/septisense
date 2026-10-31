"""
SeptiSense Application Configuration
"""

import os
from pathlib import Path
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

class Settings(BaseModel):
    PROJECT_NAME: str = "SeptiSense"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # SQLite Database
    DB_PATH: Path = PROJECT_ROOT / "backend" / "septisense.db"
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{PROJECT_ROOT / 'backend' / 'septisense.db'}")
    
    # ML Models & Reports Paths
    SEPSIS_MODEL_PATH: Path = PROJECT_ROOT / "ml" / "models" / "sepsis_model.joblib"
    ECG_MODEL_PATH: Path = PROJECT_ROOT / "ml" / "models" / "ecg_model.joblib"
    METRICS_JSON_PATH: Path = PROJECT_ROOT / "ml" / "reports" / "metrics.json"
    FEATURE_SPEC_PATH: Path = PROJECT_ROOT / "ml" / "models" / "feature_spec.json"
    ECG_SPEC_PATH: Path = PROJECT_ROOT / "ml" / "models" / "ecg_feature_spec.json"
    
    # Serial Defaults
    DEFAULT_BAUD: int = int(os.getenv("DEFAULT_BAUD", "921600"))
    SERIAL_PORT: str = os.getenv("SERIAL_PORT", "AUTO")
    
    # Regulatory Notice
    REGULATORY_NOTICE: str = "Educational and research prototype. Not clinically validated. Not a substitute for medical advice."

settings = Settings()
