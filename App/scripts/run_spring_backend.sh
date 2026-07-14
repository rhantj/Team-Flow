#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$APP_DIR/backend_spring/build"

cd "$APP_DIR/backend_spring"
exec ./gradlew --no-daemon --console=plain bootRun
