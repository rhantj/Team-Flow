# WorkFlow AI · P0 업무 분담 (7인)

> 산출물 생성 기능은 P0 범위에서 제외했다. 기존 산출물 오너(FS-5)는 ML/AI 모델링 전담으로 재배치해 7인 전원이 P0 주담당을 갖도록 조정했다.

## 1. 7인 기능 오너 (P0 재정의)

| 오너 | 이름 | 담당 기능 | 개발 범위 |
| --- | --- | --- | --- |
| FS-1 | 박상준 | 인증/프로젝트/RBAC | 로그인, 프로젝트 생성, 팀원 초대, 역할 권한 |
| FS-2 | 박지수 | 회의록 AI/To-Do | 업로드, AI 요약, To-Do 생성, 역할 배정 |
| FS-3 | 허영주 | 대시보드/지연 위험도 | 진행률, 마감 임박, 업무량, 지연 위험도 예측 |
| FS-4 | 고무서 | AI Assistant/RAG | 프로젝트 Q&A, embedding, vector 검색, 출처 표시 |
| FS-5 | 이은주 | ML/AI 모델링 | 업무 편중 점수, 지연 위험도 지원, 임베딩 파이프라인 |
| FS-6 | 유소은 | 업무 보드 | 카테고리별 업무 UI, 칸반, 담당자/마감일 관리 |
| FS-7 | 곽진아 | 심사자/기여도/QA | 기여도 리포트, AI 평가 근거, 권한 테스트 |

## 2. P0 업무 분담표

| ID | P0 업무 | 담당(주) | 부담당 | 주요 기술 |
| --- | --- | --- | --- | --- |
| FR-01 | 인증/권한/마이페이지 (회원가입·로그인·RBAC·역할별 화면) | **박상준 (FS-1)** | 곽진아 (FS-7) | Spring Boot, JWT, RBAC, React |
| FR-02 | 프로젝트 관리 (생성·팀원 초대·마감일) | **박상준 (FS-1)** | 곽진아 (FS-7) | Spring Boot, DB |
| FR-03 | 업무 보드 (상태별 칸반·카테고리 UI·담당자/마감일) | **유소은 (FS-6)** | 박지수 (FS-2) | React, Spring Boot |
| FR-04 | 회의록 업로드 (문서 업로드·텍스트 추출·AI 분석) | **박지수 (FS-2)** | 고무서 (FS-4) | LLM, File Parser |
| FR-05 | To-Do 자동 생성 (업무 추출·담당자 후보·미배정 처리) | **박지수 (FS-2)** | 고무서 (FS-4) | LLM, Function Calling |
| FR-06 | 대시보드 (진행률·마감 임박·업무량·최근 활동) | **허영주 (FS-3)** | 유소은 (FS-6) | DB Aggregation, Chart UI |
| AI-1 | ML 지연 위험도 예측 (정상/주의/위험) | **허영주 (FS-3)** | 유소은 (FS-6) | scikit-learn/LightGBM |
| FR-07 | ML 업무 편중 점수 (팀원별 과부하 점수) | **이은주 (FS-5)** | 허영주 (FS-3) | Regression/Classification |
| FR-08 | AI Assistant / RAG (프로젝트 맥락 Q&A·출처 표시) | **고무서 (FS-4)** | 이은주 (FS-5) | LLM, RAG, pgvector |
| FR-09 | 심사자 기여도 리포트 기본 (업무/회의/문서 기반) | **곽진아 (FS-7)** | 박상준 (FS-3) | DB Aggregation, LLM |

## 3. 오너별 부하 요약

| 오너 | 이름 | 담당 기능(주) | 부담당 지원 |
| --- | --- | --- | --- |
| FS-1 | 박상준 | FR-01, FR-02 | FR-06 |
| FS-2 | 박지수 | FR-04, FR-05 | FR-03 |
| FS-3 | 허영주 | FR-06, AI-1 | FR-07, FR-09 |
| FS-4 | 고무서 | FR-08 | FR-04 |
| FS-5 | 이은주 | FR-07 | AI-1, FR-08 |
| FS-6 | 유소은 | FR-03 | FR-02, FR-05 |
| FS-7 | 곽진아 | FR-09 | FR-01 |

## 4. 기술 스택 개발 가이드

> 공통 원칙: 각자 담당 기능을 **화면(React) → API(Spring Boot) → DB(PostgreSQL) → AI(FastAPI)** 까지 세로로 책임진다. AI 추론이 필요한 기능은 Spring Boot가 FastAPI(`/ai/*`)를 호출하는 구조.

### FS-1 박상준 · 인증/프로젝트/RBAC
- **스택**: Spring Boot 3.5 + Spring Security 6.5, JWT(jjwt 0.13), React 19 + Vite 7
- **개발 순서**: `users`/`project_members` 스키마 → 회원가입·로그인 API → JWT 발급/검증 필터 → 역할(팀장/팀원/심사자) RBAC 가드 → React 로그인·마이페이지·역할별 라우팅
- **핵심**: 모든 API의 인증·권한 기반을 먼저 완성해야 다른 오너가 붙는다. `@PreAuthorize`로 역할 검증, 프론트는 라우트 가드로 역할별 화면 분기.

