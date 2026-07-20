"""지연 위험도 모델 아티팩트 저장/로드 및 실시간 추론.

delay_model.ipynb에서 학습 파이프라인과 분리해 옮긴 모듈이다. 노트북은 피처 선정/학습/평가
같은 실험 서술만 담당하고, 이 모듈을 import해서 쓴다. delay_router.py/delay_service.py 같은
프로덕션 코드가 더 이상 노트북을 JSON으로 파싱해 exec()할 필요가 없도록 하기 위함이다.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import joblib
import lightgbm as lgb
import pandas as pd

from ml_delay_risk.config import get_settings

logger = logging.getLogger(__name__)

NUM_CLASSES = 3
CATEGORICAL_COLUMNS = ["issuetype_name", "priority_name", "project_key", "status_at_cutoff"]
FREQUENCY_ENCODED_COLUMNS = ["reporter", "assignee_at_cutoff"]


@dataclass
class ModelArtifact:
    booster: lgb.Booster
    feature_names: list[str]
    categorical_columns: list[str]
    frequency_maps: dict[str, dict[str, int]]
    proxy_deadline_map: dict[tuple[str, str], float]
    global_median_duration_hours: float


def _model_path() -> Path:
    settings = get_settings()
    path = Path(settings.model_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path / settings.model_filename


def _save_artifact(artifact: ModelArtifact) -> None:
    path = _model_path()
    joblib.dump(artifact, path)
    logger.info("모델 저장 완료: %s", path)


_artifact_cache: Optional[ModelArtifact] = None
_artifact_cache_lock = threading.Lock()


def load_artifact() -> ModelArtifact:
    # FastAPI가 동기 라우트 핸들러를 스레드풀에서 실행하므로, 캐시가 비어 있는 상태에서
    # 여러 요청이 동시에 들어오면 락 없이는 joblib.load()가 중복 실행될 수 있다. 더블 체크
    # 락킹으로 최초 1회만 로드하고, 캐시가 채워진 이후에는 락 없이 바로 반환한다.
    global _artifact_cache
    if _artifact_cache is None:
        with _artifact_cache_lock:
            if _artifact_cache is None:
                path = _model_path()
                if not path.exists():
                    raise FileNotFoundError(
                        f"학습된 모델이 없습니다: {path}. "
                        "먼저 'python -m ml_delay_risk.train'을 실행하거나 모델을 내려받으세요."
                    )
                try:
                    _artifact_cache = joblib.load(path)
                except Exception as exc:
                    # 예전 코드(모듈명이 "__main__"으로 고정되던 시절)로 저장된 모델이거나
                    # 파일이 손상된 경우 AttributeError/UnpicklingError 등 다양한 예외가 날 수
                    # 있다. 호출부(delay_router.py)가 "모델 미준비"로 인식해 503으로 응답할
                    # 수 있도록 FileNotFoundError로 통일해 재발생시킨다.
                    raise FileNotFoundError(
                        f"모델 파일을 불러오지 못했습니다: {path} ({exc!r}). "
                        "파일이 손상되었거나 예전 코드로 저장된 모델일 수 있습니다. "
                        "다시 학습하거나(python -m ml_delay_risk.train) 최신 모델을 내려받으세요."
                    ) from exc
    return _artifact_cache


def proxy_deadline_for(issuetype_name: str, priority_name: str) -> float:
    artifact = load_artifact()
    return artifact.proxy_deadline_map.get(
        (issuetype_name, priority_name), artifact.global_median_duration_hours
    )


def predict_class_probabilities(feature_row: dict[str, Any]) -> list[float]:
    """클래스 색인(0=정상,1=주의,2=위험) 순서의 확률 리스트를 반환."""
    artifact = load_artifact()
    row_df = pd.DataFrame([feature_row])

    for col in FREQUENCY_ENCODED_COLUMNS:
        if col in row_df.columns:
            row_df[col] = row_df[col].map(artifact.frequency_maps.get(col, {})).fillna(0).astype(int)

    for col in artifact.feature_names:
        if col not in row_df.columns:
            row_df[col] = None
    row_df = row_df[artifact.feature_names]

    for col in artifact.feature_names:
        if col in artifact.categorical_columns:
            row_df[col] = row_df[col].astype("category")
        else:
            # 단일 행 DataFrame에서 None(예: 예상시간 없는 이슈의 progress_ratio)은
            # object dtype이 되어 LightGBM predict가 거부한다 -> 명시적으로 float로 강제.
            row_df[col] = pd.to_numeric(row_df[col], errors="coerce")

    probabilities = artifact.booster.predict(row_df, num_iteration=artifact.booster.best_iteration)[0]
    return [float(p) for p in probabilities]
