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
    from huggingface_hub.errors import HFValidationError

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
        # huggingface_hub 캐시 구조는 항상 snapshots/<확정된 커밋 해시>/<파일명>이므로,
        # revision을 안 고정했더라도 실제로 어떤 커밋을 받았는지 로그로 남겨 사후 추적이
        # 가능하게 한다.
        resolved_revision = Path(downloaded_path).parent.name
    except (OSError, HFValidationError):
        # OSError는 requests/huggingface_hub가 던지는 네트워크 오류와 HTTP 오류(잘못된
        # repo/revision, private 저장소 인증 실패 등 HfHubHTTPError 계열)를 모두 포괄한다
        # (requests.exceptions.RequestException이 OSError를 상속). HFValidationError는
        # repo_id/revision 형식 자체가 잘못된 경우. 이런 "외부 요인으로 재시도하면 나아질 수
        # 있는" 실패까지만 삼킨다 — set -e인 docker-entrypoint.sh가 이 때문에 컨테이너 기동을
        # 멈추면 안 되므로. 모델 없이도 서버는 뜰 수 있고(health가 model_loaded=False를
        # 보고, predict 계열은 503을 반환), 반대로 이 좁은 목록에 없는 예외(예: 코드 자체의
        # 버그)는 그대로 전파해 배포 실패가 조용히 묻히지 않도록 한다.
        logger.exception(
            "Hugging Face Hub 모델 다운로드 실패. 모델 없이 서버 기동을 계속합니다 "
            "(관련 API는 모델을 준비하기 전까지 503을 반환합니다). repo=%s revision=%s",
            settings.hf_model_repo_id,
            settings.hf_model_revision or "(default)",
        )
        return

    logger.info(
        "모델 다운로드 완료: %s (실제 커밋=%s)", target_path, resolved_revision
    )


if __name__ == "__main__":
    main()
