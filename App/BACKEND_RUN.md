# WorkFlow AI Backend 실행 방법

아래 명령은 모두 저장소 루트에서 실행한다 (이 파일은 `App/BACKEND_RUN.md`에 있다).

## 0. 백엔드 기준 버전

- **Spring Boot**: 3.5.16
- **Java**: 21 LTS (`App/backend_spring/build.gradle`의 toolchain, Dockerfile 베이스 이미지 모두 21로 통일)
- **빌드 도구**: Gradle (`App/backend_spring/gradlew` Gradle Wrapper 포함, 버전 9.5.1 고정)
- **Railway 배포**: `App/backend_spring/Dockerfile`도 Java 21 이미지(`eclipse-temurin:21-jdk` 빌드 스테이지, `eclipse-temurin:21-jre` 런타임) 사용

로컬에 Gradle Wrapper로 빌드하려면:

```bash
cd App/backend_spring
./gradlew clean bootJar
```

저장소 루트 스크립트(`App/scripts/build_spring_backend.sh`, `App/scripts/run_spring_backend.sh`)를 쓰는 방식도 동일하게 동작한다 (내부적으로 `App/backend_spring`으로 이동해 `./gradlew`를 실행).

## 1. AI FastAPI 서버

실제 앱은 `App/backend_fastapi/app/main.py`에 있다.

```bash
bash App/scripts/run_ai_fastapi.sh
```

기본 주소:

```text
http://127.0.0.1:8000/api/v1/health
```

## 2. Spring Boot 메인 백엔드

Gradle Wrapper가 필요한 Gradle 배포판을 자동으로 내려받아 실행한다 (별도 로컬 설치 불필요, JDK 21만 있으면 된다).

```bash
bash App/scripts/run_spring_backend.sh
```

기본 주소:

```text
http://localhost:8080/api/v1/health
```

## 3. 프론트엔드

프론트엔드는 `App/frontend/` 디렉터리에 있다 (pnpm 사용, `App/frontend/pnpm-workspace.yaml` 참고).

```bash
cd App/frontend
pnpm install
pnpm dev
```

## 4. 빌드 확인

```bash
cd App/frontend && pnpm build && cd ../..
bash App/scripts/build_spring_backend.sh
```

회의록 AI 화면에서 파일 업로드 후 `AI 분석 시작`을 누르면 프론트가 Spring Boot로 요청을 보내고, Spring Boot가 FastAPI 분석 서버를 호출한다.

FastAPI가 꺼져 있어도 Spring Boot fallback 분석기가 기본 분석 결과를 반환하므로 시연 흐름은 유지된다.

## 5. 외부 배포 (Railway, Swagger 공개)

### Swagger 주소

- 로컬: `http://localhost:8080/swagger-ui/index.html`
- Railway 배포 후: `https://<railway-domain>/swagger-ui/index.html`
- API docs: 로컬 `http://localhost:8080/v3/api-docs` / 배포 `https://<railway-domain>/v3/api-docs`

경로는 `/swagger-ui/index.html`, `/v3/api-docs` 그대로 유지된다 (springdoc 기본값). `application-prod.yml`에서 이 경로를 다시 지정하지 않는다 — 재지정하면 `/swagger-ui/swagger-ui/index.html`로 이중 리다이렉트되는 springdoc 버그가 있다.

### API Base URL

- 로컬: `http://localhost:8080/api/v1`
- Railway 배포 후: `https://<railway-domain>/api/v1`

프론트는 `VITE_API_BASE_URL` 환경변수로 이 값을 주입한다 (`App/frontend/src/meetings/libs/utils/meetingAiApi.ts` 참고, 미설정 시 `http://localhost:8080/api/v1`로 폴백).

### 배포 대응 서버 설정

`App/backend_spring/src/main/resources/application.yml`:

```yaml
server:
  port: ${PORT:8080}
  address: 0.0.0.0
```

