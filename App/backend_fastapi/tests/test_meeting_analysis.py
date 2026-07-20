from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import (
    AnalyzeRequest,
    analyze_meeting,
    app,
    build_ollama_prompt,
    parse_ollama_analysis_response,
)


def test_extracts_assignee_candidate_from_meeting_text_instead_of_rotating_attendees():
    request = AnalyzeRequest(
        title="정기회의",
        meeting_date="2026-07-15",
        text="유소은은 API 문서를 정리한다. 김민준이 발표자료를 작성한다.",
        participants=["김민준", "이서연", "박지수", "최동혁"],
    )

    result = analyze_meeting(request)

    candidates = [todo.assignee_candidate for todo in result.todos]
    assert "유소은" in candidates
    assert "김민준" in candidates


def test_leaves_assignee_candidate_empty_when_no_name_is_written_in_text():
    request = AnalyzeRequest(
        title="정기회의",
        meeting_date="2026-07-15",
        text="발표자료 초안 작성 논의를 진행했다.",
        participants=["김민준", "이서연"],
    )

    result = analyze_meeting(request)

    assert result.todos
    assert result.todos[0].assignee_candidate == ""


CAPSTONE_KICKOFF_TRANSCRIPT = """고무서: 전체 범위와 1주차 개발 목표를 정리하겠습니다.
곽진아: 인증과 권한 구조는 제가 먼저 잡겠습니다. Google OAuth 로그인, JWT 발급, 프로젝트별 팀장/팀원/심사자 권한을 7월 12일까지 기본 구조로 구현하겠습니다.
박지수: 저는 회의록 AI 분석을 맡겠습니다. 우선 문서 업로드 기반으로 회의 요약, 결정사항, 위험요소, To-Do 후보를 JSON으로 추출하는 기능부터 만들겠습니다.
허영주: 업무 보드는 네 개 상태로 가면 될 것 같습니다. 회의록에서 생성된 To-Do가 팀장 승인 후 업무 보드에 들어오게 연결하겠습니다.
유소은: 대시보드는 완료율, 마감 임박 업무, 블로커, 팀원별 업무량을 보여주겠습니다. ML 지연 위험도는 처음에는 규칙 기반으로 만들겠습니다.
박상준: AI Assistant는 RAG 구조로 설계하겠습니다.
이은주: 심사자 화면에서는 개인별 기여도 리포트와 AI 평가 근거를 볼 수 있게 하겠습니다.
곽진아: API 명세는 공통 응답 형식을 맞춰야 합니다.
박지수: 회의록 분석 결과는 summary, decisions, todos, risks, keywords 형식으로 고정하겠습니다.
"""


def test_extracts_speaker_name_as_assignee_candidate_from_name_colon_utterance_transcript():
    request = AnalyzeRequest(
        title="캡스톤디자인 WorkFlow AI 착수 회의",
        meeting_date="2026-07-09",
        meeting_kind="캡스톤디자인",
        text=CAPSTONE_KICKOFF_TRANSCRIPT,
        participants=["김민준", "이서연", "박지수", "최동혁"],
    )

    result = analyze_meeting(request)

    candidates = [todo.assignee_candidate for todo in result.todos]
    for name in ["고무서", "곽진아", "박지수", "허영주", "유소은", "박상준", "이은주"]:
        assert name in candidates

    # 발언자별로 자기 발언에서 언급한 담당 업무만 후보로 잡혀야 한다 — 한 사람에게 몰리면 안 된다.
    assert candidates.count("박지수") < len(candidates)


def test_parse_ollama_analysis_response_builds_valid_result_from_json():
    request = AnalyzeRequest(
        title="정기회의",
        meeting_date="2026-07-15",
        text="박지수: 저는 회의록 AI 분석을 맡겠습니다.",
        participants=["박지수", "김민준"],
    )
    raw = json.dumps(
        {
            "summary": "회의록 AI 분석 담당을 정했다.",
            "decisions": ["회의록 AI 분석은 박지수가 담당한다."],
            "todos": [
                {
                    "title": "회의록 AI 분석 구현",
                    "description": "회의록 AI 분석 기능을 구현한다.",
                    "assignee_candidate": "박지수",
                    "due_date": "2026-07-20",
                    "priority": "HIGH",
                    "category": "AI",
                }
            ],
            "risks": ["일정이 촉박할 수 있다."],
            "keywords": ["회의록 AI", "분석"],
        },
        ensure_ascii=False,
    )

    result = parse_ollama_analysis_response(raw, request)

    assert result.summary == "회의록 AI 분석 담당을 정했다."
    assert result.todos[0].assignee_candidate == "박지수"
    assert result.todos[0].assignee_id is None
    assert result.todos[0].needs_leader_review is True
    assert result.todos[0].category == "AI"


