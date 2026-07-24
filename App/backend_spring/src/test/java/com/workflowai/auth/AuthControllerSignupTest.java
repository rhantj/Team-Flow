package com.workflowai.auth;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflowai.presence.PresenceService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * /api/v1/auth/signup의 termsAgreed 하위 호환성을 컨트롤러(HTTP) 레벨에서 검증한다.
 * SignupRequest.termsAgreed는 Boolean(래퍼)이라 @AssertTrue가 null(필드 누락)은 통과시키고
 * false(명시적 거부)만 막는다 — 이 두 경로가 실제 HTTP 요청/검증 파이프라인에서도 그대로
 * 동작하는지는 AuthServiceTest(서비스 단위 테스트)만으로는 보장되지 않는다.
 */
@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerSignupTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private AuthService authService;

    @MockitoBean
    private GoogleOAuthService googleOAuthService;

    @MockitoBean
    private TestLoginService testLoginService;

    @MockitoBean
    private PresenceService presenceService;

    @Test
    void signup_withoutTermsAgreedField_legacyClient_succeeds() throws Exception {
        when(authService.signup(eq("legacy@example.com"), eq("12345678"), eq("이름"), eq("MEMBER"), isNull()))
            .thenReturn(SignupResponse.active(
                new AuthTokenResponse("access-token", "refresh-token", 1800L, null, null)
            ));

        mockMvc.perform(post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "email": "legacy@example.com",
                      "password": "12345678",
                      "name": "이름",
                      "roleType": "MEMBER"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("ACTIVE"));
    }

    @Test
    void signup_withTermsAgreedTrue_newClient_succeeds() throws Exception {
        when(authService.signup(eq("new@example.com"), eq("12345678"), eq("이름"), eq("MEMBER"), eq(true)))
            .thenReturn(SignupResponse.active(
                new AuthTokenResponse("access-token", "refresh-token", 1800L, null, null)
            ));

        mockMvc.perform(post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "email": "new@example.com",
                      "password": "12345678",
                      "name": "이름",
                      "roleType": "MEMBER",
                      "termsAgreed": true
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("ACTIVE"));
    }

    @Test
    void signup_withTermsAgreedFalse_explicitlyRejected_returns400WithoutCallingService() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "email": "reject@example.com",
                      "password": "12345678",
                      "name": "이름",
                      "roleType": "MEMBER",
                      "termsAgreed": false
                    }
                    """))
            .andExpect(status().isBadRequest());
    }
}
