# CatBoost/XGBoost/RandomForest 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `delay_model.ipynb`에 CatBoost/XGBoost/RandomForest 3개 모델을 LightGBM과 같은
파이프라인으로 추가하고, 4개 모델을 검증 F1-Macro/precision/recall/f1-score/support +
혼동행렬로 비교하는 섹션을 만든다.

**Architecture:** 노트북은 함수로 감싸지 않고 셀을 순차 실행하는 stateful 구조. 피처 선정은
상관계수(R²) 기반으로 1회만 계산해 4개 모델이 완전히 같은 `selected_features`를 쓴다.
LightGBM/CatBoost/XGBoost는 같은 인코딩(카테고리 dtype 유지)이라 SMOTE 결과(`train_features_
resampled`)도 재사용한다. RandomForest만 원-핫 인코딩 + 일반 SMOTE로 별도 처리한다.
모델 저장/추론 테스트 실행 셀은 노트북 맨 끝으로 이동하고 LightGBM만 대상으로 유지한다.

**Tech Stack:** LightGBM 4.6.0(기존) / catboost 1.2.10(신규) / xgboost 3.2.0(기존) /
scikit-learn 1.6.1(기존, RandomForestClassifier) / imbalanced-learn 0.14.2(SMOTENC+SMOTE) /
pandas 2.2.3 / matplotlib 3.10.0 / seaborn 0.13.2.

이 작업은 pytest 단위 테스트가 아니라, 이 노트북 자체가 검증 대상이다(기존 노트북도 같은
방식). 각 태스크는 "코드를 셀에 반영 → `jupyter nbconvert --execute`로 전체 노트북을
파일럿 사이즈(`limit=1500`, 기본값)로 실제 실행 → exit code와 특정 셀의 stdout 출력으로
확인"을 검증 스텝으로 쓴다. 로컬 MongoDB(`ml_dashboard`)가 이미 떠 있는 것을 확인했다.
`nbconvert`/`nbformat`은 이 검증을 위해 로컬 venv에 이미 설치했다(앱 의존성이 아니므로
`requirements.txt`에는 추가하지 않음).

## Global Constraints

- random_state=42로 재현성 고정 (기존 LightGBM 셀과 동일).
- 그래프는 노트북 인라인 표시(`plt.show()`)만 하고 파일로 저장하지 않는다 (사용자 확인 완료).
- 신규 3개 모델은 비교 실험용 — 모델 저장(`ModelArtifact`)과 실시간 추론은 계속 LightGBM만
  대상으로 한다 (사용자 확인 완료).
- 하이퍼파라미터 튜닝은 범위 밖 — LightGBM과 비슷한 스케일의 베이스라인만 사용.
- LightGBM 쪽 기존 변수명(`feature_names`/`categorical_columns`/`booster`/`train_features_
  resampled` 등)은 그대로 두고, 신규 모델만 `cb_`/`xgb_`/`rf_` 접두사를 쓴다 — 이미 동작하는
  코드를 이름만 바꾸는 리스크를 피하기 위함.
- 커밋은 사용자가 요청할 때만 한다 (각 태스크 끝에 자동 커밋하지 않음).

## 검증 공통 절차

모든 태스크의 "실행" 스텝은 아래 명령을 노트북이 있는 디렉터리에서 실행한다 (경로 계산이
`Path.cwd()`에 의존하므로 반드시 이 디렉터리에서 실행— Task 1 계획 참고):

```bash
cd "D:/AIproject/project/Team/work-flow/App/backend_fastapi/ml_delay_risk/models"
"D:/AIproject/project/Team/work-flow/.venv/Scripts/python.exe" -m jupyter nbconvert \
  --to notebook --execute --inplace --ExecutePreprocessor.timeout=600 delay_model.ipynb
```

exit code 0이면 모든 셀이 에러 없이 끝난 것이다 (0이 아니면 `CellExecutionError`가 stderr에
어느 셀인지와 함께 출력된다). 그 다음 아래 스니펫으로 특정 셀의 stdout을 확인한다
(`<검색어>`는 각 태스크에서 지정):

```python
import json
nb = json.load(open(r"D:/AIproject/project/Team/work-flow/App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb", encoding="utf-8"))
for cell in nb["cells"]:
    src = "".join(cell["source"])
    if "<검색어>" in src:
        for out in cell.get("outputs", []):
            print("".join(out.get("text", [])))
            if "data" in out:
                print([k for k in out["data"].keys()])
```

노트북 편집은 `NotebookEdit` 도구를 쓴다 — `cell_id`가 필요하므로 각 스텝 전에 `Read`로
노트북을 먼저 읽어 대상 셀의 `id`를 확인한다 (아래 각 스텝은 셀을 소스 내용으로 특정하니,
그 내용이 있는 셀의 `id`를 찾아 사용).

---

### Task 1: catboost 의존성 추가 + Imports/제목 셀 갱신

**Files:**
- Modify: `App/backend_fastapi/requirements.txt`
- Modify: `App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb` (cell 0, cell 5)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `CatBoostClassifier`/`XGBClassifier`/`RandomForestClassifier`가 임포트된 상태
  (Task 3/4/5가 이 이름을 그대로 씀).

- [ ] **Step 1: requirements.txt에 catboost 추가**

`App/backend_fastapi/requirements.txt`에서 `xgboost==3.2.0` 줄 바로 다음에 아래 줄을 추가한다
(로컬 venv에는 이미 `pip install catboost`로 1.2.10이 설치돼 `pip check` 충돌 없음을 확인함):

