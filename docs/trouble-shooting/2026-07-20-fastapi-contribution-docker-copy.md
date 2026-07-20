# FastAPI contribution 패키지 Docker 이미지 누락

- 날짜: 2026-07-20
- 범위: `App/backend_fastapi`

## 증상

`docker compose up -d --build` 후 `backend-fastapi` 컨테이너가 시작 직후 종료됐다.

로그:

```text
ModuleNotFoundError: No module named 'ai_contribution_report'
```

## 원인

`App/backend_fastapi/Dockerfile`이 기존 최상위 패키지(`app`, `core`, `llm_rag_assistant`, `ml_workload_score`)만 이미지에 복사하고, 새로 추가된 `ai_contribution_report` 패키지를 복사하지 않았다.

로컬 테스트는 소스 트리 전체를 Python path에서 볼 수 있어 통과했지만, Docker 이미지는 명시적으로 `COPY`된 디렉터리만 포함하므로 컨테이너에서 import가 실패했다.

## 해결

`App/backend_fastapi/Dockerfile`에 아래 라인을 추가했다.

```dockerfile
COPY App/backend_fastapi/ai_contribution_report ai_contribution_report
```

## 확인

```bash
cd App
docker compose up -d --build backend-fastapi
docker compose ps
curl -i http://localhost:8000/api/v1/health
```

확인 결과:

- `workflow-backend-fastapi` 컨테이너 `Up`
- FastAPI health `200 OK`
- `POST /ai/report/contribution` `200 OK`
- Spring 경유 `POST /api/v1/ai/contribution/report` `200 OK`
