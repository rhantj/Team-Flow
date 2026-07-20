"""delay_model.ipynb의 정적 구조(경로 부트스트래핑, delay_model.py import 셀 등)가
학습 파이프라인 실행 없이도 깨지지 않았는지 확인하는 회귀 테스트.

predict_class_probabilities/proxy_deadline_for/ModelArtifact/load_artifact의 실제 동작은
정의가 있는 ml_delay_risk.models.delay_model을 직접 대상으로 tests/ml_delay_risk/
test_delay_model.py가 검증한다. 이 테스트는 노트북이 그 이름들을 재정의하지 않고 실제로
import하고 있는지만 본다 — 재정의가 슬쩍 다시 들어가면 이 파일과 delay_model.py의 정의가
갈라지는(=이번 리팩터로 없앤 문제) 회귀를 잡기 위함이다.
"""
from __future__ import annotations

import json

import pytest

from ml_delay_risk.models import _notebook_runtime, delay_model


def test_notebook_reexports_delay_model_symbols_without_redefining() -> None:
    # 실패 시 NotebookRuntimeError가 어느 셀(인덱스·가장 가까운 마크다운 제목)에서
    # 문제가 생겼는지 메시지에 담아 알려준다.
    module = _notebook_runtime.load()

    for name in ("load_artifact", "predict_class_probabilities", "proxy_deadline_for", "ModelArtifact"):
        notebook_value = getattr(module, name, None)
        assert notebook_value is not None, f"delay_model.ipynb에 '{name}'이(가) 없습니다."
        assert notebook_value is getattr(delay_model, name), (
            f"delay_model.ipynb의 '{name}'이 ml_delay_risk.models.delay_model에서 import된 것이 "
            "아니라 노트북 안에서 재정의된 것으로 보입니다. 두 곳의 정의가 갈라지지 않도록 "
            "delay_model.py에서 import해서 쓰세요."
        )


def test_validate_all_cells_compile_passes_on_real_notebook() -> None:
    """학습/EDA 셀(_RUN_TRAINING_CELLS 게이트 안쪽)은 run_main=False에서는 아예 실행되지
    않으므로, 실제로 python -m ml_delay_risk.train을 돌려보기 전까지는 그 안의 구문 오류를
    알 수 없었다. 이 테스트는 MongoDB나 실데이터 없이도 노트북 전체(게이트된 셀 포함) 구문을
    미리 검사해 그 공백을 메운다."""
    with _notebook_runtime._NOTEBOOK_PATH.open(encoding="utf-8") as f:
        cells = json.load(f)["cells"]

    _notebook_runtime._validate_all_cells_compile(cells)  # 예외 없이 통과해야 함


def test_validate_all_cells_compile_reports_broken_cell_location() -> None:
    cells = [
        {"cell_type": "markdown", "source": ["## 어떤 섹션\n"]},
        {"cell_type": "code", "source": ["x = 1\n"]},
        {"cell_type": "code", "source": ["def broken(:\n"]},  # 의도적 구문 오류
    ]

    with pytest.raises(_notebook_runtime.NotebookRuntimeError, match="cell #2"):
        _notebook_runtime._validate_all_cells_compile(cells)
