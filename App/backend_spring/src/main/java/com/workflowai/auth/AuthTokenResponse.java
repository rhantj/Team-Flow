package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "JWT 발급 응답")
public record AuthTokenResponse(
    String accessToken,
    String refreshToken,
    long expiresIn,
    UserSummary user,
    @Schema(description = "중간보고/시연용 테스트 로그인 세션 ID. 실제 계정/Google 로그인에서는 null.") String testSessionId
) {
    public AuthTokenResponse(String accessToken, String refreshToken, long expiresIn, UserSummary user) {
        this(accessToken, refreshToken, expiresIn, user, null);
    }
}
