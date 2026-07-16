"""``delay_model.ipynb``를 일반 모듈처럼(또는 스크립트처럼) 실행하기 위한 로더.

``delay_model.py``는 따로 존재하지 않고 노트북(``delay_model.ipynb``)만 있다. 노트북의
학습/EDA 셀은 대화형 실행(Jupyter)에서만 돌게 하려고 ``if _RUN_TRAINING_CELLS:``로
감싸져 있으므로, 이 로더가 그 플래그를 어떻게 주입하느냐에 따라 두 가지 쓰임이 갈린다.

- ``load()`` (기본값, ``run_main=False``): 라우터/서비스가 ``load_artifact`` 등 함수만
  가져다 쓰는 경우. ``_RUN_TRAINING_CELLS=False``를 주입해 학습/EDA 셀은 건너뛰고
  함수/클래스 정의부만 로드한다. 이후 호출은 캐시를 반환한다.
- ``load(run_main=True)``: ``train.py``처럼 실제로 학습 파이프라인 전체를 돌려야 하는 경우.
  ``_RUN_TRAINING_CELLS=True``를 주입해 학습/EDA 셀까지 전부 실행한다. 매번 새로 실행하며
  캐시하지 않는다.

모듈 이름은 ``run_main`` 값과 무관하게 항상 같은 고정 이름을 쓴다. 예전엔 ``run_main=True``일 때
``__name__``을 실제로 ``"__main__"``으로 바꿔치기했었는데, 그러면 이 노트북에서 정의하는
``ModelArtifact`` 같은 클래스의 ``__module__``도 ``"__main__"``이 되어버려 joblib으로 저장한
모델을 다른 프로세스(FastAPI 서버)에서 ``load_artifact()``로 언피클할 때
``AttributeError: module '__main__' has no attribute 'ModelArtifact'``로 깨졌다. 모듈 이름을
고정해야 학습 시 저장한 아티팩트를 서비스 프로세스에서도 그대로 읽을 수 있다.
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path
from typing import Any, Optional

_NOTEBOOK_PATH = Path(__file__).with_name("delay_model.ipynb")
_MODULE_NAME = "ml_delay_risk.models._delay_model_notebook"

_module_cache: Optional[types.ModuleType] = None


def load(
    *, run_main: bool = False, initial_globals: Optional[dict[str, Any]] = None
) -> types.ModuleType:
    global _module_cache
    if not run_main and _module_cache is not None:
        return _module_cache

    if run_main:
        # 노트북의 학습 셀은 Jupyter의 inline 백엔드(non-blocking)를 전제로 plt.show()를
        # 호출한다. train.py 같은 일반 스크립트에서 그대로 실행하면 GUI 백엔드가 창을 띄우고
        # 응답을 기다리며 프로세스가 멈추므로, pyplot import 이전에 Agg(비대화형)로 고정한다.
        import matplotlib

        matplotlib.use("Agg")

    with _NOTEBOOK_PATH.open(encoding="utf-8") as f:
        notebook = json.load(f)

    module = types.ModuleType(_MODULE_NAME)
    module.__file__ = str(_NOTEBOOK_PATH)
    module.__dict__["_RUN_TRAINING_CELLS"] = run_main
    # display()는 IPython 커널이 주입하는 내장 함수라 일반 스크립트 실행(run_main=True,
    # 예: train.py) 시에는 정의돼 있지 않다. Jupyter 밖에서도 죽지 않도록 print로 대체한다.
    module.__dict__["display"] = lambda *objs: print(*objs)
    if initial_globals:
        module.__dict__.update(initial_globals)

    # dataclasses는 정의된 클래스의 필드 타입을 sys.modules[cls.__module__]에서 찾으므로,
    # exec 전에 이 모듈을 sys.modules에 등록해 둬야 @dataclass(ModelArtifact)가 동작한다.
    previous_module = sys.modules.get(_MODULE_NAME)
    sys.modules[_MODULE_NAME] = module
    try:
        for cell in notebook["cells"]:
            if cell.get("cell_type") != "code":
                continue
            source = "".join(cell.get("source", []))
            exec(compile(source, str(_NOTEBOOK_PATH), "exec"), module.__dict__)
    finally:
        if not run_main:
            pass  # 캐시로 남겨둘 것이므로 sys.modules 항목도 그대로 둔다.
        elif previous_module is not None:
            sys.modules[_MODULE_NAME] = previous_module
        else:
            sys.modules.pop(_MODULE_NAME, None)

    if not run_main:
        _module_cache = module
    return module
