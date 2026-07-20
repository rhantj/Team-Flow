"""``delay_model.ipynb``를 일반 모듈처럼(또는 스크립트처럼) 실행하기 위한 로더.

프로덕션 코드(``routers/delay_router.py``, ``services/delay_service.py``)는 더 이상 이 로더를
쓰지 않는다 — ``ModelArtifact``/``load_artifact``/``predict_class_probabilities``/
``proxy_deadline_for``는 평범한 모듈인 ``ml_delay_risk/models/delay_model.py``로 옮겨졌고,
노트북도 그 모듈을 import해서 쓸 뿐 재정의하지 않는다(``delay_model.ipynb``의 "## 4." 셀 참고).
이 로더는 이제 두 곳에서만 쓰인다.

- ``train.py``가 ``load(run_main=True)``로 학습 파이프라인 전체(``if _RUN_TRAINING_CELLS:``로
  감싸진 셀들)를 노트북 그대로 실행할 때. 매번 새로 실행하며 캐시하지 않는다.
- ``tests/ml_delay_risk/test_notebook_runtime.py``가 ``load()``(기본값, ``run_main=False``)로
  노트북의 정적 구조(경로 부트스트래핑, ``delay_model.py`` import 셀 등)가 여전히 문제없이
  파싱/실행되는지만 가볍게 확인할 때. ``_RUN_TRAINING_CELLS=False``를 주입해 학습/EDA 셀은
  건너뛴다.

모듈 이름은 ``run_main`` 값과 무관하게 항상 같은 고정 이름을 쓴다. 예전엔 ``run_main=True``일 때
``__name__``을 실제로 ``"__main__"``으로 바꿔치기했었는데, 그러면 이 노트북(당시엔 여기서
``ModelArtifact``를 직접 정의했다)에서 정의하는 클래스의 ``__module__``도 ``"__main__"``이
되어버려 joblib으로 저장한 모델을 다른 프로세스에서 언피클할 때
``AttributeError: module '__main__' has no attribute 'ModelArtifact'``로 깨졌다. 지금은
``ModelArtifact``가 ``delay_model.py``라는 실제 임포트 가능한 모듈에 있어 이 문제 자체가
구조적으로 재발할 수 없다.

노트북을 JSON으로 파싱해 exec()하는 구조 자체의 "셀 순서·내용이 바뀌면 조용히 깨질 수 있는"
위험은 train.py가 쓰는 학습 파이프라인 부분에는 여전히 남아 있다(학습은 대화형 탐색이 필요한
노트북 워크플로우로 남기기로 함). 실패를 "빠르고 분명하게" 만드는 두 가지 안전장치를 둔다.
1. 셀 실행 중 예외가 나면 어느 셀(인덱스·가장 가까운 마크다운 제목)에서 났는지 덧붙여 재발생시킨다.
2. ``run_main=False`` 로드가 끝나면 필수 이름이 다 있는지(=import 셀이 여전히 제대로 동작하는지)
   즉시 검사해서, 빠진 이름이 있으면(예: import 셀이 실수로 삭제됨) 바로 실패한다.
"""
from __future__ import annotations

import json
import sys
import threading
import types
from pathlib import Path
from typing import Any, Optional

_NOTEBOOK_PATH = Path(__file__).with_name("delay_model.ipynb")
_MODULE_NAME = "ml_delay_risk.models._delay_model_notebook"

# delay_model.py에서 import되어야 하는 이름들. 노트북의 import 셀이 삭제되거나 이 중 하나를
# 재정의로 가려버리면, train.py 실행 중간이 아니라 로드 시점에 바로 에러가 나야 원인을 찾기 쉽다.
_REQUIRED_ATTRS = (
    "load_artifact",
    "predict_class_probabilities",
    "proxy_deadline_for",
    "ModelArtifact",
)

_module_cache: Optional[types.ModuleType] = None
_module_cache_lock = threading.Lock()


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

    # FastAPI가 동기 라우트 핸들러를 스레드풀에서 실행하므로, 캐시 미스 상태에서 여러 요청이
    # 동시에 최초 로드를 시도할 수 있다. 락 없이는 스레드마다 노트북을 중복 실행해 서로 다른
    # 모듈/클래스 객체를 만들고, sys.modules와 _module_cache가 가리키는 모듈이 어긋나
    # (ModelArtifact의 __module__ 불일치로 pickle/isinstance가 깨지는 것과 같은 종류의 문제로)
    # 이어질 수 있어 락으로 직렬화한다.
    with _module_cache_lock:
        if not run_main and _module_cache is not None:
            return _module_cache  # 락 대기 중 다른 스레드가 이미 로드를 끝냈을 수 있음

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
                    "delay_model.py를 import하는 셀이 삭제되었거나 다른 이름으로 가려지지 않았는지 "
                    "확인하세요."
                )
            _module_cache = module
        return module
