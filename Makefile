.PHONY: help dev test build train-sepsis train-ecg clean

help:
	@echo "SeptiSense Research Platform Make Commands:"
	@echo "  make dev          - Start Backend (FastAPI :8000) & Frontend (Vite :5173)"
	@echo "  make test         - Run Backend Pytest suite"
	@echo "  make build        - Compile Frontend TypeScript & Vite production bundle"
	@echo "  make train-sepsis - Train Model A (LightGBM Sepsis Early-Warning on CinC 2019)"
	@echo "  make train-ecg    - Train Model B (Pan-Tompkins QRS & CinC 2017 Rhythm Classifier)"
	@echo "  make clean        - Remove temporary caches and build artifacts"

dev:
	./start.sh

test:
	PYTHONPATH=. .venv/bin/pytest backend/tests/ -v

build:
	cd frontend && npm run build

train-sepsis:
	PYTHONPATH=. .venv/bin/python ml/src/train_sepsis_model.py

train-ecg:
	PYTHONPATH=. .venv/bin/python ml/src/train_ecg_model.py

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	rm -rf frontend/dist
