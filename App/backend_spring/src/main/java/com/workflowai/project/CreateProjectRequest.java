package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

@Schema(description = "프로젝트 생성 요청")
public record CreateProjectRequest(
    @NotBlank String title,
    String type,
    LocalDate deadline,
    String description
) {
}
