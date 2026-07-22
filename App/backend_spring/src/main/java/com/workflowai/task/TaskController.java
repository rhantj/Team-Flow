package com.workflowai.task;

import com.workflowai.activity.ActivityService;
import com.workflowai.common.ApiResponse;
import com.workflowai.common.DemoDataService;
import com.workflowai.notification.NotificationService;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRole;
import com.workflowai.security.CurrentUser;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "업무", description = "프로젝트 업무(Task) 조회/생성/수정 API")
@RestController
@RequestMapping("/api/v1/projects/{projectId}/tasks")
public class TaskController {
    private static final Map<String, String> STATUS_LABELS = Map.of(
        "todo", "할 일",
        "inprogress", "진행 중",
        "blocked", "보류/블로커",
        "done", "완료"
    );

    private static final Map<String, String> NUDGE_TITLES = Map.of(
        "START", "업무 시작 알림",
        "PROGRESS", "진행상황 공유 요청",
        "URGENT", "긴급 확인 요청"
    );
    private static final Map<String, String> NUDGE_MESSAGE_TEMPLATES = Map.of(
        "START", "'%s' 업무를 시작해주세요.",
        "PROGRESS", "'%s' 업무의 진행상황을 공유해주세요.",
        "URGENT", "'%s' 업무가 보류 중입니다. 빠른 확인이 필요합니다."
    );

    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final DemoDataService demoDataService;
    private final ActivityService activityService;
    private final NotificationService notificationService;
    private final ProjectMemberRepository projectMemberRepository;

    public TaskController(
        TaskRepository taskRepository,
        UserRepository userRepository,
        DemoDataService demoDataService,
        ActivityService activityService,
        NotificationService notificationService,
        ProjectMemberRepository projectMemberRepository
    ) {
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.demoDataService = demoDataService;
        this.activityService = activityService;
        this.notificationService = notificationService;
        this.projectMemberRepository = projectMemberRepository;
    }

    // TODO: 로그인이 없어 활동 로그의 행위자를 항상 mock 사용자 "1"로 남긴다. 실제 인증이 붙으면 로그인 사용자로 교체.
    private Long currentActorId() {
        return demoDataService.resolveUserId("1");
    }

    private String userName(Long userId) {
        if (userId == null) return "알 수 없음";
        return userRepository.findById(userId).map(User::getName).orElse("알 수 없음");
    }

