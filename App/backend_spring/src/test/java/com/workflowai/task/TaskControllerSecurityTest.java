package com.workflowai.task;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.activity.ActivityService;
import com.workflowai.common.DemoDataService;
import com.workflowai.notification.NotificationService;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.rag.RagIngestService;
import com.workflowai.security.ProjectAccess;
import com.workflowai.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

// MethodSecurityTestConfig는 일부러 @SpringBootConfiguration을 쓰지 않는다. 같은 패키지(com.workflowai.task)의
// 다른 @WebMvcTest(예: ChecklistControllerGenerateTest)들이 설정 클래스를 명시하지 않고 자동 탐지에 의존하는데,
// @SpringBootConfiguration을 붙이면 그 자동 탐지가 (실제 앱의 메인 클래스 대신) 이 클래스를 더 가까운
// 후보로 집어서 다른 테스트들이 UserRepository 등 빈을 못 찾고 깨진다. 대신 @ContextConfiguration으로
// 명시적으로 지정해 자동 탐지 자체를 우회한다.
@WebMvcTest(TaskController.class)
@AutoConfigureMockMvc(addFilters = false)
@ContextConfiguration(classes = TaskControllerSecurityTest.MethodSecurityTestConfig.class)
class TaskControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskRepository taskRepository;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private DemoDataService demoDataService;

    @MockitoBean
    private ActivityService activityService;

    @MockitoBean
    private NotificationService notificationService;

    @MockitoBean
    private ProjectMemberRepository projectMemberRepository;

    @MockitoBean
    private RagIngestService ragIngestService;

    @MockitoBean(name = "projectAccess")
    private ProjectAccess projectAccess;

    @Test
    void updateTaskReturns403WhenNotLeader() throws Exception {
        when(projectAccess.hasRole(eq("demo-project"), eq("LEADER"))).thenReturn(false);

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .with(user("member"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"새 제목\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void deleteTaskReturns403WhenNotLeader() throws Exception {
        when(projectAccess.hasRole(eq("demo-project"), eq("LEADER"))).thenReturn(false);

        mockMvc.perform(delete("/api/v1/projects/demo-project/tasks/42")
                .with(user("member")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Test
    void sendNudgeReturns403WhenNotLeader() throws Exception {
        when(projectAccess.hasRole(eq("demo-project"), eq("LEADER"))).thenReturn(false);

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/nudge")
                .with(user("member"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"START\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Configuration
    @EnableMethodSecurity
    @Import(TaskController.class)
    static class MethodSecurityTestConfig {
        @Bean
        TaskAccessDeniedResponseAdvice accessDeniedResponseAdvice() {
            return new TaskAccessDeniedResponseAdvice();
        }
    }
}
