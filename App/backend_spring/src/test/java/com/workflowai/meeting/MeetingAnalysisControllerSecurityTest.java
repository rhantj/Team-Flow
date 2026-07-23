package com.workflowai.meeting;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.security.ProjectAccess;
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

// MethodSecurityTestConfig는 TaskControllerSecurityTest와 같은 이유로 @SpringBootConfiguration을 쓰지 않고
// @ContextConfiguration으로 명시한다. AccessDeniedResponseAdvice도 다른 패키지의 동명 테스트 전용 advice와
// 빈 이름이 충돌하지 않도록 이 클래스만의 이름(MeetingAnalysisAccessDeniedResponseAdvice)을 쓴다.
@WebMvcTest(MeetingAnalysisController.class)
@AutoConfigureMockMvc(addFilters = false)
@ContextConfiguration(classes = MeetingAnalysisControllerSecurityTest.MethodSecurityTestConfig.class)
class MeetingAnalysisControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private MeetingAnalysisService meetingAnalysisService;

    @MockitoBean(name = "projectAccess")
    private ProjectAccess projectAccess;

    @Test
    void registerTasksReturns403WhenNotLeader() throws Exception {
        when(projectAccess.hasRole(eq("demo-project"), eq("LEADER"))).thenReturn(false);

        mockMvc.perform(post("/api/v1/projects/demo-project/meetings/5/tasks/register")
                .with(user("member"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"todos\":[]}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @Configuration
    @EnableMethodSecurity
    @Import(MeetingAnalysisController.class)
    static class MethodSecurityTestConfig {
        @Bean
        MeetingAnalysisAccessDeniedResponseAdvice accessDeniedResponseAdvice() {
            return new MeetingAnalysisAccessDeniedResponseAdvice();
        }
    }
}
