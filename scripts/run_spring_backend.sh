#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MAVEN_BIN="$ROOT_DIR/.tools/apache-maven-3.9.9/bin/mvn"
rm -rf "$ROOT_DIR/backend-spring/target"

if [ -x "$MAVEN_BIN" ]; then
  "$MAVEN_BIN" -Dmaven.repo.local="$ROOT_DIR/.m2/repository" -f "$ROOT_DIR/backend-spring/pom.xml" spring-boot:run
else
  mvn -Dmaven.repo.local="$ROOT_DIR/.m2/repository" -f "$ROOT_DIR/backend-spring/pom.xml" spring-boot:run
fi
