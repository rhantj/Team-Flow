package com.workflowai.contribution;

import java.util.List;

public record ContributionScoreResponseDto(
    String schema_version,
    Long project_id,
    List<ContributionMemberScoreDto> members,
    String note
) {}
