package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "초대 코드로 프로젝트 참여 요청")
public record JoinProjectRequest(
    @Schema(example = "AB12CD34") @NotBlank String code
) {
}
