package com.workflowai.task;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.activity.ActivityService;
import com.workflowai.common.DemoDataService;
import com.workflowai.notification.NotificationService;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class TaskControllerUpdateTest {

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

    private Task existingTask() {
        return new Task(
            1L, "원래 제목", "frontend", "todo", 3L,
            LocalDate.of(2026, 7, 1), "medium", "원래 설명",
            "MANUAL", null, 1L, 0.0
        );
    }

    @Test
    void updatesTaskFields() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(anyLong())).thenReturn(Optional.of(existingTask()));
        when(demoDataService.resolveUserId(eq("2"))).thenReturn(5L);
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"새 제목","category":"backend","assigneeId":"2","dueDate":"2026-08-01","priority":"high","description":"새 설명"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.title").value("새 제목"))
            .andExpect(jsonPath("$.data.category").value("backend"))
            .andExpect(jsonPath("$.data.priority").value("high"))
            .andExpect(jsonPath("$.data.dueDate").value("2026-08-01"))
            .andExpect(jsonPath("$.data.assigneeId").value("5"))
            .andExpect(jsonPath("$.data.description").value("새 설명"));
    }

    @Test
    void rejectsBlankTitle() throws Exception {
        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.error.code").value("TITLE_REQUIRED"));
    }

    @Test
    void rejectsInvalidDueDateFormat() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(anyLong())).thenReturn(Optional.of(existingTask()));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"dueDate\":\"not-a-date\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_DUE_DATE"));
    }

    @Test
    void returnsNotFoundWhenTaskMissing() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(anyLong())).thenReturn(Optional.empty());

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/999")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"아무거나\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("TASK_NOT_FOUND"));
    }

    @Test
    void notifiesNewAssigneeWhenAssigneeChanges() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(anyLong())).thenReturn(Optional.of(existingTask()));
        when(demoDataService.resolveUserId(eq("2"))).thenReturn(5L);
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":\"2\"}"))
            .andExpect(status().isOk());

        verify(notificationService).notify(eq(5L), eq("TASK_ASSIGNED"), any(), any(), eq("task"), any());
    }

    @Test
    void notifiesAssigneeWhenOtherFieldsChange() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(anyLong())).thenReturn(Optional.of(existingTask()));
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"새 제목\"}"))
            .andExpect(status().isOk());

        // existingTask()의 담당자는 3L
        verify(notificationService).notify(eq(3L), eq("TASK_UPDATED"), any(), any(), eq("task"), any());
    }

    @Test
    void doesNotNotifyWhenNothingChanges() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(anyLong())).thenReturn(Optional.of(existingTask()));
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk());

        verify(notificationService, never()).notify(any(), any(), any(), any(), any(), any());
    }
}
