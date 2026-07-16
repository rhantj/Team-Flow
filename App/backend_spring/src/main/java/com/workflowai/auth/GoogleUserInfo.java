package com.workflowai.auth;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GoogleUserInfo(
    String sub,
    String name,
    String email,
    @JsonProperty("email_verified") Boolean emailVerified,
    String picture
) {
}
