# WorkFlow AI · 인증/프로젝트/RBAC 구현 파일 정리 (FR-01)

> 담당: FS-1(박상준) · 관련 계획: `docs/projects/WorkFlow_AI_P0_업무분담.md`, `docs/projects/WorkFlow_AI_API_명세서.md`
> 인증 방식: Google OAuth 2.0 전용 (비밀번호 없음, `users` 테이블에 provider/provider_id만 존재)

이 문서는 회원가입/로그인(Google OAuth) → JWT 발급/검증 → 프로젝트 단위 RBAC(팀장/팀원/심사자) 구현에서
새로 만들거나 수정한 파일을 레이어별로 정리한 것이다. 서버가 HTML을 그려주는 전통적 MVC가 아니라
**Spring Boot REST API + React SPA** 구조이므로, "View"는 프론트엔드 화면이 담당한다.

## 1. 백엔드 (`App/backend_spring`)

### 1.1 스키마

| 파일 | 역할 |
| --- | --- |
| `src/main/resources/db/migration/V1__init_schema.sql` | `docs/db/workflow_ai_schema.sql` 전체(20개 테이블)를 Flyway 마이그레이션으로 적용. `spring.jpa.hibernate.ddl-auto: validate`로 고정해 이 파일이 스키마의 유일한 소스가 되도록 함 |

### 1.2 `com.workflowai.user` — Model / Repository

| 파일 | 역할 |
| --- | --- |
| `user/User.java` | `users` 테이블과 매핑되는 JPA 엔티티 (id, email, name, provider, providerId) |
| `user/UserRepository.java` | `findByProviderAndProviderId`, `findByEmail` |

### 1.3 `com.workflowai.auth` — 인증 Controller / Service / DTO

| 파일 | 역할 |
| --- | --- |
| `auth/AuthController.java` | `GET /auth/google`(Google 인가 URL로 302), `GET /auth/google/callback`(로그인/회원가입 처리 후 프론트로 302 + 토큰을 URL 프래그먼트에 실어 전달), `POST /auth/refresh`, `POST /auth/logout` |
| `auth/AuthService.java` | 로그인/회원가입 판단 로직 — `findByProviderAndProviderId` 조회 후 없으면 `User` 신규 저장, JWT 발급 |
| `auth/GoogleOAuthProperties.java` | `workflow.google.*` 설정 바인딩 (client-id/secret/redirect-uri) |
| `auth/GoogleOAuthService.java` | Google 인가 URL 생성, code→token 교환, userinfo 조회 (RestClient 사용, `spring-boot-starter-oauth2-client` 미사용) |
| `auth/GoogleTokenResponse.java` | Google 토큰 엔드포인트 응답 DTO |
| `auth/GoogleUserInfo.java` | Google userinfo 엔드포인트 응답 DTO |
| `auth/MeController.java` | `GET /me`(사용자 정보 + 프로젝트별 역할), `GET /me/tasks`·`GET /me/comments`(다른 담당 기능을 위한 빈 목록 스텁) |
| `auth/MeResponse.java` / `auth/ProjectRoleSummary.java` / `auth/UserSummary.java` / `auth/AuthTokenResponse.java` / `auth/RefreshRequest.java` | Controller ↔ 클라이언트 응답/요청 DTO (Entity를 직접 노출하지 않음) |

### 1.4 `com.workflowai.security` — JWT / RBAC / 필터

| 파일 | 역할 |
| --- | --- |
| `security/JwtProperties.java` | `workflow.jwt.*` 설정 바인딩 (secret, access/refresh TTL) |
| `security/JwtService.java` | Access/Refresh JWT 발급·파싱 (`typ` 클레임으로 토큰 종류 구분) |
| `security/UserPrincipal.java` | 인증된 사용자를 나타내는 record (id, email, name) |
| `security/CurrentUser.java` | `SecurityContextHolder`에서 `UserPrincipal`을 꺼내는 공용 유틸 |
| `security/InvalidTokenException.java` | JWT 파싱 실패 시 던지는 예외 |
| `security/JwtAuthenticationFilter.java` | `Authorization: Bearer` 헤더를 파싱해 `SecurityContext`에 인증 정보 설정 |
| `security/SecurityConfig.java` | Stateless 세션, `/auth/**` 등 permitAll, 나머지 `authenticated()`, 401/403을 `ApiResponse` JSON으로 응답 |
| `security/ProjectAccess.java` | `@projectAccess.hasRole(projectId, role)` / `.isMember(projectId)` — `@PreAuthorize`에서 쓰는 프로젝트 단위 RBAC 빈 |

### 1.5 `com.workflowai.project` — 프로젝트/멤버/초대 Controller / Service / Repository / Model

| 파일 | 역할 |
| --- | --- |
| `project/Project.java`, `project/ProjectRepository.java` | 프로젝트 엔티티/리포지토리 |
| `project/ProjectMember.java`, `project/ProjectMemberRepository.java` | 프로젝트-사용자-역할 매핑 엔티티/리포지토리 (RBAC의 기반 테이블) |
| `project/ProjectRole.java` | `LEADER/MEMBER/REVIEWER` enum + 한글(`팀장/팀원/심사자`) 변환 유틸 |
| `project/Invitation.java`, `project/InvitationRepository.java` | 초대 엔티티/리포지토리 (토큰, 만료일, 상태) |
| `project/ProjectService.java` | 프로젝트 생성(생성자 자동 LEADER)·조회·수정·삭제, 멤버 목록/역할 변경 |
| `project/InvitationService.java` | 초대 생성, 토큰 기반 수락 처리 |
| `project/ProjectController.java` | `/projects`, `/projects/{id}`, `/projects/{id}/members`, `/projects/{id}/members/{userId}/role` |
| `project/InvitationController.java` | `/projects/{id}/invitations`, `/invitations/{token}/accept` |
| `project/CreateProjectRequest.java`, `UpdateProjectRequest.java`, `ProjectResponse.java`, `MemberResponse.java`, `UpdateMemberRoleRequest.java`, `CreateInvitationRequest.java`, `InvitationResponse.java` | 요청/응답 DTO |

