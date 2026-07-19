"""delay_model.ipynb를 실제로 로드해보는 회귀 테스트.

delay_router.py/delay_service.py는 이제 노트북을 요청 처리 시점에 지연 로드하므로(임포트
시점 크래시 방지), 노트북 셀 순서·마커 문자열이 깨져도 서버는 정상 기동하고 해당 요청만
503으로 실패한다. 그 대가로 "깨졌다"는 사실 자체는 실제 요청이 오기 전까지 드러나지 않을
수 있는데, 이 테스트가 배포 전(로컬/CI pytest 실행 시점)에 미리 잡아내는 역할을 한다.
"""
from __future__ import annotations

from ml_delay_risk.models import _notebook_runtime


def test_notebook_runtime_loads_required_symbols() -> None:
    # 실패 시 NotebookRuntimeError가 어느 셀(인덱스·가장 가까운 마크다운 제목)에서
    # 문제가 생겼는지 메시지에 담아 알려준다.
    module = _notebook_runtime.load()

    for name in ("load_artifact", "predict_class_probabilities", "proxy_deadline_for", "ModelArtifact"):
        assert callable(getattr(module, name)), f"delay_model.ipynb에 '{name}'이(가) 없거나 호출할 수 없습니다."
