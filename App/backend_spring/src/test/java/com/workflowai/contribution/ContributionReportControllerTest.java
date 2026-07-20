package com.workflowai.contribution;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflowai.rag.RagRateLimiter;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class ContributionReportControllerTest {

    @Mock
    private FastApiContributionClient fastApiContributionClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void generateReportReturnsDataFromFastApi() throws Exception {
        List<MemberContributionDto> fastApiResponse = List.of(
            new MemberContributionDto(1L, "김민준", "요약", List.of("To-Do 8/10건 완료"))
        );
        when(fastApiContributionClient.generate(any(ContributionReportRequest.class))).thenReturn(fastApiResponse);

        ContributionReportController controller = new ContributionReportController(
            fastApiContributionClient,
            new RagRateLimiter(10, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionReportRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/report").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].name").value("김민준"))
            .andExpect(jsonPath("$.data[0].summary").value("요약"));
    }

    @Test
    void generateReportReturns503WhenFastApiFails() throws Exception {
        when(fastApiContributionClient.generate(any(ContributionReportRequest.class)))
            .thenThrow(new RuntimeException("connection refused"));

        ContributionReportController controller = new ContributionReportController(
            fastApiContributionClient,
            new RagRateLimiter(10, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionReportRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/report").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error.code").value("CONTRIBUTION_REPORT_UNAVAILABLE"));
    }

    @Test
    void generateReportReturns429WhenRateLimited() throws Exception {
        ContributionReportController controller = new ContributionReportController(
            fastApiContributionClient,
            new RagRateLimiter(0, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionReportRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/report").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"));
    }
}
