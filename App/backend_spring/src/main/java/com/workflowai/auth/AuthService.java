package com.workflowai.auth;

import com.workflowai.security.JwtService;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import io.jsonwebtoken.Claims;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final String PROVIDER_GOOGLE = "google";

    private final GoogleOAuthService googleOAuthService;
    private final UserRepository userRepository;
    private final JwtService jwtService;

    public AuthService(GoogleOAuthService googleOAuthService, UserRepository userRepository, JwtService jwtService) {
        this.googleOAuthService = googleOAuthService;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
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