```
catboost==1.2.10
```

- [ ] **Step 2: Imports 셀(cell 5) 교체**

`Read`로 노트북을 읽고, 소스가 `from __future__ import annotations`로 시작하는 code 셀의
`id`를 찾는다. `NotebookEdit`으로 `edit_mode="replace"`, 아래 `new_source`로 교체:

```python
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import joblib
import lightgbm as lgb
from catboost import CatBoostClassifier
from xgboost import XGBClassifier
import matplotlib.pyplot as plt
import seaborn as sns

# 설치된 폰트 중 한글 폰트가 있을 때만 지정한다. 리스트로 지정하면 matplotlib가
# 글자 단위로 각 후보 폰트를 확인하며 없는 폰트마다 findfont 경고를 반복 출력하므로,
# font_manager로 실제 설치 여부를 미리 확인해 존재하는 폰트 하나만 설정한다.
# 아무 것도 없으면(Docker/Linux 등) 건드리지 않고 matplotlib 기본 폰트를 그대로 쓴다
# (한글 라벨은 tofu로 깨져 보일 수 있지만 경고는 나지 않는다).
import matplotlib.font_manager as fm

_installed_fonts = {f.name for f in fm.fontManager.ttflist}
_korean_font = next(
    (name for name in ("Malgun Gothic", "NanumGothic", "AppleGothic") if name in _installed_fonts),
    None,
)
if _korean_font:
    plt.rcParams["font.family"] = _korean_font
plt.rcParams["axes.unicode_minus"] = False  # 위 폰트 사용 시 마이너스 기호 깨짐 방지
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold

from ml_delay_risk.models.feature_engineering import RISK_CLASS_NAMES
from ml_delay_risk.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)
```

- [ ] **Step 3: 제목 셀(cell 0) 교체**

소스가 `# 지연 위험도(정상/주의/위험) 분류 모델 — LightGBM`로 시작하는 markdown 셀을 찾아
`replace`:

```markdown
# 지연 위험도(정상/주의/위험) 분류 모델 — LightGBM / CatBoost / XGBoost / Random Forest 비교

피처 선정(상관계수 R² 기반, 4개 모델 공용) → 이슈 단위 층화 분할 → LightGBM/CatBoost/XGBoost/
RandomForest 각각 학습 → 4개 모델 성능 비교 → LightGBM 모델 저장까지의 파이프라인을 함수로
감싸지 않고, 각 단계를 셀 단위로 라이브러리 함수를 직접 호출하며 실행합니다. 중간 결과(피처
후보/딕셔너리, 분할 결과, 클래스 분포, 피처 중요도, 성능 비교표, 혼동 행렬 등)는 각 단계 직후
셀에서 바로 확인할 수 있습니다.

CatBoost/XGBoost/Random Forest는 비교 실험용이며, 모델 저장/로드(`load_artifact`)와 실시간
추론(`predict_class_probabilities`, `proxy_deadline_for`)은 지금처럼 LightGBM만 대상으로
합니다. 이 함수들은 `App/backend_fastapi/ml_delay_risk/services/delay_service.py`가
`_notebook_runtime.load()`를 통해 이 노트북에서 직접 가져다 쓰므로 함수 형태로 유지합니다.

실제로 이 노트북에서 학습을 실행하려면 `ml_delay_risk/config.py`에 설정된 MongoDB(`ml_dashboard`)에
접속 가능해야 합니다.
```

- [ ] **Step 4: import 확인 (빠른 체크, 전체 노트북 실행 전에)**

```bash
"D:/AIproject/project/Team/work-flow/.venv/Scripts/python.exe" -c "from catboost import CatBoostClassifier; from xgboost import XGBClassifier; from sklearn.ensemble import RandomForestClassifier; print('ok')"
```

Expected: `ok` 출력.

---

### Task 2: 공용 피처 선정을 상관계수(R²) 기반으로 교체 + 저장/추론 셀 임시 제거

**Files:**
- Modify: `App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb` (cell 17, 23, 24, 25 교체;
  cell 32/33/34/35/36 삭제 — 내용은 Task 7에서 그대로 재삽입)

**Interfaces:**
- Consumes: `df`, `candidate_features`, `freq_maps`, `CATEGORICAL_COLUMNS`,
  `FREQUENCY_ENCODED_COLUMNS`, `FEATURE_DESCRIPTIONS` (기존 cell 7/18/21/22, 무변경)
- Produces: `encoded_df`(프로브 모델 학습 없이 인코딩만), `feature_importance_report`
  (컬럼: `feature`/`r2`/`r2_pct`), `selected_features`(리스트, **4개 모델 공용** — Task 3/4/5/6이
  간접적으로 `feature_names`/`categorical_columns`를 통해 이 값을 씀).

- [ ] **Step 1: `## 7` 마크다운 제목(cell 17) 교체**

소스가 `## 7. 학습 실행 — 피처 선정부터 모델 저장까지`인 markdown 셀을 `replace`:

```markdown
## 7. 학습 실행 — 피처 선정부터 4개 모델 학습까지
```

- [ ] **Step 2: 프로브 인코딩 셀(cell 23) 교체 — LightGBM 프로브 모델 학습 제거**

소스가 `# 피처 중요도만 산정할 프로브용 인코딩`으로 시작하는 code 셀을 `replace`:

