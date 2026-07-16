package com.workflowai.auth;

import com.workflowai.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "인증", description = "Google OAuth 로그인/회원가입, JWT 발급 및 재발급")
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final GoogleOAuthService googleOAuthService;
    private final AuthService authService;
    private final String frontendBaseUrl;

    public AuthController(
        GoogleOAuthService googleOAuthService,
        AuthService authService,
        @Value("${workflow.frontend.base-url}") String frontendBaseUrl
    ) {
        this.googleOAuthService = googleOAuthService;
        this.authService = authService;
        this.frontendBaseUrl = frontendBaseUrl;
    }

    @Operation(summary = "Google OAuth 인가 URL로 리다이렉트")
    @GetMapping("/google")
    public ResponseEntity<Void> redirectToGoogle() {
        String state = UUID.randomUUID().toString();
        String authorizationUrl = googleOAuthService.buildAuthorizationUrl(state);
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(authorizationUrl)).build();
    }

    @Operation(
        summary = "Google OAuth 콜백 처리",
        description = "code를 받아 로그인/회원가입을 처리하고, JWT를 URL 프래그먼트에 실어 프론트엔드로 리다이렉트한다. "
            + "브라우저 최상위 리다이렉트이므로 JSON을 직접 반환할 수 없다."
    )
    @GetMapping("/google/callback")
    public ResponseEntity<Void> handleGoogleCallback(
        @RequestParam(required = false) String code,
        @RequestParam(required = false) String state
    ) {
        if (code == null || code.isBlank()) {
            return redirectToFrontend("/login?error=oauth_failed");
        }
        try {
            AuthTokenResponse tokens = authService.loginWithGoogleCode(code);
            String fragment = "accessToken=" + encode(tokens.accessToken())
                + "&refreshToken=" + encode(tokens.refreshToken())
                + "&expiresIn=" + tokens.expiresIn();
            return redirectToFrontend("/auth/callback#" + fragment);
        } catch (Exception e) {
            return redirectToFrontend("/login?error=oauth_failed");
        }
    }

    @Operation(summary = "Refresh Token으로 Access Token 재발급")
    @PostMapping("/refresh")
    public ApiResponse<AuthTokenResponse> refresh(@Valid @RequestBody RefreshRequest request) {
        return ApiResponse.ok(authService.refresh(request.refreshToken()));
    }

    @Operation(
        summary = "로그아웃",
        description = "Refresh Token은 stateless JWT로 발급되어 서버에 저장하지 않으므로, 실제 폐기는 "
            + "클라이언트가 로컬에 저장된 토큰을 삭제하는 것으로 처리한다 (P0 범위의 알려진 한계)."
    )
    @PostMapping("/logout")
    public ApiResponse<Void> logout() {
        return ApiResponse.ok(null);
    }

    private ResponseEntity<Void> redirectToFrontend(String path) {
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(frontendBaseUrl + path)).build();
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
