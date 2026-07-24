package com.workflowai.roadmap;

import java.util.List;

public record RoadmapResponse(
    RoadmapProjectDto project,
    List<RoadmapMilestoneDto> milestones,
    List<RoadmapTaskDto> unassignedTasks
) {
}
