package com.workflowai.rag;

import java.net.http.HttpClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FastApiRagClient {
    private final RestClient restClient;

    public FastApiRagClient(@Value("${workflow.ai.base-url}") String baseUrl) {
        HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .build();
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(new JdkClientHttpRequestFactory(httpClient))
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
}
