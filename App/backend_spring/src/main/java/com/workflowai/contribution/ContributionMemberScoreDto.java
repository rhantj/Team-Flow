package com.workflowai.contribution;

public record ContributionMemberScoreDto(
    String assignee_id,
    Double workload_component,
    Double task_component,
    Double meeting_component,
    Double contribution_score
) {}
