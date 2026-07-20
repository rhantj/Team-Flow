"""ML 업무 지연 위험도 예측 모델(정상/주의/위험 3단계 분류) 설정.

환경변수는 DELAY_RISK_ 접두사로 오버라이드 가능 (예: DELAY_RISK_MONGO_URI).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

MODULE_ROOT = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DELAY_RISK_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # MongoDB (Zenodo Apache Jira Issue Tracking Dataset)
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "ml_dashboard"
    issues_collection: str = "issues"
    events_collection: str = "events"
    comments_collection: str = "comments"
    worklogs_collection: str = "worklogs"

    # 학습 데이터 구성 (다중 스냅샷)
    snapshot_offsets_days: list[int] = [1, 3, 7, 14, 30]
    """이슈 생성 후 각 시점(일)마다 스냅샷을 떠서 그 순간의 위험도를 라벨링한다.
    이슈가 해당 시점 이전에 이미 종료됐다면 그 스냅샷은 건너뛴다."""
    min_duration_hours: float = 1.0
    """이보다 빨리 종료된 이슈(중복 처리 등 노이즈)는 마감일(Proxy Deadline) 산정용
    그룹 중앙값 계산에서 제외한다."""
    min_group_size_for_sla: int = 10
    """(issuetype, priority) 그룹별 Proxy Deadline(중앙값)을 신뢰하기 위한 최소 표본 수."""

    # 3단계 라벨링 임계값 (방법론 문서 기준)
    risk_blocked_ratio: float = 0.30
    """블로커류 상태 누적시간 / Proxy Deadline 비율이 이보다 크면 '위험'(장기간 정체)."""
    warning_blocked_ratio: float = 0.10
    """위 비율이 이보다 크면 '주의' (문서의 '전체 예상 시간의 10% 이하'는 정상 범위 기준)."""
    warning_imbalance_index: float = 0.30
    """진행률 불균형 지수(시간경과율-진행률)가 이보다 크면 '주의' (경과 대비 진행 저조)."""

    # 최근 활동 모멘텀
    recent_activity_window_days: int = 3
    """기한 임박 시 최근 N일간 활동(댓글/상태변경/작업기록)이 없으면 '위험' 전조로 본다."""

    # 모델 아티팩트
    model_dir: str = str(MODULE_ROOT / "models")
    model_filename: str = "delay_model.pkl"

    # 학습된 모델(.pkl)은 저장소 비대화/재현성 문제로 git에 커밋하지 않는다.
    # 배포 환경에서는 fetch_model.py가 이 저장소에서 model_filename을 내려받는다.
    # private 저장소라면 HF_TOKEN 환경변수(huggingface_hub가 자동 인식)를 함께 설정할 것.
    hf_model_repo_id: str = ""
    # 커밋 해시 또는 태그로 고정. 비워두면 기본 브랜치의 최신 커밋을 받는데, 그 사이
    # 저장소에 새 모델이 푸시되면 배포 시점마다 다른 모델을 받게 돼 재현성이 깨진다.
    # 운영 배포에서는 반드시 특정 리비전으로 고정할 것을 권장.
    hf_model_revision: str = ""

    # load_artifact()는 이 파일을 joblib.load()(=pickle)로 역직렬화한다. pickle 역직렬화는
    # 파일 내용에 따라 임의 코드를 실행할 수 있으므로, hf_model_repo_id가 팀이 통제하지 않는
    # 저장소를 가리키게 되거나 그 저장소가 탈취되면 서버 프로세스 권한으로 코드 실행이 가능하다.
    # 여기에 다운로드한 파일의 SHA-256을 채워두면 fetch_model.py가 저장 직후 체크섬을 대조해,
    # 일치하지 않는 파일은 신뢰하지 않고(=적용하지 않고) 거부한다. 비워두면 이 검증을 건너뛴다.
    hf_model_sha256: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
