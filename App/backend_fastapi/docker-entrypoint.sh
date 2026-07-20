#!/bin/sh
set -e

python -m ml_delay_risk.fetch_model

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
