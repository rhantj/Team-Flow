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

노트북을 JSON으로 파싱해 exec()하는 구조 자체는(라우터/서비스가 지금도 이 방식에 의존) 셀
순서·내용이 바뀌면 조용히 깨질 수 있는 위험이 남아 있다. 이를 완전히 없애려면 노트북을 포기하고
평범한 .py 모듈로 되돌려야 하는데, 그러면 노트북을 탐색/학습 도구로 쓰려는 원래 설계 의도와
충돌한다. 대신 실패를 "빠르고 분명하게" 만드는 두 가지 안전장치를 둔다.
1. 셀 실행 중 예외가 나면 어느 셀(인덱스·가장 가까운 마크다운 제목)에서 났는지 덧붙여 재발생시킨다.
2. 로드가 끝나면 라우터/서비스가 실제로 참조하는 이름이 다 있는지 즉시 검사해서, 있어야 할 이름이
   빠져 있으면(예: 노트북 편집 중 함수가 삭제/오타) import 시점에 바로 실패한다 — 실제 예측 요청이
   들어왔을 때에야 AttributeError로 터지는 것보다 훨씬 원인을 찾기 쉽다.
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path
from typing import Any, Optional

_NOTEBOOK_PATH = Path(__file__).with_name("delay_model.ipynb")
_MODULE_NAME = "ml_delay_risk.models._delay_model_notebook"

# 라우터/서비스(delay_router.py, delay_service.py)가 `_notebook_runtime.load()`로 가져다
# 쓰는 이름들. 노트북 셀 편집으로 이 중 하나라도 사라지면, 실제 예측 요청이 들어왔을 때가 아니라
# 로드 시점에 바로 에러가 나야 원인을 찾기 쉽다.
_REQUIRED_ATTRS = (
    "load_artifact",
    "predict_class_probabilities",
    "proxy_deadline_for",
    "ModelArtifact",
)

_module_cache: Optional[types.ModuleType] = None


class NotebookRuntimeError(RuntimeError):
    """노트북 셀 실행 실패, 또는 로드 후 필수 이름이 빠졌을 때 발생."""


def _nearest_heading(cells: list[dict[str, Any]], upto_index: int) -> Optional[str]:
    for cell in reversed(cells[:upto_index]):
        if cell.get("cell_type") == "markdown":
            source = "".join(cell.get("source", [])).strip()
            if source:
                return source.splitlines()[0][:80]
    return None


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
    cells = notebook["cells"]

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
        for index, cell in enumerate(cells):
            if cell.get("cell_type") != "code":
                continue
            source = "".join(cell.get("source", []))
            try:
                exec(compile(source, str(_NOTEBOOK_PATH), "exec"), module.__dict__)
            except Exception as exc:
                heading = _nearest_heading(cells, index)
                location = f"cell #{index}" + (f" ('{heading}' 아래)" if heading else "")
                raise NotebookRuntimeError(
                    f"delay_model.ipynb {location} 실행 중 오류: {exc!r}. "
                    "노트북 셀이 최근에 편집되지 않았는지 확인하세요."
                ) from exc
    finally:
        if not run_main:
            pass  # 캐시로 남겨둘 것이므로 sys.modules 항목도 그대로 둔다.
        elif previous_module is not None:
            sys.modules[_MODULE_NAME] = previous_module
        else:
            sys.modules.pop(_MODULE_NAME, None)

    if not run_main:
        missing = [name for name in _REQUIRED_ATTRS if not hasattr(module, name)]
        if missing:
            raise NotebookRuntimeError(
                f"delay_model.ipynb에서 필수 이름이 빠졌습니다: {missing}. "
                "라우터/서비스가 이 이름들을 직접 참조하므로, 노트북에서 함수/클래스 정의를 "
                "지우거나 이름을 바꿨다면 delay_router.py/delay_service.py도 함께 확인하세요."
            )
        _module_cache = module
    return module
