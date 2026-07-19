"""Hugging Face Hub에서 학습된 모델(.pkl)을 내려받아 model_dir에 배치.

.pkl은 저장소 비대화/재현성 문제로 git에 커밋하지 않으므로(.gitignore 참고),
배포 환경(Docker 컨테이너 기동 시 등)에서 이 스크립트로 Hugging Face Hub에서 내려받는다.
모델이 이미 로컬에 있으면 아무것도 하지 않는다.

실행 (backend_fastapi 디렉터리에서):
    python -m ml_delay_risk.fetch_model
"""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

from ml_delay_risk.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    settings = get_settings()
    target_path = Path(settings.model_dir) / settings.model_filename

    if target_path.exists():
        logger.info("모델이 이미 존재합니다. 다운로드를 건너뜁니다: %s", target_path)
        return

    if not settings.hf_model_repo_id:
        logger.info(
            "DELAY_RISK_HF_MODEL_REPO_ID가 설정되지 않아 다운로드를 건너뜁니다. "
            "직접 학습하려면 'python -m ml_delay_risk.train'을 실행하세요."
        )
        return

    from huggingface_hub import hf_hub_download

    if not settings.hf_model_revision:
        logger.warning(
            "DELAY_RISK_HF_MODEL_REVISION이 설정되지 않아 기본 브랜치의 최신 커밋을 받습니다. "
            "배포마다 다른 모델을 받을 수 있어 재현성이 깨지니, 운영 환경에서는 커밋 해시나 "
            "태그로 고정하는 것을 권장합니다."
        )

    logger.info(
        "Hugging Face Hub에서 모델 다운로드 중: repo=%s file=%s revision=%s",
        settings.hf_model_repo_id,
        settings.model_filename,
        settings.hf_model_revision or "(default)",
    )
    try:
        downloaded_path = hf_hub_download(
            repo_id=settings.hf_model_repo_id,
            filename=settings.model_filename,
            revision=settings.hf_model_revision or None,
        )
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(downloaded_path, target_path)
    except Exception:
        # 네트워크 오류, 잘못된 repo/revision, private 저장소 토큰 누락 등으로 여기서
        # 예외가 나면 docker-entrypoint.sh가 set -e 때문에 컨테이너 기동 자체를 멈춰버린다.
        # 모델 없이도 서버는 뜰 수 있어야 하므로(health가 model_loaded=False를 보고하고,
        # predict 계열은 503을 반환) 예외를 삼키고 기동을 계속한다.
        logger.exception(
            "Hugging Face Hub 모델 다운로드 실패. 모델 없이 서버 기동을 계속합니다 "
            "(관련 API는 모델을 준비하기 전까지 503을 반환합니다). repo=%s revision=%s",
            settings.hf_model_repo_id,
            settings.hf_model_revision or "(default)",
        )
        return

    logger.info("모델 다운로드 완료: %s", target_path)


if __name__ == "__main__":
    main()
