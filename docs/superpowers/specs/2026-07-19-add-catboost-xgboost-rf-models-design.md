# 설계: delay_model.ipynb에 CatBoost / XGBoost / Random Forest 추가

## 배경

`App/backend_fastapi/ml_delay_risk/models/delay_model.ipynb`는 지연 위험도(정상/주의/위험)
3단계 분류를 LightGBM으로 학습하는 노트북이다. 상수 정의 → 피처 중요도 분석 → 피처 선정 →
이슈 단위 층화 분할 → SMOTE → 학습 → 평가 → 모델 저장 → 추론 테스트 순서로, 각 단계를
함수로 감싸지 않고 셀 단위로 직접 실행하며 중간 결과를 바로 확인하는 스타일이다.

이 설계는 같은 노트북에 CatBoost / XGBoost / Random Forest 3개 모델을 LightGBM과 동일한
파이프라인 스타일로 추가하고, 4개 모델을 검증 F1-Macro/precision/recall/f1-score/support로
비교하는 섹션을 만든다. 기존 LightGBM 셀은 수정하지 않고 순수 추가만 한다.

## 노트북은 완전히 순차 실행(stateful) 구조

셀들이 함수로 감싸여 있지 않고 전역 변수를 그대로 이어받는 구조이므로, 새 모델 섹션에서
`selected_features`, `feature_names`, `booster` 같은 LightGBM이 이미 쓰고 있는 이름을
재사용하면 이후 셀에서 LightGBM 변수를 덮어써 버린다. 신규 3개 모델은 각각
`_catboost`/`_xgboost`/`_rf` 접미사를 붙인 전용 변수명을 쓴다. LightGBM 쪽 변수명은
그대로 둔다 (기존 셀 무변경 원칙).

## 노트북 섹션 구성 (변경 후)

```
## 1. 환경 설정                      (변경 없음)
## 2. Imports                        (catboost/xgboost/RandomForest import 추가)
## 3. 상수 정의                      (변경 없음 — 데이터 관련 공유 상수)
## 3b. _RUN_TRAINING_CELLS           (변경 없음)
## 4. 모델 아티팩트 정의              (변경 없음 — delay_service.py가 그대로 참조)
## 5. 모델 저장/로드 함수             (변경 없음 — 함수 정의부, 위치 고정)
## 6. 실시간 추론용 함수              (변경 없음 — 함수 정의부, 위치 고정)
## 7. 학습 실행 — LightGBM            (기존 내용 무변경, 제목만 "LightGBM" 명시로 소폭 수정)
## 8. CatBoost 학습                  (신규)
## 9. XGBoost 학습                   (신규)
## 10. Random Forest 학습            (신규)
## 11. 4개 모델 성능 비교             (신규)
## 12. 모델 저장                     (기존 실행 셀 이동 — LightGBM artifact만)
## 13. 저장된 모델로 추론 테스트       (기존 실행 셀 이동 — LightGBM만)
```

`ModelArtifact`/`_save_artifact`/`load_artifact`/`predict_class_probabilities`
(4~6번, 함수 정의부)는 `delay_service.py`가 `_notebook_runtime.load()`로 그대로 가져다
쓰므로 이동하지 않는다. **이동 대상은 실행 셀**(아티팩트 생성+저장, 추론 테스트 실행)뿐이다.
모델 저장·추론 서빙은 계속 LightGBM(`booster`)만 대상으로 하고, 신규 3개 모델은 비교
실험용으로만 쓴다 (사용자 확인 완료).

## 모델별 반복 패턴 (CatBoost / XGBoost / Random Forest 공통 골격)

기존 LightGBM 셀의 인라인 `# <섹션 제목>` 주석 스타일을 그대로 따르고, 별도 마크다운
하위 헤더는 추가하지 않는다 (기존 노트북 컨벤션).

1. **상수 정의**: 모델별 하이퍼파라미터 딕셔너리(`CATBOOST_PARAMS`/`XGBOOST_PARAMS`/
   `RF_PARAMS`)만 새로 정의한다. `CATEGORICAL_COLUMNS`/`FREQUENCY_ENCODED_COLUMNS`/
   `NON_FEATURE_COLUMNS`/`FEATURE_DESCRIPTIONS`는 데이터 자체를 설명하는 공유 상수라
   재정의하지 않는다.
2. **피처 중요도 분석**: 전체 데이터(`df`)로 프로브 모델을 학습해 그 알고리즘 고유의
   중요도를 산출한다. `freq_maps`/`encoded_df`/`probe_weights`(LightGBM 섹션에서 이미
   계산됨, 인코딩 방식에 무관하게 재사용 가능)를 그대로 쓴다. Random Forest만 별도
   인코딩이 필요해 아래에서 따로 설명한다.
3. **피처 선정**: 동일하게 정규화 중요도 1% 임계값으로 선정하고, 막대그래프로 시각화
   (`plt.show()`만, 파일 저장 없음 — 기존 LightGBM 셀과 동일 스타일, 사용자 확인 완료).
4. **학습/검증 데이터 분할**: 새로 나누지 않는다. LightGBM 섹션에서 이미 만든 이슈 단위
   층화 분할(`train_df`/`test_df`, `StratifiedGroupKFold(random_state=42)`)을 그대로
   재사용한다는 것을 짧은 마크다운+셀로 명시한다. 모델마다 다시 나누면 비교가
   불공정해지므로 재사용이 맞다.
5. **사용 피처 + 타겟 결합 데이터프레임**: `display(df[selected_features_X + ["risk_class"]])`
   — 원본 `df` 기준으로 표시해 다른 모델들과 형식을 통일한다.
