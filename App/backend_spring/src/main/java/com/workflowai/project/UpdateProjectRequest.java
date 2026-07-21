package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

@Schema(description = "프로젝트 수정 요청 (전달된 필드만 갱신, 팀장만 가능)")
public record UpdateProjectRequest(
    String title,
    String type,
    String description,
    LocalDate startDate,
    LocalDate deadline,
    LocalDate midCheckDate,
    Integer memberLimit,
    List<String> deliverables,
    List<String> techStack,
    String goals
) {
}
