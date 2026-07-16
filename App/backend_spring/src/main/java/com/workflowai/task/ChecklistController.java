package com.workflowai.task;

import com.workflowai.activity.ActivityService;
import com.workflowai.common.ApiResponse;
import com.workflowai.common.DemoDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
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

// TODO: 실제 인증이 도입되면 프로젝트 멤버십/담당자 권한 검사를 여기에도 추가해야 한다(TaskController와 동일한 상태).
@Tag(name = "업무 체크리스트", description = "업무 안 체크리스트 항목 조회/생성/수정/삭제 API")
@RestController
@RequestMapping("/api/v1/projects/{projectId}/tasks/{taskId}/checklists")
public class ChecklistController {
    private final ChecklistRepository checklistRepository;
    private final TaskRepository taskRepository;
    private final DemoDataService demoDataService;
    private final ActivityService activityService;

    public ChecklistController(
        ChecklistRepository checklistRepository,
        TaskRepository taskRepository,
        DemoDataService demoDataService,
        ActivityService activityService
    ) {
        this.checklistRepository = checklistRepository;
        this.taskRepository = taskRepository;
        this.demoDataService = demoDataService;
        this.activityService = activityService;
    }

    private Task resolveTaskOrNull(String projectId, Long taskId) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null || !task.getProjectId().equals(projectDbId)) {
            return null;
        }
        return task;
    }

    // TODO: 로그인이 없어 활동 로그의 행위자를 항상 mock 사용자 "1"로 남긴다. 실제 인증이 붙으면 로그인 사용자로 교체.
    private Long currentActorId() {
        return demoDataService.resolveUserId("1");
    }

    @Operation(summary = "체크리스트 조회", description = "업무에 등록된 체크리스트 항목을 등록 순서대로 조회합니다.")
    @GetMapping
    public ResponseEntity<ApiResponse<List<ChecklistItemDto>>> getChecklist(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId
    ) {
        if (resolveTaskOrNull(projectId, taskId) == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        List<ChecklistItemDto> items = checklistRepository.findByTaskIdOrderByCreatedAtAsc(taskId).stream()
            .map(ChecklistItemDto::from)
            .toList();
        return ResponseEntity.ok(ApiResponse.ok(items));
    }

    @Operation(summary = "체크리스트 항목 생성", description = "업무에 새 체크리스트 항목을 추가합니다.")
    @PostMapping
    public ResponseEntity<ApiResponse<ChecklistItemDto>> createChecklistItem(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody ChecklistCreateRequest request
    ) {
        if (request.title() == null || request.title().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("TITLE_REQUIRED", "체크리스트 내용은 필수입니다."));
        }
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        Checklist checklist = checklistRepository.save(new Checklist(taskId, request.title()));
        activityService.record(
            task.getProjectId(), currentActorId(), "CHECKLIST_CREATED", taskId,
            "체크리스트 '" + checklist.getTitle() + "'을(를) 추가했습니다."
        );
        return ResponseEntity.ok(ApiResponse.ok(ChecklistItemDto.from(checklist)));
    }

    @Operation(summary = "체크리스트 항목 수정", description = "체크리스트 항목의 내용 또는 완료 여부를 부분 수정합니다.")
    @PatchMapping("/{checklistId}")
    public ResponseEntity<ApiResponse<ChecklistItemDto>> updateChecklistItem(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @Parameter(description = "체크리스트 항목 ID") @PathVariable Long checklistId,
        @RequestBody ChecklistUpdateRequest request
    ) {
        if (request.title() != null && request.title().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("TITLE_REQUIRED", "체크리스트 내용은 비워둘 수 없습니다."));
        }
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        Checklist checklist = checklistRepository.findById(checklistId).orElse(null);
        if (checklist == null || !checklist.getTaskId().equals(taskId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("CHECKLIST_NOT_FOUND", "체크리스트 항목을 찾을 수 없습니다."));
        }
        boolean wasDone = checklist.isDone();
        checklist.applyUpdate(request.title(), request.done());
        checklistRepository.save(checklist);
        if (!wasDone && checklist.isDone()) {
            activityService.record(
                task.getProjectId(), currentActorId(), "CHECKLIST_COMPLETED", taskId,
                "체크리스트 '" + checklist.getTitle() + "'을(를) 완료했습니다."
            );
        }
        return ResponseEntity.ok(ApiResponse.ok(ChecklistItemDto.from(checklist)));
    }

    @Operation(summary = "체크리스트 항목 삭제", description = "체크리스트 항목을 삭제합니다.")
    @DeleteMapping("/{checklistId}")
    public ResponseEntity<ApiResponse<Void>> deleteChecklistItem(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @Parameter(description = "체크리스트 항목 ID") @PathVariable Long checklistId
    ) {
        if (resolveTaskOrNull(projectId, taskId) == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        Checklist checklist = checklistRepository.findById(checklistId).orElse(null);
        if (checklist == null || !checklist.getTaskId().equals(taskId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("CHECKLIST_NOT_FOUND", "체크리스트 항목을 찾을 수 없습니다."));
        }
        checklistRepository.delete(checklist);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