```python
if _RUN_TRAINING_CELLS:
    # 피처 선정(상관계수 계산)용 인코딩 — 실제 학습(train_df/test_df)과는 별개로,
    # 전체 데이터를 그대로 인코딩한다. 모델을 학습시키지 않고 상관계수만 계산하므로
    # (아래 참고) 클래스 가중치는 필요 없다.
    encoded_df = df.copy()
    for col in FREQUENCY_ENCODED_COLUMNS:
        if col in encoded_df.columns:
            encoded_df[col] = encoded_df[col].map(freq_maps.get(col, {})).fillna(0).astype(int)
    for col in CATEGORICAL_COLUMNS:
        if col in encoded_df.columns:
            encoded_df[col] = encoded_df[col].astype("category")

    print(f"피처 선정용 인코딩 완료 — encoded_df shape: {encoded_df.shape}")
```

- [ ] **Step 3: 피처 중요도/선정 셀(cell 24) 교체 — gain → 상관계수(R²)**

소스가 `# <피처 선정 — 학습/검증 분할 이전에 전체 데이터로 수행>`을 포함하는 code 셀을
`replace`:

```python
if _RUN_TRAINING_CELLS:
    # <공용 피처 선정 — 상관계수(R²) 기반, LightGBM/CatBoost/XGBoost/RandomForest 4개 모델 공용>
    # 각 모델이 따로 피처 중요도를 재면 "어떤 모델이 더 유리한 피처를 골랐는가"가 알고리즘
    # 자체 비교에 섞여 들어가므로, 모델에 의존하지 않는 상관계수로 한 번만 선정해 4개
    # 모델이 완전히 같은 selected_features를 쓰게 한다.
    #
    # CATEGORICAL_COLUMNS(issuetype_name/priority_name/project_key/status_at_cutoff)는
    # 순서가 없는 명목형이라, 임의의 정수 코드로 그냥 상관계수를 내면 코드 순서(예: 알파벳
    # 순)에 따라 왜곡된다. 원-핫으로 펼쳐 더미 컬럼별 상관계수를 구한 뒤, 같은 원본 컬럼에서
    # 나온 더미들의 R²를 합산해서 원본 컬럼 하나의 설명력으로 되돌린다.
    numeric_candidate_features = [c for c in candidate_features if c not in CATEGORICAL_COLUMNS]
    r2_by_feature: dict[str, float] = {}

    for col in numeric_candidate_features:
        r = encoded_df[col].corr(encoded_df["risk_class"])
        r2_by_feature[col] = 0.0 if pd.isna(r) else r ** 2

    nominal_candidate_columns = [c for c in CATEGORICAL_COLUMNS if c in candidate_features]
    if nominal_candidate_columns:
        nominal_dummies = pd.get_dummies(encoded_df[nominal_candidate_columns], columns=nominal_candidate_columns)
        for source_col in nominal_candidate_columns:
            dummy_cols = [c for c in nominal_dummies.columns if c.startswith(f"{source_col}_")]
            dummy_r2_total = 0.0
            for dummy_col in dummy_cols:
                r = nominal_dummies[dummy_col].corr(encoded_df["risk_class"])
                dummy_r2_total += 0.0 if pd.isna(r) else r ** 2
            r2_by_feature[source_col] = dummy_r2_total

    r2_series = pd.Series(r2_by_feature)
    r2_pct = r2_series / r2_series.sum() * 100 if r2_series.sum() > 0 else r2_series

    feature_importance_report = pd.DataFrame(
        {"feature": r2_series.index, "r2": r2_series.values, "r2_pct": r2_pct.values}
    ).sort_values("r2_pct", ascending=False).reset_index(drop=True)

    importance_threshold = 0.01
    selected_features = feature_importance_report.loc[
        feature_importance_report["r2_pct"] / 100 >= importance_threshold, "feature"
    ].tolist()

    print(
        f"피처 선정(상관계수 R² 기반): 후보 {len(candidate_features)}개 중 {len(selected_features)}개 선정 "
        f"(기준: R² 비중 {importance_threshold * 100:.1f}% 이상) — 4개 모델 공용"
    )
    display(feature_importance_report)
```

- [ ] **Step 4: 시각화 셀(cell 25) 교체 — gain_pct → r2_pct**

소스가 `# <Feature importance(Gain) 시각화>`를 포함하는 code 셀을 `replace`:

```python
if _RUN_TRAINING_CELLS:
    # <선정된 피처 시각화 — 상관계수 R² 기준>
    print(f"\n선정된 피처 {len(selected_features)}개 설명 (R² 비중 내림차순):")
    selected_report = feature_importance_report[feature_importance_report["feature"].isin(selected_features)]
    for _, row in selected_report.iterrows():
        description = FEATURE_DESCRIPTIONS.get(row["feature"], "(설명 미등록)")
        print(f"  - {row['feature']} (R² 비중 {row['r2_pct']:.1f}%): {description}")

    plot_df = selected_report.sort_values("r2_pct")
    fig, ax = plt.subplots(figsize=(7, max(4, len(selected_features) * 0.35)))
    sns.barplot(data=plot_df, x="r2_pct", y="feature", color="#4C72B0", ax=ax)
    ax.set_xlabel("R² 비중 (%)")
    ax.set_ylabel("")
    ax.set_title("선정된 피처 설명력 (상관계수 R², 4개 모델 공용)")
    fig.tight_layout()
    plt.show()
    plt.close(fig)
```

