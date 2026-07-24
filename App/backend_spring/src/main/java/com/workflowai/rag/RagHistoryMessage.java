package com.workflowai.rag;

// 멀티턴 후속 질문 재작성을 위해 클라이언트가 보내는 직전 대화 한 줄. FastAPI RagHistoryMessage와
// 필드명 일치. 권한값(user_id 등)은 이 대화 기록에서 유도하지 않는다 - 참고자료일 뿐이다.
public record RagHistoryMessage(String role, String content) {}