Railway는 컨테이너에 자체 `PORT` 환경변수를 주입하고 그 포트로만 트래픽을 전달한다. 위 설정이 이미 `${PORT:8080}`로 되어 있으므로 Railway 대시보드에서 **PORT를 따로 지정하지 않아도** Railway가 주입한 값을 그대로 사용한다. `0.0.0.0` 바인딩은 컨테이너 외부(Railway 프록시)에서 오는 트래픽을 받기 위해 필요하다.

### CORS (배포 프론트 도메인 허용)

`WORKFLOW_CORS_ORIGINS` 환경변수에 콤마로 구분한 배포 프론트 도메인을 넣는다 (`App/backend_spring/src/main/java/com/workflowai/common/CorsConfig.java` 참고). 미설정 시 로컬 개발 주소(`http://localhost:5173,http://127.0.0.1:5173`)로 폴백하므로, 배포 환경에서는 반드시 재설정해야 한다. 프론트 배포 주소가 아직 없다면 임시로 `*`를 사용할 수 있다.

```
WORKFLOW_CORS_ORIGINS=https://workflow-ai.example.com,https://www.workflow-ai.example.com
```

### Railway 배포 절차

1. [Railway](https://railway.app) 로그인 후 **New Project → Deploy from GitHub repo** 선택, `rhantj/work-flow` 저장소와 `main` 브랜치를 연결한다.
2. 서비스 설정에서 **Root Directory**를 `App/backend_spring`으로 지정한다. Railway가 `App/backend_spring/Dockerfile`을 감지해 빌드한다 (`docker build -f App/backend_spring/Dockerfile App/backend_spring`과 동일한 빌드 컨텍스트).
3. **Variables** 탭에서 환경변수 등록:
   ```
   SPRING_PROFILES_ACTIVE=prod
   WORKFLOW_CORS_ORIGINS=*
   ```
   - `PORT`는 Railway가 자동 주입하므로 직접 설정하지 않는다.
   - `WORKFLOW_AI_FASTAPI_URL`은 이번 배포에서는 설정하지 않는다 — FastAPI를 아직 Railway에 같이 배포하지 않으므로, 미설정 시 **Spring 내장 fallback 분석기**가 대신 응답한다 (`FallbackMeetingAnalyzer` 참고).
   - 프론트 배포 주소가 정해지면 `WORKFLOW_CORS_ORIGINS`를 그 도메인으로 교체한다.
4. Deploy 실행 후 Railway가 할당한 퍼블릭 도메인(`Settings → Networking → Generate Domain`)을 확인한다. 이 값이 `<railway-domain>`이다.
5. 배포 후 아래를 확인한다:
   - `https://<railway-domain>/api/v1/health`
   - `https://<railway-domain>/swagger-ui/index.html`
   - `https://<railway-domain>/v3/api-docs`

### 보안 주의사항 (운영 배포 시)

- 현재 Swagger UI/`/v3/api-docs`는 인증 없이 전체 공개되어 있다. 팀 내부 공유·API 계약 확인용으로는 적합하지만, 실제 운영 환경에서는 다음을 검토해야 한다.
  - Swagger UI 접근을 Basic Auth로 제한하거나, `springdoc.swagger-ui.enabled=false`로 운영 프로필에서 아예 비활성화.
  - 회의록 승인/업무 등록처럼 데이터를 변경하는 API(`POST/PUT`)는 JWT 등 인증 토큰 검증을 추가해야 한다 — 현재는 인증이 구현되어 있지 않으므로 외부에 공개하는 순간 누구나 호출 가능한 상태다.
  - 인증을 추가하면 Swagger에 `@SecurityScheme` + `@SecurityRequirement`를 등록해 Swagger UI에서 토큰을 넣고 "Try it out"할 수 있게 해야 한다.
  - `WORKFLOW_CORS_ORIGINS=*`는 임시 공개 상태다. 프론트 배포 도메인이 정해지면 반드시 해당 도메인으로 좁혀야 한다.
- 지금 단계는 시연/개발 목적의 공개이므로 위 조치 없이 배포해도 되지만, 실사용자 데이터를 다루기 전에는 반드시 인증을 붙여야 한다.
