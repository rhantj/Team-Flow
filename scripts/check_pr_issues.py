#!/usr/bin/env python3
"""
PR의 문제 여부(머지 충돌 / 테스트·린트 실패 / Claude 위험 분석)를 종합 판단해
디스코드로 보낼 메시지를 만든다.

Claude 분석은 이 스크립트가 실행되는 머신에 설치된 Claude Code CLI(`claude`)를
우선 사용한다. 셀프호스티드 러너에 Claude Code가 로그인되어 있으면 별도
API 키 없이 그 로그인(구독)으로 분석이 실행된다. CLI가 없는 환경(예: 아직
셀프호스티드 러너를 설정하지 않은 경우)에서는 ANTHROPIC_API_KEY가 있으면
API를 대신 호출하고, 둘 다 없으면 이 항목만 건너뛴다.

표준 출력: "true" 또는 "false" (문제가 있는지 여부, 워크플로우가 이 값을 읽는다)
파일 출력: issue_message.md (문제가 있을 때 디스코드로 보낼 본문)

환경 변수:
    CONFLICT          : "true"/"false" - PR이 base와 머지 충돌 상태인지
    TESTS_RAN         : "true"/"false" - 테스트/린트를 실행했는지
    TESTS_FAILED      : "true"/"false" - 테스트/린트가 실패했는지
    TESTS_LOG_FILE    : 테스트 실패 로그 파일 경로 (선택)
    DIFF_FILE         : git diff 파일 경로
    ANTHROPIC_API_KEY : Claude CLI를 못 쓸 때의 대체 수단 (선택)
    PR_TITLE, PR_URL, PR_AUTHOR, BRANCH_NAME : 메시지 헤더용 메타데이터
"""

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request

MODEL = "claude-sonnet-5"
API_URL = "https://api.anthropic.com/v1/messages"
MAX_DIFF_CHARS = 100_000

SYSTEM_PROMPT = """당신은 시니어 코드 리뷰어입니다. 주어진 git diff를 보고
1) 버그/코드 품질 위험 2) 파괴적 변경(breaking change) 가능성을 판단하세요.

반드시 아래 JSON 형식으로만 답하세요. JSON 외 다른 텍스트는 절대 포함하지 마세요.

{"risk_level": "low" | "medium" | "high", "summary": "한국어 2~4문장 요약. 구체적 근거 포함, 문제가 없으면 '특이사항 없음'이라고만 작성"}
"""


def truncate(text: str) -> str:
    if len(text) <= MAX_DIFF_CHARS:
        return text
    return text[:MAX_DIFF_CHARS] + "\n... (생략) ..."


def parse_json_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # CLI가 JSON 앞뒤로 안내문을 덧붙이는 경우, 첫 { ... } 블록만 추출해 재시도
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def analyze_with_claude_cli(diff: str) -> dict:
    """셀프호스티드 러너에 설치된 Claude Code CLI로 분석한다 (API 키 불필요)."""
    prompt = f"{SYSTEM_PROMPT}\n\n다음 git diff를 분석하세요:\n```diff\n{truncate(diff)}\n```"

    result = subprocess.run(
        ["claude", "-p", prompt],
        stdin=subprocess.DEVNULL,  # CI에는 터미널이 없으므로 stdin 대기를 막는다
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()[:500]
        raise RuntimeError(f"claude CLI 실행 실패 (exit {result.returncode}): {detail}")

    return parse_json_response(result.stdout)


def analyze_with_claude_api(diff: str, api_key: str) -> dict:
    """CLI를 쓸 수 없을 때의 대체 수단: Anthropic API 직접 호출."""
    payload = {
        "model": MODEL,
        "max_tokens": 800,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": f"```diff\n{truncate(diff)}\n```"}],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8"))

    text = "".join(
        p.get("text", "") for p in body.get("content", []) if p.get("type") == "text"
    )
    return parse_json_response(text)


def analyze_risk(diff: str) -> dict:
    if shutil.which("claude"):
        try:
            return analyze_with_claude_cli(diff)
        except Exception as e:  # noqa: BLE001
            print(f"Claude CLI 분석 실패, API 방식으로 대체 시도: {e}")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        return analyze_with_claude_api(diff, api_key)

    raise RuntimeError(
        "claude CLI를 찾을 수 없고 ANTHROPIC_API_KEY도 설정되지 않아 "
        "위험 분석을 건너뜁니다."
    )


def env_bool(name: str) -> bool:
    return os.environ.get(name, "false").strip().lower() == "true"


def main() -> None:
    conflict = env_bool("CONFLICT")
    tests_ran = env_bool("TESTS_RAN")
    tests_failed = env_bool("TESTS_FAILED")

    risk_level = "unknown"
    risk_summary = "Claude 분석을 실행하지 않았습니다."

    diff_file = os.environ.get("DIFF_FILE")

    if diff_file and os.path.exists(diff_file):
        with open(diff_file, "r", errors="ignore") as f:
            diff = f.read()

        if diff.strip():
            try:
                result = analyze_risk(diff)
                risk_level = result.get("risk_level", "unknown")
                risk_summary = result.get("summary", "(요약 없음)")
            except Exception as e:  # noqa: BLE001
                risk_level = "unknown"
                risk_summary = f"Claude 분석 중 오류: {e}"
        else:
            risk_level = "low"
            risk_summary = "변경 사항이 없습니다."

    has_issue = conflict or tests_failed or risk_level in ("medium", "high")

    print("true" if has_issue else "false")

    if not has_issue:
        return

    pr_title = os.environ.get("PR_TITLE", "")
    pr_url = os.environ.get("PR_URL", "")
    pr_author = os.environ.get("PR_AUTHOR", "")
    branch_name = os.environ.get("BRANCH_NAME", "")

    # 개인정보 보호를 위해 디스코드에는 GitHub 아이디만 노출한다.
    # 실명/이메일은 PR 본문(GitHub, 저장소 협업자만 열람 가능)에만 남는다.
    author_line = f"브랜치: `{branch_name}` · 작성자: @{pr_author}"

    lines = [
        "🚨 **PR에서 확인이 필요한 항목이 발견되었습니다**",
        f"제목: {pr_title}",
        author_line,
        f"링크: {pr_url}",
        "",
    ]

    if conflict:
        lines.append("❌ **머지 충돌**: base 브랜치와 충돌 상태입니다. rebase/merge가 필요합니다.")

    if tests_ran and tests_failed:
        lines.append("❌ **테스트/린트 실패**: CI 단계에서 실패가 감지되었습니다.")
        log_file = os.environ.get("TESTS_LOG_FILE")
        if log_file and os.path.exists(log_file):
            with open(log_file, "r", errors="ignore") as f:
                log_tail = f.read()[-1500:]
            lines.append(f"```\n{log_tail}\n```")

    if risk_level in ("medium", "high"):
        emoji = "🔴" if risk_level == "high" else "🟡"
        lines.append(f"{emoji} **Claude 위험도 분석 ({risk_level})**: {risk_summary}")

    with open("issue_message.md", "w") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
