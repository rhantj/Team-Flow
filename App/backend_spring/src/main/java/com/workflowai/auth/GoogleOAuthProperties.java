package com.workflowai.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "workflow.google")
public record GoogleOAuthProperties(String clientId, String clientSecret, String redirectUri) {
}
