FROM python:3.12-slim
WORKDIR /app

# 저장소 루트 requirements.txt는 discord 봇(bot.py) 전용이라, FastAPI 의존성은
# App/backend_fastapi/requirements.txt에서 가져온다 (빌드 컨텍스트는 루트, docker-compose.yml 참고)
# requirements 먼저 복사해서 설치 → 코드만 바뀌었을 땐 pip install을 다시 안 하고 캐시를 씀
COPY App/backend_fastapi/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY App/backend_fastapi/app app
COPY App/backend_fastapi/core core
COPY App/backend_fastapi/llm_rag_assistant llm_rag_assistant


# FS-3(대시보드) - 지연 위험도 예측
COPY App/backend_fastapi/ml_delay_risk ml_delay_risk
# ml_delay_risk/models/*.pkl은 git에 없으므로(.gitignore 참고),
# 컨테이너 기동 시 docker-entrypoint.sh가 Hugging Face Hub에서 내려받는다.
COPY App/backend_fastapi/docker-entrypoint.sh docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000
CMD ["./docker-entrypoint.sh"]