- [ ] **Step 5: 모델 저장/추론 테스트 셀 삭제 (Task 7에서 끝으로 재삽입)**

`Read`로 노트북을 다시 읽고, 아래 5개 셀을 순서대로 `NotebookEdit`(`edit_mode="delete"`)로
삭제한다 — 삭제 전에 각 셀 내용을 그대로 기록해 둔다(Task 7에서 동일하게 다시 씀):

1. `if _RUN_TRAINING_CELLS:\n    artifact = ModelArtifact(`로 시작하는 code 셀
2. `# <학습 완료 후 생성된 ModelArtifact 객체 시각화>`를 포함하는 code 셀
3. `## 8. 저장된 모델로 추론 테스트`인 markdown 셀
4. `# 이 노트북 안에서는 load_artifact()가`로 시작하는 code 셀
5. `# '지연 위험도 예측' 테스트 실행`을 포함하는 code 셀

(삭제 후 이 5개 셀의 정확한 원본 소스는 Task 7 Step 2에 그대로 적어뒀다.)

- [ ] **Step 6: 실행 및 검증**

공통 절차대로 nbconvert 실행(exit code 0 확인). `<검색어>`를 `"피처 선정(상관계수 R² 기반)"`
으로 검증 스니펫 실행 — `선정: 후보 N개 중 M개 선정` 형태 출력에서 `M > 0`이고
`M < N`(1% 미만인 피처는 실제로 걸러짐)인지 확인. `display(feature_importance_report)`의
출력(`text/html` 또는 `text/plain` data)도 존재하는지 확인.

---

### Task 3: CatBoost 섹션 추가

**Files:**
- Modify: `App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb` (cell 31 뒤에 code 셀
  2개 삽입)

**Interfaces:**
- Consumes: `feature_names`, `categorical_columns`, `train_features_resampled`,
  `train_labels_resampled`, `test_df`, `NUM_CLASSES` (기존 LightGBM cell 28/29/7, 무변경)
- Produces: `CATBOOST_PARAMS`(dict), `cb_model`(학습된 `CatBoostClassifier`) — Task 6이 씀.

- [ ] **Step 1: `Read`로 노트북을 읽고 LightGBM 평가 셀(cell 31, `F1-Macro, classification
  report로 클래스별 성능을 확인`으로 시작)의 `id`를 확인한다.**

- [ ] **Step 2: 그 셀 뒤에 CatBoost 상수+학습 셀 삽입**

`NotebookEdit`(`edit_mode="insert"`, `cell_type="code"`, `cell_id=<cell 31의 id>`):

```python
if _RUN_TRAINING_CELLS:
    # <상수 정의 — CatBoost 하이퍼파라미터>
    # LightGBM과 같은 스케일의 베이스라인(튜닝 없음). iterations는 조기 종료 상한.
    CATBOOST_PARAMS = {
        "loss_function": "MultiClass",
        "classes_count": NUM_CLASSES,
        "learning_rate": 0.05,
        "depth": 6,
        "iterations": 500,
        "random_state": 42,
        "verbose": False,
    }

    # <SMOTE 재사용>
    # feature_names/categorical_columns가 LightGBM과 완전히 동일(같은 selected_features,
    # 같은 category dtype 인코딩)하므로 SMOTE를 다시 돌리지 않고 위 LightGBM 섹션에서 만든
    # train_features_resampled/train_labels_resampled를 그대로 재사용한다.
    print(f"CatBoost 학습에 LightGBM과 동일한 SMOTE 결과 재사용 — {len(train_features_resampled)}행")
```

- [ ] **Step 3: 방금 삽입한 셀 뒤에 CatBoost 학습 셀 삽입**

`Read`로 다시 읽어 방금 삽입한 셀의 `id`를 확인한 뒤, 그 뒤에 삽입:

```python
if _RUN_TRAINING_CELLS:
    # <모델 정의 및 학습 — CatBoost>
    cb_model = CatBoostClassifier(cat_features=categorical_columns, **CATBOOST_PARAMS)
    cb_model.fit(
        train_features_resampled,
        train_labels_resampled,
        eval_set=(test_df[feature_names], test_df["risk_class"]),
        early_stopping_rounds=30,
    )
    print(f"CatBoost 학습 완료 — best_iteration={cb_model.get_best_iteration()}")
```

- [ ] **Step 4: 실행 및 검증**

공통 절차대로 nbconvert 실행(exit code 0). `<검색어>`를 `"CatBoost 학습 완료"`로 검증 —
`best_iteration`이 출력되고 에러 트레이스백이 없는지 확인.

---

### Task 4: XGBoost 섹션 추가

**Files:**
- Modify: `App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb` (Task 3에서 삽입한
  마지막 셀 뒤에 code 셀 2개 삽입)

**Interfaces:**
- Consumes: Task 3와 동일 (`feature_names`, `categorical_columns`, `train_features_resampled`,
  `train_labels_resampled`, `test_df`, `NUM_CLASSES`)
- Produces: `XGBOOST_PARAMS`(dict), `xgb_model`(학습된 `XGBClassifier`) — Task 6이 씀.

- [ ] **Step 1: `Read`로 노트북을 읽고 Task 3에서 삽입한 마지막 셀(`CatBoost 학습 완료`
  출력하는 셀)의 `id`를 확인한다.**

- [ ] **Step 2: 그 뒤에 XGBoost 상수+SMOTE재사용 셀 삽입**

