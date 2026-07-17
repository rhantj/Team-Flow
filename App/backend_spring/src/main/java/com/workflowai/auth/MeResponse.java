package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "현재 로그인한 사용자 정보와 프로젝트별 역할 요약")
public record MeResponse(UserSummary user, List<ProjectRoleSummary> projectRoles) {
}
