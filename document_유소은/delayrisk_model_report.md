# 업무 지연 위험도(정상/주의/위험) 분류 모델 보고서

`delay_model.ipynb` 기준 작성. 아래 실험 결과는 파일럿 실행(완료 이슈 1,500건, 스냅샷 4,633행)의 실제 로그를 그대로 옮긴 것이다.

---

## 1. 목적과 종류

- **목적(예측)**: 진행 중인 Jira 이슈(업무) 하나를 특정 시점에 관찰했을 때, 이 업무가 앞으로 "정상적으로 마무리될지 / 관리자의 관심이 필요한지 / 이미 위험한 상태인지"를 실시간으로 예측한다. 관리자가 어느 업무에 언제 개입해야 하는지 판단하는 대시보드용 신호를 제공하는 것이 최종 목표다.
- **종류**: 지도학습 **다중 분류(Multiclass Classification)**. 회귀가 아니라, 아래 3개 범주 중 하나를 예측한다.

| 클래스 | 이름 | API 값 |
|---|---|---|
| 0 | 정상 | `NORMAL` |
| 1 | 주의 | `CAUTION` |
| 2 | 위험 | `DANGER` |

- **핵심 특징 — 다중 스냅샷 학습**: 하나의 완료된 이슈를 "생성 후 1/3/7/14/30일" 시점마다 스냅샷으로 잘라, 그 순간까지 관측 가능한 정보만으로 학습 행을 하나씩 만든다. 즉 모델은 "이슈가 최종적으로 어떻게 끝났는가"가 아니라 "그 순간 상태가 정상/주의/위험 중 무엇이었는가"를 배운다. 이는 실시간 추론(진행 중인 이슈를 지금 이 순간 평가)과 정확히 같은 입력 형태를 재현하기 위함이다.

---

## 2. 사용한 모델

**LightGBM** (Gradient Boosting Decision Tree), `objective="multiclass"`, `num_class=3`.

선택 이유:
- 범주형 피처(담당자, 상태 등)를 원-핫 인코딩 없이 네이티브로 처리 가능
- 결측치(예: 예상 소요시간이 없는 이슈의 진행률)에 강건 — 별도 대치(imputation) 불필요
- 학습 대상 데이터가 수천~수십만 행 규모의 정형 데이터라 트리 기반 모델이 신경망보다 적은 데이터로도 안정적

---

## 3. 데이터 출처

MongoDB `ml_dashboard` DB (Zenodo Apache Jira Issue Tracking Dataset)의 4개 컬렉션:

| 컬렉션 | 용도 |
|---|---|
| `issues` | 이슈 기본 정보(생성일, 완료일, 담당자, 유형, 우선순위, 예상 소요시간 등) |
| `events` | 상태/담당자 변경 이력(changelog) |
| `comments` | 댓글 — 활동 모멘텀 측정 |
| `worklogs` | 작업 시간 기록 — 진행률 측정 (봇 계정 자동 제외) |

학습 대상은 `resolution.name`이 `Fixed / Done / Resolved / Implemented / Delivered / Staged / Workaround` 중 하나인 "정상 완료" 이슈만 사용한다. `Duplicate`, `Won't Fix` 등으로 종결된 이슈나 아직 미해결인 이슈는 애초에 지연 여부를 판단할 근거가 없어 학습셋에서 제외한다.

---

## 4. Target(타겟) 정의

### 4.1 왜 규칙 기반 라벨링인가

이 데이터셋에는 Jira의 실제 "마감일(Due date)" 필드가 없다. 따라서 동일한 `(issuetype, priority)` 조합을 가진 과거 이슈들의 처리시간 **중앙값**을 그 조합의 가상 마감일(**Proxy Deadline**)로 대체한다. 표본이 10건 미만인 희소한 조합은 전체 데이터의 전역 중앙값으로 대체한다(실제 실행 시: 그룹 30개, 전역 중앙값 521.9시간, 표본 1,417건).

### 4.2 라벨 계산 규칙 (`classify_risk`)

아래 세 값을 cutoff(스냅샷) 시점까지 관측 가능한 정보만으로 계산한 뒤, 이 규칙으로 라벨을 정한다 — 완료된 이슈의 "최종" 결과는 절대 참조하지 않는다(=실시간 추론 때도 동일하게 재현 가능=미래 정보 누수 없음):

