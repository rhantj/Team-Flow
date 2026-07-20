"""지연 위험도 3단계(정상/주의/위험) 분류 모델 학습 스크립트.

실행 (backend_fastapi 디렉터리에서):
    python -m ml_delay_risk.train                # 기본 파일럿 실행(5000개 이슈 + SMOTE)
    python -m ml_delay_risk.train --limit 2000   # 소규모 파일럿 실행
"""
from __future__ import annotations

import argparse
import logging

from ml_delay_risk.models import _notebook_runtime


def main() -> None:
    parser = argparse.ArgumentParser(description="ML 업무 지연 위험도(정상/주의/위험) 분류 모델 학습")
    parser.add_argument("--test-size", type=float, default=0.2, help="시간 기준 검증셋 비율 (기본 0.2)")
    parser.add_argument(
        "--limit",
        type=int,
        default=5000,
        help="SMOTE 적용 전 가져올 이슈 수 (기본 5000). 0을 지정하면 전체 데이터 사용",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    train_limit = None if args.limit == 0 else args.limit

    # delay_model.ipynb의 학습 파이프라인(피처 선정 → 이슈 단위 층화 분할 → 4개 모델 학습 →
    # MLflow 튜닝 → 최적 모델 저장)을 노트북 그대로 실행한다. limit/test_size는 노트북 셀이
    # globals().get("_TRAIN_LIMIT"/"_TRAIN_TEST_SIZE", 기본값)으로 읽어간다.
    _notebook_runtime.load(
        run_main=True,
        initial_globals={"_TRAIN_LIMIT": train_limit, "_TRAIN_TEST_SIZE": args.test_size},
    )


if __name__ == "__main__":
    main()
