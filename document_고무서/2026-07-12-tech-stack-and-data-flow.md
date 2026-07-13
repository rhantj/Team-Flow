# 기술 스택 요약 및 버튼 클릭 데이터 흐름도

작성일: 2026-07-12

## 1. 기술 스택 요약

WorkFlow AI는 프론트엔드 1개, 백엔드 2개(Spring Boot / FastAPI)로 구성된 구조다. 자세한 버전 근거는 `docs/WorkFlow_AI_기술_스택_버전.md` 참고.

| 레이어 | 기술 | 역할 |
|---|---|---|
| 프론트엔드 | React 19.2.7 + TypeScript 5.9.3 + Vite 7.3.6 + Tailwind CSS 4.3.2 | 화면(대시보드/업무보드/회의록 AI/산출물 생성/GitHub 연동), `fetch` 기반 API 호출 |
| 백엔드 (BFF) | Spring Boot 3.5.16 (Java 21) | 프론트엔드가 실제로 호출하는 API 서버. 인증/도메인 로직 + FastAPI 호출 오케스트레이션 |
| AI 백엔드 | FastAPI 0.139.0 (Python 3.12.13) | LLM/ML 추론 전담 (회의록 분석, 산출물 생성 등) |
| DB / Vector DB | PostgreSQL 17.10 + pgvector 0.8.5 | (계획 단계 — 아직 코드에 연결 안 됨. 현재는 인메모리 `Map` 저장) |
| LLM | OpenAI API / Ollama | 자연어 생성(발표자료/보고서/README 초안, 회의록 요약) |

**핵심 구조**: 프론트는 Spring Boot에만 직접 요청을 보낸다. Spring Boot가 필요 시 내부적으로 FastAPI를 호출하고, FastAPI 호출이 실패하면 Spring 자체 fallback 로직으로 대체 응답을 만든다. 즉 프론트엔드는 FastAPI의 존재를 모른다.

## 2. 버튼 클릭 데이터 흐름도 (예: 회의록 AI 분석)

현재 코드베이스에서 실제로 프론트 → Spring → FastAPI 로 이어지는, 목데이터가 아닌 유일한 엔드투엔드 경로다. (`App/frontend/src/meetings/screen/MeetingsView.tsx` → `meetingAiApi.ts` → `MeetingAnalysisController` → `MeetingAnalysisService` → `FastApiMeetingClient` → FastAPI `main.py`)

```
[사용자] "AI 분석 시작" 버튼 클릭
   │
   ▼
MeetingsView.tsx
   └─ analyzeMeeting({ projectId, file, title, ... }) 호출
   │
   ▼  fetch POST (multipart/form-data)
   │  http://localhost:8080/api/v1/projects/{projectId}/meetings/analyze
   ▼
[Spring Boot] MeetingAnalysisController.analyze()
   └─ MeetingAnalysisService.analyze()
        ├─ 업로드 파일에서 텍스트 추출 (txt/md/docx 등)
        ├─ AiAnalyzeRequest 조립
        │
        ▼  RestClient POST (JSON)
        │  http://localhost:8000/api/v1/meetings/analyze-json   ← workflow.ai.base-url
        ▼
   [FastAPI] main.py: analyze_json() → analyze_meeting()
        ├─ 텍스트에서 결정사항/위험요소/To-Do 키워드 추출
        └─ MeetingAnalysisResult(summary, decisions, todos, risks, keywords) 반환
        │
        ▼  (성공 시)
   MeetingAnalysisService: analysisSource = "FASTAPI"
   (FastAPI 호출 실패/예외 시)
   MeetingAnalysisService: FallbackMeetingAnalyzer가 자체 분석 → analysisSource = "SPRING_FALLBACK"
        │
        ▼
   MeetingAnalysisResponse를 인메모리 Map에 저장, ApiResponse로 래핑
   │
   ▼  JSON 응답
[프론트] analyzeMeeting()이 응답 파싱 → 분석 결과(요약/결정사항/To-Do) 화면 렌더링
   └─ 팀장이 To-Do 후보 선택 후 "업무로 등록" 버튼 클릭 시
        POST /api/v1/projects/{projectId}/meetings/{meetingId}/tasks/register
        → 업무보드에서 사용할 Task 생성 (현재는 카운트만 반환하는 스텁)
```

### 흐름의 특징

- **장애 격리(Fallback)**: FastAPI 서버가 꺼져 있거나 응답이 없어도 Spring이 자체 fallback 분석기로 항상 결과를 반환한다. 프론트는 `analysisSource` 필드로 어느 쪽이 응답했는지만 알 수 있다.
- **DB 미연결**: 분석 결과는 Spring 프로세스 메모리(`ConcurrentHashMap`)에만 저장된다. 서버 재시작 시 소실되며, PostgreSQL 연동은 아직 구현되지 않았다.
- **다른 탭(대시보드/업무보드/산출물 생성/GitHub 연동)의 버튼**은 현재 대부분 프론트 mock 데이터 또는 Spring의 고정 샘플 응답(`.gitkeep`만 있는 컨트롤러 다수)을 반환하는 단계로, 위와 같은 실제 FastAPI 연동은 아직 없다.
