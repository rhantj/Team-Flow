from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from llm_rag_assistant.app.services.chat_service import _is_personal_intent, answer_question


@pytest.mark.asyncio
async def test_answer_question_returns_answer_with_sources() -> None:
    pool = object()
    rows = [
        {"source_type": "meeting", "source_id": 1, "content": "회의록 상세 내용" * 30, "similarity": 0.87},
    ]

    with (
        patch(
            "llm_rag_assistant.app.services.chat_service.embed_text",
            new=AsyncMock(return_value=[0.1, 0.2]),
        ),
        patch(
            "llm_rag_assistant.app.services.chat_service.search_similar_chunks",
            new=AsyncMock(return_value=rows),
        ) as mock_search,
        patch(
            "llm_rag_assistant.app.services.chat_service.generate_answer",
            new=AsyncMock(return_value="이것이 답변입니다"),
        ),
    ):
        result = await answer_question(pool, project_id=5, question="질문")

    mock_search.assert_awaited_once_with(pool, 5, [0.1, 0.2], top_k=5, assignee_id=None)
    assert result.answer == "이것이 답변입니다"
    assert len(result.sources) == 1
    assert result.sources[0].source_type == "meeting"
    assert result.sources[0].source_id == 1
    assert len(result.sources[0].content_snippet) <= 200
    assert result.sources[0].similarity == 0.87


@pytest.mark.asyncio
async def test_answer_question_handles_no_matching_chunks() -> None:
    pool = object()

    with (
        patch(
            "llm_rag_assistant.app.services.chat_service.embed_text",
            new=AsyncMock(return_value=[0.1]),
        ),
        patch(
            "llm_rag_assistant.app.services.chat_service.search_similar_chunks",
            new=AsyncMock(return_value=[]),
        ),
        patch(
            "llm_rag_assistant.app.services.chat_service.generate_answer",
            new=AsyncMock(return_value="근거 없음: 관련 자료를 찾지 못했습니다"),
        ),
    ):
        result = await answer_question(pool, project_id=5, question="관련 없는 질문")

    assert result.sources == []
    assert "근거 없음" in result.answer


@pytest.mark.asyncio
async def test_answer_question_filters_by_assignee_when_personal_intent_and_user_id_given() -> None:
    pool = object()
    rows = [{"source_type": "task", "source_id": 3, "content": "내 업무", "similarity": 0.9}]

    with (
        patch(
            "llm_rag_assistant.app.services.chat_service.embed_text",
            new=AsyncMock(return_value=[0.1]),
        ),
        patch(
            "llm_rag_assistant.app.services.chat_service.search_similar_chunks",
            new=AsyncMock(return_value=rows),
        ) as mock_search,
        patch(
            "llm_rag_assistant.app.services.chat_service.generate_answer",
            new=AsyncMock(return_value="답변"),
        ),
    ):
        await answer_question(pool, project_id=5, question="내가 담당한 업무 알려줘", user_id=42)

    mock_search.assert_awaited_once_with(pool, 5, [0.1], top_k=5, assignee_id=42)


@pytest.mark.asyncio
async def test_answer_question_does_not_filter_by_assignee_for_non_personal_question() -> None:
    pool = object()

    with (
        patch(
            "llm_rag_assistant.app.services.chat_service.embed_text",
            new=AsyncMock(return_value=[0.1]),
        ),
        patch(
            "llm_rag_assistant.app.services.chat_service.search_similar_chunks",
            new=AsyncMock(return_value=[]),
        ) as mock_search,
        patch(
            "llm_rag_assistant.app.services.chat_service.generate_answer",
            new=AsyncMock(return_value="답변"),
        ),
    ):
        await answer_question(pool, project_id=5, question="프로젝트 전체 업무 현황 알려줘", user_id=42)

    mock_search.assert_awaited_once_with(pool, 5, [0.1], top_k=5, assignee_id=None)


@pytest.mark.parametrize(
    "question",
    [
        "이 문제 알려줘",
        "이번 과제 진행 상황이 어때?",
        "안내 사항 정리해줘",
        "제안서 초안 만들어줘",
    ],
)
def test_is_personal_intent_does_not_false_positive_on_substring_matches(question: str) -> None:
    """'제 '가 '문제 '/'과제 '/'안내 '/'제안' 같은 무관한 단어의 부분 문자열로 들어있다고
    개인화 질문으로 오인하면 안 된다 (토큰 단위 정확 일치여야 함)."""
    assert _is_personal_intent(question) is False


