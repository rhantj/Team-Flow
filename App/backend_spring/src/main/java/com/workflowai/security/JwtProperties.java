package com.workflowai.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "workflow.jwt")
public record JwtProperties(String secret, long accessTokenTtlSeconds, long refreshTokenTtlSeconds) {
}
