package com.workflowai.auth;

import com.workflowai.security.JwtService;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import io.jsonwebtoken.Claims;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final String PROVIDER_GOOGLE = "google";
    private static final String PROVIDER_DEMO = "demo";
    private static final String PROVIDER_LOCAL = "local";
    private static final String ROLE_TYPE_REVIEWER = "REVIEWER";
    private static final String REVIEWER_STATUS_PENDING = "PENDING";
    private static final int MIN_PASSWORD_LENGTH = 8;

    private final GoogleOAuthService googleOAuthService;
    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;

    public AuthService(
        GoogleOAuthService googleOAuthService,
        UserRepository userRepository,
        JwtService jwtService,
        PasswordEncoder passwordEncoder
    ) {
        this.googleOAuthService = googleOAuthService;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public AuthTokenResponse loginWithGoogleCode(String code) {
        GoogleTokenResponse tokenResponse = googleOAuthService.exchangeCode(code);
        GoogleUserInfo userInfo = googleOAuthService.fetchUserInfo(tokenResponse.accessToken());

        User user = userRepository.findByProviderAndProviderId(PROVIDER_GOOGLE, userInfo.sub())
            .orElseGet(() -> userRepository.save(
                new User(userInfo.email(), userInfo.name(), PROVIDER_GOOGLE, userInfo.sub())
            ));

        return issueTokens(user);
    }

    /** [개발용] Google OAuth 없이 데모 계정(provider="demo", providerId=demoUserId)으로 즉시 로그인한다. */
    public AuthTokenResponse devLogin(String demoUserId) {
        User user = userRepository.findByProviderAndProviderId(PROVIDER_DEMO, demoUserId)
            .orElseThrow(() -> new IllegalArgumentException("알 수 없는 테스트 계정입니다: " + demoUserId));
        return issueTokens(user);
    }

    /** 이메일/비밀번호 회원가입. REVIEWER는 토큰을 발급하지 않고 승인 대기 상태로만 계정을 만든다. */
    @Transactional
    public SignupResponse signup(String email, String password, String name, String roleType) {
        if (email == null || email.isBlank() || name == null || name.isBlank()) {
            throw new InvalidSignupInputException("이름과 이메일을 입력해주세요.");
        }
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw new InvalidSignupInputException("비밀번호는 " + MIN_PASSWORD_LENGTH + "자 이상이어야 합니다.");
        }
        if (userRepository.existsByEmail(email)) {
            throw new EmailAlreadyExistsException();
        }

        String passwordHash = passwordEncoder.encode(password);
        boolean isReviewerApplication = ROLE_TYPE_REVIEWER.equalsIgnoreCase(roleType);
        User newUser = new User(email, name, PROVIDER_LOCAL, email, passwordHash);
        if (isReviewerApplication) {
            newUser.setReviewerStatus(REVIEWER_STATUS_PENDING);
        }
        User user;
        try {
            user = userRepository.saveAndFlush(newUser);
        } catch (DataIntegrityViolationException e) {
            if (userRepository.existsByEmail(email)) {
                throw new EmailAlreadyExistsException();
            }
            throw e;
        }

        if (isReviewerApplication) {
            return SignupResponse.pendingReviewerApproval();
        }
        return SignupResponse.active(issueTokens(user));
    }

    /**
     * 이메일/비밀번호 로그인. Google 전용 계정(password_hash 없음)은 별도 안내 메시지로 거부하고,
     * 아직 승인되지 않은 REVIEWER 신청 계정(reviewer_status=PENDING)은 로그인 자체를 막는다.
     */
    public AuthTokenResponse loginWithPassword(String email, String password) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(InvalidCredentialsException::new);
        if (user.getPasswordHash() == null) {
            throw new GoogleAccountRequiredException();
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        if (REVIEWER_STATUS_PENDING.equals(user.getReviewerStatus())) {
            throw new ReviewerApprovalPendingException();
        }
        return issueTokens(user);
    }

    public AuthTokenResponse refresh(String refreshToken) {
        Claims claims = jwtService.parseRefreshToken(refreshToken);
        Long userId = Long.valueOf(claims.getSubject());
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        return issueTokens(user);
    }

    private AuthTokenResponse issueTokens(User user) {
        String accessToken = jwtService.issueAccessToken(user);
        String refreshToken = jwtService.issueRefreshToken(user);
        UserSummary summary = new UserSummary(user.getId(), user.getEmail(), user.getName());
        return new AuthTokenResponse(accessToken, refreshToken, jwtService.accessTokenTtlSeconds(), summary);
    }
}
