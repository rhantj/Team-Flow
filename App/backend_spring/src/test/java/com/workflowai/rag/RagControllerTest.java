package com.workflowai.rag;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflowai.security.UserPrincipal;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class RagControllerTest {

    @Mock
    private FastApiRagClient fastApiRagClient;

    private final RagRateLimiter rateLimiter = new RagRateLimiter(10, 60);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(long userId) {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(
                new UserPrincipal(userId, "user" + userId + "@workflow.ai", "테스트유저"), null, List.of()
            )
        );
    }

    @Test
    void queryReturnsAnswerFromFastApi() throws Exception {
        authenticateAs(5L);
        RagQueryResponse fastApiResponse = new RagQueryResponse(
            "답변입니다",
            List.of(new RagSourceDto("meeting", 1L, "요약", 0.9))
        );
        when(fastApiRagClient.query(any(RagQueryRequest.class))).thenReturn(fastApiResponse);

        RagController controller = new RagController(fastApiRagClient, rateLimiter);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new RagQueryRequest(1L, "질문", null));

        mockMvc.perform(post("/api/v1/ai/rag/query").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.answer").value("답변입니다"))
            .andExpect(jsonPath("$.data.sources[0].source_type").value("meeting"));
    }

    @Test
    void queryFillsUserIdFromAuthenticatedSessionNotRequestBody() throws Exception {
        // user_id는 클라이언트가 보낸 값을 신뢰하지 않고 인증 세션에서 채워야 한다 (다른 사람의
        // user_id를 흉내내 담당 업무를 조회하는 것을 방지).
        authenticateAs(5L);
        RagQueryResponse fastApiResponse = new RagQueryResponse("답변", List.of());
        when(fastApiRagClient.query(any(RagQueryRequest.class))).thenReturn(fastApiResponse);

        RagController controller = new RagController(fastApiRagClient, rateLimiter);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new RagQueryRequest(1L, "질문", 999L));

        mockMvc.perform(post("/api/v1/ai/rag/query").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());

        ArgumentCaptor<RagQueryRequest> captor = ArgumentCaptor.forClass(RagQueryRequest.class);
        verify(fastApiRagClient).query(captor.capture());
        assertThat(captor.getValue().user_id()).isEqualTo(5L);
    }

    @Test
    void queryReturns429WhenRateLimited() throws Exception {
        RagRateLimiter exhaustedLimiter = new RagRateLimiter(0, 60);
        RagController controller = new RagController(fastApiRagClient, exhaustedLimiter);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new RagQueryRequest(1L, "질문", null));

        mockMvc.perform(post("/api/v1/ai/rag/query").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"));
    }
}
