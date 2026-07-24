package com.workflowai.assistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.project.ProjectMember;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRole;
import com.workflowai.rag.RagRateLimiter;
import com.workflowai.security.UserPrincipal;
import java.util.List;
import java.util.Optional;
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
class AssistantControllerTest {

    @Mock
    private FastApiAssistantClient fastApiAssistantClient;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    private final RagRateLimiter rateLimiter = new RagRateLimiter(10, 60);

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

    private MockMvc mockMvc() {
        return MockMvcBuilders.standaloneSetup(
            new AssistantController(fastApiAssistantClient, rateLimiter, projectMemberRepository)
        ).build();
    }

    private void stubRole(long userId, ProjectRole role) {
        // ProjectMember의 무인자 생성자는 protected(JPA 전용)라 다른 패키지에서 쓸 수 없다.
        ProjectMember member = new ProjectMember(1L, userId, role);
        when(projectMemberRepository.findByProjectIdAndUserId(1L, userId)).thenReturn(Optional.of(member));
    }

    @Test
    void commandFillsUserIdAndRoleFromSessionNotRequestBody() throws Exception {
        // 요청 바디로 LEADER를 참칭해도 세션 역할(MEMBER)로 덮어써야 한다.
        authenticateAs(5L);
        stubRole(5L, ProjectRole.MEMBER);
        when(fastApiAssistantClient.command(any(FastApiAssistantRequest.class)))
            .thenReturn(new AssistantResponse("answer", "답변", List.of(), null, null));

        String body = """
            {"project_id":1,"question":"질문","user_id":999,"user_role":"LEADER","history":[]}""";

        mockMvc().perform(post("/api/v1/ai/assistant/command")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());

        ArgumentCaptor<FastApiAssistantRequest> captor =
            ArgumentCaptor.forClass(FastApiAssistantRequest.class);
        verify(fastApiAssistantClient).command(captor.capture());
        assertThat(captor.getValue().user_id()).isEqualTo(5L);
        assertThat(captor.getValue().user_role()).isEqualTo("MEMBER");
    }

    @Test
    void leaderRoleIsForwardedAsLeader() throws Exception {
        authenticateAs(7L);
        stubRole(7L, ProjectRole.LEADER);
        when(fastApiAssistantClient.command(any(FastApiAssistantRequest.class)))
            .thenReturn(new AssistantResponse("answer", "답변", List.of(), null, null));

        String body = """
            {"project_id":1,"question":"질문","history":[]}""";

        mockMvc().perform(post("/api/v1/ai/assistant/command")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk());

        ArgumentCaptor<FastApiAssistantRequest> captor =
            ArgumentCaptor.forClass(FastApiAssistantRequest.class);
        verify(fastApiAssistantClient).command(captor.capture());
        assertThat(captor.getValue().user_role()).isEqualTo("LEADER");
    }

    @Test
    void missingMembershipIsRejected() throws Exception {
        authenticateAs(9L);
        when(projectMemberRepository.findByProjectIdAndUserId(1L, 9L)).thenReturn(Optional.empty());

        String body = """
            {"project_id":1,"question":"질문","history":[]}""";

        mockMvc().perform(post("/api/v1/ai/assistant/command")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("NOT_PROJECT_MEMBER"));
    }

    @Test
    void rejectsHistoryWithNullElementInsteadOf500() throws Exception {
        authenticateAs(5L);
        String body = """
            {"project_id":1,"question":"질문","history":[null]}""";

        mockMvc().perform(post("/api/v1/ai/assistant/command")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_HISTORY"));
    }

    @Test
    void returns503WhenFastApiCallFails() throws Exception {
        authenticateAs(5L);
        stubRole(5L, ProjectRole.MEMBER);
        when(fastApiAssistantClient.command(any(FastApiAssistantRequest.class)))
            .thenThrow(new org.springframework.web.client.ResourceAccessException("refused"));

        String body = """
            {"project_id":1,"question":"질문","history":[]}""";

        mockMvc().perform(post("/api/v1/ai/assistant/command")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error.code").value("ASSISTANT_UNAVAILABLE"));
    }
}