- `elapsed_ratio` = 경과 시간(시작 ~ cutoff) ÷ Proxy Deadline
- `blocked_ratio` = 블로커 상태 누적 체류시간 ÷ Proxy Deadline
- `imbalance_index` = `elapsed_ratio` − `progress_ratio`(진행률. 예상시간이 없으면 `None`)

```
elapsed_ratio > 1.0                        → 2 (위험, 마감일 초과)
blocked_ratio > 0.30                       → 2 (위험, 블로커 상태 장기 정체)
blocked_ratio > 0.10                       → 1 (주의, 블로커 상태 일정 기간 체류)
imbalance_index > 0.30                     → 1 (주의, 경과 대비 진행률 저조)
그 외                                        → 0 (정상)
```

### 4.3 실제 클래스 분포 (완료 이슈 1,500건 → 스냅샷 4,633행)

| 클래스 | 행 수 | 비율 |
|---|---|---|
| 0 (정상) | 4,013 | 86.6% |
| 1 (주의) | 37 | 0.8% |
| 2 (위험) | 583 | 12.6% |

'주의' 클래스가 극단적으로 희소한 **클래스 불균형** 데이터라는 점이 이후 데이터 분할·학습 기법 선택에 그대로 반영되어 있다.

---

## 5. Feature(피처) 상세 설명

전체 33개 피처를 "정적 피처"(이슈 생성 시점 근처 값, 스냅샷 시점에 따라 거의 변하지 않음)와 "동적 피처"(스냅샷 cutoff 시점까지 누적된 시계열 값)로 나눈다.

### 5.1 정적 피처 (`build_static_features`)

| 피처명 | 설명 |
|---|---|
| `project_key` | 이슈 키(`JELLY-123`)에서 추출한 프로젝트 코드(`JELLY`). 프로젝트별 업무 패턴 차이를 반영 |
| `issuetype_name` | 이슈 유형(`Bug`, `Task`, `Improvement` 등). Proxy Deadline 산정 기준이자 그 자체로도 중요 피처 |
| `priority_name` | 우선순위(`Blocker`, `Critical`, `Major`, `Minor`, `Trivial`). Proxy Deadline 산정 기준 |
| `reporter` | 이슈 등록자(계정명). 빈도 인코딩 처리 |
| `is_subtask` | 하위 작업(subtask) 여부 |
| `has_parent` | 상위 이슈(에픽 등)에 속해 있는지 여부 |
| `num_subtasks` | 이 이슈에 딸린 하위 작업 개수. 많을수록 완료가 여러 조건에 의존해 지연 위험 ↑ |
| `num_components` | 소속 컴포넌트(모듈) 개수 |
| `num_fixversions` | 목표 릴리즈 버전 개수 |
| `num_versions` | 영향받는 버전 개수 |
| `has_original_estimate` | 최초 예상 소요시간(`timeoriginalestimate`)이 설정되어 있는지 여부 |
| `original_estimate_seconds` | 최초 예상 소요시간(초). 미설정 시 0 |
| `num_issuelinks_total` | 다른 이슈와의 연관관계(`issuelinks`) 총 개수 |
| `num_blocked_by_links` | 그중 "이 이슈를 막고 있는(is blocked by)" 관계 개수 |
| `num_unresolved_blockers` | 그 블로커 이슈 중 아직 해결되지 않은 것의 개수 — 연쇄 지연(다른 업무 때문에 내 업무가 지연) 신호 |

### 5.2 동적 피처 (`build_dynamic_features`) — cutoff 시점까지 누적

