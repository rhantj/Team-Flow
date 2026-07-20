from __future__ import annotations

from app.main import AnalyzeRequest, analyze_meeting


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
