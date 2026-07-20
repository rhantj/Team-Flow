"""LightGBM 3단계(정상/주의/위험) 분류 모델 학습 스크립트.

실행 (backend_fastapi 디렉터리에서):
    python -m ml_delay_risk.train
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
        default=None,
        help="이슈 수를 제한해 빠르게 파일럿 실행 (예: 2000). 미지정 시 전체 데이터 사용",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    # delay_model.ipynb의 학습 파이프라인(피처 선정 → 이슈 단위 층화 분할 → LightGBM 학습 →
    # 평가 → 저장)을 노트북 그대로 실행한다. limit/test_size는 노트북 셀이
    # globals().get("_TRAIN_LIMIT"/"_TRAIN_TEST_SIZE", 기본값)으로 읽어간다.
    _notebook_runtime.load(
        run_main=True,
        initial_globals={"_TRAIN_LIMIT": args.limit, "_TRAIN_TEST_SIZE": args.test_size},
    )


if __name__ == "__main__":
    main()
