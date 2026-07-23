package com.workflowai.task;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
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
import com.workflowai.rag.RagIngestService;
import com.workflowai.security.UserPrincipal;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
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

    @Mock
    private RagIngestService ragIngestService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
            .standaloneSetup(new TaskController(
                taskRepository, userRepository, demoDataService, activityService,
                notificationService, projectMemberRepository, ragIngestService
            ))
            .build();
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(
                new UserPrincipal(1L, "user1@workflow.ai", "테스트유저"), null, List.of()
            )
        );
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
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
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"title":"새 제목","category":"backend","assigneeId":"5","dueDate":"2026-08-01","priority":"high","description":"새 설명"}
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
    void rejectsInvalidAssigneeIdFormat() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(anyLong())).thenReturn(Optional.of(existingTask()));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":\"not-a-number\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("INVALID_ASSIGNEE_ID"));

        verify(notificationService, never()).notify(any(), any(), any(), any(), any(), any());
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
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":\"5\"}"))
            .andExpect(status().isOk());

        verify(notificationService).notify(eq(5L), eq("TASK_ASSIGNED"), any(), any(), eq("task"), any());
    }

    @Test
    void syncsRagAssigneeMetadataWhenAssigneeChanges() throws Exception {
        // 담당자가 재배정된 뒤에도 RAG 검색이 옛 담당자에게 계속 걸리지 않도록,
        // 기존 인제스트된 청크의 assignee_id를 동기화하는 호출이 나가야 한다.
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(anyLong())).thenReturn(Optional.of(existingTask()));
        when(taskRepository.save(any(Task.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(patch("/api/v1/projects/demo-project/tasks/42")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"assigneeId\":\"5\"}"))
            .andExpect(status().isOk());

        // existingTask()는 id를 명시적으로 설정하지 않는 픽스처라 getId()가 null이다
        // (Task 생성자의 첫 인자는 projectId). 이 테스트는 task.getId() 값 자체가 아니라
        // syncAssigneeBestEffort가 새 담당자(5L)와 함께 실제로 호출되는지만 검증한다.
        verify(ragIngestService).syncAssigneeBestEffort(eq(1L), eq("task"), isNull(), eq(5L));
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