@pytest.mark.parametrize(
    "question",
    ["내가 담당한 업무 알려줘", "제가 맡은 태스크 뭐야", "나의 할 일 정리해줘", "내 업무 목록 보여줘"],
)
def test_is_personal_intent_detects_standalone_personal_pronoun_tokens(question: str) -> None:
    assert _is_personal_intent(question) is True


@pytest.mark.parametrize(
    "question",
    [
        "내가? 무슨 업무 맡았지",
        "제가, 담당한 업무가 뭐예요",
        "나는 할 일이 뭐야?",
        "저는 뭘 해야 하나요~",
    ],
)
def test_is_personal_intent_handles_trailing_punctuation_and_topic_particle_forms(question: str) -> None:
    """'내가?'처럼 조사 뒤에 문장부호가 붙거나, '나는/저는'처럼 목록에 없던 흔한 표현도
    개인화 질문으로 인식해야 한다."""
    assert _is_personal_intent(question) is True


@pytest.mark.parametrize(
    "question",
    [
        "(내가 담당한 업무 뭐야",
        "제가: 뭐 해야 하죠",
        "저한테) 할당된 태스크 알려줘",
        '"내가" 맡은 업무가 뭔데',
    ],
)
def test_is_personal_intent_strips_wrapping_brackets_and_colons(question: str) -> None:
    """괄호로 둘러싸이거나 콜론이 붙은 조사 표현도 (기존엔 문장부호 스트립 대상이 아니었음)
    개인화 질문으로 인식해야 한다."""
    assert _is_personal_intent(question) is True


@pytest.mark.parametrize(
    "question",
    ["내업무 알려줘", "제업무 뭐야", "제담당 태스크 뭐지", "내할일 정리해줘", "내꺼 뭐 있어"],
)
def test_is_personal_intent_detects_compact_pronoun_task_compounds(question: str) -> None:
    """'내 업무'를 공백 없이 붙여 쓴 '내업무' 같은 압축형도 놓치지 않아야 한다."""
    assert _is_personal_intent(question) is True


@pytest.mark.parametrize(
    "question",
    ["내년 계획 알려줘", "내용 정리해줘", "제안서 검토해줘", "제출 기한이 언제야", "제목 정해줘"],
)
def test_is_personal_intent_compact_pattern_does_not_false_positive(question: str) -> None:
    """압축형 탐지가 '내년'/'내용'/'제안'/'제출'/'제목' 같은 무관한 단어까지 오탐하면 안 된다."""
    assert _is_personal_intent(question) is False


@pytest.mark.parametrize(
    "question",
    [
        "내가할일줘",
        "제가맡은거 뭐야",
        "todo 알려줘",
        "task 목록 보여줘",
    ],
)
def test_is_personal_intent_detects_particle_attached_compact_forms(question: str) -> None:
    assert _is_personal_intent(question) is True


@pytest.mark.parametrize(
    "question",
    [
        "내년 계획 알려줘",
        "내용 요약해줘",
        "제안서 검토해줘",
        "제출 기한이 언제야",
    ],
)
def test_is_personal_intent_particle_pattern_does_not_false_positive(question: str) -> None:
    assert _is_personal_intent(question) is False


@pytest.mark.parametrize(
    "question",
    [
        "일요일에 회의 있어?",
        "일단 확인해볼게",
        "제일 중요한 건 뭐야",
    ],
)
def test_is_personal_intent_il_suffix_does_not_false_positive(question: str) -> None:
    assert _is_personal_intent(question) is False


@pytest.mark.parametrize(
    "question",
    [
        "“내업무 확인해줘”",
        "“제할일 뭐야”",
        "“내담당 태스크 보여줄래”",
    ],
)
def test_is_personal_intent_detects_curly_quoted_compact_forms(question: str) -> None:
    """Korean-style curly double quotes (U+201C/U+201D) wrapping compact personal-intent
    forms should still be recognized as personal intent. Regression test for missing
    curly quote support in _COMPACT_PERSONAL_TASK_PATTERN leading boundary."""
    assert _is_personal_intent(question) is True
