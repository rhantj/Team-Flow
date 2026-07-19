#!/usr/bin/env bash
# Let's Encrypt 인증서 최초 발급 (OCI 서버에서 1회만 실행).
# 갱신은 docker-compose.prod.yml의 certbot 컨테이너가 알아서 한다.
#
# 사용법:
#   cd App
#   DOMAIN=myapp.duckdns.org EMAIL=you@example.com bash scripts/init-letsencrypt.sh
#
# 순환 문제를 푸는 방식:
#   nginx는 인증서 파일이 있어야 443으로 뜨는데, certbot은 nginx가 80에서 챌린지를
#   서빙해야 인증서를 준다. 그래서 임시 자체서명 인증서로 nginx를 먼저 띄우고,
#   진짜 인증서를 받은 뒤 교체한다.

set -euo pipefail

: "${DOMAIN:?DOMAIN 환경변수가 필요하다 (예: DOMAIN=myapp.duckdns.org)}"
: "${EMAIL:?EMAIL 환경변수가 필요하다 (만료 알림 수신용)}"

# 스테이징으로 먼저 시험하려면 STAGING=1. Let's Encrypt 운영 환경은 실패 횟수 제한이
# 빡빡하므로(주당 5회) 설정이 확실하지 않으면 스테이징을 먼저 쓸 것.
STAGING="${STAGING:-0}"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
LIVE_DIR="/etc/letsencrypt/live/${DOMAIN}"

echo "==> 도메인: ${DOMAIN}"

if [ -e "${LIVE_DIR}/fullchain.pem" ] && [ ! -L "${LIVE_DIR}/fullchain.pem.dummy" ]; then
  echo "이미 인증서가 있다: ${LIVE_DIR}"
  echo "다시 발급하려면 sudo rm -rf ${LIVE_DIR} 후 재실행."
  exit 0
fi

echo "==> 1/5 임시 자체서명 인증서 생성 (nginx 부트스트랩용)"
sudo mkdir -p "${LIVE_DIR}"
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "${LIVE_DIR}/privkey.pem" \
  -out "${LIVE_DIR}/fullchain.pem" \
  -subj "/CN=localhost"

echo "==> 2/5 live/current 심볼릭 링크 생성"
# nginx.prod.conf가 도메인을 모르게 하려고 고정 경로를 쓴다.
sudo ln -sfn "${LIVE_DIR}" /etc/letsencrypt/live/current

echo "==> 3/5 nginx 기동 (80에서 ACME 챌린지 서빙)"
${COMPOSE} up -d --build frontend

# nginx가 80을 잡을 때까지 잠깐 기다린다.
for _ in $(seq 1 15); do
  if curl -fsS -o /dev/null "http://localhost/.well-known/acme-challenge/" 2>/dev/null; then break; fi
  sleep 1
done

echo "==> 4/5 임시 인증서 삭제 후 진짜 인증서 발급"
sudo rm -rf "${LIVE_DIR}"

STAGING_FLAG=""
if [ "${STAGING}" != "0" ]; then
  echo "    (스테이징 모드 — 브라우저가 신뢰하지 않는 인증서가 발급된다)"
  STAGING_FLAG="--staging"
fi

${COMPOSE} run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  ${STAGING_FLAG} \
  -d "${DOMAIN}" \
  --email "${EMAIL}" \
  --agree-tos --no-eff-email \
  --non-interactive

# 발급 후 live 디렉터리가 새로 만들어졌으므로 링크를 다시 건다.
sudo ln -sfn "${LIVE_DIR}" /etc/letsencrypt/live/current

echo "==> 5/5 전체 스택 기동"
${COMPOSE} up -d --build

echo
echo "완료. https://${DOMAIN} 확인."
echo "인증서 갱신은 certbot 컨테이너가 12시간마다 확인하고,"
echo "nginx는 6시간마다 reload해서 갱신분을 집어온다."
