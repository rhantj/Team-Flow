package com.workflowai.task;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.activity.ActivityService;
import com.workflowai.common.DemoDataService;
import com.workflowai.notification.NotificationService;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class TaskControllerCreateTest {

    @Mock
    private TaskRepository taskRepository;

    @Mock
    private DemoDataService demoDataService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ActivityService activityService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
            .standaloneSetup(new TaskController(
                taskRepository, userRepository, demoDataService, activityService,
                notificationService, projectMemberRepository
            ))
            .build();
    }

    @Test
    void notifiesAssigneeOnCreate() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        // TaskController.currentActorId()는 mock 사용자 "1" -> DB id 1L로 해석된다.
        when(demoDataService.resolveUserId("1")).thenReturn(1L);
        when(demoDataService.resolveUserId("2")).thenReturn(5L);
        when(taskRepository.findTopByProjectIdAndStatusOrderByPositionDesc(anyLong(), any()))
            .thenReturn(java.util.Optional.empty());
        when(taskRepository.save(any(Task.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"새 업무","category":"backend","assigneeId":"2"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));

        verify(notificationService).notify(
            eq(5L), eq("TASK_ASSIGNED"), any(), any(), eq("task"), any()
        );
    }

    @Test
    void doesNotNotifyWhenNoAssignee() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findTopByProjectIdAndStatusOrderByPositionDesc(anyLong(), any()))
            .thenReturn(java.util.Optional.empty());
        when(taskRepository.save(any(Task.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"담당자 없는 업무","category":"backend"}
                    """))
            .andExpect(status().isOk());

        verify(notificationService, never()).notify(any(), any(), any(), any(), any(), any());
    }
}
