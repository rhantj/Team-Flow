package com.workflowai.notification;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.security.UserPrincipal;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(NotificationController.class)
@AutoConfigureMockMvc(addFilters = false)
class NotificationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private NotificationRepository notificationRepository;

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
    void listsNotificationsForCurrentUser() throws Exception {
        authenticateAs(5L);
        Notification n = new Notification(5L, "TASK_ASSIGNED", "새 업무 배정", "'로그인 API' 업무가 배정되었습니다.", "task", 42L);
        when(notificationRepository.findTop50ByUserIdOrderByCreatedAtDesc(5L)).thenReturn(List.of(n));

        mockMvc.perform(get("/api/v1/notifications"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].type").value("TASK_ASSIGNED"))
            .andExpect(jsonPath("$.data[0].title").value("새 업무 배정"));
    }

    @Test
    void returnsUnreadCount() throws Exception {
        authenticateAs(5L);
        when(notificationRepository.countByUserIdAndReadFalse(5L)).thenReturn(3L);

        mockMvc.perform(get("/api/v1/notifications/unread-count"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.count").value(3));
    }

    @Test
    void marksAllNotificationsRead() throws Exception {
        authenticateAs(5L);
        Notification n = new Notification(5L, "TASK_ASSIGNED", "새 업무 배정", "내용", "task", 42L);
        when(notificationRepository.findByUserIdAndReadFalse(5L)).thenReturn(List.of(n));

        mockMvc.perform(patch("/api/v1/notifications/read-all"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));

        verify(notificationRepository).saveAll(List.of(n));
    }
}
