#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_DIR="$(cd "$APP_DIR/.." && pwd)"
MAVEN_BIN="$ROOT_DIR/.tools/apache-maven-3.9.9/bin/mvn"
rm -rf "$APP_DIR/backend_spring/target"

if [ -x "$MAVEN_BIN" ]; then
  exec "$MAVEN_BIN" -Dmaven.repo.local="$ROOT_DIR/.m2/repository" -f "$APP_DIR/backend_spring/pom.xml" spring-boot:run
else
  exec mvn -Dmaven.repo.local="$ROOT_DIR/.m2/repository" -f "$APP_DIR/backend_spring/pom.xml" spring-boot:run
fi
