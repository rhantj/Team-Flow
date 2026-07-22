package com.workflowai.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.workflowai.task.Task;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

@ExtendWith(MockitoExtension.class)
class ProjectServiceTest {

    @Mock private ProjectRepository projectRepository;
    @Mock private ProjectMemberRepository projectMemberRepository;
    @Mock private UserRepository userRepository;
    @Mock private TaskRepository taskRepository;

    private ProjectService projectService;

    @BeforeEach
    void setUp() {
        TransactionOperations transactionOperations = new TransactionOperations() {
            @Override
            public <T> T execute(TransactionCallback<T> action) throws TransactionException {
                return action.doInTransaction(null);
            }
        };
        projectService = new ProjectService(
            projectRepository,
            projectMemberRepository,
            userRepository,
            taskRepository,
            transactionOperations
        );
    }

    private CreateProjectRequest validRequest() {
        return new CreateProjectRequest(
            "스마트 주차 관리 시스템", "캡스톤디자인", "설명",
            LocalDate.of(2026, 3, 1), LocalDate.of(2026, 7, 18), null,
            6, List.of("발표자료", "보고서"), List.of("Spring Boot", "React"), "MVP 목표"
        );
    }

    @Test
    void create_savesProjectAndRegistersCreatorAsLeader() {
        when(projectRepository.saveAndFlush(any(Project.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(any())).thenReturn(List.of());
        when(projectMemberRepository.countByProjectId(any())).thenReturn(0L);

        ProjectResponse response = projectService.create(1L, validRequest());

        ArgumentCaptor<ProjectMember> memberCaptor = ArgumentCaptor.forClass(ProjectMember.class);
        verify(projectMemberRepository).save(memberCaptor.capture());
        assertThat(memberCaptor.getValue().getUserId()).isEqualTo(1L);
        assertThat(memberCaptor.getValue().getRole()).isEqualTo(ProjectRole.LEADER);
        assertThat(response.title()).isEqualTo("스마트 주차 관리 시스템");
        assertThat(response.inviteCode()).isNotBlank();
    }

    @Test
    void create_missingDeadline_isAllowedForBackwardCompatibility() {
        CreateProjectRequest request = new CreateProjectRequest(
            "제목", "캡스톤디자인", null, null, null, null, null, null, null, null
        );
        when(projectRepository.saveAndFlush(any(Project.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(any())).thenReturn(List.of());
        when(projectMemberRepository.countByProjectId(any())).thenReturn(0L);

        ProjectResponse response = projectService.create(1L, request);

        assertThat(response.deadline()).isNull();
    }

    @Test
    void create_startDateAfterDeadline_throws() {
        CreateProjectRequest request = new CreateProjectRequest(
            "제목", "캡스톤디자인", null,
            LocalDate.of(2026, 8, 1), LocalDate.of(2026, 7, 1), null,
            null, null, null, null
        );

        assertThatThrownBy(() -> projectService.create(1L, request))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void create_memberLimitLessThanOne_throws() {
        CreateProjectRequest request = new CreateProjectRequest(
            "제목", "캡스톤디자인", null, null, LocalDate.of(2026, 7, 1), null,
            0, null, null, null
        );

        assertThatThrownBy(() -> projectService.create(1L, request))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void find_computesMemberCountAndTaskProgressFromRealData() {
        Project project = new Project("제목", "캡스톤디자인", "설명");
        ReflectionTestUtils.setField(project, "id", 10L);
        when(projectRepository.findById(10L)).thenReturn(Optional.of(project));
        when(projectMemberRepository.countByProjectId(10L)).thenReturn(2L);
        Task done = new Task(10L, "a", "frontend", "완료", 1L, null, "medium", null, "MANUAL", null, 1L, 0.0);
        Task notDone = new Task(10L, "b", "frontend", "할 일", 1L, null, "medium", null, "MANUAL", null, 1L, 1.0);
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(any())).thenReturn(List.of(done, notDone));

        ProjectResponse response = projectService.find(10L);

        assertThat(response.memberCount()).isEqualTo(2);
        assertThat(response.taskProgress()).isEqualTo(50);
    }

    @Test
    void find_noTasks_progressIsZero() {
        Project project = new Project("제목", "캡스톤디자인", "설명");
        ReflectionTestUtils.setField(project, "id", 10L);
        when(projectRepository.findById(10L)).thenReturn(Optional.of(project));
        when(projectMemberRepository.countByProjectId(10L)).thenReturn(0L);
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(any())).thenReturn(List.of());

        ProjectResponse response = projectService.find(10L);

        assertThat(response.taskProgress()).isZero();
    }

    @Test
    void joinByCode_addsMemberWithMemberRole() {
        Project project = new Project("제목", "캡스톤디자인", "설명");
        when(projectRepository.findByInviteCode("AB12CD34")).thenReturn(Optional.of(project));
        when(projectMemberRepository.existsByProjectIdAndUserId(any(), any())).thenReturn(false);
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(any())).thenReturn(List.of());
        when(projectMemberRepository.countByProjectId(any())).thenReturn(0L);

        projectService.joinByCode(5L, "ab12cd34");

        ArgumentCaptor<ProjectMember> memberCaptor = ArgumentCaptor.forClass(ProjectMember.class);
        verify(projectMemberRepository).save(memberCaptor.capture());
        assertThat(memberCaptor.getValue().getUserId()).isEqualTo(5L);
        assertThat(memberCaptor.getValue().getRole()).isEqualTo(ProjectRole.MEMBER);
    }

    @Test
    void joinByCode_invalidCode_throws() {
        when(projectRepository.findByInviteCode("BADCODE1")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> projectService.joinByCode(5L, "badcode1"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void create_retriesWhenInviteCodeSaveCollisionOccurs() {
        when(projectRepository.saveAndFlush(any(Project.class)))
            .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint \"uq_projects_invite_code\""))
            .thenAnswer(invocation -> invocation.getArgument(0));
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(any())).thenReturn(List.of());
        when(projectMemberRepository.countByProjectId(any())).thenReturn(0L);

        ProjectResponse response = projectService.create(1L, validRequest());

        assertThat(response.inviteCode()).isNotBlank();
        verify(projectRepository, org.mockito.Mockito.times(2)).saveAndFlush(any(Project.class));
    }
}
