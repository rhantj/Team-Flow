"""``delay_model.ipynb``의 라이브러리 정의 셀을 일반 모듈처럼 사용하기 위한 로더.

``delay_model.py``는 따로 존재하지 않고 노트북(``delay_model.ipynb``)만 있으므로,
노트북 코드 셀 중 학습/추론 테스트 실행 셀(``build_training_dataframe(`` 호출이 등장하는
지점부터)을 제외한 "라이브러리 정의부"만 순서대로 ``exec``하여 ``train_and_save``,
``load_artifact`` 등을 이 모듈의 속성으로 노출한다.
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path
from typing import Optional

_NOTEBOOK_PATH = Path(__file__).with_name("delay_model.ipynb")

_module_cache: Optional[types.ModuleType] = None


def load() -> types.ModuleType:
    """노트북의 라이브러리 정의부를 실행하고, 그 결과를 담은 모듈 객체를 반환한다.

    두 번째 호출부터는 캐시된 모듈을 그대로 반환한다(재실행하지 않음).
    """
    global _module_cache
    if _module_cache is not None:
        return _module_cache

    with _NOTEBOOK_PATH.open(encoding="utf-8") as f:
        notebook = json.load(f)

    module_name = "ml_delay_risk.models._delay_model_notebook"
    module = types.ModuleType(module_name)
    module.__file__ = str(_NOTEBOOK_PATH)
    # dataclasses는 정의된 클래스의 필드 타입을 sys.modules[cls.__module__]에서 찾으므로,
    # exec 전에 이 모듈을 sys.modules에 등록해 둬야 @dataclass(ModelArtifact)가 동작한다.
    sys.modules[module_name] = module


    # <주피터 노트북 모듈화 - 모듈 탐색 로직>
    for cell in notebook["cells"]:
        if cell.get("cell_type") != "code":
            continue
        source = "".join(cell.get("source", []))
        
        # 마커 검사(_STOP_MARKER) 및 break 로직 완전히 제거
        exec(compile(source, str(_NOTEBOOK_PATH), "exec"), module.__dict__)

    _module_cache = module
    return module
