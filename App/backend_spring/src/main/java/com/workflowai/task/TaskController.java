package com.workflowai.task;

import com.workflowai.common.ApiResponse;
import com.workflowai.common.DemoDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.springframework.http.ResponseEntity;
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
    private final TaskRepository taskRepository;
    private final DemoDataService demoDataService;

    public TaskController(TaskRepository taskRepository, DemoDataService demoDataService) {
        this.taskRepository = taskRepository;
        this.demoDataService = demoDataService;
    }

    @Operation(
        summary = "프로젝트 업무 목록 조회",
        description = "프로젝트에 등록된 업무(Task)를 최신순으로 조회합니다. 회의록 AI가 등록한 업무와 수동 등록 업무를 모두 포함합니다."
    )
    @GetMapping
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

    // TODO: 실제 인증이 도입되면 프로젝트 멤버십/담당자 권한 검사를 여기(생성/수정/상태변경)에 추가해야 한다.
    // 지금은 데모 프로젝트 하나만 존재하고 로그인이 없어 누구나 호출 가능한 상태다.

    @Operation(
        summary = "업무 생성",
        description = "업무보드에서 새 업무를 직접 생성합니다."
    )
    @PostMapping
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

        // TODO: "1"은 로그인한 사용자가 없어 임시로 쓰는 mock 담당자 id다. 실제 인증이 붙으면 로그인 사용자 id로 교체.
        Long createdBy = demoDataService.resolveUserId("1");
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
        return ResponseEntity.ok(ApiResponse.ok(TaskListItem.from(task)));
    }

    @Operation(
        summary = "업무 위치/상태 변경",
        description = "칸반 보드 드래그앤드롭으로 업무의 상태(컬럼)와 그 컬럼 안에서의 순서(position)를 함께 변경합니다."
    )
    @PatchMapping("/{taskId}/position")
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
        task.moveTo(request.status(), request.position());
        taskRepository.save(task);
        return ResponseEntity.ok(ApiResponse.ok(TaskListItem.from(task)));
    }

    @Operation(
        summary = "업무 수정",
        description = "업무의 제목/카테고리/담당자/마감일/우선순위/설명을 부분 수정합니다. null인 필드는 변경하지 않습니다."
    )
    @PatchMapping("/{taskId}")
    public ResponseEntity<ApiResponse<TaskListItem>> updateTask(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody TaskUpdateRequest request
    ) {
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

        task.applyUpdate(
            request.title(),
            request.category(),
            request.assigneeId() == null ? null : demoDataService.resolveUserId(request.assigneeId()),
            dueDate,
            request.priority(),
            request.description()
        );
        taskRepository.save(task);
        return ResponseEntity.ok(ApiResponse.ok(TaskListItem.from(task)));
    }

    @Operation(
        summary = "업무 삭제",
        description = "업무를 영구적으로 삭제합니다."
    )
    @DeleteMapping("/{taskId}")
    public ResponseEntity<ApiResponse<Void>> deleteTask(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId
    ) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null || !task.getProjectId().equals(projectDbId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        taskRepository.delete(task);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    private static LocalDate parseDate(String dueDate) {
        return dueDate == null || dueDate.isBlank() ? null : LocalDate.parse(dueDate);
    }

    private static String defaultString(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