def test_parse_ollama_analysis_response_handles_markdown_code_fence():
    request = AnalyzeRequest(title="정기회의", meeting_date="2026-07-15", text="내용", participants=[])
    raw = (
        "```json\n"
        + json.dumps({"summary": "요약", "decisions": [], "todos": [], "risks": [], "keywords": []})
        + "\n```"
    )

    result = parse_ollama_analysis_response(raw, request)

    assert result.summary == "요약"


def test_parse_ollama_analysis_response_rejects_hallucinated_assignee_name():
    """회의록 원문에 등장하지 않는 이름을 모델이 지어내더라도 담당자로 채택하지 않는다."""
    request = AnalyzeRequest(
        title="정기회의",
        meeting_date="2026-07-15",
        text="발표자료 초안 작성 논의를 진행했다.",
        participants=["김민준", "이서연"],
    )
    raw = json.dumps(
        {
            "summary": "발표자료 작성 논의",
            "decisions": [],
            "todos": [
                {
                    "title": "발표자료 작성",
                    "description": "발표자료 초안을 작성한다.",
                    "assignee_candidate": "최동혁",
                    "priority": "MEDIUM",
                    "category": "PRESENTATION",
                }
            ],
            "risks": [],
            "keywords": [],
        },
        ensure_ascii=False,
    )

    result = parse_ollama_analysis_response(raw, request)

    assert result.todos[0].assignee_candidate == ""


def test_parse_ollama_analysis_response_normalizes_invalid_priority_and_category():
    request = AnalyzeRequest(title="정기회의", meeting_date="2026-07-15", text="내용", participants=[])
    raw = json.dumps(
        {
            "summary": "요약",
            "decisions": [],
            "todos": [
                {
                    "title": "업무",
                    "description": "설명",
                    "assignee_candidate": "",
                    "priority": "URGENT",
                    "category": "UNKNOWN",
                }
            ],
            "risks": [],
            "keywords": [],
        }
    )

    result = parse_ollama_analysis_response(raw, request)

    assert result.todos[0].priority == "MEDIUM"
    assert result.todos[0].category == "ETC"


def test_parse_ollama_analysis_response_invalid_json_raises():
    request = AnalyzeRequest(title="정기회의", meeting_date="2026-07-15", text="내용", participants=[])
    with pytest.raises(json.JSONDecodeError):
        parse_ollama_analysis_response("이건 JSON이 아닙니다", request)


def test_build_ollama_prompt_includes_assignee_rules_and_participants():
    request = AnalyzeRequest(
        title="정기회의",
        meeting_date="2026-07-15",
        text="박지수: 저는 회의록 AI 분석을 맡겠습니다.",
        participants=["박지수", "김민준"],
    )

    prompt = build_ollama_prompt(request)

    assert "박지수" in prompt and "김민준" in prompt
    assert "빈 문자열" in prompt
    assert "임의 배정" in prompt
    assert "몰아서 배정" in prompt


def test_analyze_json_falls_back_to_rule_based_when_ollama_fails(monkeypatch):
    monkeypatch.setenv("MEETING_ANALYSIS_PROVIDER", "ollama")
    client = TestClient(app)
    with patch("app.main.analyze_meeting_with_ollama", side_effect=RuntimeError("ollama down")):
        response = client.post(
            "/api/v1/meetings/analyze-json",
            json={
                "title": "정기회의",
                "meeting_date": "2026-07-15",
                "text": "발표자료 초안 작성 논의를 진행했다.",
                "participants": ["김민준"],
            },
        )

    assert response.status_code == 200
    assert response.json()["summary"]


