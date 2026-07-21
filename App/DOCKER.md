# Docker로 실행하기

파일 배치는 이미 적용되어 있다. (`docker-compose.yml`, `.env.example`은 `App/` 루트, 각 서비스의
`Dockerfile`/`.dockerignore`는 해당 서비스 폴더 안)

## 실행 방법

```bash
cd App
cp .env.example .env   # 값 채우기: DB 비밀번호, JWT_SECRET, LLM_API_KEY 등
docker compose up -d
```

- 프론트엔드: http://localhost:5173
- Spring Boot API: http://localhost:8080/api/v1/health
- Swagger UI: http://localhost:8080/swagger-ui/index.html
- AI FastAPI: http://localhost:8000/api/v1/health

## 현재 상태에서 알아둘 것

- **db / redis / kafka 서비스는 아직 앱 코드가 사용하지 않는다.** `backend_spring`의
  `build.gradle`에는 JPA/Postgres/Redis/Kafka 의존성이 없고 `application.yml`에도 관련 설정이
  없다. 저장소 루트의 `requirements.txt`에도 kafka/redis 클라이언트가 없다.
  즉 지금 `docker compose up`을 해도 이 세 서비스는 컨테이너만 뜨고 백엔드와 실제로 연결되지는
  않는다. 나중에 DB/Redis/Kafka 연동 코드가 추가되면, 그때 `KAFKA_BOOTSTRAP_SERVERS` /
  `DB_HOST` / `REDIS_HOST` 환경변수 이름이 실제 Spring/FastAPI 설정 프로퍼티 키와 맞는지
  다시 확인할 것.
- **DB 포트 충돌**: 로컬에 이미 PostgreSQL이 떠 있다면 `.env`에 `DB_HOST_PORT=5433` 추가.
- **frontend**는 pnpm 기준(`pnpm dev` → 5173 포트)으로 되어 있다. `package.json`의 dev
  스크립트가 바뀌면 `frontend/Dockerfile`의 CMD/EXPOSE도 같이 맞출 것.
