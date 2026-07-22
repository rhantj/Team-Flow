package com.workflowai.rag;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FastApiRagClient {
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    // query()의 LLM 생성 시간도 함께 고려한 값 (ingest는 RagIngestService에서 별도 스레드로 호출되므로
    // 이 타임아웃 안에서만 블로킹된다).
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(30);

    private final RestClient restClient;

    public FastApiRagClient(@Value("${workflow.ai.base-url}") String baseUrl) {
        HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(CONNECT_TIMEOUT)
            .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(requestFactory)
            .build();
    }

    public RagQueryResponse query(RagQueryRequest request) {
        return restClient.post()
            .uri("/ai/rag/query")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(RagQueryResponse.class);
    }

    public RagIngestResponse ingest(RagIngestRequest request) {
        return restClient.post()
            .uri("/ai/rag/ingest")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(RagIngestResponse.class);
    }

    public void syncAssignee(RagAssigneeSyncRequest request) {
        restClient.post()
            .uri("/ai/rag/assignee-sync")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .toBodilessEntity();
    }
}