def test_analyze_json_uses_rule_based_only_when_provider_is_rule(monkeypatch):
    monkeypatch.setenv("MEETING_ANALYSIS_PROVIDER", "rule")
    client = TestClient(app)
    with patch("app.main.analyze_meeting_with_ollama") as mock_ollama:
        response = client.post(
            "/api/v1/meetings/analyze-json",
            json={
                "title": "정기회의",
                "meeting_date": "2026-07-15",
                "text": "발표자료 초안 작성 논의를 진행했다.",
                "participants": ["김민준"],
            },
        )

    assert response.status_code == 200
    mock_ollama.assert_not_called()


def test_analyze_json_uses_ollama_result_when_available(monkeypatch):
    monkeypatch.setenv("MEETING_ANALYSIS_PROVIDER", "ollama")
    fake_result = analyze_meeting(
        AnalyzeRequest(title="정기회의", meeting_date="2026-07-15", text="내용", participants=["김민준"])
    )
    client = TestClient(app)
    with patch("app.main.analyze_meeting_with_ollama", return_value=fake_result) as mock_ollama:
        response = client.post(
            "/api/v1/meetings/analyze-json",
            json={"title": "정기회의", "meeting_date": "2026-07-15", "text": "내용", "participants": ["김민준"]},
        )

    assert response.status_code == 200
    mock_ollama.assert_called_once()


def test_ollama_response_does_not_pile_all_todos_on_one_person():
    """캡스톤 착수 회의 시나리오: Ollama가 각 발언자의 담당 발언만 assignee_candidate로 채택하고,
    박지수에게 모든 업무가 몰리지 않아야 한다. 담당자 불명확 업무는 미배정이어야 한다."""
    request = AnalyzeRequest(
        title="캡스톤디자인 WorkFlow AI 착수 회의",
        meeting_date="2026-07-09",
        text=CAPSTONE_KICKOFF_TRANSCRIPT,
        participants=["김민준", "이서연", "박지수", "최동혁"],
    )
    raw = json.dumps(
        {
            "summary": "각 파트 담당자와 착수 목표를 정리했다.",
            "decisions": ["회의록 분석 결과는 summary, decisions, todos, risks, keywords 형식으로 고정한다."],
            "todos": [
                {
                    "title": "인증/권한 구조",
                    "description": "인증과 권한 구조를 잡는다.",
                    "assignee_candidate": "곽진아",
                    "priority": "HIGH",
                    "category": "BACKEND",
                },
                {
                    "title": "회의록 AI 분석",
                    "description": "회의록 AI 분석을 맡는다.",
                    "assignee_candidate": "박지수",
                    "priority": "HIGH",
                    "category": "AI",
                },
                {
                    "title": "업무 보드 상태",
                    "description": "업무 보드는 네 개 상태로 구성한다.",
                    "assignee_candidate": "허영주",
                    "priority": "MEDIUM",
                    "category": "FRONTEND",
                },
                {
                    "title": "대시보드 지표",
                    "description": "완료율과 마감 임박 업무를 보여준다.",
                    "assignee_candidate": "유소은",
                    "priority": "MEDIUM",
                    "category": "FRONTEND",
                },
                {
                    "title": "AI Assistant RAG 설계",
                    "description": "AI Assistant는 RAG 구조로 설계한다.",
                    "assignee_candidate": "박상준",
                    "priority": "MEDIUM",
                    "category": "AI",
                },
                {
                    "title": "심사자 기여도 리포트",
                    "description": "심사자 화면에서 개인별 기여도 리포트를 보여준다.",
                    "assignee_candidate": "이은주",
                    "priority": "MEDIUM",
                    "category": "FRONTEND",
                },
                {
                    "title": "API 명세 정리",
                    "description": "API 명세는 공통 응답 형식을 맞춰야 한다.",
                    "assignee_candidate": "",
                    "priority": "LOW",
                    "category": "BACKEND",
                },
            ],
            "risks": [],
            "keywords": ["캡스톤", "회의록 AI"],
        },
        ensure_ascii=False,
    )

    result = parse_ollama_analysis_response(raw, request)

    candidates = [todo.assignee_candidate for todo in result.todos]
    assert candidates.count("박지수") == 1
    assert candidates.count("박지수") < len(candidates)
    assert "" in candidates  # 담당자 불명확 업무는 미배정으로 남는다
    expected_names = {"곽진아", "박지수", "허영주", "유소은", "박상준", "이은주"}
    assert expected_names.issubset(set(candidates))
    for todo in result.todos:
        assert todo.assignee_id is None
        assert todo.needs_leader_review is True
