package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

@Schema(description = "프로젝트 상세 정보")
public record ProjectResponse(Long id, String title, String type, LocalDate deadline, String description) {
}
