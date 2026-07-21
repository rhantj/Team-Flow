package com.workflowai.task;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.common.DemoDataService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(TaskResultController.class)
@AutoConfigureMockMvc(addFilters = false)
class TaskResultControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskResultRepository taskResultRepository;

    @MockitoBean
    private TaskResultLinkRepository taskResultLinkRepository;

    @MockitoBean
    private TaskResultFileRepository taskResultFileRepository;

    @MockitoBean
    private TaskRepository taskRepository;

    @MockitoBean
    private DemoDataService demoDataService;

    @MockitoBean
    private SupabaseStorageClient storageClient;

    private Task taskWithAssignee(Long assigneeId) {
        return new Task(
            1L, "API 명세 확정", "backend", "inprogress", assigneeId,
            LocalDate.of(2026, 7, 1), "high", "설명",
            "MANUAL", null, 1L, 0.0
        );
    }

    @Test
    void getResultReturnsEmptyWhenNoneSaved() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));
        when(taskResultRepository.findByTaskId(42L)).thenReturn(Optional.empty());
        when(taskResultLinkRepository.findByTaskIdOrderByCreatedAtAsc(42L)).thenReturn(List.of());
        when(taskResultFileRepository.findByTaskIdOrderByCreatedAtAsc(42L)).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/projects/demo-project/tasks/42/result"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.content").value(""))
            .andExpect(jsonPath("$.data.updatedAt").doesNotExist());
    }

    @Test
    void returnsNotFoundWhenTaskMissing() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(999L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/projects/demo-project/tasks/999/result"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("TASK_NOT_FOUND"));
    }

    @Test
    void assigneeCanSaveContent() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));
        when(taskResultRepository.findByTaskId(42L)).thenReturn(Optional.empty());
        when(taskResultRepository.save(any(TaskResult.class))).thenAnswer(inv -> inv.getArgument(0));
        when(taskResultLinkRepository.findByTaskIdOrderByCreatedAtAsc(42L)).thenReturn(List.of());
        when(taskResultFileRepository.findByTaskIdOrderByCreatedAtAsc(42L)).thenReturn(List.of());

        mockMvc.perform(put("/api/v1/projects/demo-project/tasks/42/result")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":5,"content":"API 명세 초안을 작성했습니다."}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.content").value("API 명세 초안을 작성했습니다."));
    }

    @Test
    void nonAssigneeCannotSaveContent() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));

        mockMvc.perform(put("/api/v1/projects/demo-project/tasks/42/result")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":9,"content":"제가 대신 씁니다"}
                    """))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN_NOT_ASSIGNEE"));

        verify(taskResultRepository, never()).save(any());
    }

    @Test
    void assigneeCanAddLink() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));
        when(taskResultLinkRepository.save(any(TaskResultLink.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/result/links")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":5,"url":"https://github.com/teamflow-ai/backend/pull/42","title":"PR #42"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.title").value("PR #42"))
            .andExpect(jsonPath("$.data.url").value("https://github.com/teamflow-ai/backend/pull/42"));
    }

    @Test
    void nonAssigneeCannotAddLink() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/result/links")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"userId":9,"url":"https://github.com/x/y","title":"제목"}
                    """))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN_NOT_ASSIGNEE"));

        verify(taskResultLinkRepository, never()).save(any());
    }

    @Test
    void assigneeCanDeleteLink() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));
        when(taskResultLinkRepository.findById(7L)).thenReturn(Optional.of(new TaskResultLink(42L, "https://x.com", "제목")));

        mockMvc.perform(delete("/api/v1/projects/demo-project/tasks/42/result/links/7").param("userId", "5"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void assigneeCanUploadFile() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));
        when(taskResultFileRepository.save(any(TaskResultFile.class))).thenAnswer(inv -> inv.getArgument(0));
        MockMultipartFile file = new MockMultipartFile("file", "meeting_result.pdf", "application/pdf", "hello".getBytes());

        mockMvc.perform(multipart("/api/v1/projects/demo-project/tasks/42/result/files")
                .file(file)
                .param("userId", "5"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.fileName").value("meeting_result.pdf"));

        verify(storageClient).upload(anyString(), any(byte[].class), eq("application/pdf"));
    }

    @Test
    void nonAssigneeCannotUploadFile() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));
        MockMultipartFile file = new MockMultipartFile("file", "meeting_result.pdf", "application/pdf", "hello".getBytes());

        mockMvc.perform(multipart("/api/v1/projects/demo-project/tasks/42/result/files")
                .file(file)
                .param("userId", "9"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN_NOT_ASSIGNEE"));

        verify(storageClient, never()).upload(anyString(), any(byte[].class), any());
    }

    @Test
    void getFileUrlRequestsSignedUrlWithOriginalFileNameForDownload() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(taskWithAssignee(5L)));
        TaskResultFile file = new TaskResultFile(42L, "meeting_result.pdf", "tasks/42/uuid-meeting_result.pdf", 2048, "application/pdf", 5L);
        when(taskResultFileRepository.findById(9L)).thenReturn(Optional.of(file));
        when(storageClient.createSignedUrl("tasks/42/uuid-meeting_result.pdf", 3600, "meeting_result.pdf"))
            .thenReturn("https://signed.example.com/meeting_result.pdf?download=meeting_result.pdf");

        mockMvc.perform(get("/api/v1/projects/demo-project/tasks/42/result/files/9/url"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data").value("https://signed.example.com/meeting_result.pdf?download=meeting_result.pdf"));
    }
}
