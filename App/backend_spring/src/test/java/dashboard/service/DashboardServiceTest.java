package dashboard.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.workflowai.activity.ActivityRepository;
import com.workflowai.common.DemoDataService;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.task.Task;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.UserRepository;
import dashboard.DTO.DashboardTaskDto;
import dashboard.DTO.DelayRiskDto;
import dashboard.entity.MlPrediction;
import dashboard.repository.MilestoneRepository;
import dashboard.repository.MlPredictionRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    @Mock private TaskRepository taskRepository;
    @Mock private MilestoneRepository milestoneRepository;
    @Mock private ActivityRepository activityRepository;
    @Mock private MlPredictionRepository mlPredictionRepository;
    @Mock private UserRepository userRepository;
    @Mock private ProjectMemberRepository projectMemberRepository;
    @Mock private DemoDataService demoDataService;
    @Mock private FastApiDashboardClient fastApiDashboardClient;

    private DashboardService newService() {
        return new DashboardService(
            taskRepository, milestoneRepository, activityRepository, mlPredictionRepository,
            userRepository, projectMemberRepository, demoDataService, fastApiDashboardClient
        );
    }

    private Task taskWithId(Long id, Long assigneeId) {
        Task task = new Task(
            1L, "제목 " + id, "backend", "inprogress", assigneeId,
            LocalDate.of(2026, 8, 1), "medium", "설명",
            "MANUAL", null, 1L, 0.0
        );
        ReflectionTestUtils.setField(task, "id", id);
        return task;
    }

    private MlPrediction predictionFor(Long taskId, String result) {
        MlPrediction prediction = newMlPrediction();
        ReflectionTestUtils.setField(prediction, "targetId", taskId);
        ReflectionTestUtils.setField(prediction, "result", result);
        ReflectionTestUtils.setField(prediction, "score", new BigDecimal("0.80"));
        ReflectionTestUtils.setField(prediction, "createdAt", LocalDateTime.of(2026, 7, 20, 9, 0));
        return prediction;
    }

    private MlPrediction newMlPrediction() {
        try {
            var constructor = MlPrediction.class.getDeclaredConstructor();
            constructor.setAccessible(true);
            return constructor.newInstance();
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void getMyDelayRisksReturnsOnlyTasksAssignedToGivenUser() {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        Task myTask = taskWithId(10L, 5L);
        Task otherTask = taskWithId(11L, 6L);
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(myTask, otherTask));
        when(mlPredictionRepository.findByProjectIdAndTargetTypeAndModelTypeOrderByTargetIdAscCreatedAtDesc(
            eq(1L), eq("task"), eq("delay_risk")
        )).thenReturn(List.of(predictionFor(10L, "위험"), predictionFor(11L, "위험")));

        List<DelayRiskDto> result = newService().getMyDelayRisks("demo-project", 5L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).taskId()).isEqualTo("10");
    }

    @Test
    void getMyDelayRisksExcludesNormalResult() {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        Task myTask = taskWithId(10L, 5L);
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(myTask));
        when(mlPredictionRepository.findByProjectIdAndTargetTypeAndModelTypeOrderByTargetIdAscCreatedAtDesc(
            eq(1L), eq("task"), eq("delay_risk")
        )).thenReturn(List.of(predictionFor(10L, "정상")));

        List<DelayRiskDto> result = newService().getMyDelayRisks("demo-project", 5L);

        assertThat(result).isEmpty();
    }

    @Test
    void getMyDelayRisksSkipsUnassignedTasks() {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        Task unassigned = taskWithId(10L, null);
        when(taskRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(unassigned));
        when(mlPredictionRepository.findByProjectIdAndTargetTypeAndModelTypeOrderByTargetIdAscCreatedAtDesc(
            eq(1L), eq("task"), eq("delay_risk")
        )).thenReturn(List.of(predictionFor(10L, "위험")));

        List<DelayRiskDto> result = newService().getMyDelayRisks("demo-project", 5L);

        assertThat(result).isEmpty();
    }

    @Test
    void getTasksIncludesCreatedAtAndUpdatedAt() {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        Task task = taskWithId(10L, 5L);
        ReflectionTestUtils.setField(task, "createdAt", LocalDateTime.of(2026, 7, 1, 9, 0));
        ReflectionTestUtils.setField(task, "updatedAt", LocalDateTime.of(2026, 7, 19, 15, 30));
        when(taskRepository.findByProjectIdOrderByStatusAscPositionAsc(1L)).thenReturn(List.of(task));

        List<DashboardTaskDto> result = newService().getTasks("demo-project");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).createdAt()).isEqualTo("2026-07-01T09:00:00");
        assertThat(result.get(0).updatedAt()).isEqualTo("2026-07-19T15:30:00");
    }
}
