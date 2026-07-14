FROM python:3.12-slim
WORKDIR /app

# requirements.txt가 저장소 루트에 있어서 빌드 컨텍스트가 루트다 (docker-compose.yml 참고)
# requirements 먼저 복사해서 설치 → 코드만 바뀌었을 땐 pip install을 다시 안 하고 캐시를 씀
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY App/backend_fastapi/app app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
