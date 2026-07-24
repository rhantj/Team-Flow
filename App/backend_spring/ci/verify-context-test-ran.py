#!/usr/bin/env python3
"""ApplicationContextLoadTest가 실제로 실행됐는지 확인한다.

이 테스트는 Docker가 없으면 조용히 건너뛴다(로컬 개발 편의). CI 게이트에서까지
건너뛰면 배선 오류를 잡는 방어선이 사라지므로, JUnit 리포트를 파싱해 실행 여부를
명시적으로 확인한다. 속성 순서나 공백에 의존하는 문자열 매칭 대신 XML로 파싱한다.
"""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SUITE = "com.workflowai.ApplicationContextLoadTest"
REPORT = Path("build/test-results/test") / f"TEST-{SUITE}.xml"


def fail(message: str) -> None:
    print(f"[FAIL] {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if not REPORT.is_file():
        fail(f"리포트가 없습니다: {REPORT} — 테스트가 아예 실행되지 않았습니다.")

    try:
        suite = ET.parse(REPORT).getroot()
    except ET.ParseError as error:
        fail(f"리포트를 파싱할 수 없습니다: {error}")

    def count(name: str) -> int:
        raw = suite.get(name)
        if raw is None:
            fail(f"리포트에 '{name}' 속성이 없습니다 — 리포트 형식이 바뀌었습니다.")
        try:
            return int(raw)
        except ValueError:
            fail(f"'{name}' 값이 정수가 아닙니다: {raw!r}")
        raise AssertionError("unreachable")

    tests, skipped = count("tests"), count("skipped")
    failures, errors = count("failures"), count("errors")

    # <skipped/> 자식 요소로도 교차 확인한다. 두 표현이 어긋나면 형식 변화로 보고 막는다.
    skipped_elements = len(suite.findall(".//skipped"))
    if skipped_elements != skipped:
        fail(f"skipped 속성({skipped})과 <skipped> 요소 수({skipped_elements})가 다릅니다.")

    if tests < 1:
        fail(f"실행된 테스트가 없습니다 (tests={tests}).")
    if skipped:
        fail(
            f"테스트가 건너뛰어졌습니다 (skipped={skipped}). "
            "CI 러너에 Docker가 없으면 Testcontainers가 비활성화됩니다."
        )
    if failures or errors:
        fail(f"테스트가 실패했습니다 (failures={failures}, errors={errors}).")

    print(f"[OK] {SUITE} 실행 확인 (tests={tests}, skipped=0)")


if __name__ == "__main__":
    main()