| 피처명 | 설명 |
|---|---|
| `status_at_cutoff` | cutoff 시점의 상태(`Open`, `In Progress`, `Blocked` 등). changelog를 역으로 재구성해 계산 |
| `assignee_at_cutoff` | cutoff 시점의 담당자. 재배정 이력이 없으면 현재 담당자로 근사(빈도 인코딩) |
| `num_events_before_cutoff` | cutoff 이전 발생한 변경 이력(이벤트) 총 개수 |
| `num_status_changes` | 그중 상태 변경 횟수 |
| `num_assignee_changes` | 담당자 변경(재배정) 횟수 |
| `num_reopens` | 상태가 `Open`/`Reopened`로 되돌아간 횟수 — 반려/재작업 신호 |
| `hours_in_current_status` | 마지막 상태 변경 이후 cutoff까지 경과한 시간 |
| `blocked_hours_before_cutoff` | `Blocked`/`Waiting`/`On Hold` 등 블로커성 상태에 머문 누적 시간 |
| `num_comments_before_cutoff` | cutoff 이전 댓글 수 |
| `num_unique_commenters` | 댓글을 남긴 고유 인원 수 |
| `hours_since_last_comment` | 마지막 댓글로부터 cutoff까지 경과 시간 — 최근 활동 모멘텀 |
| `num_worklog_entries` | 작업 기록(worklog) 건수 (봇 계정 제외) |
| `num_unique_workers` | 실제 작업한 고유 인원 수 |
| `time_spent_seconds_before_cutoff` | cutoff까지 누적 투입 시간(초, 봇 제외) |
| `progress_ratio_at_cutoff` | 진행률 = 누적 투입시간 ÷ 최초 예상시간(예상시간 없으면 `NaN`, LightGBM이 결측으로 처리) |
| `elapsed_hours_at_cutoff` | 이슈 생성 후 cutoff까지 경과 시간(절대값, 시간 단위) |
| `activity_count_recent_window` | 최근 N일(기본 3일)간의 댓글+상태변경+작업기록 합계 — 무활동이면 위험 전조 |
| `snapshot_offset_days` | 이 스냅샷이 생성 후 며칠째 시점인지(1/3/7/14/30). 실시간 추론 시에는 실제 경과일(연속값)로 대체 |

### 5.3 계산은 되지만 피처에서 제외한 값 — **데이터 누수(Data Leakage) 방지**

아래 4개는 `build_dynamic_features`가 계산은 하지만, 학습 피처에서 **의도적으로 제외**한다(`LEAKY_FEATURE_COLUMNS`):

| 제외된 값 | 제외 이유 |
|---|---|
| `elapsed_ratio_at_cutoff` | `classify_risk()`의 입력값 그 자체 — 피처로 남기면 모델이 패턴을 학습하는 게 아니라 라벨링 규칙식을 그대로 베껴버림 |
| `blocked_ratio_at_cutoff` | 위와 동일 |
| `imbalance_index_at_cutoff` | 위와 동일 |
| `hours_until_deadline_at_cutoff` | `proxy_deadline_hours − elapsed_hours_at_cutoff`로 역산 가능해 사실상 `elapsed_ratio`와 동일 정보 |

이 4개를 포함한 채로 처음 학습했을 때 검증 성능이 비정상적으로 높게 나왔던 것이 발견 계기였고, 제외 후 F1-Macro가 현실적인 수준(0.92)으로 조정되었다.

### 5.4 인코딩 방식

- **범주형 네이티브 처리** (`issuetype_name`, `priority_name`, `project_key`, `status_at_cutoff`): LightGBM의 categorical dtype 기능을 그대로 사용
- **빈도 인코딩** (`reporter`, `assignee_at_cutoff`): 카디널리티(계정 수)가 높아 학습셋에서의 등장 빈도로 치환. 추론 시 처음 보는 계정은 0으로 처리(모델이 자연스럽게 결측 취급)

---

## 6. 데이터 분할 기법

**`StratifiedGroupKFold`** (issue_key 단위 그룹 분할 + 계층 층화).

일반적인 랜덤 분할이나 단순 `train_test_split`을 쓰지 않은 이유:

1. **그룹 누수 방지**: 같은 이슈의 여러 스냅샷(1/3/7/14/30일)이 train과 valid에 걸쳐 나뉘면, 모델이 "같은 이슈를 이미 본 적 있다"는 정보로 부정 채점(과적합 은폐)될 수 있다. 그래서 `issue_key` 단위로 그룹을 통째로 한쪽에만 배정한다.
2. **희귀 클래스 균형 배분**: '주의' 클래스가 전체의 0.8%뿐이라, 단순 랜덤 분할이면 검증셋에 '주의' 표본이 아예 없을 수도 있다. 그룹 대표 라벨(그 이슈가 도달한 최고 위험도, 즉 `risk_class`의 최댓값)로 층화해 희귀 클래스도 train/valid 양쪽에 고르게 배분한다.

분할 비율은 `n_splits = max(2, round(1/test_size))`로 결정(기본 `test_size=0.2` → 5-fold 중 1개를 검증셋으로 사용), `random_state=42`로 고정.

---

## 7. 학습 기법

