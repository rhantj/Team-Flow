# WorkFlow AI 7인 풀스택 구현 상세

> 로드맵의 7인 기능 오너제(FS-1 ~ FS-7)를 화면 / API / DB / AI 단위로 세분화한 문서.
> 각 오너는 담당 기능을 프론트-백-DB-AI까지 세로로 책임진다.

## 0. 공통 규칙

| 항목 | 내용 |
| --- | --- |
| Frontend | React + Vite + TypeScript, 라우팅 react-router, 상태 TanStack Query(서버) + Zustand(클라) |
| Backend | Spring Boot, Spring Security, JWT, Spring Data JPA |
| AI Backend | Python FastAPI (별도 서비스), Spring Boot가 내부 호출 |
| DB | PostgreSQL + pgvector |
| API 규칙 | REST, `POST /api/v1/...`, 응답 envelope `{ success, data, error }` |
| 비동기 | 회의록 분석/STT/GitHub 동기화는 Redis Queue로 처리, 상태 폴링 |
| 인증 방식 | Google OAuth 2.0 로그인, 서버 발급 Access(30분)/Refresh(2주) JWT |

## 0-1. AI 기술 맵 (오너별)

| 오너 | ML | DL | LLM |
| --- | --- | --- | --- |
| FS-1 인증/프로젝트 | - | - | - | 곽진아
| FS-2 회의록/To-Do | 역할 추천(KNN, P1) | STT(Whisper), 문장 분류(KoBERT, P1) | 회의 요약·To-Do 추출(Function Calling) | 박지수
| FS-3 대시보드 | 지연 위험도·업무 편중(LightGBM) | 회의 감정/위험 신호(BERT, P2) | AI 추천 액션 문장 생성 | 유소은
| FS-4 Assistant | - | - | RAG 답변(Embedding + LLM) | 박상준
| FS-5 산출물 | - | - | 산출물 초안 생성(+RAG 옵션) | 고무서
| FS-6 업무 보드/GitHub | - | 업무 우선순위 분류(BERT, P1) | - | 허영주
| FS-7 기여도/심사 | 이상치 탐지(Isolation Forest, P1) | - | 기여도 근거 요약 | 이은주

> 표기: ML=scikit-learn/LightGBM 계열, DL=PyTorch/Transformers/Whisper, LLM=OpenAI 호환 API+RAG. "-"는 해당 기술 미사용.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 -- 곽진아 --
# 🟦 FS-1 · 인증 / 프로젝트 / RBAC

> **AI 기술**: 없음(순수 인증·권한·CRUD). AI 미사용이 정상.

### 핵심 결정사항
- **인증 방식**: **Google OAuth 2.0**. 비밀번호 저장 없음. 구글 프로필(email, name, sub)로 유저 생성/조회 후 서버가 자체 JWT(Access/Refresh) 발급.
- **OAuth 플로우**: Authorization Code 방식. 프론트가 구글 로그인 → code → 백엔드가 code로 토큰 교환·프로필 조회 → 신규면 회원가입, 기존이면 로그인 → 서버 JWT 반환.
- **유저 식별**: 구글 `sub`를 불변 식별자로 저장(이메일 변경 대비). `users.provider='google'`, `users.provider_id=sub`.
- **권한 모델**: 전역 role이 아니라 **프로젝트별 role**(`project_members.role` = 팀장/팀원/심사자). 한 유저가 프로젝트A는 팀장, 프로젝트B는 팀원일 수 있음.
- **인가 방식**: Spring Security OAuth2 Client + `@PreAuthorize` + 프로젝트 멤버십 체크 커스텀 방식.
- **초대 방식**: 이메일 초대 링크(토큰). 초대 수락도 구글 로그인 후 처리. 심사자는 팀장이 이메일로 초대.

