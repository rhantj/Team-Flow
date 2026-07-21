# OCI 배포 설계

작성일: 2026-07-17

## 목표

work-flow 전체 스택을 OCI 인스턴스(`workflow-ai-oci`, 2 OCPU / 12GB, Ubuntu 24.04 ARM,
161.33.132.66)에 Docker Compose로 배포한다. 로컬 LLM(Ollama)은 이번 범위에서 제외한다.

## 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 범위 | 전체 스택 − Ollama | 12GB에서 로컬 LLM은 빠듯하고 GPU가 없어 CPU 추론이 느림 |
| 오케스트레이션 | Docker Compose | 단일 노드에서 k8s는 이득 없이 복잡도만 증가 |
| 빌드 | 서버에서 직접 빌드 | 서버가 ARM 네이티브. 로컬(Windows x86)은 QEMU 필요 |
| DB | OCI에 새 DB, Supabase 병행 유지 | 데이터 이전 없이 검증 후 전환 |
| HTTPS | 무료 도메인 + Let's Encrypt | 구글 OAuth가 HTTPS·도메인을 강제 |
| TLS 종료 | 기존 프론트 nginx 확장 | 고무서님이 만든 구성 재사용, 계층 추가 없음 |

## 아키텍처

```
인터넷 → :80/:443 → [frontend: nginx]  정적 파일 + /api/ 프록시
                          ↓ (compose 내부 네트워크)
                    [backend-spring:8080] → [db:5432 pgvector]
                          ↓                  [redis:6379]
                    [backend-fastapi:8000]   [kafka:9092]
```

호스트에는 80/443만 공개한다. 나머지 서비스는 `127.0.0.1`에만 바인딩해
SSH 터널로만 접근 가능하게 한다.

## 반드시 고쳐야 하는 것

### 1. 포트 노출 (보안)

현재 `docker-compose.yml`은 db·redis·kafka·spring·fastapi를 전부 `0.0.0.0`에 게시한다.
`POSTGRES_PASSWORD` 기본값이 `root`이므로 그대로 배포하면 DB가 인터넷에 열린다.

**호스트 iptables로는 못 막는다.** Docker는 publish한 포트를 nat PREROUTING + FORWARD
체인으로 처리하므로 INPUT 체인 규칙을 우회한다. 즉 포트를 게시하지 않는 것이 유일한 방어다.
(OCI Security List는 호스트 밖이라 막아주지만, 이중 방어가 필요하다.)

### 2. Spring 프로필 (보안)

`application-prod.yml`에서만 `dev-login-enabled: false`, `seed-enabled: false`,
springdoc 비활성화가 적용된다. `application.yml`의 기본값은 `dev-login-enabled: true`다.
compose에 `SPRING_PROFILES_ACTIVE`가 없으므로 그대로 배포하면
`/api/v1/auth/dev-login/{1~4}`가 인터넷에 열려 누구나 데모 계정으로 로그인할 수 있다.

### 3. pgvector

`docs/db/migrations/001_document_chunks_vector.sql`이 `CREATE EXTENSION vector`와
`VECTOR(768)`을 사용한다. Supabase는 pgvector가 내장이지만 `postgres:17` 공식 이미지에는 없다.
`pgvector/pgvector:pg17`로 교체한다 (arm64 지원 확인함).

### 4. X-Forwarded-Proto

TLS를 nginx에서 종료하므로 Spring은 평문 HTTP로 요청을 받는다. `X-Forwarded-Proto`가 없으면
Spring이 리다이렉트 URL을 `http://`로 만들어 OAuth 흐름이 깨진다.
nginx에 헤더를 추가하고 Spring에 `server.forward-headers-strategy=framework`를 설정한다.

### 5. compose frontend 잔재

`43c8a50`(고무서)이 Dockerfile을 nginx 멀티스테이지로 바꿨으나 compose를 수정하지 않아
`./frontend:/app` 볼륨과 `API_PROXY_TARGET` 환경변수가 남아 있다. 지금 HMR은 동작하지 않는데
주석은 HMR이라고 말한다. 정리한다.

### 6. DB 마이그레이션 순서

compose는 `db/init`만 자동 실행한다(`01_base_schema.sql`, `02_meeting_ai_additions.sql`).
`docs/db/migrations/001~004`는 포함되지 않는다. init은 `embedding`을 JSONB로 만들고
마이그레이션 001이 `VECTOR(768)`로 바꾸므로, 첫 기동 후 001~004를 순서대로 적용해야 한다.

두 디렉터리를 합칠 수 없다: `initdb.d`는 알파벳순 실행인데 `001_`이 `01_`보다 앞서므로
순서가 뒤집힌다. 별도 단계로 유지한다.

## 파일 변경

| 파일 | 변경 |
|---|---|
| `App/docker-compose.prod.yml` | 신규. 운영 오버레이 |
| `App/frontend/nginx.prod.conf` | 신규. 80/443, ACME 경로, HTTPS 리다이렉트, X-Forwarded-Proto |
| `App/docker-compose.yml` | frontend 잔재 제거 |
| `App/backend_spring/.../application.yml` | `forward-headers-strategy: framework` |
| `App/scripts/init-letsencrypt.sh` | 신규. 인증서 최초 발급 부트스트랩 |
| `App/DEPLOY_OCI.md` | 신규. 서버 작업 런북 |

## 서버 작업 (사람이 직접)

1. OCI Security List에 80/443 인그레스 추가 (기본은 22만)
2. Ubuntu iptables에 80/443 허용 + `netfilter-persistent save`
   — OCI Ubuntu 이미지는 22 외 전부 차단한다
3. Docker + compose 플러그인 설치 (arm64)
4. 무료 도메인을 161.33.132.66에 연결
5. 구글 콘솔에 `https://<도메인>/api/v1/auth/google/callback` 등록
6. `.env` 작성 — `POSTGRES_PASSWORD`(기본값 `root` 금지), `JWT_SECRET`,
   `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI`, `WORKFLOW_FRONTEND_BASE_URL`,
   `WORKFLOW_CORS_ORIGINS`

## 알려진 제약 (의도된 것)

- **LLM 기능 비활성**: RAG 검색/생성이 동작하지 않는다. `chat_router.py`가 `ConnectError`를
  잡아 에러를 반환하고, 회의 분석은 Spring `FallbackMeetingAnalyzer`가 처리한다. 앱은 죽지 않는다.
- **Supabase 병행**: OCI DB는 빈 상태로 시작한다. 기존 Supabase/Railway 환경은 유지한다.
- 예상 메모리 사용량 4.5~7GB (12GB 중).

## 검증 기준

- `https://<도메인>/` 프론트 로딩, 인증서 유효
- `https://<도메인>/api/v1/health` 200
- 구글 로그인 → 보드 진입까지 성공
- 외부에서 5432/6379/9092/8080/8000 접근 불가
- `https://<도메인>/api/v1/auth/dev-login/1` → 404
- `https://<도메인>/swagger-ui/index.html` → 404
