package com.workflowai.meeting;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FastApiMeetingClient {
    private final RestClient restClient;

    @Autowired
    public FastApiMeetingClient(
        @Value("${workflow.ai.base-url}") String baseUrl,
        @Value("${workflow.ai.connect-timeout-seconds:5}") long connectTimeoutSeconds,
        @Value("${workflow.ai.read-timeout-seconds:45}") long readTimeoutSeconds
    ) {
        this(
            baseUrl,
            Duration.ofSeconds(connectTimeoutSeconds),
            Duration.ofSeconds(readTimeoutSeconds)
        );
    }

    FastApiMeetingClient(String baseUrl, Duration connectTimeout, Duration readTimeout) {
        // JDK HttpClient는 plaintext(http://) 대상에도 기본적으로 HTTP/2(h2c) 업그레이드를 시도하는데,
        // uvicorn(FastAPI)이 이를 지원하지 않아 요청이 깨진다. HTTP/1.1을 명시해 우회한다.
        HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(connectTimeout)
            .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(readTimeout);
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(requestFactory)
            .build();
    }

    public MeetingAnalysisResult analyze(AiAnalyzeRequest request) {
        return restClient.post()
            .uri("/api/v1/meetings/analyze-json")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(MeetingAnalysisResult.class);
    }
}
