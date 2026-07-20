package dashboard.service;

import com.workflowai.common.DemoDataService;
import com.workflowai.task.Task;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import dashboard.DTO.ActivityItemDto;
import dashboard.DTO.CategoryProgressDto;
import dashboard.DTO.DashboardSummaryResponse;
import dashboard.DTO.MilestoneProgressDto;
import dashboard.DTO.ProgressDetailResponse;
import dashboard.DTO.TaskDelayRiskDto;
import dashboard.DTO.UpcomingTaskDto;
import dashboard.DTO.WorkloadEntryDto;
import dashboard.entity.Activity;
import dashboard.entity.Milestone;
import dashboard.entity.MlPrediction;
import dashboard.repository.DashboardActivityRepository;
import dashboard.repository.MilestoneRepository;
import dashboard.repository.MlPredictionRepository;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {
    private static final Logger log = LoggerFactory.getLogger(DashboardService.class);

    private static final String STATUS_DONE = "done";
    private static final String STATUS_INPROGRESS = "inprogress";
    private static final String STATUS_BLOCKED = "blocked";

    private static final String TARGET_TYPE_TASK = "task";
    private static final String MODEL_TYPE_DELAY_RISK = "delay_risk";
    private static final String RISK_RESULT_NORMAL = "정상";

    private final TaskRepository taskRepository;
    private final MilestoneRepository milestoneRepository;
    private final DashboardActivityRepository activityRepository;
    private final MlPredictionRepository mlPredictionRepository;
    private final UserRepository userRepository;
    private final DemoDataService demoDataService;
    private final FastApiDashboardClient fastApiDashboardClient;

    public DashboardService(
        TaskRepository taskRepository,
        MilestoneRepository milestoneRepository,
        DashboardActivityRepository activityRepository,
        MlPredictionRepository mlPredictionRepository,
        UserRepository userRepository,
        DemoDataService demoDataService,
        FastApiDashboardClient fastApiDashboardClient
    ) {
        this.taskRepository = taskRepository;
        this.milestoneRepository = milestoneRepository;
        this.activityRepository = activityRepository;
        this.mlPredictionRepository = mlPredictionRepository;
        this.userRepository = userRepository;
        this.demoDataService = demoDataService;
        this.fastApiDashboardClient = fastApiDashboardClient;
    }

    public DashboardSummaryResponse getSummary(String projectIdParam) {
        Long projectId = demoDataService.resolveProjectId(projectIdParam);
        List<Task> tasks = taskRepository.findByProjectIdOrderByCreatedAtDesc(projectId);

        long total = tasks.size();
        long done = tasks.stream().filter(t -> STATUS_DONE.equals(t.getStatus())).count();
        long blocked = tasks.stream().filter(t -> STATUS_BLOCKED.equals(t.getStatus())).count();
        long inProgress = tasks.stream().filter(t -> STATUS_INPROGRESS.equals(t.getStatus())).count();
        long progressPercent = total == 0 ? 0 : Math.round(done * 100.0 / total);

        List<UpcomingTaskDto> upcoming = tasks.stream()
            .filter(t -> !STATUS_DONE.equals(t.getStatus()))
            .sorted(Comparator.comparing(Task::getDueDate, Comparator.nullsLast(Comparator.naturalOrder())))
            .limit(5)
            .map(t -> new UpcomingTaskDto(
                String.valueOf(t.getId()),
                t.getTitle(),
                t.getStatus(),
                t.getDueDate() == null ? null : t.getDueDate().toString(),
                resolveUserName(t.getAssigneeId())
            ))
            .toList();

        List<WorkloadEntryDto> workload = buildWorkload(tasks);

        List<ActivityItemDto> recentActivity = activityRepository
            .findTop10ByProjectIdOrderByCreatedAtDesc(projectId)
            .stream()
            .map(this::toActivityItemDto)
            .toList();

        return new DashboardSummaryResponse(total, done, progressPercent, blocked, inProgress, upcoming, workload, recentActivity);
    }

    public ProgressDetailResponse getProgressDetail(String projectIdParam) {
        Long projectId = demoDataService.resolveProjectId(projectIdParam);
        List<Task> tasks = taskRepository.findByProjectIdOrderByCreatedAtDesc(projectId);

        long total = tasks.size();
        long done = tasks.stream().filter(t -> STATUS_DONE.equals(t.getStatus())).count();
        long progressPercent = total == 0 ? 0 : Math.round(done * 100.0 / total);

        List<MilestoneProgressDto> milestones = buildMilestoneProgress(projectId, tasks);
        List<CategoryProgressDto> categoryBreakdown = buildCategoryBreakdown(tasks);

        List<MlPrediction> latestPredictions = latestPredictionsByTarget(projectId);
        boolean hasPredictions = !latestPredictions.isEmpty();

        Map<Long, Task> tasksById = new LinkedHashMap<>();
        tasks.forEach(t -> tasksById.put(t.getId(), t));

        List<TaskDelayRiskDto> delayRisks = latestPredictions.stream()
            .filter(p -> !RISK_RESULT_NORMAL.equals(p.getResult()))
            .map(p -> toDelayRiskDto(p, tasksById.get(p.getTargetId())))
            .filter(java.util.Objects::nonNull)
            .toList();

        return new ProgressDetailResponse(total, done, progressPercent, milestones, categoryBreakdown, delayRisks, hasPredictions);
    }

    /** FastAPI에 재예측을 요청한 뒤(베스트-에포트) 최신 진행률 상세를 반환한다. */
    public ProgressDetailResponse refreshDelayRiskAndGetProgress(String projectIdParam) {
        Long projectId = demoDataService.resolveProjectId(projectIdParam);
        try {
            fastApiDashboardClient.refreshDelayRisk(projectId);
        } catch (Exception e) {
            // FastAPI가 내려가 있어도 대시보드 자체는 계속 떠야 하므로, 여기서 예외를 삼키고
            // ml_predictions에 이미 저장돼 있던 마지막 예측 결과로 계속 진행한다.
            log.warn("지연 위험도 재예측 요청 실패 (project_id={}): {}", projectId, e.getMessage());
        }
        return getProgressDetail(projectIdParam);
    }

    private List<WorkloadEntryDto> buildWorkload(List<Task> tasks) {
        Map<Long, List<Task>> byAssignee = new LinkedHashMap<>();
        for (Task task : tasks) {
            if (task.getAssigneeId() == null) {
                continue;
            }
            byAssignee.computeIfAbsent(task.getAssigneeId(), k -> new ArrayList<>()).add(task);
        }

        List<WorkloadEntryDto> result = new ArrayList<>();
        for (Map.Entry<Long, List<Task>> entry : byAssignee.entrySet()) {
            List<Task> assigneeTasks = entry.getValue();
            long doneCount = assigneeTasks.stream().filter(t -> STATUS_DONE.equals(t.getStatus())).count();
            result.add(new WorkloadEntryDto(
                String.valueOf(entry.getKey()),
                resolveUserName(entry.getKey()),
                assigneeTasks.size(),
                doneCount
            ));
        }
        return result;
    }

    private List<MilestoneProgressDto> buildMilestoneProgress(Long projectId, List<Task> tasks) {
        Map<Long, List<Task>> tasksByMilestone = new LinkedHashMap<>();
        for (Task task : tasks) {
            if (task.getMilestoneId() == null) {
                continue;
            }
            tasksByMilestone.computeIfAbsent(task.getMilestoneId(), k -> new ArrayList<>()).add(task);
        }

        return milestoneRepository.findByProjectIdOrderByDueDateAsc(projectId).stream()
            .map(m -> toMilestoneProgressDto(m, tasksByMilestone.getOrDefault(m.getId(), List.of())))
            .toList();
    }

    private MilestoneProgressDto toMilestoneProgressDto(Milestone milestone, List<Task> linkedTasks) {
        long taskCount = linkedTasks.size();
        long doneCount = linkedTasks.stream().filter(t -> STATUS_DONE.equals(t.getStatus())).count();
        long progressPercent = taskCount == 0 ? 0 : Math.round(doneCount * 100.0 / taskCount);

        String status;
        if (taskCount > 0 && doneCount == taskCount) {
            status = STATUS_DONE;
        } else if (doneCount > 0 || linkedTasks.stream().anyMatch(t -> STATUS_INPROGRESS.equals(t.getStatus()))) {
            status = STATUS_INPROGRESS;
        } else {
            status = "todo";
        }

        return new MilestoneProgressDto(
            String.valueOf(milestone.getId()),
            milestone.getTitle(),
            milestone.getDueDate() == null ? null : milestone.getDueDate().toString(),
            status,
            taskCount,
            doneCount,
            progressPercent
        );
    }

    private List<CategoryProgressDto> buildCategoryBreakdown(List<Task> tasks) {
        Map<String, List<Task>> byCategory = new LinkedHashMap<>();
        for (Task task : tasks) {
            byCategory.computeIfAbsent(task.getCategory(), k -> new ArrayList<>()).add(task);
        }

        List<CategoryProgressDto> result = new ArrayList<>();
        for (Map.Entry<String, List<Task>> entry : byCategory.entrySet()) {
            long doneCount = entry.getValue().stream().filter(t -> STATUS_DONE.equals(t.getStatus())).count();
            result.add(new CategoryProgressDto(entry.getKey(), entry.getValue().size(), doneCount));
        }
        return result;
    }

    /** target_id별로 created_at이 가장 최신인 예측 한 건만 남긴다. */
    private List<MlPrediction> latestPredictionsByTarget(Long projectId) {
        List<MlPrediction> ordered = mlPredictionRepository
            .findByProjectIdAndTargetTypeAndModelTypeOrderByTargetIdAscCreatedAtDesc(
                projectId, TARGET_TYPE_TASK, MODEL_TYPE_DELAY_RISK
            );

        Map<Long, MlPrediction> latestByTarget = new LinkedHashMap<>();
        for (MlPrediction prediction : ordered) {
            latestByTarget.putIfAbsent(prediction.getTargetId(), prediction);
        }
        return new ArrayList<>(latestByTarget.values());
    }

    private TaskDelayRiskDto toDelayRiskDto(MlPrediction prediction, Task task) {
        if (task == null) {
            // 예측 이후 업무가 삭제된 경우 등 - 더 이상 존재하지 않는 업무는 화면에 표시하지 않는다.
            return null;
        }
        Double score = prediction.getScore() == null ? null : prediction.getScore().doubleValue();
        return new TaskDelayRiskDto(
            String.valueOf(task.getId()),
            task.getTitle(),
            resolveUserName(task.getAssigneeId()),
            task.getStatus(),
            task.getDueDate() == null ? null : task.getDueDate().toString(),
            prediction.getResult(),
            score,
            prediction.getCreatedAt() == null ? null : prediction.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    private ActivityItemDto toActivityItemDto(Activity activity) {
        return new ActivityItemDto(
            String.valueOf(activity.getId()),
            activity.getType(),
            resolveUserName(activity.getActorId()),
            activity.getTargetId() == null ? null : String.valueOf(activity.getTargetId()),
            activity.getCreatedAt() == null ? null : activity.getCreatedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        );
    }

    private String resolveUserName(Long userId) {
        if (userId == null) {
            return null;
        }
        return userRepository.findById(userId).map(User::getName).orElse(null);
    }
}