| 항목 | 값/방법 |
|---|---|
| 목적함수 | `multiclass`, `num_class=3` |
| 평가지표 | `multi_logloss`, `multi_error` (학습 중 모니터링) + `F1-Macro`, `classification_report`, 혼동행렬(최종 평가) |
| 클래스 불균형 보정 | 역빈도 샘플 가중치 (`total / (클래스 수 × 해당 클래스 표본 수)`)를 `lgb.Dataset(weight=...)`로 적용 |
| 하이퍼파라미터 | `learning_rate=0.05`, `num_leaves=31`, `num_boost_round=500` |
| 조기 종료 | `early_stopping(30)` — 검증 성능이 30라운드 연속 개선 없으면 중단 |
| 결측치 처리 | 별도 대치 없이 LightGBM 네이티브 결측 분기 사용 (`progress_ratio_at_cutoff`의 `NaN` 등) |

train/serve 코드 공유: `train_and_save`(학습)와 `predict_class_probabilities`(실시간 추론)가 동일한 피처 인코딩 함수(`_apply_frequency_encoding`, `_apply_categorical_dtype`)를 그대로 재사용해, 학습 때와 추론 때 피처가 다르게 처리되는 train/serve skew를 원천 차단한다.

---

## 8. 학습 결과

파일럿 실행 조건: 완료 이슈 1,500건 → 스냅샷 4,633행 (train 3,720 / valid 913).

**Best iteration: 71 라운드** (`multi_logloss` 기준 조기 종료)

| 데이터셋 | multi_logloss | multi_error |
|---|---|---|
| train | 0.0319 | 0.0032 |
| valid | 0.0595 | 0.0131 |

**검증셋 F1-Macro: 0.9166**

**클래스별 성능 (valid, 913건)**

| 클래스 | precision | recall | f1-score | support |
|---|---|---|---|---|
| 정상 | 1.00 | 0.99 | 0.99 | 792 |
| 주의 | 0.73 | 0.89 | 0.80 | 9 |
| 위험 | 0.94 | 0.97 | 0.96 | 112 |
| **accuracy** | | | **0.99** | 913 |
| macro avg | 0.89 | 0.95 | 0.92 | 913 |
| weighted avg | 0.99 | 0.99 | 0.99 | 913 |

혼동행렬(seaborn heatmap, `models/confusion_matrix.png`):

![혼동행렬](confusion_matrix.png)

**해석**: '정상'과 '위험'은 precision/recall 모두 0.94 이상으로 안정적이다. '주의' 클래스는 표본이 9건뿐이라 recall(0.89)에 비해 precision(0.73)이 상대적으로 낮은데 — 표본 수 자체가 워낙 적어 한두 건의 오분류가 지표를 크게 흔든다. 다만 macro avg가 아닌 weighted avg에서 0.99가 나오는 것은 절대다수인 '정상' 클래스가 지표를 지배하기 때문이므로, 이 모델을 평가할 때는 **macro 지표(0.92)를 주로 봐야 한다** — accuracy나 weighted avg만 보면 '위험'/'주의' 탐지력을 과대평가하게 된다.

---

## 9. 기타 중요 사항

- **파일럿 규모의 한계**: 위 결과는 전체 데이터(약 77만 건 규모 추정) 중 1,500건만 사용한 파일럿이다. '주의' 클래스가 37건(스냅샷 기준)뿐이라 아직 신뢰 구간이 넓다. 전체 데이터로 재학습하면 특히 '주의' 클래스의 precision이 달라질 가능성이 높다.
- **Proxy Deadline의 근본적 한계**: 실제 마감일이 아니라 과거 유사 이슈의 중앙값으로 대체한 값이라, 실제 업무 특성과 괴리가 있을 수 있다(예: 실제로는 급한 업무인데 과거 평균이 느긋했던 이슈타입/우선순위 조합).
- **봇 계정 필터링**: `worklogs`의 `author`에 `bot`, `hudson`, `jenkins` 등의 문자열이 포함되면 자동화 계정으로 간주해 진행률/활동 모멘텀 계산에서 제외한다. 포함 시 자동화된 봇 활동이 사람의 성실도로 잘못 학습되는 것을 방지한다.
- **모델 아티팩트 구성**: `booster`(LightGBM 모델) 외에도 `feature_names`, `categorical_columns`, `frequency_maps`, `proxy_deadline_map`, `global_median_duration_hours`를 함께 `joblib`으로 직렬화(`models/delay_model.pkl`)해, 추론 시 학습 때와 완전히 동일한 인코딩·Proxy Deadline 조회가 가능하도록 했다.
- **코드 구조**: 이 노트북(`delay_model.ipynb`)이 모델 정의의 유일한 원본이며, FastAPI 서비스(`services/delay_service.py`, `routers/delay_router.py`)는 `_notebook_runtime.py`를 통해 노트북의 라이브러리 정의 셀들을 동적으로 로드해 재사용한다.
