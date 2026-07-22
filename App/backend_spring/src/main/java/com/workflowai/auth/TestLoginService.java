package com.workflowai.auth;

import com.workflowai.common.DemoDataService;
import com.workflowai.presence.PresenceService;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * 중간보고/시연용 아이디+비밀번호 로그인. 운영용 Google OAuth와는 별개의 우회 경로이며,
 * 내부적으로는 기존 데모 계정(dev-login) 시딩을 그대로 재사용한다. 비밀번호는 전부 "1111"로 고정.
 */
@Service
public class TestLoginService {
    private static final String TEST_PASSWORD = "1111";

    private static final Map<String, String> USERNAME_TO_DEMO_ID = Map.of(
        "leader", "1",
        "member1", "2",
        "member2", "3",
        "member3", "4",
        "member4", "5",
        "reviewer", "6",
        "member5", "7"
    );

    private final AuthService authService;
    private final DemoDataService demoDataService;
    private final PresenceService presenceService;

    public TestLoginService(AuthService authService, DemoDataService demoDataService, PresenceService presenceService) {
        this.authService = authService;
        this.demoDataService = demoDataService;
        this.presenceService = presenceService;
    }

    /** 아이디/비밀번호 검증 → 동시 로그인 여부 확인 → 통과하면 데모 계정 JWT를 발급한다. */
    public AuthTokenResponse login(String username, String password) {
        String demoUserId = username == null ? null : USERNAME_TO_DEMO_ID.get(username.trim().toLowerCase());
        if (demoUserId == null || !TEST_PASSWORD.equals(password)) {
            throw new InvalidTestCredentialsException();
        }

        Long userId = demoDataService.resolveUserId(demoUserId);
        if (userId == null) {
            throw new InvalidTestCredentialsException();
        }

        String sessionId = UUID.randomUUID().toString();
        if (!presenceService.tryAcquire(userId, sessionId)) {
            throw new TestAccountAlreadyActiveException();
        }

        // devLogin은 시딩된 계정이 없을 때만 IllegalArgumentException을 던진다(AuthService 참고).
        // 그 외 런타임 예외(DB 연결 오류 등)는 장애 원인이 가려지지 않도록 그대로 전파한다 — 대신
        // presence는 여기서 반드시 반납해 로그인 실패로 접속 슬롯이 영구 점유되지 않게 한다.
        try {
            AuthTokenResponse tokens = authService.devLogin(demoUserId);
            return new AuthTokenResponse(
                tokens.accessToken(),
                tokens.refreshToken(),
                tokens.expiresIn(),
                tokens.user(),
                sessionId
            );
        } catch (IllegalArgumentException e) {
            presenceService.release(userId, sessionId);
            throw new InvalidTestCredentialsException();
        } catch (RuntimeException e) {
            presenceService.release(userId, sessionId);
            throw e;
        }
    }
}
