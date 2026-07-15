package com.workflowai.auth;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GoogleTokenResponse(
    @JsonProperty("access_token") String accessToken,
    @JsonProperty("expires_in") Long expiresIn,
    @JsonProperty("token_type") String tokenType,
    @JsonProperty("id_token") String idToken
) {
}
