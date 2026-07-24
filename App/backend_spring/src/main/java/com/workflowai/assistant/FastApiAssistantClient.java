package com.workflowai.assistant;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FastApiAssistantClient {
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    // 명령 경로는 계획 LLM 호출이 끼어 질의응답보다 길어질 수 있다.
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(45);

    private final RestClient restClient;

    public FastApiAssistantClient(
        @Value("${workflow.ai.base-url}") String baseUrl,
        @Value("${workflow.ai.internal-key}") String internalKey
    ) {
        HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(CONNECT_TIMEOUT)
            .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(requestFactory)
            .defaultHeader("X-Internal-Api-Key", internalKey)
            .build();
    }

    public AssistantResponse command(FastApiAssistantRequest request) {
        return restClient.post()
            .uri("/ai/assistant/command")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(AssistantResponse.class);
    }

    public AssistantResponse resume(FastApiAssistantResumeRequest request) {
        return restClient.post()
            .uri("/ai/assistant/resume")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(AssistantResponse.class);
    }
}