```python
if _RUN_TRAINING_CELLS:
    # <상수 정의 — XGBoost 하이퍼파라미터>
    XGBOOST_PARAMS = {
        "objective": "multi:softprob",
        "num_class": NUM_CLASSES,
        "eval_metric": "mlogloss",
        "learning_rate": 0.05,
        "max_depth": 6,
        "n_estimators": 500,
        "tree_method": "hist",
        "enable_categorical": True,
        "random_state": 42,
    }

    # <SMOTE 재사용> — CatBoost와 같은 이유로 LightGBM의 결과를 그대로 쓴다.
    print(f"XGBoost 학습에 LightGBM과 동일한 SMOTE 결과 재사용 — {len(train_features_resampled)}행")
```

- [ ] **Step 3: 그 뒤에 XGBoost 학습 셀 삽입**

`Read`로 다시 읽어 방금 삽입한 셀의 `id`를 확인한 뒤, 그 뒤에 삽입:

```python
if _RUN_TRAINING_CELLS:
    # <모델 정의 및 학습 — XGBoost>
    xgb_model = XGBClassifier(**XGBOOST_PARAMS, early_stopping_rounds=30)
    xgb_model.fit(
        train_features_resampled,
        train_labels_resampled,
        eval_set=[(test_df[feature_names], test_df["risk_class"])],
        verbose=False,
    )
    print(f"XGBoost 학습 완료 — best_iteration={xgb_model.best_iteration}")
```

- [ ] **Step 4: 실행 및 검증**

nbconvert 실행(exit code 0). `<검색어>`를 `"XGBoost 학습 완료"`로 검증.

---

### Task 5: Random Forest 섹션 추가 (원-핫 인코딩 + 일반 SMOTE)

**Files:**
- Modify: `App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb` (Task 4에서 삽입한
  마지막 셀 뒤에 code 셀 3개 삽입)

**Interfaces:**
- Consumes: `feature_names`, `categorical_columns`, `train_df`, `test_df`
- Produces: `RF_PARAMS`, `rf_nominal_columns`, `rf_train_features`, `rf_test_features`,
  `rf_train_features_resampled`, `rf_train_labels_resampled`, `rf_model`(학습된
  `RandomForestClassifier`) — Task 6이 `rf_model`/`rf_test_features`를 씀.

- [ ] **Step 1: `Read`로 노트북을 읽고 Task 4에서 삽입한 마지막 셀(`XGBoost 학습 완료`
  출력하는 셀)의 `id`를 확인한다.**

- [ ] **Step 2: 그 뒤에 RF 상수+원-핫 인코딩 셀 삽입**

```python
if _RUN_TRAINING_CELLS:
    # <상수 정의 — RandomForest 하이퍼파라미터>
    # RandomForest는 조기 종료 개념이 없어 n_estimators를 고정값으로 둔다.
    RF_PARAMS = {
        "n_estimators": 500,
        "max_depth": None,
        "random_state": 42,
        "n_jobs": -1,
    }

    # <RandomForest 학습 입력 준비 — 명목형 원-핫 인코딩>
    # sklearn RandomForestClassifier는 범주형(category dtype)을 직접 못 받는다. 피처 "선정"은
    # 이미 위 공용 단계(상관계수 R²)에서 원본 컬럼 단위로 끝났으므로, 여기서는 선정된 피처 중
    # CATEGORICAL_COLUMNS만 원-핫으로 펼쳐 실제 학습 입력을 만든다.
    rf_nominal_columns = [c for c in categorical_columns if c in feature_names]
    rf_train_features = pd.get_dummies(train_df[feature_names], columns=rf_nominal_columns)
    rf_test_features = pd.get_dummies(test_df[feature_names], columns=rf_nominal_columns)
    # train/valid에 등장하는 카테고리 값이 다를 수 있어, test 쪽 더미 컬럼을 train 기준으로
    # 맞춘다(없는 컬럼은 0으로 채움) — 그래야 두 세트의 컬럼 구성이 모델 입력과 일치한다.
    rf_test_features = rf_test_features.reindex(columns=rf_train_features.columns, fill_value=0)

    print(
        f"RandomForest 원-핫 인코딩 완료 — 피처 {len(feature_names)}개 -> {rf_train_features.shape[1]}개 컬럼 "
        f"(명목형 {len(rf_nominal_columns)}개 컬럼 확장)"
    )
```

- [ ] **Step 3: 그 뒤에 RF SMOTE 셀 삽입**

`Read`로 다시 읽어 방금 삽입한 셀의 `id`를 확인한 뒤, 그 뒤에 삽입:

```python
if _RUN_TRAINING_CELLS:
    # <SMOTE 적용 — RandomForest는 일반 SMOTE 사용>
    # 원-핫 인코딩 후에는 진짜 "범주형 컬럼"이 없고 전부 numeric(0/1 포함)이다. SMOTENC로
    # 더미 컬럼 각각을 독립적으로 범주형 취급하면 원-핫의 "하나만 1" 제약이 깨질 수 있어
    # (이웃마다 다른 더미가 1로 선택될 수 있음), 일반 SMOTE로 전부 연속형처럼 보간한다.
    # 보간된 더미 값이 소수점이 되는 것은 알려진 근사이며 RandomForest 학습에는 문제 없다.
    from imblearn.over_sampling import SMOTE

    rf_train_labels = train_df["risk_class"]
    print(f"SMOTE 적용 전 학습 세트 클래스 분포:\n{rf_train_labels.value_counts().sort_index()}")

    rf_minority_class_count = rf_train_labels.value_counts().min()
    if rf_minority_class_count < 2:
        logger.warning(
            "소수 클래스 표본이 %d개뿐이라 SMOTE를 적용할 수 없어 원본 분포를 그대로 사용합니다.",
            rf_minority_class_count,
        )
        rf_train_features_resampled, rf_train_labels_resampled = rf_train_features, rf_train_labels
    else:
        rf_k_neighbors = min(5, rf_minority_class_count - 1)
        rf_smote = SMOTE(k_neighbors=rf_k_neighbors, random_state=42)
        rf_train_features_resampled, rf_train_labels_resampled = rf_smote.fit_resample(
            rf_train_features, rf_train_labels
        )

    print(f"\nSMOTE 적용 후 학습 세트 클래스 분포:\n{rf_train_labels_resampled.value_counts().sort_index()}")
    print(f"학습 세트 행 수: {len(rf_train_features)}행 -> {len(rf_train_features_resampled)}행")
```

- [ ] **Step 4: 그 뒤에 RF 학습 셀 삽입**

`Read`로 다시 읽어 방금 삽입한 셀의 `id`를 확인한 뒤, 그 뒤에 삽입:

```python
if _RUN_TRAINING_CELLS:
    # <모델 정의 및 학습 — RandomForest>
    rf_model = RandomForestClassifier(**RF_PARAMS)
    rf_model.fit(rf_train_features_resampled, rf_train_labels_resampled)
    print(f"RandomForest 학습 완료 — n_estimators={rf_model.n_estimators}, 입력 컬럼 {rf_train_features_resampled.shape[1]}개")
```

- [ ] **Step 5: 실행 및 검증**

nbconvert 실행(exit code 0). `<검색어>`를 `"RandomForest 학습 완료"`로 검증. 추가로
`<검색어>`를 `"RandomForest 원-핫 인코딩 완료"`로도 확인해 `rf_train_features.shape[1]`이
`len(feature_names)`보다 큰지(원-핫으로 컬럼이 늘었는지) 확인한다.

---

### Task 6: 4개 모델 성능 비교 섹션 추가 + LightGBM 개별 혼동행렬 제거

**Files:**
- Modify: `App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb` (cell 31에서 혼동행렬
  블록 제거; Task 5 마지막 셀 뒤에 markdown 1개 + code 3개 삽입)

**Interfaces:**
- Consumes: `booster`, `feature_names`, `cb_model`, `xgb_model`, `rf_model`, `rf_test_features`,
  `test_df`, `NUM_CLASSES`, `RISK_CLASS_NAMES`, `f1_score`, `classification_report`,
  `confusion_matrix` (모두 기존 import/이전 태스크 산출물)
- Produces: `model_predictions`(dict), `comparison_report`(DataFrame), `f1_macro_by_model`(dict)

- [ ] **Step 1: `Read`로 노트북을 읽고 LightGBM 평가 셀(cell 31)의 `id`를 확인, 혼동행렬
  블록을 제거하도록 `replace`**

소스가 `# F1-Macro, classification report, 혼동 행렬로 클래스별 성능을 확인`으로 시작하는
code 셀을 아래로 `replace` (혼동행렬 plot 블록만 제거, F1-Macro/classification_report 출력은
유지 — 혼동행렬은 이제 비교 섹션의 2×2 그리드에서 4개 모델과 함께 그린다):

```python
if _RUN_TRAINING_CELLS:
    # F1-Macro, classification report로 클래스별 성능을 확인
    # (단순 accuracy는 '위험' 소수 클래스 성능을 가려서 부적합).
    # 혼동 행렬은 4개 모델을 한 번에 비교하는 "4개 모델 성능 비교" 섹션에서 그린다.
    probabilities = booster.predict(test_df[feature_names], num_iteration=booster.best_iteration)
    predicted_labels = np.argmax(probabilities, axis=1)

    class_labels = list(range(NUM_CLASSES))
    target_names = [RISK_CLASS_NAMES[i] for i in class_labels]

    print(
        "검증 F1-Macro: "
        f"{f1_score(test_df['risk_class'], predicted_labels, labels=class_labels, average='macro'):.4f}"
    )
    print(
        classification_report(
            test_df["risk_class"],
            predicted_labels,
            labels=class_labels,
            target_names=target_names,
            zero_division=0,
        )
    )
```

- [ ] **Step 2: `Read`로 다시 읽어 Task 5의 마지막 셀(RandomForest 학습) `id`를 확인하고,
  그 뒤에 마크다운 헤더 삽입**

`edit_mode="insert"`, `cell_type="markdown"`:

```markdown
## 11. 4개 모델 성능 비교
```

- [ ] **Step 3: 그 뒤에 예측 수집 + 비교 표 셀 삽입**

`Read`로 다시 읽어 방금 삽입한 markdown 셀의 `id`를 확인한 뒤, 그 뒤에 code 셀 삽입:

