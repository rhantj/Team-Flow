# 가입된 유저가 로그인이 안 되는 오류 — Supabase 풀러 Prepared Statement 충돌

## 상태
해결됨

## 증상
`users` 테이블에 이미 존재하는(가입 완료된) 유저인데 로그인이 간헐적으로 실패한다.

## 원인
`backend-spring`의 `SPRING_DATASOURCE_URL`이 Supabase **Supavisor(pgbouncer) 트랜잭션 모드 풀러**(`aws-1-ap-south-1.pooler.supabase.com:6543`)를 가리키고 있었다.

트랜잭션 풀러는 요청(트랜잭션)마다 물리 DB 커넥션을 다른 클라이언트 세션에 재할당한다. 반면 PgJDBC 드라이버는 기본값(`prepareThreshold=5`)으로 자주 실행되는 쿼리를 서버사이드 prepared statement로 캐싱하는데, 이 캐시가 "논리적으로 같은 커넥션"을 전제로 이름(`S_1`, `S_3` 등)을 붙인다. 트랜잭션 풀러 환경에서는 이 전제가 깨져서 서로 다른 클라이언트가 같은 이름의 prepared statement를 다른 물리 커넥션에 준비하려다 충돌한다.

```
Caused by: org.postgresql.util.PSQLException: ERROR: prepared statement "S_1" already exists
```

이 에러가 로그인 처리(`AuthService.loginWithGoogleCode`, `@Transactional`)의 커밋/롤백 시점에 발생하면 트랜잭션이 롤백되어 로그인이 실패한다. 커넥션 풀 재사용 타이밍에 따라 확률적으로만 발생하기 때문에 "가입은 됐는데 로그인이 안 된다"처럼 간헐적 증상으로 보였다.

## 해결
`App/backend_spring/src/main/resources/application.yml`의 `spring.datasource.hikari.data-source-properties`에 `prepareThreshold: 0`을 추가해 PgJDBC 서버사이드 prepare를 비활성화했다 (Supabase 공식 권장 설정).

```yaml
spring:
  datasource:
    hikari:
      data-source-properties:
        prepareThreshold: 0
```

## 검증
- `docker compose up -d --build backend-spring`로 재빌드/재기동
- `/api/v1/auth/dev-login/{id}` 엔드포인트에 동시 요청 20건을 보내 커넥션 풀 경합을 재현 → `prepared statement already exists` 에러 재발 없음 확인

## 참고
- 세션 모드 풀러(포트 `5432`)를 쓰면 이 문제가 원천적으로 발생하지 않지만, 현재 인프라 구성상 트랜잭션 풀러(6543)를 유지하기로 했으므로 애플리케이션 레벨에서 `prepareThreshold=0`으로 대응했다.
