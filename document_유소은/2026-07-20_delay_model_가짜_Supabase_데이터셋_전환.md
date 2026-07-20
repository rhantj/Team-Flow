# 설계 기록: delay_model.ipynb 학습 데이터를 Jira → 가짜 Supabase 데이터셋으로 전환

## 배경

`delay_model.ipynb`는 원래 Jira Issue Tracking 데이터셋(MongoDB)으로 학습했지만, 실제
서비스(`delay_service.py`)는 우리 팀 Supabase 스키마(tasks/milestones/task_checklists/
task_comments/activities)를 읽는다. 이전 작업(`456c91c`)에서 이미 "학습 피처 중 Supabase에
대응 개념이 없는 것들(`SUPABASE_UNAVAILABLE_COLUMNS`)을 학습 후보에서 제외"하는 정합화를
했지만, 학습 데이터 자체는 여전히 Jira였다.

이번 변경은 학습 데이터 자체를 팀 Supabase 스키마 형태의 임의 생성(fake) 데이터로 완전히
바꾼 것이다. Jira/MongoDB 경로(`dataset_builder.py`)는 참고용으로 남겨두고 더 이상 노트북이
사용하지 않는다.

## 핵심 설계 결정

브레인스토밍 과정에서 정리된 결정들 (각 결정의 이유는 코드 주석에도 남겨둠):

| 결정 | 내용 | 이유 |
| --- | --- | --- |
| 피처 생성 함수 재사용 | 학습도 실시간 추론과 동일한 `delay_service.build_feature_row()`를 그대로 호출 | 학습·서빙이 다른 코드로 피처를 만들면 train/serve skew가 생김 — 아예 같은 함수를 쓰면 구조적으로 차단됨 |
| 스냅샷 없음 | Jira처럼 이슈 하나당 1/3/7/14/30일 여러 시점을 스냅샷 뜨지 않고, 업무당 1개 학습 행(단일 시점)만 생성 | 실제 서비스가 항상 "완료 안 된 업무를 현재 시점(now)에서" 평가하므로, 학습도 그 형태를 그대로 재현하면 충분 — 컷오프를 별도로 시뮬레이션할 필요가 없어짐 |
| 라벨 직접 배정 | `classify_risk()` 규칙 함수를 호출하지 않고, 목표 라벨(정상/주의/위험)을 먼저 정한 뒤 그 라벨에 맞는 시나리오(경과율/블로커 비율/진행률)로 데이터를 생성 | 가짜 데이터를 만드는 입장이라 라벨을 직접 알 수 있음. 다만 `classify_risk()`가 참조하는 임계값(`risk_blocked_ratio` 등)은 라벨별 목표 구간으로 그대로 재사용해 의미적 일관성은 유지 |
| 타겟 컬럼 = 문자열 | `risk_class` 값 자체가 `'정상'/'주의'/'위험'` — 별도 label 컬럼 없음 | 사람이 읽기 쉬움. 다만 LightGBM(`objective="multiclass"`)과 프로덕션 계약(클래스 인덱스 0/1/2)은 정수가 필요해서, 노트북에 인코딩 셀 1개를 추가해 이후 셀들은 그대로 정수로 동작 |
| 균형 샘플링 | 정상/주의/위험 각 동일 개수(기본 1,500건씩, 총 4,500건) | 규칙 기반 라벨링은 자연히 '정상'에 쏠리므로(Jira도 마찬가지), 라벨을 먼저 균형 있게 정해 생성 단계에서부터 해결 — 이후 SMOTE 단계는 사실상 no-op(안전망으로 유지) |
| 카테고리/우선순위 다양성 | 라벨 버킷 안에서도 18개 카테고리·3개 우선순위가 고르게 섞이도록 각 업무마다 독립적으로 샘플링 | '위험'이 특정 카테고리에만 몰리면 모델이 "카테고리=X → 위험" 같은 얕은 상관만 배움 |
| 엣지 케이스 포함 | 마감일 없음(~20%), 체크리스트 0개, 담당자 미배정(~5%), 댓글/활동 0건을 라벨 전반에 분포 | 실제 서비스에서 마주칠 결측 패턴을 학습에도 반영 |

## 데이터 생성 방법론

`ml_delay_risk/models/mock_issue_dataset.py`의 핵심 아이디어는 "`classify_risk()`가
참조하는 3개 지표(`elapsed_ratio`, `blocked_ratio`, `imbalance_index`)를 라벨별 목표 구간
에 놓이도록 원본 데이터(생성 시각, 마감일, 블로커 체류 시간, 체크리스트 진행률)를 역산해서
만든다"는 것이다.

핵심 관계식: `due_duration_hours = elapsed_hours / elapsed_ratio_목표`로 마감일을 역산하면,
`elapsed_ratio_at_cutoff = elapsed_hours / due_duration_hours`가 정확히 목표값이 된다
(마감일이 실제로 존재하는 경우에 한함 — 마감일 없음 엣지 케이스는 카테고리/우선순위 기준
휴리스틱 값으로 대체되므로 목표와 어긋날 수 있음, 의도된 노이즈).

