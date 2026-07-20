package com.workflowai.auth;

import com.workflowai.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "인증", description = "Google OAuth 로그인/회원가입, JWT 발급 및 재발급")
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private static final String STATE_COOKIE = "oauth_state";

    private final GoogleOAuthService googleOAuthService;
    private final AuthService authService;
    private final String frontendBaseUrl;
    private final boolean forceSecureCookies;
    private final boolean devLoginEnabled;

    public AuthController(
        GoogleOAuthService googleOAuthService,
        AuthService authService,
        @Value("${workflow.frontend.base-url}") String frontendBaseUrl,
        @Value("${workflow.security.force-secure-cookies:false}") boolean forceSecureCookies,
        @Value("${workflow.demo.dev-login-enabled:true}") boolean devLoginEnabled
    ) {
        this.googleOAuthService = googleOAuthService;
        this.authService = authService;
        this.frontendBaseUrl = frontendBaseUrl;
        this.forceSecureCookies = forceSecureCookies;
        this.devLoginEnabled = devLoginEnabled;

        // 배포 시 Secure 쿠키 설정을 잘못 맞추면 로그인이 조용히 깨지므로, 기동 로그에서 바로 눈에 띄게 남긴다.
        if (frontendBaseUrl.startsWith("https://") && !forceSecureCookies) {
            log.warn(
                "OAuth state cookie security: frontend가 HTTPS({})인데 "
                    + "workflow.security.force-secure-cookies=false다. 프록시가 사설 대역 IP가 아니면 "
                    + "request.isSecure()가 false로 판정되어 Secure 쿠키가 붙지 않고 로그인이 깨질 수 있다 — "
                    + "SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES 또는 WORKFLOW_FORCE_SECURE_COOKIES 설정을 확인할 것.",
                frontendBaseUrl
            );
        } else {
            log.info("OAuth state cookie security: force-secure-cookies={}", forceSecureCookies);
        }
    }

    @Operation(summary = "Google OAuth 인가 URL로 리다이렉트")
    @GetMapping("/google")
    public ResponseEntity<Void> redirectToGoogle(HttpServletRequest request) {
        String state = UUID.randomUUID().toString();
        String authorizationUrl = googleOAuthService.buildAuthorizationUrl(state);
        return ResponseEntity.status(HttpStatus.FOUND)
            .location(URI.create(authorizationUrl))
            .header(HttpHeaders.SET_COOKIE, stateCookie(state, Duration.ofMinutes(5), request).toString())
            .build();
    }

    @Operation(
        summary = "Google OAuth 콜백 처리",
        description = "code를 받아 로그인/회원가입을 처리하고, JWT를 URL 프래그먼트에 실어 프론트엔드로 리다이렉트한다. "
            + "브라우저 최상위 리다이렉트이므로 JSON을 직접 반환할 수 없다. "
            + "state는 /google에서 발급한 HttpOnly 쿠키 값과 대조해 OAuth 콜백 CSRF를 방지한다."
    )
    @GetMapping("/google/callback")
    public ResponseEntity<Void> handleGoogleCallback(
        @RequestParam(required = false) String code,
        @RequestParam(required = false) String state,
        @CookieValue(name = STATE_COOKIE, required = false) String expectedState,
        HttpServletRequest request
    ) {
        ResponseCookie clearStateCookie = stateCookie("", Duration.ZERO, request);

        if (code == null || code.isBlank()) {
            return redirectToFrontend("/login?error=oauth_failed", clearStateCookie);
        }
        if (!statesMatch(state, expectedState)) {
            log.warn("Google OAuth state 불일치로 콜백 거부");
            return redirectToFrontend("/login?error=oauth_failed", clearStateCookie);
        }
        try {
            AuthTokenResponse tokens = authService.loginWithGoogleCode(code);
            String fragment = "accessToken=" + encode(tokens.accessToken())
                + "&refreshToken=" + encode(tokens.refreshToken())
                + "&expiresIn=" + tokens.expiresIn();
            return redirectToFrontend("/auth/callback#" + fragment, clearStateCookie);
        } catch (Exception e) {
            log.warn("Google OAuth 콜백 처리 실패", e);
            return redirectToFrontend("/login?error=oauth_failed", clearStateCookie);
        }
    }

    @Operation(
        summary = "[개발용] 데모 계정으로 즉시 로그인",
        description = "Google OAuth 없이 시딩된 데모 계정(demoUserId: 1~4)으로 바로 로그인한다. "
            + "workflow.demo.dev-login-enabled=false(프로덕션 기본값)이면 404를 반환한다."
    )
    @GetMapping("/dev-login/{demoUserId}")
    public ResponseEntity<Void> devLogin(@PathVariable String demoUserId) {
        if (!devLoginEnabled) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        try {
            AuthTokenResponse tokens = authService.devLogin(demoUserId);
            String fragment = "accessToken=" + encode(tokens.accessToken())
                + "&refreshToken=" + encode(tokens.refreshToken())
                + "&expiresIn=" + tokens.expiresIn();
            return redirectToFrontend("/auth/callback#" + fragment, stateCookie("", Duration.ZERO));
        } catch (Exception e) {
            log.warn("데모 로그인 실패: {}", demoUserId, e);
            return redirectToFrontend("/login?error=oauth_failed", stateCookie("", Duration.ZERO));
        }
    }

    @Operation(
        summary = "[개발용] 데모 계정 JWT 발급",
        description = "프론트 개발 화면에서 리다이렉트 없이 데모 계정 JWT를 받아 저장할 때 사용한다. "
            + "workflow.demo.dev-login-enabled=false(프로덕션 기본값)이면 404를 반환한다."
    )
    @GetMapping("/dev-login-token/{demoUserId}")
    public ResponseEntity<ApiResponse<AuthTokenResponse>> devLoginToken(@PathVariable String demoUserId) {
        if (!devLoginEnabled) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.fail("DEV_LOGIN_DISABLED", "개발용 로그인이 비활성화되어 있습니다."));
        }
        try {
            return ResponseEntity.ok(ApiResponse.ok(authService.devLogin(demoUserId)));
        } catch (Exception e) {
            log.warn("데모 토큰 로그인 실패: {}", demoUserId, e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.fail("DEMO_USER_NOT_FOUND", "테스트 계정을 찾을 수 없습니다."));
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

    private ResponseEntity<Void> redirectToFrontend(String path, ResponseCookie cookie) {
        return ResponseEntity.status(HttpStatus.FOUND)
            .location(URI.create(frontendBaseUrl + path))
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .build();
    }

    private ResponseCookie stateCookie(String value, Duration maxAge, HttpServletRequest request) {
        return ResponseCookie.from(STATE_COOKIE, value)
            .httpOnly(true)
            .secure(forceSecureCookies || request.isSecure())
            .sameSite("Lax")
            .path("/api/v1/auth")
            .maxAge(maxAge)
            .build();
    }

    /** 개발용 로그인 경로에서 state 쿠키를 지울 때 사용 — 요청의 isSecure() 판단이 필요 없다. */
    private ResponseCookie stateCookie(String value, Duration maxAge) {
        return ResponseCookie.from(STATE_COOKIE, value)
            .httpOnly(true)
            .secure(forceSecureCookies)
            .sameSite("Lax")
            .path("/api/v1/auth")
            .maxAge(maxAge)
            .build();
    }

    /** 타이밍 공격 여지를 없애기 위해 상수 시간으로 state 값을 비교한다. */
    private boolean statesMatch(String state, String expectedState) {
        if (state == null || expectedState == null) {
            return false;
        }
        return MessageDigest.isEqual(
            state.getBytes(StandardCharsets.UTF_8),
            expectedState.getBytes(StandardCharsets.UTF_8)
        );
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
