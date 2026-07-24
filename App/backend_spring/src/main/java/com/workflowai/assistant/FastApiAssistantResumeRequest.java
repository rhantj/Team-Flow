package com.workflowai.assistant;

public record FastApiAssistantResumeRequest(
    String thread_id,
    String step_id,
    boolean ok,
    String error
) {}