| 라벨 | 분기 | elapsed_ratio 목표 | blocked_ratio 목표 | 상태 | 진행률 성향 |
| --- | --- | --- | --- | --- | --- |
| 정상 | - | 0.45~0.77 | 0~0.08 | inprogress | 경과율과 비슷하게 진행 |
| 주의 | 블로커형 (50%) | 0.45~0.77 | 0.12~0.28 | blocked | 경과율과 비슷 |
| 주의 | 진행저조형 (50%) | 0.77~0.98 | 0~0.08 | inprogress | 경과율보다 0.35~0.55 낮음 |
| 위험 | 마감초과형 (50%) | 1.05~1.8 (마감일 필수) | 0~0.15 | inprogress | 0.5~0.95 (미완료 상태로 방치) |
| 위험 | 장기블로커형 (50%) | 0.45~0.77 | 0.35~0.7 | blocked | 경과율의 0.7~1.0배 (블로커 전까진 순항) |

이 값들은 `config.Settings`의 `risk_blocked_ratio`(0.30) / `warning_blocked_ratio`(0.10) /
`warning_imbalance_index`(0.30) 임계값을 넘거나(위험) 그 사이에 들도록(주의) 목표 구간을
잡았다.

그 외:
- 카테고리별 기준 소요시간(`BASELINE_HOURS_BY_CATEGORY`) × 우선순위 배수(`high=0.7,
  medium=1.0, low=1.4`)로 `(category, priority) → proxy_deadline_hours` 맵을 만들어,
  마감일이 없는 업무의 폴백 값이자 저장되는 모델 아티팩트의 `proxy_deadline_map`으로도
  재사용한다(운영 시 `delay_model.proxy_deadline_for`가 참조).
- 마일스톤 완료율(`parent_unresolved` 피처)에 현실적인 변동을 주기 위해, 학습 행에는
  포함되지 않는 "이미 완료된 필러 업무"(전체의 20%)를 별도로 만들어 완료율 계산에만
  반영한다.
- `status_at_cutoff`가 항상 blocked/inprogress에만 몰리지 않도록, 블로커가 아닌 경우
  15% 확률로 "아직 아무도 손대지 않은 채 방치된 업무"(todo)를 추가로 만든다.

## 확인한 한계 (의도된 트레이드오프)

- 마감일이 없고 경과 시간이 매우 긴(최대 120일) 업무는 카테고리 휴리스틱 폴백(10~168시간)
  기준으로 `elapsed_ratio_at_cutoff`가 매우 크게 나올 수 있다. 이 컬럼은 `LEAKY_FEATURE_
  COLUMNS`로 학습에서 이미 제외되므로 직접적인 문제는 아니지만, 실제 운영에서도 마감일
  없이 오래 방치된 업무는 동일하게 나타나는 현상이라 판단해 별도로 보정하지 않았다.
- 상관관계는 `status_at_cutoff`/`blocked_hours_before_cutoff`/`hours_in_current_status`
  조합에서 뚜렷하게 나타나고(정상은 블로커 0%, 주의/위험은 각 ~50%), `progress_ratio_
  at_cutoff`/댓글·활동 수는 상대적으로 약한 신호다 — 실제 학습 성능은 노트북 실행 후
  4개 모델 비교 섹션에서 확인 필요.

## 파일 구성

- [mock_issue_dataset.py](../App/backend_fastapi/ml_delay_risk/models/mock_issue_dataset.py) — 생성 모듈, `build_training_dataframe(limit=4500, num_projects=12, seed=42)`
- [delay_service.py](../App/backend_fastapi/ml_delay_risk/services/delay_service.py) — `build_feature_row()`에 `proxy_deadline_lookup` 파라미터 추가(하위호환, 기본값은 기존과 동일)
- [delay_model.ipynb](../App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb) — cell 14 데이터 소스 교체, `risk_class` 문자열→정수 인코딩 셀 추가
- [test_mock_issue_dataset.py](../App/backend_fastapi/tests/ml_delay_risk/test_mock_issue_dataset.py) — 균형 샘플링/재현성/다양성/정합성 테스트 9개

## 향후 확인할 것

- 노트북을 실제로 실행해 4개 모델(LightGBM/CatBoost/XGBoost/RandomForest) 검증 macro
  F1/F2를 확인하고, 신호가 너무 약하면(예: progress_ratio 관련 피처 중요도가 0에 가까움)
  라벨별 시나리오 파라미터(진행률 목표 구간)를 조정.
- `python -m ml_delay_risk.train`으로 전체 파이프라인(피처 선정 → SMOTE → 4개 모델 →
  MLflow 튜닝 → 저장)이 실제로 끝까지 도는지 확인 (이번 세션에서는 함수 단위 테스트만
  검증했고, 노트북 전체 실행/모델 저장까지는 아직 안 돌려봄).
