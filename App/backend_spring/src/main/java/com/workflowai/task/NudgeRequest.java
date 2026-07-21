package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "업무 알림(넛지) 요청")
public record NudgeRequest(
    @Schema(description = "알림 종류", example = "START", allowableValues = {"START", "PROGRESS", "URGENT"}) String kind
) {}
