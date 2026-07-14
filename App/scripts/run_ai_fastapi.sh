#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR/backend_fastapi"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

if [ -f ".venv/bin/activate" ]; then
  source .venv/bin/activate
else
  source .venv/Scripts/activate
fi

python -m pip --version >/dev/null 2>&1 || python -m ensurepip --upgrade
python -m pip install -r "$ROOT_DIR/backend_fastapi/requirements.txt"
exec python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