### Frontend
- "Google로 계속하기" 로그인 화면 / 로그아웃
- OAuth 콜백 처리 화면(code 수신 → 백엔드 교환 → JWT 저장)
- 프로젝트 목록, 프로젝트 생성 모달(제목, 유형, 마감일, 설명)
- 팀원 초대 화면(이메일 입력 → 초대 발송, 역할 선택)
- 초대 수락 화면(토큰 링크 진입)
- 권한별 라우트 가드(HOC 또는 route wrapper)

### Backend API
- `GET /api/v1/auth/google` (구글 인가 URL 리다이렉트) `GET /api/v1/auth/google/callback` (code → JWT)
- `POST /api/v1/auth/refresh` `POST /api/v1/auth/logout`
- `GET /api/v1/projects` `POST /api/v1/projects`
- `POST /api/v1/projects/{id}/invitations` (초대 생성)
- `POST /api/v1/invitations/{token}/accept`
- `GET /api/v1/projects/{id}/members` `PATCH .../members/{userId}/role`

### DB
- `users` (id, email, name, provider, provider_id)  ← password_hash 제거, provider/provider_id 추가
- `projects` (id, title, type, deadline, description)
- `project_members` (id, project_id, user_id, role)
- `invitations` (id, project_id, email, role, token, status, expires_at)

### 완료 기준
- 역할별 로그인 후 접근 화면이 다르게 표시(AC-01)
- 심사자/팀원 권한이 API 레벨에서 차단됨

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 박지수 --
# 🟩 FS-2 · 회의록 AI / To-Do

