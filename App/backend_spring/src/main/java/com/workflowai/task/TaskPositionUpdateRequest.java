package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "업무 위치/상태 변경 요청 (칸반 드래그앤드롭용)")
public record TaskPositionUpdateRequest(
    @Schema(description = "변경할 상태", example = "inprogress", allowableValues = {"todo", "inprogress", "blocked", "done"}) String status,
    @Schema(description = "같은 status 안에서의 순서(오름차순). 앞뒤 카드 position의 중간값, 맨 끝이면 +1", example = "1.5") double position
) {}
