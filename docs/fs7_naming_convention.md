# FS-7 DB 네이밍 컨벤션 (팀 공유용)

> 작성: 이은주 (FS-7) · 다른 오너 테이블도 이 컨벤션 따라주면 충돌 없이 JOIN 가능

## 1. 테이블 / 컬럼
- 테이블명: `snake_case`, 복수형 (`contribution_reports`, `evaluation_scores`)
- 컬럼명: `snake_case`
- PK: 모든 테이블 `id BIGSERIAL PRIMARY KEY` (UUID 안 씀 — Spring Data JPA `Long id` 기본값과 맞춤)
- FK: `{참조테이블_단수}_id` (`project_id`, `user_id`, `reviewer_id`)
- Boolean: `is_` 접두사 (`is_public`, `is_done`)
- 시각: `created_at`, `updated_at` (`TIMESTAMPTZ`, `DEFAULT now()`)
- JSON 저장: `JSONB` 타입, 컬럼명은 단수 (`evidence`, 배열이어도 단수 유지 — "증거 데이터 뭉치" 자체를 지칭)

## 2. Java 엔티티 (Spring Boot / JPA)
- 클래스명: `PascalCase` 단수형 (`ContributionReport`, `EvaluationScore`)
- 필드명: `camelCase` (`projectId`, `isPublic`) — Spring의 기본 `CamelCaseToUnderscoresNamingStrategy`가 자동으로 `snake_case` 컬럼에 매핑하므로 `@Column(name=...)` 명시 안 해도 됨. 단, 매핑 안 되는 예외 케이스만 명시.
- Enum 저장: `@Enumerated(EnumType.STRING)` + DB는 `VARCHAR` + `CHECK` 제약 (숫자 ordinal 저장 금지 — 나중에 값 추가/순서 바뀌면 깨짐)

## 3. API 경로 (FS-7 담당 엔드포인트, 문서 기준 확정본)
```
GET   /api/v1/projects/{id}/contributions
GET   /api/v1/projects/{id}/members/{userId}/contribution
POST  /api/v1/projects/{id}/comments
POST  /api/v1/projects/{id}/scores
PATCH /api/v1/projects/{id}/scores/{scoreId}/visibility
POST  /ai/contribution/summarize      (FastAPI)
POST  /ai/ml/anomaly                  (FastAPI)
```

## 4. 착수보고서(중간2차) 대조 결과 (2026-07-10 확인)
- DB: **PostgreSQL 15 확정**. JSONB/pgvector 지원이 선택 이유로 공식 문서에 명시됨 → evidence 컬럼 JSONB 설계 그대로 유지
- 공식 ERD(p.49)에 contribution_reports/evaluation_scores/audit_logs/comments 4개 테이블 이미 반영됨, 필드 기본 구성 일치
- **공식 ERD에는 없고 FS-7 구현 중 내가 추가한 확장 필드** (DB 설계 담당자에게 공유 필요):
  - `contribution_reports`: task_completed_count, meeting_attendance_count, github_commit_count, deliverable_count (무임승차 탐지용 숫자 피처)
  - `comments`: author_role (심사자/팀장/팀원 구분, 작성 시점 스냅샷)
- **정정 (2026-07-10):** `meeting_attendees` 테이블은 물리 ERD(14개 테이블)에 실제로 존재하지 않음 — 이전에 내가 필드 정보를 잘못 읽어서 있다고 말했던 것 정정. 회의 참석 데이터는 `activities` 테이블(type='meeting_attended' 등)로 흡수됐을 가능성이 높음. FS-2(박지수)에게 확인 필요.
- **core ERD(workflow_ai_core_erd.html) 대조 결과 (2026-07-10):**
  - DB는 **PostgreSQL 확정** (문서상 "MySQL"은 오타였음, 팀 확인 완료)
  - "핵심 9개 테이블" 문서는 전체 스키마가 아니라 공통 코어만 정리한 것 — `contribution_reports`/`audit_logs`/`comments`가 안 보이는 건 정상 (FS-7 소유 확장 테이블이라 이 문서 범위 밖)
  - **`evaluation_scores`에서 `reviewer_id`, `comment` 제거 확정** — comment는 FS-7의 `comments` 테이블로 이관, `UNIQUE(project_id, user_id)` 제약 추가 (프로젝트당 사용자 1명에 점수 1개)
  - `project_members.role` 값은 영문 `team_lead`/`member`/`reviewer`로 저장 (한글 아님) — `Comment.AuthorRole` enum과 값 일치 확인됨

## 5. 다른 오너에게 요청할 것
- FS-2(박지수) / FS-6(허영주): 회의 참석 데이터가 `activities`로 통합됐는지 별도 테이블인지 확인 필요, `github_records` 정확한 컬럼명도 공유 부탁 — `evidence` JSONB 매핑에 필요
- FS-3(유소은): 이상치 탐지 결과는 `ml_predictions` 테이블 재사용 예정, `model_type='isolation_forest'`로 넣을 거라 미리 공지
- DB 설계 담당자: 위 확장 필드 2건 공식 ERD에 반영 요청
