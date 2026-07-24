package com.workflowai.assistant;

import java.util.List;

// Spring -> FastAPI 전송용. user_id/user_role은 인증 세션에서 채워진 값이다.
public record FastApiAssistantRequest(
    Long project_id,
    String question,
    Long user_id,
    String user_role,
    List<AssistantHistoryMessage> history
) {}
