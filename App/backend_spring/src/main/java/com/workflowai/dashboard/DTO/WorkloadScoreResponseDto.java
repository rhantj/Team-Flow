package com.workflowai.dashboard.DTO;

import java.util.List;

public record WorkloadScoreResponseDto(
    String schema_version,
    Long project_id,
    String source,
    String method,
    List<WorkloadScoreMemberDto> members,
    String note,
    Double team_mean_completion
) {}