```python
if _RUN_TRAINING_CELLS:
    # <4개 모델 예측 수집>
    lgm_probabilities = booster.predict(test_df[feature_names], num_iteration=booster.best_iteration)
    lgm_predicted = np.argmax(lgm_probabilities, axis=1)
    cb_predicted = cb_model.predict(test_df[feature_names]).ravel().astype(int)
    xgb_predicted = xgb_model.predict(test_df[feature_names]).astype(int)
    rf_predicted = rf_model.predict(rf_test_features).astype(int)

    model_predictions = {
        "LightGBM": lgm_predicted,
        "CatBoost": cb_predicted,
        "XGBoost": xgb_predicted,
        "RandomForest": rf_predicted,
    }

    class_labels = list(range(NUM_CLASSES))
    target_names = [RISK_CLASS_NAMES[i] for i in class_labels]
    y_true = test_df["risk_class"]

    # <4개 모델 성능 비교 — F1-Macro/precision/recall/f1-score/support>
    comparison_rows = []
    f1_macro_by_model = {}
    for model_name, y_pred in model_predictions.items():
        f1_macro = f1_score(y_true, y_pred, labels=class_labels, average="macro")
        f1_macro_by_model[model_name] = f1_macro
        report = classification_report(
            y_true, y_pred, labels=class_labels, target_names=target_names,
            zero_division=0, output_dict=True,
        )
        for class_name in target_names:
            comparison_rows.append({
                "model": model_name,
                "class": class_name,
                "precision": report[class_name]["precision"],
                "recall": report[class_name]["recall"],
                "f1-score": report[class_name]["f1-score"],
                "support": report[class_name]["support"],
            })
        comparison_rows.append({
            "model": model_name,
            "class": "F1-Macro (전체)",
            "precision": None,
            "recall": None,
            "f1-score": f1_macro,
            "support": report["macro avg"]["support"],
        })

    comparison_report = pd.DataFrame(comparison_rows)
    print("<4개 모델 성능 비교 — 검증 precision/recall/f1-score/support>")
    display(comparison_report)
```

- [ ] **Step 4: 그 뒤에 F1-Macro 막대그래프 + 혼동행렬 그리드 셀 삽입**

`Read`로 다시 읽어 방금 삽입한 셀의 `id`를 확인한 뒤, 그 뒤에 code 셀 삽입:

```python
if _RUN_TRAINING_CELLS:
    # <F1-Macro 비교 막대그래프>
    fig, ax = plt.subplots(figsize=(6, 4))
    sns.barplot(x=list(f1_macro_by_model.keys()), y=list(f1_macro_by_model.values()), color="#4C72B0", ax=ax)
    ax.set_ylabel("검증 F1-Macro")
    ax.set_ylim(0, 1)
    ax.set_title("4개 모델 검증 F1-Macro 비교")
    for i, value in enumerate(f1_macro_by_model.values()):
        ax.text(i, value + 0.01, f"{value:.3f}", ha="center")
    fig.tight_layout()
    plt.show()
    plt.close(fig)

    # <혼동행렬 — 4개 모델 2x2 그리드>
    fig, axes = plt.subplots(2, 2, figsize=(10, 8))
    for ax, (model_name, y_pred) in zip(axes.flat, model_predictions.items()):
        cm = confusion_matrix(y_true, y_pred, labels=class_labels)
        sns.heatmap(
            cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=target_names, yticklabels=target_names, cbar=False, ax=ax,
        )
        ax.set_xlabel("예측")
        ax.set_ylabel("실제")
        ax.set_title(f"{model_name} (F1-Macro {f1_macro_by_model[model_name]:.3f})")
    fig.tight_layout()
    plt.show()
    plt.close(fig)

    print("4개 모델 성능 비교 완료")
```

- [ ] **Step 5: 실행 및 검증**

nbconvert 실행(exit code 0). `<검색어>`를 `"4개 모델 성능 비교 완료"`로 검증. 추가로
`<검색어>`를 `"<4개 모델 성능 비교"`로 찾아 `comparison_report`의 출력이 존재하는지,
`f1_macro_by_model`에 4개 모델 이름이 모두 있는지 확인한다.

---

### Task 7: 모델 저장/추론 테스트 셀을 노트북 끝으로 재삽입 + 전체 실행 최종 검증

**Files:**
- Modify: `App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb` (Task 6 마지막 셀 뒤에
  markdown 2개 + code 4개 삽입 — Task 2 Step 5에서 삭제했던 내용을 그대로 복원)

**Interfaces:**
- Consumes: `booster`, `feature_names`, `categorical_columns`, `frequency_maps`,
  `proxy_deadline_map`, `global_median`, `df` (모두 기존 LightGBM 산출물, 무변경)
- Produces: `artifact`(`ModelArtifact`), 저장된 `.pkl` 파일, 추론 테스트 출력 — 새 것은 없음
  (기존과 동일한 산출물, 위치만 이동).

- [ ] **Step 1: `Read`로 노트북을 읽고 Task 6의 마지막 셀(`4개 모델 성능 비교 완료` 출력하는
  셀)의 `id`를 확인한다.**

- [ ] **Step 2: 그 뒤에 "모델 저장" 마크다운 헤더 삽입**

```markdown
## 12. 모델 저장

신규 3개 모델(CatBoost/XGBoost/RandomForest)은 비교 실험용이며, 저장 대상은 지금처럼
LightGBM(`booster`)뿐입니다.
```

- [ ] **Step 3: 그 뒤에 아티팩트 생성+저장 셀 삽입 (Task 2 Step 5에서 삭제한 원본 그대로)**

`Read`로 다시 읽어 방금 삽입한 markdown 셀의 `id`를 확인한 뒤, 그 뒤에 code 셀 삽입:

