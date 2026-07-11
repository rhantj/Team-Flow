#!/usr/bin/env bash
# 프론트엔드 + Spring Boot + FastAPI를 한 번에 띄우고, Ctrl+C 한 번으로 전부 종료한다.
#
# 사용법:
#   bash App/scripts/dev-all.sh
#
# 종료:
#   Ctrl+C 한 번이면 세 프로세스 전부 정리된다.

set -uo pipefail
set -m  # 각 백그라운드 잡을 별도 프로세스 그룹으로 띄운다 (그룹째로 kill하기 위함)

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$APP_DIR/scripts/.dev-logs"
mkdir -p "$LOG_DIR"

PIDS=()

# package.json의 packageManager(pnpm 버전 고정)가 실제로 적용되도록 corepack 활성화
# (macOS/Windows 환경별 pnpm 버전 차이로 인한 의존성 정책 불일치 방지)
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || echo "corepack enable 실패 (권한 문제일 수 있음, 무시하고 진행)"
else
  echo "corepack이 설치되어 있지 않습니다. Node.js 16.9+ 에는 기본 내장되어 있으니 Node 버전을 확인하세요."
fi

cleanup() {
  echo ""
  echo "종료 중... 전체 프로세스 그룹을 정리합니다."
  for pid in "${PIDS[@]:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    fi
  done
  sleep 1
  # 프로세스 트리 누락 대비 안전망 (mvn이 자식 JVM을, uvicorn --reload가 워커를 남기는 경우)
  pkill -f "uvicorn app.main:app" 2>/dev/null
  pkill -f "gradlew.*bootRun" 2>/dev/null
  pkill -f "$APP_DIR/frontend/node_modules/.*vite" 2>/dev/null
  wait 2>/dev/null
  echo "모두 종료됨."
}
trap cleanup EXIT INT TERM

echo "[1/3] AI FastAPI 서버 시작 (로그: $LOG_DIR/fastapi.log)"
bash "$APP_DIR/scripts/run_ai_fastapi.sh" > "$LOG_DIR/fastapi.log" 2>&1 &
PIDS+=("$!")

echo "[2/3] Spring Boot 백엔드 시작 (로그: $LOG_DIR/spring.log)"
bash "$APP_DIR/scripts/run_spring_backend.sh" > "$LOG_DIR/spring.log" 2>&1 &
PIDS+=("$!")

echo "백엔드 부팅 대기 중..."
sleep 3

echo "[3/3] 프론트엔드(Vite) 시작 (로그: $LOG_DIR/frontend.log) — Ctrl+C로 전체 종료"
(cd "$APP_DIR/frontend" && exec pnpm dev) > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=("$!")

echo "프론트엔드 부팅 대기 중..."
sleep 3

echo ""
echo "===== 로컬 접속 주소 ====="
echo "프론트엔드      : http://localhost:5173"
echo "Spring Boot API : http://localhost:8080/api/v1/health"
echo "Swagger UI      : http://localhost:8080/swagger-ui/index.html"
echo "AI FastAPI      : http://127.0.0.1:8000/api/v1/health"
echo "=========================="
echo ""
echo "모두 시작됨. 로그는 $LOG_DIR 에서 tail -f로 확인 가능. Ctrl+C로 전체 종료."
# macOS 기본 bash(3.2)는 `wait -n`을 지원하지 않으므로 전체 대기로 처리한다.
wait
