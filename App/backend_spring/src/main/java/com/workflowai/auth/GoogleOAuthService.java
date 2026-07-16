package com.workflowai.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class GoogleOAuthService {
    private static final String AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    private static final String USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

    private final GoogleOAuthProperties properties;
    private final RestClient restClient = RestClient.create();

    public GoogleOAuthService(GoogleOAuthProperties properties) {
        this.properties = properties;
    }

    public String buildAuthorizationUrl(String state) {
        return AUTHORIZATION_ENDPOINT
            + "?client_id=" + encode(properties.clientId())
            + "&redirect_uri=" + encode(properties.redirectUri())
            + "&response_type=code"
            + "&scope=" + encode("openid email profile")
            + "&access_type=offline"
            + "&state=" + encode(state);
    }

    public GoogleTokenResponse exchangeCode(String code) {
        return restClient.post()
            .uri(TOKEN_ENDPOINT)
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body(tokenRequestBody(code))
            .retrieve()
            .body(GoogleTokenResponse.class);
    }

    public GoogleUserInfo fetchUserInfo(String googleAccessToken) {
        return restClient.get()
            .uri(USERINFO_ENDPOINT)
            .header("Authorization", "Bearer " + googleAccessToken)
            .retrieve()
            .body(GoogleUserInfo.class);
    }

    private String tokenRequestBody(String code) {
        return "client_id=" + encode(properties.clientId())
            + "&client_secret=" + encode(properties.clientSecret())
            + "&code=" + encode(code)
            + "&redirect_uri=" + encode(properties.redirectUri())
            + "&grant_type=authorization_code";
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
