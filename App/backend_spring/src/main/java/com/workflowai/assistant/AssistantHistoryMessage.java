package com.workflowai.assistant;

// 후속 질문 재작성용 대화 한 줄. FastAPI RagHistoryMessage와 필드명 일치.
// 권한값(user_id/user_role)은 이 대화 기록에서 유도하지 않는다 - 참고자료일 뿐이다.
public record AssistantHistoryMessage(String role, String content) {}
