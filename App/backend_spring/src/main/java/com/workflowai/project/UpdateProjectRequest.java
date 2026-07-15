package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

@Schema(description = "프로젝트 수정 요청 (전달된 필드만 갱신)")
public record UpdateProjectRequest(String title, String description, LocalDate deadline) {
}
