package com.workflowai.assistant;

import java.util.List;

// user_id/user_role은 클라이언트 값을 신뢰하지 않고 AssistantController가 인증 세션에서 채운다.
public record AssistantCommandRequest(
    Long project_id,
    String question,
    List<AssistantHistoryMessage> history
) {}