    @Operation(
        summary = "프로젝트 업무 목록 조회",
        description = "프로젝트에 등록된 업무(Task)를 최신순으로 조회합니다. 회의록 AI가 등록한 업무와 수동 등록 업무를 모두 포함합니다."
    )
    @GetMapping
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ApiResponse<List<TaskListItem>> getTasks(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId
    ) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        List<TaskListItem> tasks = taskRepository.findByProjectIdOrderByStatusAscPositionAsc(projectDbId).stream()
            .map(TaskListItem::from)
            .toList();
        return ApiResponse.ok(tasks);
    }

    /** 해당 프로젝트+상태 컬럼의 맨 끝에 놓일 position(가장 큰 값 + 1, 비어있으면 0). */
    private double nextAppendPosition(Long projectDbId, String status) {
        return taskRepository.findTopByProjectIdAndStatusOrderByPositionDesc(projectDbId, status)
            .map(t -> t.getPosition() + 1)
            .orElse(0.0);
    }

    // DONE: @projectAccess.isMember(#projectId)로 프로젝트 멤버십 검사 적용 완료 (2026-07-18).
    // TODO: createTask/updateTask는 assigneeId를, updatePosition 등은 activity 기록 시 currentActorId()가
    // 항상 mock 사용자 "1"이라 실제 로그인 사용자가 반영되지 않는다. 이 부분은 남은 과제로
    // document_고무서에 별도 기록.

    @Operation(
        summary = "업무 생성",
        description = "업무보드에서 새 업무를 직접 생성합니다."
    )
    @PostMapping
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    @Transactional
    public ResponseEntity<ApiResponse<TaskListItem>> createTask(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @RequestBody TaskCreateRequest request
    ) {
        if (request.title() == null || request.title().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("TITLE_REQUIRED", "업무 제목은 필수입니다."));
        }

        Long projectDbId = demoDataService.resolveProjectId(projectId);
        LocalDate dueDate;
        try {
            dueDate = parseDate(request.dueDate());
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("INVALID_DUE_DATE", "dueDate는 YYYY-MM-DD 형식이어야 합니다."));
        }

        Long createdBy = currentActorId();
        String status = request.status() == null ? "todo" : request.status();
        // category는 DB NOT NULL이라 누락 시 저장 단계에서 예외가 나기 전에 기본값으로 방어한다.
        String category = defaultString(request.category(), "other");
        Task task = taskRepository.save(new Task(
            projectDbId,
            request.title(),
            category,
            status,
            demoDataService.resolveUserId(request.assigneeId()),
            dueDate,
            request.priority(),
            request.description(),
            "MANUAL",
            null,
            createdBy,
            nextAppendPosition(projectDbId, status)
        ));
        activityService.record(projectDbId, createdBy, "TASK_CREATED", task.getId(), "'" + task.getTitle() + "' 업무를 새로 추가했습니다.");
        if (task.getAssigneeId() != null && !task.getAssigneeId().equals(createdBy)) {
            notificationService.notify(
                task.getAssigneeId(), "TASK_ASSIGNED", "새 업무가 배정되었습니다.",
                "'" + task.getTitle() + "' 업무가 배정되었습니다.", "task", task.getId()
            );
        }
        return ResponseEntity.ok(ApiResponse.ok(TaskListItem.from(task)));
    }

    @Operation(
        summary = "업무 위치/상태 변경",
        description = "칸반 보드 드래그앤드롭으로 업무의 상태(컬럼)와 그 컬럼 안에서의 순서(position)를 함께 변경합니다."
    )
    @PatchMapping("/{taskId}/position")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    @Transactional
    public ResponseEntity<ApiResponse<TaskListItem>> updatePosition(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody TaskPositionUpdateRequest request
    ) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null || !task.getProjectId().equals(projectDbId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        Long currentUserId = CurrentUser.id();
        if (!isLeader(projectDbId, currentUserId) && !currentUserId.equals(task.getAssigneeId())) {
            return ResponseEntity.status(403).body(ApiResponse.fail("FORBIDDEN_NOT_OWNER", "본인이 담당자인 업무만 이동할 수 있습니다."));
        }
        String previousStatus = task.getStatus();
        task.moveTo(request.status(), request.position());
        taskRepository.save(task);
        if (!previousStatus.equals(task.getStatus())) {
            String label = STATUS_LABELS.getOrDefault(task.getStatus(), task.getStatus());
            Long moveActorId = currentActorId();
            activityService.record(
                projectDbId, moveActorId, "STATUS_CHANGED", task.getId(),
                "'" + task.getTitle() + "' 상태를 '" + label + "'(으)로 변경했습니다."
            );
            String notificationContent = "'" + task.getTitle() + "' 업무가 '" + label + "'(으)로 이동했습니다.";
            if (task.getAssigneeId() != null && !task.getAssigneeId().equals(moveActorId)) {
                notificationService.notify(
                    task.getAssigneeId(), "STATUS_CHANGED", "담당 업무 상태가 변경되었습니다.",
                    notificationContent, "task", task.getId()
                );
            }
            projectMemberRepository.findAllByProjectId(projectDbId).stream()
                .filter(member -> member.getRole() == ProjectRole.LEADER)
                .map(com.workflowai.project.ProjectMember::getUserId)
                .filter(leaderId -> !leaderId.equals(moveActorId))
                .filter(leaderId -> !leaderId.equals(task.getAssigneeId()))
                .forEach(leaderId -> notificationService.notify(
                    leaderId, "STATUS_CHANGED", "업무 상태가 변경되었습니다.",
                    notificationContent, "task", task.getId()
                ));
        }
        return ResponseEntity.ok(ApiResponse.ok(TaskListItem.from(task)));
    }

    @Operation(
        summary = "업무 수정",
        description = "업무의 제목/카테고리/담당자/마감일/우선순위/설명을 부분 수정합니다. null인 필드는 변경하지 않습니다."
    )
    @PatchMapping("/{taskId}")
    @PreAuthorize("@projectAccess.hasRole(#projectId, 'LEADER')")
    @Transactional
    public ResponseEntity<ApiResponse<TaskListItem>> updateTask(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody TaskUpdateRequest request
    ) {
        if (request.title() != null && request.title().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("TITLE_REQUIRED", "업무 제목은 비워둘 수 없습니다."));
        }

        Long projectDbId = demoDataService.resolveProjectId(projectId);
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null || !task.getProjectId().equals(projectDbId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }

        LocalDate dueDate;
        try {
            dueDate = parseDate(request.dueDate());
        } catch (DateTimeParseException e) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("INVALID_DUE_DATE", "dueDate는 YYYY-MM-DD 형식이어야 합니다."));
        }

        String titleBefore = task.getTitle();
        String categoryBefore = task.getCategory();
        Long assigneeBefore = task.getAssigneeId();
        LocalDate dueDateBefore = task.getDueDate();
        String priorityBefore = task.getPriority();
        String descriptionBefore = task.getDescription();

        Long newAssigneeId = request.assigneeId() == null ? null : demoDataService.resolveUserId(request.assigneeId());
        task.applyUpdate(request.title(), request.category(), newAssigneeId, dueDate, request.priority(), request.description());
        taskRepository.save(task);

        Long actorId = currentActorId();
        boolean assigneeChanged = !Objects.equals(assigneeBefore, task.getAssigneeId());
        boolean otherFieldsChanged = !Objects.equals(titleBefore, task.getTitle())
            || !Objects.equals(categoryBefore, task.getCategory())
            || !Objects.equals(dueDateBefore, task.getDueDate())
            || !Objects.equals(priorityBefore, task.getPriority())
            || !Objects.equals(descriptionBefore, task.getDescription());
        if (assigneeChanged) {
            activityService.record(
                projectDbId, actorId, "ASSIGNEE_CHANGED", task.getId(),
                "담당자를 '" + userName(task.getAssigneeId()) + "'(으)로 변경했습니다."
            );
            if (task.getAssigneeId() != null && !task.getAssigneeId().equals(actorId)) {
                notificationService.notify(
                    task.getAssigneeId(), "TASK_ASSIGNED", "업무 담당자로 지정되었습니다.",
                    "'" + task.getTitle() + "' 업무 담당자로 지정되었습니다.", "task", task.getId()
                );
            }
        }
        if (otherFieldsChanged) {
            activityService.record(projectDbId, actorId, "TASK_UPDATED", task.getId(), "'" + task.getTitle() + "' 업무 정보를 수정했습니다.");
            if (task.getAssigneeId() != null && !task.getAssigneeId().equals(actorId)) {
                notificationService.notify(
                    task.getAssigneeId(), "TASK_UPDATED", "담당 업무 정보가 수정되었습니다.",
                    "'" + task.getTitle() + "' 업무 정보가 수정되었습니다.", "task", task.getId()
                );
            }
        }
        return ResponseEntity.ok(ApiResponse.ok(TaskListItem.from(task)));
    }

    @Operation(
        summary = "업무 삭제",
        description = "업무를 영구적으로 삭제합니다."
    )
    @DeleteMapping("/{taskId}")
    @PreAuthorize("@projectAccess.hasRole(#projectId, 'LEADER')")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> deleteTask(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId
    ) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null || !task.getProjectId().equals(projectDbId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        // 삭제되면 상세 화면이 바로 닫혀서 이 업무 자체의 피드에는 안 보이지만, 프로젝트 전체 활동 로그를 위해 남겨둔다.
        Long deleteActorId = currentActorId();
        activityService.record(projectDbId, deleteActorId, "TASK_DELETED", task.getId(), "'" + task.getTitle() + "' 업무를 삭제했습니다.");
        if (task.getAssigneeId() != null && !task.getAssigneeId().equals(deleteActorId)) {
            // targetId가 가리키는 업무는 이 트랜잭션이 끝나면 더 이상 존재하지 않는다 — 의도된 동작이다.
            // 삭제 알림은 targetId로 업무를 다시 조회하지 않고 title을 메시지에 그대로 박아 보여주므로,
            // 대상이 사라져도 알림 내용 자체는 그대로 유효하다.
            notificationService.notify(
                task.getAssigneeId(), "TASK_DELETED", "담당 업무가 삭제되었습니다.",
                "'" + task.getTitle() + "' 업무가 삭제되었습니다.", "task", task.getId()
            );
        }
        taskRepository.delete(task);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @Operation(
        summary = "업무 알림(넛지) 보내기",
        description = "담당자에게 정형화된 메시지(업무 시작/진행상황 공유/긴급 확인)를 알림으로 보냅니다."
    )
    @PostMapping("/{taskId}/nudge")
    @PreAuthorize("@projectAccess.hasRole(#projectId, 'LEADER')")
    public ResponseEntity<ApiResponse<Void>> sendNudge(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody NudgeRequest request
    ) {
        String messageTemplate = NUDGE_MESSAGE_TEMPLATES.get(request.kind());
        if (messageTemplate == null) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("INVALID_NUDGE_KIND", "알 수 없는 알림 종류입니다."));
        }
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null || !task.getProjectId().equals(projectDbId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        Long actorId = CurrentUser.id();
        if (task.getAssigneeId() != null && !task.getAssigneeId().equals(actorId)) {
            notificationService.notify(
                task.getAssigneeId(), "TASK_NUDGE", NUDGE_TITLES.get(request.kind()),
                String.format(messageTemplate, task.getTitle()), "task", task.getId()
            );
        }
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    private boolean isLeader(Long projectId, Long userId) {
        return projectMemberRepository.findByProjectIdAndUserId(projectId, userId)
            .map(member -> member.getRole() == ProjectRole.LEADER)
            .orElse(false);
    }

    private static LocalDate parseDate(String dueDate) {
        return dueDate == null || dueDate.isBlank() ? null : LocalDate.parse(dueDate);
    }

    private static String defaultString(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
