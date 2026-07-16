package com.workflowai.security;

import com.workflowai.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    private static final String CLAIM_TYPE = "typ";
    private static final String TYPE_ACCESS = "access";
    private static final String TYPE_REFRESH = "refresh";

    private final JwtProperties properties;
    private final SecretKey key;

    public JwtService(JwtProperties properties) {
        this.properties = properties;
        this.key = Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
    }

    public String issueAccessToken(User user) {
        return issueToken(user, TYPE_ACCESS, properties.accessTokenTtlSeconds());
    }

    public String issueRefreshToken(User user) {
        return issueToken(user, TYPE_REFRESH, properties.refreshTokenTtlSeconds());
    }

    public long accessTokenTtlSeconds() {
        return properties.accessTokenTtlSeconds();
    }

    public Claims parseAccessToken(String token) {
        Claims claims = parse(token);
        requireType(claims, TYPE_ACCESS);
        return claims;
    }

    public Claims parseRefreshToken(String token) {
        Claims claims = parse(token);
        requireType(claims, TYPE_REFRESH);
        return claims;
    }

    private String issueToken(User user, String type, long ttlSeconds) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(String.valueOf(user.getId()))
            .claim(CLAIM_TYPE, type)
            .claim("email", user.getEmail())
            .claim("name", user.getName())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(ttlSeconds)))
            .signWith(key)
            .compact();
    }

    private Claims parse(String token) {
        try {
            return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidTokenException("유효하지 않은 토큰입니다.", e);
        }
    }

    private void requireType(Claims claims, String expected) {
        if (!expected.equals(claims.get(CLAIM_TYPE, String.class))) {
            throw new InvalidTokenException("토큰 타입이 올바르지 않습니다.");
        }
    }
}
