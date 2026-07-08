#!/usr/bin/env python3
"""
PR 점검에서 문제가 발견됐을 때, Jira 프로젝트(WF)에 이슈를 등록한다.

같은 PR에 push가 반복돼도 이슈가 중복 생성되지 않도록, PR 번호 라벨
(auto-pr-PR-<번호>)로 열린 이슈를 먼저 찾아 있으면 코멘트만 남기고,
없으면 새 이슈를 생성한다.

입력:
    issue_message.md : PR 점검 결과 본문 (check_pr_issues.py가 생성)

환경 변수:
    JIRA_BASE_URL     : 예) https://your-team.atlassian.net
    JIRA_EMAIL        : Jira 계정 이메일
    JIRA_API_TOKEN    : Jira API 토큰
    JIRA_PROJECT      : 대상 프로젝트 이름 또는 키 (기본 work-flow)
    JIRA_ISSUE_TYPE   : 이슈 유형 (기본 Task)
    PR_NUMBER, PR_TITLE, PR_URL, BRANCH_NAME : 이슈 메타데이터
"""

# 어노테이션 지연 평가: dict | None 문법을 Python 3.7+에서도 안전하게 사용
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def api_request(base_url: str, path: str, auth: str, method: str = "GET", payload: dict | None = None) -> dict:
    url = f"{base_url.rstrip('/')}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


def resolve_project_key(base_url: str, auth: str, project: str) -> str:
    """프로젝트 이름 또는 키를 받아 실제 프로젝트 키를 반환한다.

    Jira 이슈 생성/JQL은 키(대문자, 하이픈 불가)를 쓰므로, 사용자가 이름
    (예: work-flow)을 넘겨도 project search로 키를 찾아준다.
    """
    path = f"/rest/api/3/project/search?query={urllib.parse.quote(project)}&maxResults=50"
    result = api_request(base_url, path, auth)
    for p in result.get("values", []):
        if project.lower() in (p.get("name", "").lower(), p.get("key", "").lower()):
            return p["key"]
    # 이름/키가 정확히 일치하는 프로젝트가 없으면, 엉뚱한 프로젝트에
    # 이슈가 생성되지 않도록 추정하지 않고 명확히 실패시킨다.
    candidates = ", ".join(f'{p.get("name")}({p.get("key")})' for p in result.get("values", []))
    raise ValueError(
        f"'{project}'와 일치하는 Jira 프로젝트를 찾지 못했습니다. 검색 결과: [{candidates or '없음'}]"
    )


def adf_doc(intro: str, body_text: str) -> dict:
    """Jira Cloud API v3용 ADF(Atlassian Document Format) 문서 생성."""
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": intro}]},
            {"type": "codeBlock", "content": [{"type": "text", "text": body_text}]},
        ],
    }


def main() -> None:
    base_url = env("JIRA_BASE_URL")
    email = env("JIRA_EMAIL")
    token = env("JIRA_API_TOKEN")

    # 시크릿에 스킴이 빠져 있어도 동작하도록 https:// 보정
    if base_url and not base_url.startswith(("http://", "https://")):
        base_url = f"https://{base_url}"
    project = env("JIRA_PROJECT", "work-flow")
    issue_type = env("JIRA_ISSUE_TYPE", "Task")

    if not (base_url and email and token):
        print("JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN 시크릿이 없어 Jira 등록을 건너뜁니다.")
        return

    if not os.path.exists("issue_message.md"):
        print("issue_message.md가 없어 Jira 등록을 건너뜁니다.")
        return

    with open("issue_message.md", "r", errors="ignore") as f:
        message = f.read().strip()

    pr_number = env("PR_NUMBER")
    pr_title = env("PR_TITLE")
    pr_url = env("PR_URL")
    branch = env("BRANCH_NAME")

    auth = base64.b64encode(f"{email}:{token}".encode("utf-8")).decode("ascii")

    try:
        project_key = resolve_project_key(base_url, auth, project)
    except urllib.error.HTTPError as e:
        print(f"프로젝트 조회 실패, 입력값을 키로 사용: {e.code}")
        project_key = project

    label = f"auto-pr-PR-{pr_number}"

    # 1) 라벨로 아직 완료되지 않은 기존 이슈 검색
    jql = f'project = "{project_key}" AND labels = "{label}" AND statusCategory != Done'
    search_path = f"/rest/api/3/search/jql?jql={urllib.parse.quote(jql)}&fields=key&maxResults=1"
    try:
        found = api_request(base_url, search_path, auth)
        existing = (found.get("issues") or [None])[0]
    except urllib.error.HTTPError as e:
        print(f"Jira 검색 실패: {e.code} {e.read().decode('utf-8', 'ignore')[:300]}")
        existing = None

    body_text = f"{message}\n\n관련 PR: {pr_url}\n브랜치: {branch}"

    if existing:
        key = existing["key"]
        print(f"기존 Jira 이슈 {key} 에 코멘트 추가")
        comment = {"body": adf_doc("최신 push에서도 PR 점검 필요 항목이 감지되었습니다.", body_text)}
        api_request(base_url, f"/rest/api/3/issue/{key}/comment", auth, "POST", comment)
        return

    summary = f"[PR #{pr_number}] {pr_title}"[:255]
    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": summary,
            "issuetype": {"name": issue_type},
            "labels": [label, "auto-pr"],
            "description": adf_doc("PR 점검에서 확인이 필요한 항목이 발견되어 자동 등록된 이슈입니다.", body_text),
        }
    }
    try:
        created = api_request(base_url, "/rest/api/3/issue", auth, "POST", payload)
        print(f"Jira 이슈 생성: {created.get('key')}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:500]
        print(f"Jira 이슈 생성 실패: {e.code} {detail}")
        sys.exit(1)


if __name__ == "__main__":
    main()
