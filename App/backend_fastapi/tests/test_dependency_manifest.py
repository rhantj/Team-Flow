from __future__ import annotations

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_fastapi_runtime_uses_single_root_requirements_manifest() -> None:
    requirements = (REPOSITORY_ROOT / "requirements.txt").read_text(encoding="utf-8")
    dockerfile = (REPOSITORY_ROOT / "App/backend_fastapi/Dockerfile").read_text(encoding="utf-8")
    run_script = (REPOSITORY_ROOT / "App/scripts/run_ai_fastapi.sh").read_text(encoding="utf-8")

    assert "fastapi==" in requirements
    assert "uvicorn[standard]==" in requirements
    assert "pymongo==" in requirements
    assert "catboost==" in requirements
    assert "COPY requirements.txt ." in dockerfile
    assert 'pip install -r "$ROOT_DIR/../requirements.txt"' in run_script
    assert not (REPOSITORY_ROOT / "App/backend_fastapi/requirements.txt").exists()
