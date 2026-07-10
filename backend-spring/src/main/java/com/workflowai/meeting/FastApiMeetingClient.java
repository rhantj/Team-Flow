package com.workflowai.meeting;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FastApiMeetingClient {
    private final RestClient restClient;

    public FastApiMeetingClient(@Value("${workflow.ai.base-url}") String baseUrl) {
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
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