### FS-2 박지수 · 회의록 AI/To-Do
- **스택**: Spring Boot(업로드/저장) + FastAPI(LLM 분석), pdfplumber·python-docx(파싱), OpenAI SDK 1.x 또는 Ollama(gemma)
- **개발 순서**: 파일 업로드 API → `meetings` 저장 → FastAPI `/ai/meeting/analyze`에서 텍스트 추출 → LLM 요약/결정사항/위험/To-Do JSON 생성 → `meeting_analysis` 저장 → To-Do를 `tasks`로 변환(담당자 후보 포함)
- **핵심**: LLM 출력은 JSON 스키마로 고정(Pydantic 검증). Function Calling으로 구조화 출력 강제. 미배정 업무는 팀장이 배정하도록 상태 분리.

### FS-3 허영주 · 대시보드/지연 위험도
- **스택**: Spring Boot(집계 API) + React Chart(Recharts 등) + FastAPI(ML 추론), scikit-learn/LightGBM
- **개발 순서**: 진행률·마감 임박·업무량 집계 쿼리 → 대시보드 카드 UI → FastAPI `/ai/predict/delay`로 업무 상태·마감일·진행률 입력 → 정상/주의/위험 분류 → `ml_predictions` 저장 → 대시보드에 위험도 표시
- **핵심**: 집계는 DB에서 처리(N+1 회피). ML 모델 학습/피처는 FS-5와 협업, FS-3은 서빙·시각화 담당.

### FS-4 고무서 · AI Assistant/RAG
- **스택**: FastAPI + pgvector(PostgreSQL 17) + OpenAI/Ollama 임베딩, LangChain(선택)
- **개발 순서**: 회의록·업무·문서 chunk 임베딩 → pgvector 저장 → `/ai/rag/query`에서 유사 chunk 검색 → 컨텍스트 주입 후 LLM 답변 → 출처(source) 함께 반환 → React 채팅 UI
- **핵심**: 답변에 반드시 출처 표기(AC-06). 임베딩 파이프라인은 FS-5와 공유. 프로젝트 범위로 검색 필터링(권한 격리).

### FS-5 이은주 · ML/AI 모델링
- **스택**: FastAPI + scikit-learn 1.6 / XGBoost 3.2 / LightGBM 4.6, NumPy 2.5, pandas
- **개발 순서**: 팀원별 업무 수·난이도·완료율 피처 설계 → 업무 편중 점수 회귀/분류 모델 → `/ai/score/workload` 서빙 → 지연 위험도(FS-3)·임베딩(FS-4) 파이프라인 지원 → 노트북(ipynb)으로 학습·평가 기록
- **핵심**: 모델 baseline 우선, 하이퍼파라미터 튜닝은 이후. 학습 과정·평가 그래프는 `output/` 폴더에 저장, 실험 결과는 md로 정리.

### FS-6 유소은 · 업무 보드
- **스택**: React 19 + Tailwind 4(드래그·칸반) + Spring Boot(Task API)
- **개발 순서**: `tasks`/`task_checklists` 스키마 → 카테고리(기획/FE/BE/AI/QA/발표/기타) 선택 UI → 상태별 칸반 컬럼 → 업무 상세 패널(상태/담당자/마감일/체크리스트) → 상태 변경 시 대시보드 반영(FS-3 연동)
- **핵심**: FR-05(To-Do 생성)와 데이터 모델 공유 — 회의록에서 넘어온 업무가 보드에 그대로 반영되도록 `tasks` 스키마를 FS-2와 합의.

### FS-7 곽진아 · 심사자/기여도/QA
- **스택**: Spring Boot(집계 + 권한) + FastAPI(LLM 요약), React(심사자 전용 화면)
- **개발 순서**: 심사자 RBAC 검증(FS-1 연동) → 업무/회의/문서 활동 집계 → `/ai/report/contribution`에서 LLM으로 기여도 요약 → `contribution_reports` 저장 → 심사자 전용 화면(팀원 외 접근 차단) → 전체 권한/시나리오 QA
- **핵심**: 기여도 리포트·AI 평가 근거는 심사자만 조회(AC-07). QA 오너로서 최종 권한 테스트·회귀 테스트 총괄.

## 5. 배정 근거

- **산출물 제거**: 발표자료·보고서·README 등 산출물 생성 기능은 P0에서 전면 제외. 관련 오너(구 FS-5)는 ML/AI 모델링 전담으로 전환.
- **ML 부하 분산**: 지연 위험도·업무 편중 등 ML이 허영주(FS-3) 한 명에게 몰리지 않도록 이은주(FS-5)가 모델링을 분담.
- **데이터 흐름 교차 배정**: 회의록→To-Do→보드→대시보드 흐름상 인접 오너를 부담당으로 교차 배치 (FS-2↔FS-6, FS-3↔FS-1).
- **LLM 파이프라인 공유**: 회의록 분석(FR-04)·RAG(FR-08)는 LLM/임베딩 로직을 공유하므로 고무서(FS-4)·이은주(FS-5)가 상호 부담당.
- **권한/QA**: 권한 성격이 강한 FR-01은 QA 오너 곽진아(FS-7)가 부담당으로 검증.
