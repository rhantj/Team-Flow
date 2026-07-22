package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;

public record SignupResponse(
    @Schema(description = "ACTIVE(즉시 로그인) 또는 PENDING_REVIEWER_APPROVAL(심사자 승인 대기)", example = "ACTIVE") String status,
    @Schema(description = "status가 ACTIVE일 때만 채워짐. PENDING_REVIEWER_APPROVAL이면 null.") AuthTokenResponse tokens
) {
    public static SignupResponse active(AuthTokenResponse tokens) {
        return new SignupResponse("ACTIVE", tokens);
    }

    public static SignupResponse pendingReviewerApproval() {
        return new SignupResponse("PENDING_REVIEWER_APPROVAL", null);
    }
}
