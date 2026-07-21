package com.workflowai.task;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.workflowai.common.DemoDataService;
import com.workflowai.project.ProjectMember;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRole;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(TaskCommentController.class)
@AutoConfigureMockMvc(addFilters = false)
class TaskCommentControllerFeedbackTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TaskCommentRepository taskCommentRepository;

    @MockitoBean
    private TaskRepository taskRepository;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private DemoDataService demoDataService;

    @MockitoBean
    private ProjectMemberRepository projectMemberRepository;

    private Task existingTask() {
        return new Task(
            1L, "로그인 API 구현", "backend", "done", 1L,
            LocalDate.of(2026, 7, 1), "high", "설명",
            "MANUAL", null, 1L, 0.0
        );
    }

    @Test
    void leaderCanPostFeedback() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(existingTask()));
        when(demoDataService.resolveUserId("1")).thenReturn(100L);
        when(projectMemberRepository.findByProjectIdAndUserId(1L, 100L))
            .thenReturn(Optional.of(new ProjectMember(1L, 100L, ProjectRole.LEADER)));
        when(taskCommentRepository.save(any(TaskComment.class)))
            .thenAnswer(inv -> inv.getArgument(0));
        when(userRepository.findById(100L))
            .thenReturn(Optional.of(new User("leader@workflow.ai", "김민준", "demo", "1")));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/comments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"authorId":"1","content":"화면 반응형 처리 다시 확인해주세요","type":"FEEDBACK"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.type").value("FEEDBACK"));
    }

    @Test
    void nonLeaderCannotPostFeedback() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(existingTask()));
        when(demoDataService.resolveUserId("2")).thenReturn(200L);
        when(projectMemberRepository.findByProjectIdAndUserId(1L, 200L))
            .thenReturn(Optional.of(new ProjectMember(1L, 200L, ProjectRole.MEMBER)));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/comments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"authorId":"2","content":"제가 피드백 남길게요","type":"FEEDBACK"}
                    """))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN_NOT_LEADER"));
    }

    @Test
    void nonMemberCannotPostFeedback() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(existingTask()));
        when(demoDataService.resolveUserId("3")).thenReturn(300L);
        when(projectMemberRepository.findByProjectIdAndUserId(1L, 300L))
            .thenReturn(Optional.empty());

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/comments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"authorId":"3","content":"피드백입니다","type":"FEEDBACK"}
                    """))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN_NOT_LEADER"));
    }

    @Test
    void defaultsToCommentTypeWhenOmitted() throws Exception {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(taskRepository.findById(42L)).thenReturn(Optional.of(existingTask()));
        when(demoDataService.resolveUserId("2")).thenReturn(200L);
        when(taskCommentRepository.save(any(TaskComment.class)))
            .thenAnswer(inv -> inv.getArgument(0));
        when(userRepository.findById(200L))
            .thenReturn(Optional.of(new User("member@workflow.ai", "이서연", "demo", "2")));

        mockMvc.perform(post("/api/v1/projects/demo-project/tasks/42/comments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"authorId":"2","content":"확인했습니다"}
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.type").value("COMMENT"));
    }
}
