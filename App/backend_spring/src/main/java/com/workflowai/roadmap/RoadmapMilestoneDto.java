package com.workflowai.roadmap;

import java.util.List;

public record RoadmapMilestoneDto(
    String id,
    String title,
    String startDate,
    String dueDate,
    long taskCount,
    long doneCount,
    long progressPercent,
    List<RoadmapTaskDto> tasks
) {
}
