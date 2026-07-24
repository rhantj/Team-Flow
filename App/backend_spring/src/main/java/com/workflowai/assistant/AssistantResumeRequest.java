package com.workflowai.assistant;

public record AssistantResumeRequest(
    Long project_id,
    String thread_id,
    String step_id,
    Boolean ok,
    String error
) {}
