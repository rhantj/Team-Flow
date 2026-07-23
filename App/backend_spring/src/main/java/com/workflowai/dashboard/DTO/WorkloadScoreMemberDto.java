package com.workflowai.dashboard.DTO;

public record WorkloadScoreMemberDto(
    String assignee_id,
    Integer task_count_total,
    Double completion_rate,
    Double overload_score,
    Boolean is_anomaly,
    String anomaly_type,
    Double task_count_active_rel,
    Double difficulty_avg_rel,
    Integer overdue_count
) {}
