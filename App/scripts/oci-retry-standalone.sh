#!/usr/bin/env bash
# OCI Always Free 인스턴스 생성 자동 재시도 스크립트 (독립 실행용)
#
# 사용법:
#   1. 이 컴퓨터에 OCI CLI 설치: pip install oci-cli
#   2. ~/.oci/config 와 API 개인키 파일을 준비 (아래 CONFIG 값들 채우기)
#   3. bash oci-retry-standalone.sh
#
# GitHub Actions 없이, 이 스크립트를 돌리는 컴퓨터가 켜져있는 동안 계속 재시도합니다.

set -uo pipefail

export SUPPRESS_LABEL_WARNING=True

# ===== 여기 채우기 (또는 실행 전에 환경변수로 넘기기) =====
COMPARTMENT_ID="${COMPARTMENT_ID:-ocid1.tenancy.oc1..여기에_테넌시_OCID}"
SUBNET_ID="${SUBNET_ID:-ocid1.subnet.oc1.ap-tokyo-1.여기에_서브넷_OCID}"
SSH_PUBLIC_KEY_FILE="${SSH_PUBLIC_KEY_FILE:-$HOME/.ssh/oci_workflow_key.pub}"   # 접속용 공개키 파일 경로
# ========================

INSTANCE_DISPLAY_NAME="workflow-ai-oci"
SHAPE="VM.Standard.A1.Flex"
OCPUS=4
MEMORY_GBS=24
RETRY_INTERVAL_SECONDS="${RETRY_INTERVAL_SECONDS:-30}"   # 기본 30초, 환경변수로 덮어쓰기 가능

echo "OCI Always Free 인스턴스 자동 재시도 시작 (${RETRY_INTERVAL_SECONDS}초 간격, Ctrl+C로 중단)"

while true; do
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

  EXISTING=$(oci compute instance list \
    --compartment-id "$COMPARTMENT_ID" \
    --display-name "$INSTANCE_DISPLAY_NAME" \
    --lifecycle-state RUNNING \
    --query 'data[0].id' --raw-output 2>/dev/null || true)

  if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ]; then
    echo "[$TIMESTAMP] 이미 인스턴스가 실행 중입니다: $EXISTING"
    echo "완료! 스크립트를 종료합니다."
    break
  fi

  AD=$(oci iam availability-domain list \
    --compartment-id "$COMPARTMENT_ID" \
    --query 'data[0].name' --raw-output 2>/dev/null)

  IMAGE_ID=$(oci compute image list \
    --compartment-id "$COMPARTMENT_ID" \
    --operating-system "Canonical Ubuntu" \
    --operating-system-version "24.04" \
    --shape "$SHAPE" \
    --sort-by TIMECREATED --sort-order DESC \
    --query 'data[0].id' --raw-output 2>/dev/null)

  OUT=$(oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$AD" \
    --shape "$SHAPE" \
    --shape-config "{\"ocpus\": $OCPUS, \"memoryInGBs\": $MEMORY_GBS}" \
    --subnet-id "$SUBNET_ID" \
    --image-id "$IMAGE_ID" \
    --assign-public-ip true \
    --display-name "$INSTANCE_DISPLAY_NAME" \
    --ssh-authorized-keys-file "$SSH_PUBLIC_KEY_FILE" \
    --wait-for-state RUNNING --max-wait-seconds 120 2>&1)
  CODE=$?

  if [ $CODE -eq 0 ]; then
    echo "[$TIMESTAMP] 성공! 인스턴스가 생성되었습니다."
    echo "$OUT"
    break
  fi

  if echo "$OUT" | grep -qi "Out of host capacity\|Out of capacity"; then
    echo "[$TIMESTAMP] 아직 용량 부족. ${RETRY_INTERVAL_SECONDS}초 후 재시도합니다."
  else
    echo "[$TIMESTAMP] 예상 못한 에러:"
    echo "$OUT"
    echo "${RETRY_INTERVAL_SECONDS}초 후 다시 시도합니다."
  fi

  sleep "$RETRY_INTERVAL_SECONDS"
done
