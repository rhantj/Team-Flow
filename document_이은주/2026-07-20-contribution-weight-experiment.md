# 기여도 점수 가중치 실험 결과

작성일: 2026-07-20

## 데이터
합성 데이터 60건 + 실 프로젝트(project_id=1) N건.

실행 시점에 로컬 backend-fastapi(`http://localhost:8000`)가 기동되어 있지 않아
`/ai/score/contribution` 호출이 `404 Not Found`로 실패했다(`document_이은주/01-contribution-weight-experiment.ipynb`
셀 2 출력 참고). 브리프의 `try/except` 설계대로 실 데이터 병합은 건너뛰고 합성 데이터
60건만으로 가중치를 산출했다.

## 결과
- 엔트로피 가중법: workload=0.2016, task=0.4911, meeting=0.3073
- PCA(1주성분, 설명분산비율 0.430): workload=0.2302, task=0.3826, meeting=0.3872
- 최종 채택: entropy — 사유: `choose_final_weights` 로직상 1주성분 설명분산비율(0.430)이
  0.5 미만이라 PCA 근거가 약하다고 판단해 엔트로피 가중치를 채택했다. 채택된 엔트로피
  가중치의 최댓값(task=0.4911)도 0.9 미만이라 균등 폴백은 발동하지 않았다.

## 반영
`App/backend_fastapi/contribution_score/app/services/contribution_service.py`의
`WEIGHT_WORKLOAD`/`WEIGHT_TASK`/`WEIGHT_MEETING`을 위 최종 채택 값(entropy 가중치,
소수 4자리 반올림: 0.2016 / 0.4911 / 0.3073, 합계 1.0)으로 갱신.

## 그래프
`App/output/contribution_score/weight_comparison.png`
