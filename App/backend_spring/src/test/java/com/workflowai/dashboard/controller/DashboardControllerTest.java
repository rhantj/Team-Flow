package com.workflowai.dashboard.controller;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.dashboard.DTO.DashboardSummaryResponse;
import com.workflowai.dashboard.DTO.DelayRiskDto;
import com.workflowai.dashboard.DTO.ProgressDetailResponse;
import com.workflowai.dashboard.service.DashboardService;
import com.workflowai.security.UserPrincipal;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class DashboardControllerTest {

    private static final Long CURRENT_USER_ID = 5L;

    @Mock
    private DashboardService dashboardService;

    @BeforeEach
    void authenticateAsCurrentUser() {
        UserPrincipal principal = new UserPrincipal(CURRENT_USER_ID, "user@example.com", "김민준");
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(principal, null, List.of())
        );
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void getSummaryReturnsDataFromService() throws Exception {
        DashboardSummaryResponse response = new DashboardSummaryResponse(
            14, 4, 29, 2, 4, List.of(), List.of(), List.of()
        );
        when(dashboardService.getSummary(eq("demo-project"))).thenReturn(response);

        DashboardController controller = new DashboardController(dashboardService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(get("/api/v1/projects/demo-project/dashboard/summary"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.totalTasks").value(14))
            .andExpect(jsonPath("$.data.progressPercent").value(29));
    }

    @Test
    void getProgressReturnsDataFromService() throws Exception {
        ProgressDetailResponse response = new ProgressDetailResponse(
            14, 4, 29, List.of(), List.of(), List.of(), false, null, null
        );
        when(dashboardService.getProgressDetail(eq("demo-project"))).thenReturn(response);

        DashboardController controller = new DashboardController(dashboardService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(get("/api/v1/projects/demo-project/dashboard/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.hasPredictions").value(false));
    }

    @Test
    void getMyDelayRisksUsesCurrentUserIdFromSecurityContext() throws Exception {
        DelayRiskDto risky = new DelayRiskDto(
            "10", "결제 시스템 연동", "김민준", "inprogress", "2026-07-25", "위험", 0.82, "2026-07-19T09:00:00"
        );
        when(dashboardService.getMyDelayRisks(eq("demo-project"), eq(CURRENT_USER_ID)))
            .thenReturn(List.of(risky));

        DashboardController controller = new DashboardController(dashboardService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(get("/api/v1/projects/demo-project/dashboard/delay-risk/mine"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].taskId").value("10"))
            .andExpect(jsonPath("$.data[0].result").value("위험"));
    }

    @Test
    void refreshDelayRiskDelegatesToServiceAndReturnsProgress() throws Exception {
        ProgressDetailResponse response = new ProgressDetailResponse(
            14, 4, 29, List.of(), List.of(), List.of(), true, null, null
        );
        when(dashboardService.refreshDelayRiskAndGetProgress(eq("demo-project"))).thenReturn(response);

        DashboardController controller = new DashboardController(dashboardService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(post("/api/v1/projects/demo-project/dashboard/delay-risk/refresh"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.hasPredictions").value(true));
    }
}