> **AI 기술**: **LLM**(회의 요약·결정/위험 추출·To-Do 생성, Function Calling) · **DL**(Whisper STT / KoBERT 문장 분류 P1) · **ML**(역할 추천 KNN P1).
>
> **학습 데이터셋**: 회의 요약·문장 분류 → [MeetingBank](https://meetingbank.github.io/) · [QMSum](https://github.com/Yale-LILY/QMSum) / STT → [Common Voice](https://commonvoice.mozilla.org/datasets) · [KsponSpeech(AI Hub)](https://aihub.or.kr/)

### 핵심 결정사항
- **회의방 개념 없음(파일/녹음 기반)**: 회의 1건 = 업로드 파일 1개 또는 마이크 녹음 1건. "참가 인원"은 실시간 세션이 아니라 **참석자 태깅**으로 처리한다.
- **참석자 모델**: 회의 생성 시 프로젝트 멤버 중 참석자 다중 선택 → `meeting_attendees`에 저장. 대학생 팀 기준 참석자 3~7명 가정. 참석자 정보는 이후 기여도(회의 참여) 근거로 사용.
- **입력 유형**: 문서(P0) → 마이크 녹음 STT(P1) → 음성 파일(P1) → 영상(P2). 문서 파싱은 pdfplumber/python-docx.
- **마이크 녹음 STT**: 브라우저 `getUserMedia` + `MediaRecorder`로 현장 녹음 → 종료 시 오디오 업로드 → Whisper STT → transcript 저장 후 기존 분석 파이프라인 재사용. 실시간 스트리밍이 아니라 녹음 종료 후 일괄 전사(구현 단순화).
- **상대방 음성(원격 참가자) 캡처**: 화상회의 상대의 음성은 스피커로 출력되어 마이크로 안 잡히므로, `getDisplayMedia({ audio: true })`로 **탭/시스템 오디오**를 캡처한다. 마이크(내 음성) 스트림과 시스템 오디오(상대 음성) 스트림을 Web Audio API(`AudioContext`)로 믹싱해 하나로 녹음 → 전사. 온라인/오프라인 회의 모두 대응.
- **화자 구분(선택)**: 마이크/시스템 오디오를 별도 트랙으로도 저장하면 "나 vs 상대" 트랙 단위 구분 가능. 다중 화자 분리(diarization)는 범위 외.
- **분석 흐름**: 업로드 → 텍스트 추출 → LLM 분석 → 요약/결정사항/위험/To-Do JSON → 사용자 검토 후 승인.
- **To-Do 배정**: 담당자 명확하면 자동 배정, 불명확하면 미배정으로 두고 팀장이 지정.

### Frontend
- 회의록 업로드 화면(유형 선택, 파일 드롭, 참석자 선택)
- **녹음 화면**: 마이크 + 시스템(탭) 오디오 동시 캡처, 시작/일시정지/종료, 녹음 시간·파형 표시, 종료 시 믹싱 오디오 업로드
- 분석 진행 상태 표시(폴링 스피너)
- 분석 결과 화면: 요약 / 결정사항 / 위험요소 / To-Do 후보 리스트
- To-Do 후보 검토·수정·승인 UI(담당자, 마감일, 우선순위 편집)

### Backend API
- `POST /api/v1/projects/{id}/meetings` (파일 업로드 또는 녹음 오디오 + 참석자)
- `POST /api/v1/meetings/{id}/transcribe` (오디오 → STT 트리거 → Queue)
- `GET /api/v1/meetings/{id}` (분석 상태/결과)
- `POST /api/v1/meetings/{id}/analyze` (AI 분석 트리거 → Queue)
- `POST /api/v1/meetings/{id}/todos/approve` (선택 To-Do를 tasks로 확정)

### AI Backend (FastAPI)
- `POST /ai/stt/transcribe` : 오디오(마이크+시스템 믹싱) → 텍스트. Whisper API 또는 local Whisper
- `POST /ai/meeting/analyze` : 텍스트 입력 → `{summary, decisions[], risks[], action_items[]}`
- LLM Function Calling으로 To-Do 스키마(제목/담당자후보/마감일/우선순위) 강제

### DB
- `meetings` (id, project_id, file_type, transcript, file_path)
- `meeting_attendees` (id, meeting_id, user_id)  ← **참석자 태깅**
- `meeting_analysis` (meeting_id, summary, decisions, risks, action_items)

### 완료 기준
- 문서 업로드 후 요약 + To-Do 후보 생성(AC-02)
- 미배정 업무를 팀장이 배정해 보드 등록(AC-03)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 유소은 --
# 🟨 FS-3 · 대시보드 / ML 위험도

> **AI 기술**: **ML**(지연 위험도 3분류·업무 편중 회귀, LightGBM) · **LLM**(AI 추천 액션 문장 생성) · **DL**(회의 감정/위험 신호 표시 P2, 생성은 FS-2).
>
> **학습 데이터셋**: 지연 위험도 → [The Public Jira Dataset](https://zenodo.org/records/5882881) (마감일·상태·변경 이력 등 이슈 데이터로 지연 라벨 구성)

### 핵심 결정사항
- **ML 데이터 부재 대응**: 초기엔 규칙 기반 스코어로 시작 → 데이터 축적 후 LightGBM 교체(로드맵과 일치).
- **지연 위험도**: 입력 = 마감일 임박도, 진행률, 지연 횟수, 담당자 업무량 → 정상/주의/위험 3분류.
- **업무 편중 점수**: 팀원별 업무 수·난이도·완료율·마감 임박 → 과부하 점수(회귀).
- **집계**: 실시간 쿼리 + 무거운 집계는 캐시.

### Frontend
- 대시보드: 전체 진행률, 마감 D-day, 마감 임박(오늘/3일/7일), 지연 업무
- 팀원별 업무량 차트(과부하 점수 색상 표시)
- 최근 활동 피드
- AI 추천 액션 카드(재배정 추천, 우선 처리)

### Backend API
- `GET /api/v1/projects/{id}/dashboard/summary`
- `GET /api/v1/projects/{id}/dashboard/workload`
- `GET /api/v1/projects/{id}/predictions?type=delay|overload`

### AI Backend (FastAPI)
- `POST /ai/ml/delay-risk` : 업무 피처 → 정상/주의/위험 + score (ML, LightGBM)
- `POST /ai/ml/overload` : 팀원 피처 → 과부하 score (ML, 회귀)
- `POST /ai/llm/recommend-actions` : 위험 예측 + 업무/팀 현황 → 추천 액션 문장(재배정/우선 처리) 생성 (LLM)
- scikit-learn/LightGBM, 예측 결과는 `ml_predictions`에 저장

### DB
- `activities` (id, project_id, actor_id, type, target_id, created_at)
- `ml_predictions` (id, project_id, target_type, target_id, model_type, result, score)

### 완료 기준
- ML 지연 위험도·업무 편중 점수 화면 표시(AC-05)
- 보드 상태 변경이 대시보드 진행률 반영(AC-04)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 박상준 --
# 🟧 FS-4 · AI Assistant / RAG

> **AI 기술**: **LLM + RAG**(Embedding으로 프로젝트 문서 검색 → LLM이 출처 포함 답변 생성).

### 핵심 결정사항
- **RAG 소스**: 회의록, To-Do, 산출물, GitHub 기록을 chunk 임베딩.
- **Vector DB**: pgvector(같은 DB에서 관리, 인프라 단순화).
- **출처 표시**: 답변에 근거 chunk의 출처(회의록/업무 ID) 명시.
- **권한 제어**: 심사자/팀원/팀장 권한에 맞는 데이터만 검색(RBAC 필터).

### Frontend
- Assistant 채팅 UI(질문 입력, 답변, 출처 뱃지)
- 프로젝트별 대화 세션
- 추천 질문 프리셋("이번 주 위험한 업무는?")

### Backend API
- `POST /api/v1/projects/{id}/assistant/ask` (질문 → AI Backend 프록시, 권한 필터 적용)
- `GET /api/v1/projects/{id}/assistant/history`

### AI Backend (FastAPI)
- `POST /ai/rag/index` : 새 문서/업무 임베딩 후 저장
- `POST /ai/rag/ask` : 질문 → embedding 검색 → LLM 답변 + 출처
- Embedding 모델 + LLM API

### DB
- `document_chunks` (id, project_id, source_type, source_id, content, embedding vector)
- `assistant_messages` (id, project_id, user_id, role, content, sources)

### 완료 기준
- 프로젝트 데이터 기반 질문에 출처와 함께 답변(AC-06)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 고무서 --
# 🟥 FS-5 · 산출물 생성

> **AI 기술**: **LLM**(발표자료·보고서·README·제안서·실험보고서 초안 생성). 여유 시 **RAG**로 근거 기반 확장.

### 핵심 결정사항
- **P0 산출물**: 발표자료 / 보고서 / README 초안(텍스트). 실제 파일(PPTX/PDF) 다운로드는 P2.
- **생성 엔진 = LLM**: 본문·목차·발표 대본 등 자연어 생성은 LLM이 담당. 규칙/템플릿만으로 불가.
- **역할 분리**: "무엇을 쓸지"=LLM, "어떤 틀에 담을지"=유형별 프롬프트 템플릿, "파일 변환"=python-pptx/ReportLab(P2, LLM 아님).
- **컨텍스트 주입 전략**: 1차는 프로젝트 요약(회의록·업무·마일스톤 압축)을 프롬프트에 주입하는 단순 방식. 여유 시 FS-4 RAG를 붙여 근거 기반 생성으로 확장.
- **출력 형식 강제**: LLM 출력은 유형별 구조(발표=슬라이드 배열, README=섹션 배열)로 JSON/마크다운 스키마 고정.
- **검수 흐름**: 초안 생성 → 팀원 수정 → 팀장 검수 → 확정.

### Frontend
- 산출물 유형 선택 화면(발표자료/보고서/README/제안서/실험보고서)
- 생성 옵션 입력 → 초안 생성 → 편집기(마크다운)
- 검수 상태 표시(초안/검수중/확정)

### Backend API
- `POST /api/v1/projects/{id}/deliverables` (유형 + 옵션 → 생성 트리거)
- `GET /api/v1/deliverables/{id}` `PATCH /api/v1/deliverables/{id}`
- `POST /api/v1/deliverables/{id}/finalize`

### AI Backend (FastAPI)
- `POST /ai/deliverable/generate` : 유형 + 프로젝트 컨텍스트 → **LLM 호출** → 구조화 초안(JSON/마크다운)
- **LLM 파이프라인**: (1) 프로젝트 데이터 수집·요약 → (2) 유형별 프롬프트 템플릿에 주입 → (3) LLM 생성 → (4) 스키마 검증 후 반환
- 유형별 프롬프트 템플릿(발표자료/보고서/README/제안서/실험보고서)
- (P2) 확장: `/ai/deliverable/refine` — 사용자 지시로 특정 섹션만 LLM 재생성
- OpenAI API 또는 호환 LLM, RAG 연동 시 FS-4 `/ai/rag/*` 재사용

### DB
- `deliverables` (id, project_id, type, title, content, status, file_path)

### 완료 기준
- 발표자료/보고서/README 초안 생성(AC-07)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 허영주 --
# 🟪 FS-6 · 업무 보드 / GitHub

> **AI 기술**: 코어는 규칙 기반(AI 없음). **DL**(업무 우선순위 분류 BERT, P1)이 업무 생성 시 자동 추천에 붙음.
>
> **학습 데이터셋**: 우선순위 분류 → [The Public Jira Dataset](https://zenodo.org/records/5882881) (이슈 priority 필드 활용) · GitHub Issue 라벨 데이터

### 핵심 결정사항
- **보드 구조**: 상태 4컬럼(할 일/진행 중/보류·블로커/완료). 생성 시 **카테고리 먼저 선택**(기획~기타 18종).
- **상세 패널**: 업무 클릭 시 우측 패널에서 상태/담당자/마감일/체크리스트 편집.
- **GitHub 연동(P1)**: REST API로 커밋/Issue 수집 및 갱신. 소스트리 형태의 브랜치/커밋 그래프·diff 뷰어 제공.

### Frontend
- 칸반 보드(드래그로 상태 이동)
- 업무 생성 모달(카테고리 선택 → 공통+카테고리 전용 필드)
- 업무 상세 우측 패널(체크리스트 포함)
- GitHub 활동 패널(커밋/Issue 활동 표시)

### Backend API
- `GET/POST /api/v1/projects/{id}/tasks` `PATCH /api/v1/tasks/{id}`
- `POST /api/v1/tasks/{id}/checklists`
- `POST /api/v1/projects/{id}/github/connect`
- `GET /api/v1/projects/{id}/github/records`
- `POST /api/v1/github/webhook`

### DB
- `tasks` (id, project_id, title, category, status, assignee_id, due_date, priority)
- `task_checklists` (id, task_id, title, is_done)
- `github_records` (id, project_id, type, title, author, url, linked_task_id)

### 완료 기준
- 카테고리별 업무 생성·상태 이동
- GitHub 커밋 조회 및 업무 연결

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 이은주 --
# 🟫 FS-7 · 심사자 / 기여도 / QA

> **AI 기술**: **ML**(기여도 이상치 탐지 Isolation Forest, P1) · **LLM**(기여도 근거 요약 생성).
>
> **학습 데이터셋**: GitHub 활동 기반 기여도 → [GH Archive](https://www.gharchive.org/) (커밋·Issue 이벤트 스트림)

### 핵심 결정사항
- **접근 제어**: 개인별 기여도 리포트·AI 평가 근거는 **심사자만**. 팀장/팀원 차단.
- **기여도 근거**: 업무 완료 + 회의 참석(FS-2 attendees) + GitHub 커밋 + 산출물 작성 집계.
- **이상치 탐지(P1)**: Isolation Forest로 무임승차/과편중 패턴 탐지.
- **평가 점수**: 심사자 입력 + 공개/비공개 설정. 모든 조회는 audit log 기록.
- **QA 담당**: 전체 회귀 테스트, 권한 시나리오 검증.

### Frontend
- 심사자 대시보드(담당 프로젝트 목록)
- 개인별 기여도 리포트(활동 요약 + 근거 출처)
- 개인/팀 코멘트 작성
- 평가 점수 입력 + 공개 설정 토글

### Backend API
- `GET /api/v1/projects/{id}/contributions` (심사자 전용)
- `GET /api/v1/projects/{id}/members/{userId}/contribution`
- `POST /api/v1/projects/{id}/comments`
- `POST /api/v1/projects/{id}/scores` `PATCH .../scores/{id}/visibility`

### AI Backend (FastAPI)
- `POST /ai/contribution/summarize` : 활동 데이터 → 근거 포함 요약
- `POST /ai/ml/anomaly` : 멤버별 활동 피처 → 이상치 여부 (Isolation Forest)

### DB
- `contribution_reports` (id, project_id, user_id, summary, evidence)
- `evaluation_scores` (id, project_id, user_id, score, is_public)
- `audit_logs` (id, user_id, action, target_type, target_id)

### 완료 기준
- 심사자만 기여도 리포트/AI 평가 근거 조회(AC-08)
- 회의록→평가 근거까지 한 흐름 시연(AC-09)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ⬛ 공통/협업 기능

> 특정 오너 한 명에 딱 배정되지 않고 여러 오너가 나눠 담당하는 기능.

### 마이페이지 (FR-12) — 담당: FS-1 (셸) + 각 오너(위젯)
- **핵심 결정**: 역할별 개인 화면. 팀장/팀원/심사자에 따라 위젯 구성 다름.
- 팀원: 내 할 일, 내 진행률, 받은 코멘트 / 팀장: + 팀 현황, 승인 대기 / 심사자: 담당 프로젝트, 평가 현황.
- **구현 분담**: FS-1이 마이페이지 라우트·레이아웃·권한 분기 셸 담당, 각 위젯은 데이터 오너가 API 제공.
- Backend: `GET /api/v1/me`, `GET /api/v1/me/tasks`, `GET /api/v1/me/comments`.
- 완료: 로그인 역할별로 다른 개인 화면 표시.

### 목표 / 마일스톤 — 담당: FS-3
- **핵심 결정**: 프로젝트 마일스톤 대비 진행률 집계. 승인된 To-Do가 목표 진행률에 반영.
- DB: `milestones` (id, project_id, title, due_date), `task.milestone_id` 연결.
- Backend: `GET/POST /api/v1/projects/{id}/milestones`.
- 완료: 대시보드에 목표 대비 진행률 표시.

### 개인 / 팀 코멘트 — 담당: FS-7 (스키마) + FS-1 (권한)
- **핵심 결정**: 개인 코멘트=모두 작성, 팀 코멘트=팀장·심사자만. 조회 권한은 대상별 제어.
- DB: `comments` (id, project_id, target_type[personal|team], target_user_id, author_id, content).
- Backend: `POST /api/v1/projects/{id}/comments`, `GET .../comments?scope=`.
- 완료: 권한별 코멘트 작성·조회 제어.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 🔗 오너 간 인터페이스(경계 주의)

| 경계 | 주는 쪽 | 받는 쪽 | 계약 |
| --- | --- | --- | --- |
| 승인된 To-Do → 업무 | FS-2 | FS-6 | `tasks` insert 스키마 |
| 업무/활동 → 예측 | FS-6 | FS-3 | `tasks`, `activities` 피처 |
| 회의 참석/커밋 → 기여도 | FS-2, FS-6 | FS-7 | `meeting_attendees`, `github_records` |
| 모든 문서 → RAG 인덱싱 | FS-2, FS-5, FS-6 | FS-4 | `/ai/rag/index` 호출 |
| 권한 컨텍스트 | FS-1 | 전원 | JWT claims + project role |
