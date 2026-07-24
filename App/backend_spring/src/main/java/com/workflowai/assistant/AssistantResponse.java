package com.workflowai.assistant;

import java.util.List;
import java.util.Map;

// FastAPI 응답을 그대로 통과시킨다(snake_case 유지).
public record AssistantResponse(
    String type,
    String message,
    List<Map<String, Object>> sources,
    String thread_id,
    Map<String, Object> card
) {}