6. **SMOTE 적용**: train 세트에만 적용 (검증 누수 방지 원칙 동일).
7. **모델 정의 및 학습**: 조기 종료를 지원하는 모델(CatBoost/XGBoost)은 `test_df`를
   `eval_set`으로 넘겨 적용한다. 하이퍼파라미터는 튜닝 없이 LightGBM과 비슷한 스케일의
   베이스라인(`learning_rate=0.05`, `random_state=42` 등)으로 잡는다 — 이번 작업 범위는
   튜닝이 아니라 베이스라인 비교.

### CatBoost / XGBoost — 범주형 처리

LightGBM과 동일하게 `CATEGORICAL_COLUMNS`를 pandas `category` dtype으로 유지한다.
CatBoost는 `cat_features` 인자로 네이티브 처리하고, XGBoost는 `enable_categorical=True`
+ `tree_method="hist"`로 네이티브 처리한다. SMOTE는 LightGBM과 동일하게 `SMOTENC`
(범주형 컬럼 인덱스 지정)를 사용한다.

### Random Forest — 범주형 처리 (원-핫 인코딩, 사용자 결정)

sklearn `RandomForestClassifier`는 범주형을 직접 받지 못한다. `CATEGORICAL_COLUMNS`
(issuetype_name/priority_name/project_key/status_at_cutoff)만 원-핫 인코딩하고,
`FREQUENCY_ENCODED_COLUMNS`(reporter/assignee_at_cutoff)는 기존처럼 빈도 인코딩된
정수를 그대로 쓴다(이미 numeric).

- **피처 선정 단위는 원본 컬럼 유지**: 원-핫으로 펼친 더미 컬럼 단위가 아니라, 다른
  3개 모델과 동일하게 원본 컬럼(`issuetype_name` 등) 단위로 선정한다. 프로브 모델의
  더미별 `feature_importances_`를 원본 컬럼으로 합산(sum)해서 원본 컬럼 단위 중요도
  리포트를 만들고, 그 위에 동일한 1% 임계값을 적용한다. 이렇게 해야 "선정된 피처 개수"를
  4개 모델 간에 같은 기준으로 비교할 수 있고, "사용 피처 + 타겟 결합 데이터프레임" 단계도
  원본 `df` 컬럼으로 그대로 표시할 수 있다.
- **실제 학습 입력은 확장된 더미 컬럼**: `train_df`/`test_df`를 각각 원-핫 인코딩한 뒤
  `test`를 `train`의 더미 컬럼 기준으로 `reindex(fill_value=0)`해서 정렬한다(두 세트에
  등장하는 카테고리 값이 다를 수 있으므로).
- **SMOTE는 `SMOTENC`가 아니라 일반 `SMOTE`를 쓴다**: 원-핫 인코딩 후에는 진짜 "범주형
  컬럼"이 없고 전부 numeric(0/1 포함)이다. `SMOTENC`로 더미 컬럼 각각을 독립적으로
  범주형 취급하면 원-핫의 "하나만 1" 제약이 깨질 수 있어(이웃마다 다른 더미가 1로 선택),
  차라리 일반 `SMOTE`로 전부 연속형처럼 보간하는 편이 일반적이고 단순하다(보간된 더미 값이
  소수점이 되는 것은 알려진 근사이며, RandomForest 학습에는 문제 없음). 노트북에 이유를
  짧은 주석으로 남긴다.

## 4개 모델 비교 섹션 (## 11)

- 4개 모델(LightGBM 포함) 각각에 대해 자신의 `test_df`(+피처 인코딩)로 예측하고
  `classification_report(output_dict=True)`로 precision/recall/f1-score/support를
  뽑아 하나의 비교 표(모델 × 클래스)로 합친다.
- F1-Macro만 모은 막대그래프로 4개 모델을 한눈에 비교.
- 혼동행렬은 2×2 서브플롯 그리드로 4개 모델을 한 번에 시각화한다. LightGBM은 `## 7`에
  이미 개별 혼동행렬이 있어 그리드에 넣으면 다소 중복되지만, 기존 셀을 건드리지 않기 위해
  그대로 둔다.
- 그래프는 노트북 인라인 표시(`plt.show()`)만 하고 파일로 저장하지 않는다(기존 LightGBM
  셀과 동일 — 사용자 확인 완료).

## 의존성

`catboost`가 `requirements.txt`와 로컬 venv 어디에도 없다. `requirements.txt`에
버전 고정으로 추가하고 로컬 venv에 설치한다. xgboost(3.2.0)/scikit-learn(1.6.1)은
이미 설치돼 있다.

## 검증 계획

로컬 MongoDB(`ml_dashboard`)가 떠 있는 것을 확인했다. 노트북을 파일럿 사이즈
(`limit=1500`, 기존 기본값)로 실제 실행해서:
- 4개 모델이 에러 없이 학습되는지
- 비교 표/그래프/혼동행렬이 정상 출력되는지
- 기존 LightGBM 셀(저장/추론 테스트 포함, 이동 후 위치)이 여전히 정상 동작하는지

확인한다.

## 스코프 밖

- 하이퍼파라미터 튜닝 (베이스라인 비교만 요청됨)
- 신규 3개 모델의 저장/실시간 서빙 (LightGBM만 유지, 사용자 확인 완료)
- 그래프 파일 저장/output 폴더 (인라인 표시만, 사용자 확인 완료)
- 기존 LightGBM 셀 수정 (순수 추가만)
