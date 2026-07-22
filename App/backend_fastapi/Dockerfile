FROM python:3.12-slim
WORKDIR /app

# lightgbm이 런타임에 libgomp.so.1(OpenMP)을 필요로 함 - slim 이미지엔 기본 미포함
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# CPU 전용 PyTorch 휠을 먼저 설치한다. requirements.txt에 torch를 그냥 적으면 기본 PyPI 인덱스가
# CUDA 포함 빌드를 받아와 이미지가 수 GB 커진다 - RAG 임베딩 로컬 추론(embedding_service.py)은
# GPU가 필요 없으므로 반드시 CPU 휠 인덱스로 먼저 설치해 이후 requirements.txt 설치 시 재설치되지 않게 한다.
RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu

# requirements는 저장소 루트 requirements.txt로 통합됨 (빌드 컨텍스트는 루트, docker-compose.yml 참고)
# requirements 먼저 복사해서 설치 → 코드만 바뀌었을 땐 pip install을 다시 안 하고 캐시를 씀
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY App/backend_fastapi/app app
COPY App/backend_fastapi/core core
COPY App/backend_fastapi/llm_rag_assistant llm_rag_assistant
COPY App/backend_fastapi/ml_workload_score ml_workload_score
COPY App/backend_fastapi/ai_contribution_report ai_contribution_report
COPY App/backend_fastapi/contribution_score contribution_score
# 업무 체크리스트 AI 생성 (LLM)
COPY App/backend_fastapi/llm_checklist llm_checklist
# FS-3(대시보드) - 지연 위험도 예측
COPY App/backend_fastapi/ml_delay_risk ml_delay_risk
# ml_delay_risk/models/*.pkl은 git에 없으므로(.gitignore 참고),
# 컨테이너 기동 시 docker-entrypoint.sh가 Hugging Face Hub에서 내려받는다.
COPY App/backend_fastapi/docker-entrypoint.sh docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000
CMD ["./docker-entrypoint.sh"]
