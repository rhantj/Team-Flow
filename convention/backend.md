# Backend 개발 컨벤션 (WorkFlow AI · Spring Boot)

Spring Boot 3.5 + Java 21 + Gradle 기반 핵심 서비스 API. 인증/권한/프로젝트/업무/대시보드/평가 데이터를 담당하고, AI 추론은 FastAPI(`/ai/*`)를 호출해 위임한다.

## 기술 스택 (고정 버전)

| 기술 | 버전 | 주의 |
| --- | --- | --- |
| Java | 21 LTS | Spring Boot 3.x는 Java 17+ 요구 |
| Spring Boot | 3.5.16 | BOM이 하위 의존성 버전 관리 |
| Spring Security | 6.5 (BOM) | 개별 버전 지정 금지 |
| Spring Data JPA | Hibernate 6.6 (BOM) | |
| JWT | jjwt 0.13 | |
| OpenAPI/Swagger | springdoc-openapi **2.x** | 3.x는 Spring Boot 4 전용 — 쓰지 말 것 |
| Build | Gradle 9.5 (wrapper 고정) | |
| Test | JUnit 5.12 + Mockito 5.17 (BOM) | |

빌드·실행: `cd App/backend_spring && ./gradlew build`

## 패키지 구조 (도메인별)

기존 구조를 따른다. 도메인 단위로 묶고, 각 도메인 안에서 계층 분리.

```
src/main/java/
├── auth/          # 인증/권한 (FS-1)
│   ├── controller/  service/  repository/  entity/  DTO/
├── dashboard/     # 대시보드 (FS-3)
│   ├── controller/  service/  repository/  entity/  DTO/
├── global/        # 공통
│   ├── config/    # Security, Web, Swagger 설정
│   ├── error/     # 예외·핸들러
│   ├── client/    # FastAPI 등 외부 호출 클라이언트
│   ├── queue/     # 비동기(Redis) 처리
│   └── lib/       # 공용 유틸
└── com/workflowai # 애플리케이션 진입점
```

새 도메인(board, meetings 등)도 같은 5계층(`controller/service/repository/entity/DTO`)을 따른다.

## 계층 규칙

- **Controller**: 요청 검증·응답 매핑만. 비즈니스 로직 금지. 얇게 유지.
- **Service**: 비즈니스 로직·트랜잭션(`@Transactional`) 경계. 도메인 간 호출은 Service 레벨.
- **Repository**: Spring Data JPA 인터페이스. 복잡 쿼리는 `@Query` 또는 QueryDSL.
- **Entity**: DB 매핑 전용. 컨트롤러에 Entity 직접 노출 금지 — 반드시 DTO 변환.
- **DTO**: 요청/응답 분리(`XxxRequest`, `XxxResponse`).

## 네이밍 (DB 컨벤션 문서 준수)

`docs/fs7_naming_convention.md`를 팀 공통 규칙으로 따른다.

- 테이블: `snake_case` 복수형 (`tasks`, `contribution_reports`)
- 컬럼: `snake_case`, PK는 `id BIGSERIAL`, FK는 `{단수}_id` (`project_id`, `user_id`)
- Boolean 컬럼: `is_` 접두사, 시각: `created_at`/`updated_at` (`TIMESTAMPTZ DEFAULT now()`)
- Entity 클래스: `PascalCase` 단수형 (`ContributionReport`), 필드: `camelCase`
  - Spring 기본 `CamelCaseToUnderscoresNamingStrategy`가 자동 매핑 → `@Column(name=...)`은 예외 케이스만
- Enum: `@Enumerated(EnumType.STRING)` + DB `VARCHAR` + `CHECK` 제약. **ordinal 저장 금지**
- `project_members.role`은 영문 `team_lead`/`member`/`reviewer`로 저장

## API 규칙

- 기본 경로: `/api/v1/...` (예: `/api/v1/projects/{id}/tasks`)
- 응답 envelope 일관화: `{ success, data, error }` + 페이징 시 `meta`(total/page/limit)
- 페이지네이션: 목록 조회는 `LIMIT` 필수(무한 쿼리 금지)
- OpenAPI 문서화(springdoc)로 엔드포인트 자동 노출

## 보안 (필수)

- 모든 상태 변경 API는 인증 필요. 역할 검증은 `@PreAuthorize`.
- SQL은 JPA/파라미터 바인딩만 — 문자열 concat 쿼리 금지(인젝션).
- 비밀정보(JWT secret, DB 비번, API 키)는 **환경변수/설정**으로. 하드코딩 금지.
- 에러 메시지에 민감정보(스택트레이스·SQL) 노출 금지. `global/error`에서 표준 응답.
- 심사자 전용 데이터(기여도·평가 근거)는 서버에서 역할 검증 후에만 반환(AC-07).

## 비동기 / 외부 호출

- AI 분석·파일 처리·GitHub 동기화는 `global/queue`(Redis) 통해 비동기 처리.
- FastAPI 호출은 `global/client`에 클라이언트로 캡슐화, 타임아웃·실패 처리 명시.

## 코드 원칙

- 메서드 50줄, 파일 800줄 이내. 깊은 중첩(4단계 초과) 금지 — early return.
- 에러는 명시적으로 핸들링, 삼키지 말 것.
- 요청 범위를 벗어난 리팩터링 금지.

## 커밋 전 체크

- [ ] `./gradlew build` 통과 (테스트 포함)
- [ ] 하드코딩된 시크릿 없음
- [ ] Entity 직접 노출 없음(DTO 변환)
- [ ] 권한(`@PreAuthorize`) 검증 확인
- [ ] `build/`, `bin/` 등 빌드 산출물 커밋 제외
