package com.workflowai.rag;

import java.util.List;

// React -> Spring -> FastAPI 전 구간에서 동일 스키마를 그대로 사용(FastAPI RagQueryRequest와 필드명 일치).
// user_id는 클라이언트 요청 바디가 아니라 RagController가 인증 세션(CurrentUser)에서 채워 넣는다.
// history는 후속 질문 재작성용 대화 기록. null이 들어올 수 있어 컨트롤러에서 빈 리스트로 정규화한다.
public record RagQueryRequest(Long project_id, String question, Long user_id, List<RagHistoryMessage> history) {}
