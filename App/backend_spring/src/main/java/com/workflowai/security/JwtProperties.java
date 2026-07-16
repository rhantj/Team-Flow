package com.workflowai.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "workflow.jwt")
public record JwtProperties(String secret, long accessTokenTtlSeconds, long refreshTokenTtlSeconds) {
}