### 1.6 설정 변경

| 파일 | 변경 내용 |
| --- | --- |
| `build.gradle` | Spring Security, Spring Data JPA, PostgreSQL 드라이버, Flyway, jjwt(JWT) 의존성 추가 |
| `src/main/resources/application.yml` | `spring.datasource`/`spring.jpa`/`spring.flyway`, `workflow.jwt.*`, `workflow.google.*`, `workflow.frontend.base-url` 추가 |
| `App/.env.example` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `WORKFLOW_FRONTEND_BASE_URL` 추가 |
| `App/docker-compose.yml` | `backend-spring` 서비스에 위 환경변수 + 기존에 연결 안 돼 있던 `JWT_SECRET` 전달 |

## 2. 프론트엔드 (`App/frontend/src`)

### 2.1 API 클라이언트 (`global/api/`)

| 파일 | 역할 |
| --- | --- |
| `global/api/tokenStore.ts` | Access/Refresh 토큰 `localStorage` 저장/조회/삭제 |
| `global/api/apiClient.ts` | `fetch` 래퍼 — `Authorization: Bearer` 자동 첨부, 401 시 refresh 후 1회 재시도 |
| `global/api/authTypes.ts` | 백엔드 DTO에 대응하는 TS 타입 (`UserSummary`, `MeResponse`, `ProjectRoleSummary` 등) |
| `global/api/projectsApi.ts` | `createProject`, `listProjects`, `createInvitation` |

### 2.2 인증 상태 / 라우트 가드 (`global/hooks/`)

| 파일 | 역할 |
| --- | --- |
| `global/hooks/useAuth.tsx` | 전역 인증 Context — 마운트 시 `/me` 조회, `loginWithGoogle`, `logout`, `refreshMe` 제공 |
| `global/hooks/useAuthGuard.tsx` | `RequireAuth`(비로그인 시 `/login`으로), `RequireRole`(프로젝트 역할 기반 라우트 가드) |

### 2.3 화면 (`auth/screen/`, `mypage/screen/`)

| 파일 | 역할 |
| --- | --- |
| `auth/screen/LoginScreen.tsx` | 이메일/비밀번호 폼 → "Google로 계속하기" 버튼으로 교체 |
| `auth/screen/SignupScreen.tsx` | 동일 브랜드 패널을 유지한 "Google로 시작하기" 환영 화면으로 재구성 |
| `auth/screen/GoogleCallbackScreen.tsx` (신규) | `/auth/callback` — URL 프래그먼트의 토큰을 저장하고 `/me` 조회 후 `/dashboard`로 이동 |
| `auth/screen/OnboardingScreen.tsx` | 프로젝트 이름 입력 추가, "다른 팀원을 팀장으로" 분기 제거, 이메일별 실제 초대(`POST invitations`)로 재설계 |
| `mypage/screen/MyPage.tsx` | 수동 역할 전환 버튼 제거, 실제 프로젝트 role로 팀원/심사자 화면 분기, 프로필·로그아웃 실연동 |
| `routes/router.tsx` | `/auth/callback` 공개 라우트 추가, `OnboardingScreen`을 인증 필요 라우트로 이동 |

## 3. 요청 흐름 요약 (회원가입/로그인)

```
SignupScreen (Google 버튼)
  → AuthController GET /auth/google        (Google 인가 URL로 302)
  → Google 로그인 동의 화면                  (외부)
  → AuthController GET /auth/google/callback
  → AuthService.loginWithGoogleCode()
      → GoogleOAuthService (code→token 교환, userinfo 조회)
      → UserRepository (없으면 User 신규 저장 = 회원가입, 있으면 기존 사용자 = 로그인)
      → JwtService (Access/Refresh 발급)
  → AuthController가 프론트로 302 (토큰을 URL #fragment에 실음)
  → GoogleCallbackScreen.tsx (tokenStore에 저장 → /me 호출)
  → useAuth 상태 갱신 → RequireAuth 통과 → /dashboard
```

이후 보호된 API 호출은 `apiClient`가 `Authorization: Bearer`를 자동 첨부하고,
프로젝트 단위 권한 검사는 각 Controller 메서드의 `@PreAuthorize("@projectAccess...")`가 담당한다.

## 4. 알려진 한계 (P0 범위)

- Refresh Token은 stateless JWT로 서버에 저장하지 않아 `POST /auth/logout`이 서버 측에서 실제로 폐기하지는 못한다 (클라이언트 토큰 삭제만 수행).
- `docs/db/workflow_ai_schema.sql`과 `V1__init_schema.sql`은 내용이 중복된다. 향후 스키마 변경 시 두 파일을 함께 갱신해야 한다.
- `/me/tasks`, `/me/comments`는 빈 목록을 반환하는 스텁이다 (실 데이터는 회의록/업무 보드 담당 기능에서 채움).
- `MyPage`의 업무 목록·활동 타임라인·기여도 리포트 등 세부 데이터는 이번 범위에서 mock 데이터를 유지한다.
