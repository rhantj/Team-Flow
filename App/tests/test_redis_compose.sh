#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_dir="${repo_root}/App"
tmp_dir="$(mktemp -d)"
project_name="workflow-redis-acl-test-$$"
smoke_override="${tmp_dir}/smoke.override.yml"
smoke_started=0

cleanup() {
  if [ "${smoke_started}" -eq 1 ]; then
    docker compose \
      --project-name "${project_name}" \
      --env-file "${tmp_dir}/compose.env" \
      -f "${app_dir}/docker-compose.yml" \
      -f "${app_dir}/docker-compose.prod.yml" \
      -f "${smoke_override}" \
      down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

chmod 700 "${tmp_dir}"
cat >"${tmp_dir}/compose.env" <<'EOF'
POSTGRES_PASSWORD=TestPostgresPassword_1234567890
DATABASE_URL=postgresql://postgres:test@db:5432/workflow
SPRING_DATASOURCE_PASSWORD=TestPostgresPassword_1234567890
JWT_SECRET=TestJwtSecret_12345678901234567890
RAG_INTERNAL_API_KEY=TestRagKey_123456789012345678901
GOOGLE_CLIENT_ID=test-client-id
GOOGLE_CLIENT_SECRET=TestGoogleSecret_1234567890123456
HUGGINGFACEHUB_API_TOKEN=TestHuggingFaceToken_1234567890123
REDIS_ADMIN_PASSWORD=AdminPassword_123456789012345678
REDIS_SPRING_PASSWORD=SpringPassword_12345678901234567
REDIS_FASTAPI_PASSWORD=FastApiPassword_1234567890123456
EOF
chmod 600 "${tmp_dir}/compose.env"
cat >"${smoke_override}" <<EOF
services:
  redis:
    container_name: ${project_name}-redis
EOF
chmod 600 "${smoke_override}"

rendered_config="${tmp_dir}/compose.json"
docker compose \
  --env-file "${tmp_dir}/compose.env" \
  -f "${app_dir}/docker-compose.yml" \
  -f "${app_dir}/docker-compose.prod.yml" \
  config --format json >"${rendered_config}"
chmod 600 "${rendered_config}"

python3 - "${rendered_config}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    config = json.load(stream)

services = config["services"]
redis = services["redis"]
spring = services["backend-spring"]
fastapi = services["backend-fastapi"]

assert not redis.get("ports"), "production Redis must not publish a host port"
assert any(
    volume.get("source") == "redis-data" and volume.get("target") == "/data"
    for volume in redis.get("volumes", [])
), "Redis must mount the redis-data named volume at /data"

command = " ".join(redis.get("command", []))
for expected in ("--appendonly yes", "--appendfsync everysec", "--maxmemory-policy noeviction"):
    assert expected in command, f"Redis command is missing {expected}"

redis_env = redis["environment"]
assert redis_env["REDIS_ADMIN_PASSWORD"] == "AdminPassword_123456789012345678"
assert redis_env["REDIS_SPRING_PASSWORD"] == "SpringPassword_12345678901234567"
assert redis_env["REDIS_FASTAPI_PASSWORD"] == "FastApiPassword_1234567890123456"

spring_env = spring["environment"]
assert spring_env["REDIS_USERNAME"] == "spring"
assert spring_env["REDIS_PASSWORD"] == redis_env["REDIS_SPRING_PASSWORD"]
assert spring.get("stop_grace_period") in ("60s", "1m0s")

fastapi_env = fastapi["environment"]
assert fastapi_env["REDIS_USERNAME"] == "fastapi"
assert fastapi_env["REDIS_PASSWORD"] == redis_env["REDIS_FASTAPI_PASSWORD"]

healthcheck = " ".join(redis["healthcheck"]["test"])
assert "REDISCLI_AUTH" in healthcheck
assert "--user admin" in healthcheck
assert "--pass" not in healthcheck
PY

for variable in REDIS_ADMIN_PASSWORD REDIS_SPRING_PASSWORD REDIS_FASTAPI_PASSWORD; do
  grep -Eq "${variable}: *\\$\\{${variable}:\\?" "${app_dir}/docker-compose.prod.yml"
  grep -q "^${variable}=$" "${app_dir}/.env.example"
done

grep -q 'user default off' "${app_dir}/redis/users.acl.template"
grep -Fq 'user admin on >__ADMIN_PASSWORD__ ~* &* +@all' "${app_dir}/redis/users.acl.template"
grep -Fq 'user spring on >__SPRING_PASSWORD__ resetkeys ~meeting-analysis* -@all +ping +hello +client|setinfo +client|setname +select +xadd +xgroup +xreadgroup +xack +xdel +eval +evalsha' \
  "${app_dir}/redis/users.acl.template"
grep -Fq 'user fastapi on >__FASTAPI_PASSWORD__ resetkeys ~meeting_analysis:* ~rag_answer:* -@all +ping +hello +client|setinfo +client|setname +select +get +set +del' \
  "${app_dir}/redis/users.acl.template"
if grep -Eq '(^|[[:space:]])\+client([[:space:]]|$)' "${app_dir}/redis/users.acl.template"; then
  printf '%s\n' "Redis service users must not receive all CLIENT subcommands" >&2
  exit 1
fi
grep -q 'chmod 600' "${app_dir}/redis/redis-entrypoint.sh"
grep -Eq '영문 대소문자.*숫자.*_.*-' "${app_dir}/.env.example"

workflow="${repo_root}/.github/workflows/deploy-oci.yml"
runbook="${app_dir}/DEPLOY_OCI.md"
troubleshooting="${repo_root}/docs/trouble-shooting/2026-07-23-redis-queue-oci.md"

assert_contains() {
  file="$1"
  expected="$2"
  description="$3"
  if ! grep -Fq "${expected}" "${file}"; then
    printf 'missing %s in %s\n' "${description}" "${file}" >&2
    exit 1
  fi
}

assert_contains "${workflow}" 'config --quiet' "safe Compose credential gate"
assert_contains "${workflow}" 'REDISCLI_AUTH=' "authenticated Redis command"
assert_contains "${workflow}" 'redis-cli --raw --user admin ping' "authenticated Redis PING"
assert_contains "${workflow}" 'http://127.0.0.1:8000/api/v1/health' "local FastAPI health check"
assert_contains "${workflow}" 'http://127.0.0.1:8080/api/v1/health' "local Spring readiness check"
assert_contains "${workflow}" 'XINFO GROUPS meeting-analysis' "meeting-analysis group readiness check"
assert_contains "${workflow}" 'meeting-analysis-workers' "expected queue consumer group"
assert_contains "${workflow}" 'https://${{ secrets.OCI_DOMAIN }}/api/v1/health' "public Spring health check"
assert_contains "${workflow}" 'XLEN meeting-analysis' "rollback queue length metric"
assert_contains "${workflow}" 'XPENDING meeting-analysis meeting-analysis-workers' "rollback pending metric"
assert_contains "${workflow}" '이전 코드는 Redis Stream을 drain할 수 없습니다' "rollback queue warning"
config_line=$(grep -nF 'config --quiet' "${workflow}" | head -n 1 | cut -d: -f1)
up_line=$(grep -nF 'docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build' \
  "${workflow}" | head -n 1 | cut -d: -f1)
readiness_loop_line=$(grep -nF 'for attempt in $(seq 1 30)' "${workflow}" | head -n 1 | cut -d: -f1)
readiness_end_line=$(grep -nF 'if [ "$internal_ready" -ne 1 ]' "${workflow}" | head -n 1 | cut -d: -f1)
rollback_length_line=$(grep -nF 'queue_length=$(docker exec workflow-redis' "${workflow}" | cut -d: -f1)
rollback_pending_line=$(grep -nF 'queue_pending=$(docker exec workflow-redis' "${workflow}" | cut -d: -f1)
rollback_reset_line=$(grep -nF 'git reset --hard deploy-previous' "${workflow}" | cut -d: -f1)
test "${config_line}" -lt "${up_line}"
for readiness_command in 'redis-cli --raw --user admin ping' \
  'http://127.0.0.1:8000/api/v1/health' 'http://127.0.0.1:8080/api/v1/health' \
  'XINFO GROUPS meeting-analysis'; do
  command_line=$(grep -nF "${readiness_command}" "${workflow}" | head -n 1 | cut -d: -f1)
  test "${command_line}" -gt "${readiness_loop_line}"
  test "${command_line}" -lt "${readiness_end_line}"
done
test "${rollback_length_line}" -lt "${rollback_pending_line}"
test "${rollback_pending_line}" -lt "${rollback_reset_line}"
if grep -Eq '(^|[[:space:]])(source[[:space:]]+|\.[[:space:]]+\.\/\.env|set[[:space:]]+-a)' "${workflow}"; then
  printf '%s\n' "deploy workflow must not execute Compose dotenv as shell code" >&2
  exit 1
fi
if grep -Eq '(^|[[:space:]])set[[:space:]]+-x([[:space:]]|$)' "${workflow}"; then
  printf '%s\n' "deploy workflow must never enable shell tracing" >&2
  exit 1
fi

for port in 5432 6379 9092 8000 8080; do
  assert_contains "${runbook}" "${port}" "external closure check for port ${port}"
done
for credential in HF_TOKEN HUGGINGFACEHUB_API_TOKEN LANGSMITH_API_KEY GOOGLE_CLIENT_SECRET \
  RAG_INTERNAL_API_KEY POSTGRES_PASSWORD SPRING_DATASOURCE_PASSWORD DATABASE_URL; do
  assert_contains "${runbook}" "${credential}" "mandatory credential rotation for ${credential}"
done
for scenario in 'default_denied=' 'spring_denied=' 'fastapi_denied=' 'pending_after=' \
  'test "$pending_after" = 0' 'before_length=' 'after_length=' \
  'test "$after_length" = "$before_length"' 'test "$after_pending" = "$before_pending"' \
  'stop backend-spring' 'spring_ready=0' 'redis_ready=0'; do
  assert_contains "${runbook}" "${scenario}" "executable OCI verification ${scenario}"
done
if grep -Eq '^(HF_TOKEN|HUGGINGFACEHUB_API_TOKEN|LANGSMITH_API_KEY|GOOGLE_CLIENT_SECRET|RAG_INTERNAL_API_KEY|POSTGRES_PASSWORD|SPRING_DATASOURCE_PASSWORD)=[^<[:space:]]' "${runbook}"; then
  printf '%s\n' "runbook must not contain credential values" >&2
  exit 1
fi
for scenario in "appendonly" "ACL" "pending 복구" "force-recreate redis" "FAILED" \
  "meeting_analysis:" "rag_answer:" "payload" "로그"; do
  assert_contains "${runbook}" "${scenario}" "OCI Redis verification scenario ${scenario}"
done

assert_contains "${troubleshooting}" 'REDISCLI_AUTH=' "secret-safe Redis authentication"
assert_contains "${troubleshooting}" 'XLEN meeting-analysis' "queue length diagnosis"
assert_contains "${troubleshooting}" 'XPENDING meeting-analysis meeting-analysis-workers' "pending diagnosis"
assert_contains "${troubleshooting}" 'XINFO GROUPS meeting-analysis' "consumer group diagnosis"
assert_contains "${troubleshooting}" '이전 코드는 Redis Stream을 drain할 수 없습니다' "rollback recovery caution"
if grep -Eq '(^|[[:space:]])set[[:space:]]+-x([[:space:]]|$)' "${troubleshooting}"; then
  printf '%s\n' "troubleshooting commands must never enable shell tracing" >&2
  exit 1
fi
if grep -Eq '(^|[[:space:]])(source[[:space:]]+|\.[[:space:]]+\.\/\.env|set[[:space:]]+-a)' "${troubleshooting}"; then
  printf '%s\n' "troubleshooting must not execute Compose dotenv as shell code" >&2
  exit 1
fi
assert_contains "${troubleshooting}" 'spring_ready=0' "bounded Spring recovery readiness"
assert_contains "${troubleshooting}" 'test "$spring_ready" = 1' "Spring recovery failure gate"

if [ "${RUN_REDIS_SMOKE:-auto}" != "0" ] \
  && docker info >/dev/null 2>&1 \
  && docker image inspect redis:7-alpine >/dev/null 2>&1; then
  smoke_started=1
  docker compose \
    --project-name "${project_name}" \
    --env-file "${tmp_dir}/compose.env" \
    -f "${app_dir}/docker-compose.yml" \
    -f "${app_dir}/docker-compose.prod.yml" \
    -f "${smoke_override}" \
    up -d redis >"${tmp_dir}/smoke.log" 2>&1

  for _ in $(seq 1 30); do
    if docker compose \
      --project-name "${project_name}" \
      --env-file "${tmp_dir}/compose.env" \
      -f "${app_dir}/docker-compose.yml" \
      -f "${app_dir}/docker-compose.prod.yml" \
      -f "${smoke_override}" \
      exec -T redis sh -c \
      'REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --user admin ping' \
      >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  docker compose \
    --project-name "${project_name}" \
    --env-file "${tmp_dir}/compose.env" \
    -f "${app_dir}/docker-compose.yml" \
    -f "${app_dir}/docker-compose.prod.yml" \
    -f "${smoke_override}" \
    exec -T redis sh -ec '
      admin() {
        REDISCLI_AUTH="$REDIS_ADMIN_PASSWORD" redis-cli --raw --user admin "$@"
      }
      spring() {
        REDISCLI_AUTH="$REDIS_SPRING_PASSWORD" redis-cli --raw --user spring "$@"
      }
      fastapi() {
        REDISCLI_AUTH="$REDIS_FASTAPI_PASSWORD" redis-cli --raw --user fastapi "$@"
      }

      [ "$(admin ping)" = "PONG" ]
      [ "$(stat -c %a /run/workflow-redis/users.acl)" = "600" ]
      [ "$(admin config get appendonly | tail -n 1)" = "yes" ]
      [ "$(admin config get appendfsync | tail -n 1)" = "everysec" ]
      [ "$(admin config get maxmemory-policy | tail -n 1)" = "noeviction" ]

      default_denied="$(redis-cli --raw ping 2>&1 || true)"
      case "$default_denied" in
        *NOAUTH*) ;;
        *) exit 1 ;;
      esac

      spring client setname workflow-queue-smoke >/dev/null
      redis_version="$(admin info server | sed -n "s/^redis_version:\\([0-9][0-9]*\\)\\.\\([0-9][0-9]*\\).*/\\1 \\2/p")"
      redis_major="${redis_version%% *}"
      redis_minor="${redis_version#* }"
      if [ "$redis_major" -gt 7 ] || { [ "$redis_major" -eq 7 ] && [ "$redis_minor" -ge 2 ]; }; then
        spring client setinfo lib-name workflow-queue-smoke >/dev/null
      fi

      stream=meeting-analysis:acl-smoke
      group=meeting-analysis-workers-smoke
      consumer=meeting-analysis-worker-smoke
      ack_script="
        if not redis.acl_check_cmd(\"XACK\", KEYS[1], ARGV[1], ARGV[2]) then
          return redis.error_reply(\"XACK permission denied\")
        end
        if not redis.acl_check_cmd(\"XDEL\", KEYS[1], ARGV[2]) then
          return redis.error_reply(\"XDEL permission denied\")
        end
        redis.call(\"XACK\", KEYS[1], ARGV[1], ARGV[2])
        return redis.call(\"XDEL\", KEYS[1], ARGV[2])
      "

      first_id="$(spring xadd "$stream" "*" payload fixture-one)"
      spring xgroup create "$stream" "$group" 0 >/dev/null
      spring xreadgroup group "$group" "$consumer" count 1 streams "$stream" ">" >/dev/null
      [ -n "$(admin xpending "$stream" "$group" - + 10)" ]
      [ "$(spring eval "$ack_script" 1 "$stream" "$group" "$first_id")" = "1" ]
      [ "$(admin xlen "$stream")" = "0" ]
      [ -z "$(admin xpending "$stream" "$group" - + 10)" ]

      second_id="$(spring xadd "$stream" "*" payload fixture-two)"
      spring xreadgroup group "$group" "$consumer" count 1 streams "$stream" ">" >/dev/null
      [ -n "$(admin xpending "$stream" "$group" - + 10)" ]
      script_sha="$(admin script load "$ack_script")"
      [ "$(spring evalsha "$script_sha" 1 "$stream" "$group" "$second_id")" = "1" ]
      [ "$(admin xlen "$stream")" = "0" ]
      [ -z "$(admin xpending "$stream" "$group" - + 10)" ]

      spring_denied="$(spring set meeting_analysis:forbidden fixture 2>&1 || true)"
      case "$spring_denied" in
        *NOPERM*) ;;
        *) exit 1 ;;
      esac
      [ "$(admin exists meeting_analysis:forbidden)" = "0" ]

      fastapi set meeting_analysis:acl-smoke fixture >/dev/null
      [ "$(fastapi get meeting_analysis:acl-smoke)" = "fixture" ]
      fastapi set rag_answer:acl-smoke fixture >/dev/null
      [ "$(fastapi get rag_answer:acl-smoke)" = "fixture" ]
      fastapi del meeting_analysis:acl-smoke rag_answer:acl-smoke >/dev/null

      fastapi_denied="$(fastapi xadd meeting-analysis:forbidden "*" payload fixture 2>&1 || true)"
      case "$fastapi_denied" in
        *NOPERM*) ;;
        *) exit 1 ;;
      esac
      [ "$(admin exists meeting-analysis:forbidden)" = "0" ]
    '
fi

printf '%s\n' "Redis Compose security checks passed"