```python
if _RUN_TRAINING_CELLS:
    artifact = ModelArtifact(
        booster=booster,
        feature_names=feature_names,
        categorical_columns=categorical_columns,
        frequency_maps=frequency_maps,
        proxy_deadline_map=proxy_deadline_map,
        global_median_duration_hours=global_median,
    )
    _save_artifact(artifact)
```

- [ ] **Step 4: 그 뒤에 아티팩트 정보 출력 셀 삽입 (원본 그대로)**

`Read`로 다시 읽어 방금 삽입한 셀의 `id`를 확인한 뒤, 그 뒤에 code 셀 삽입:

```python
if _RUN_TRAINING_CELLS:
    # <학습 완료 후 생성된 ModelArtifact 객체 시각화>
    print(f"선정된 최종 피처 개수: {len(artifact.feature_names)}")
    display(artifact.feature_names)
    print(f"범주형 피처: {artifact.categorical_columns}")
    print(f"빈도 인코딩 대상 컬럼: {list(artifact.frequency_maps.keys())}")
```

- [ ] **Step 5: 그 뒤에 "추론 테스트" 마크다운 헤더 삽입 (번호만 8 → 13)**

`Read`로 다시 읽어 방금 삽입한 셀의 `id`를 확인한 뒤, 그 뒤에 markdown 셀 삽입:

```markdown
## 13. 저장된 모델로 추론 테스트
```

- [ ] **Step 6: 그 뒤에 추론 테스트 셀 2개 삽입 (원본 그대로)**

`Read`로 다시 읽어 방금 삽입한 markdown 셀의 `id`를 확인한 뒤, 그 뒤에 code 셀 삽입:

```python
# 이 노트북 안에서는 load_artifact()가 이 노트북 자체의 전역변수 _artifact_cache를 참조하므로
# (위 5~6번 셀에서 함수를 그대로 재정의했기 때문), 방금 학습한 artifact를 바로 캐시에 넣어
# 재학습 없이 재사용할 수 있습니다.
if _RUN_TRAINING_CELLS:
    _artifact_cache = artifact

    # 테스트용 데이터
    sample_row = df.drop(columns=["risk_class", "created", "issue_key"]).iloc[99]  # id=99번인 이슈
    display(sample_row)
```

`Read`로 다시 읽어 방금 삽입한 셀의 `id`를 확인한 뒤, 그 뒤에 마지막 code 셀 삽입:

```python
if _RUN_TRAINING_CELLS:
    # '지연 위험도 예측' 테스트 실행
    probabilities = predict_class_probabilities(sample_row)
    class_probabilities = dict(zip(["정상", "주의", "위험"], probabilities))
    display(pd.Series(class_probabilities, name="확률"))

    predicted_class = max(class_probabilities, key=class_probabilities.get)
    print(f"예측 클래스: {predicted_class} (확률 {class_probabilities[predicted_class]:.4f})")
```

- [ ] **Step 7: 전체 노트북 최종 실행**

공통 절차대로 nbconvert 실행 (exit code 0 확인 — 이번엔 노트북 전체, 37+15개 셀 전부).

- [ ] **Step 8: 최종 검증 — 아래 체크리스트를 모두 확인**

```python
import json
nb = json.load(open(r"D:/AIproject/project/Team/work-flow/App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb", encoding="utf-8"))

def outputs_of(needle):
    for cell in nb["cells"]:
        src = "".join(cell["source"])
        if needle in src:
            return [("".join(o.get("text", []))) for o in cell.get("outputs", [])]
    return None

checks = {
    "피처 선정": "피처 선정(상관계수 R² 기반)",
    "CatBoost 학습": "CatBoost 학습 완료",
    "XGBoost 학습": "XGBoost 학습 완료",
    "RandomForest 학습": "RandomForest 학습 완료",
    "4개 모델 비교": "4개 모델 성능 비교 완료",
    "모델 저장": "모델 저장 완료",  # _save_artifact의 logger.info 메시지
    "추론 테스트": "예측 클래스:",
}
for label, needle in checks.items():
    out = outputs_of(needle)
    print(label, "->", "OK" if out else "MISSING", out[:1] if out else "")
```

Expected: 7개 항목 모두 `OK`. 하나라도 `MISSING`이면 해당 셀을 다시 확인한다.

- [ ] **Step 9: (선택) 임시 파일 정리**

Task 진행 중 만든 스크래치 파일이 있다면(`nb_full.txt` 등, 이미 삭제됐는지 `git status`로
확인) 저장소 루트에 남아있지 않은지 확인한다.

---

## Self-Review 메모 (계획 작성자용)

- **스펙 커버리지**: 설계 문서(`document_유소은/2026-07-19_기타 분류 모델 추가.md`)의 모든
  섹션(공용 피처 선정, 모델별 SMOTE/학습, 4개 모델 비교, 모델 저장/추론 이동, 의존성,
  검증 계획)이 Task 1~7에 매핑됨.
- **플레이스홀더 스캔**: 모든 코드 블록이 완전한 실행 가능 코드. "TBD"/"나중에" 없음.
- **타입/이름 일관성**: `feature_names`/`categorical_columns`/`train_features_resampled`/
  `train_labels_resampled`(LightGBM, cell 28/29 그대로) → Task 3/4가 그대로 소비.
  `rf_train_features`/`rf_test_features`/`rf_model`(Task 5) → Task 6이 그대로 소비.
  `cb_model`/`xgb_model`(Task 3/4) → Task 6이 그대로 소비. 이름 불일치 없음.
