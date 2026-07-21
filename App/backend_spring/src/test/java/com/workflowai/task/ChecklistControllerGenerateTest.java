package com.workflowai.task;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.activity.ActivityService;
import com.workflowai.common.DemoDataService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ChecklistController.class)
@AutoConfigureMockMvc(addFilters = false)
class ChecklistControllerGenerateTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ChecklistRepository checklistRepository;

    @MockitoBean
    private TaskRepository taskRepository;

    @MockitoBean
    private DemoDataService demoDataService;

    @MockitoBean
    private ActivityService activityService;

    @MockitoBean
    private ChecklistGenerator checklistGenerator;

    private Task existingTask() {
        return new Task(
            1L, "백엔드 로그인 API", "backend", "todo", 3L,
            LocalDate.of(2026, 7, 1), "medium", "로그인 성공/실패 케이스를 모두 처리한다.",
            "MANUAL", null, 1L, 0.0
        );
    }

    @Test
    void generatesChecklistItemsAndAppendsToExisting() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(existingTask()));
        when(demoDataService.resolveUserId("1")).thenReturn(1L);
        when(checklistGenerator.generate(any(Task.class)))
            .thenReturn(List.of("API 명세 확정", "단위 테스트 작성"));
        when(checklistRepository.save(any(Checklist.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/checklists/generate"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.length()").value(2))
            .andExpect(jsonPath("$.data[0].title").value("API 명세 확정"))
            .andExpect(jsonPath("$.data[0].done").value(false))
            .andExpect(jsonPath("$.data[1].title").value("단위 테스트 작성"));

        verify(activityService).record(eq(1L), any(), eq("CHECKLIST_CREATED"), eq(42L), eq("체크리스트 2개를 자동 생성했습니다."));
    }

    @Test
    void skipsTitlesThatAlreadyExistOnRepeatedGeneration() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(existingTask()));
        when(demoDataService.resolveUserId("1")).thenReturn(1L);
        when(checklistGenerator.generate(any(Task.class)))
            .thenReturn(List.of("API 명세 확정", "단위 테스트 작성"));
        when(checklistRepository.findByTaskIdOrderByCreatedAtAsc(42L))
            .thenReturn(List.of(new Checklist(42L, "API 명세 확정")));
        when(checklistRepository.save(any(Checklist.class))).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/checklists/generate"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.length()").value(1))
            .andExpect(jsonPath("$.data[0].title").value("단위 테스트 작성"));

        verify(checklistRepository, never()).save(argThat(c -> c.getTitle().equals("API 명세 확정")));
    }

    @Test
    void returnsNotFoundWhenTaskMissing() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(999L)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/999/checklists/generate"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("TASK_NOT_FOUND"));
    }
}
