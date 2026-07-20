package com.workflowai.rag;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class RagControllerTest {

    @Mock
    private FastApiRagClient fastApiRagClient;

    private final RagRateLimiter rateLimiter = new RagRateLimiter(10, 60);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void queryReturnsAnswerFromFastApi() throws Exception {
        RagQueryResponse fastApiResponse = new RagQueryResponse(
            "답변입니다",
            List.of(new RagSourceDto("meeting", 1L, "요약", 0.9))
        );
        when(fastApiRagClient.query(any(RagQueryRequest.class))).thenReturn(fastApiResponse);

        RagController controller = new RagController(fastApiRagClient, rateLimiter);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new RagQueryRequest(1L, "질문"));

        mockMvc.perform(post("/api/v1/ai/rag/query").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.answer").value("답변입니다"))
            .andExpect(jsonPath("$.data.sources[0].source_type").value("meeting"));
    }

    @Test
    void queryReturns429WhenRateLimited() throws Exception {
        RagRateLimiter exhaustedLimiter = new RagRateLimiter(0, 60);
        RagController controller = new RagController(fastApiRagClient, exhaustedLimiter);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new RagQueryRequest(1L, "질문"));

        mockMvc.perform(post("/api/v1/ai/rag/query").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"));
    }
}
