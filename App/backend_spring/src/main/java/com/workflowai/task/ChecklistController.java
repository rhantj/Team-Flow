package com.workflowai.task;

import com.workflowai.activity.ActivityService;
import com.workflowai.common.ApiResponse;
import com.workflowai.common.DemoDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// DONE: @projectAccess.isMember(#projectId)로 프로젝트 멤버십 검사 적용 완료 (2026-07-18).
// TODO: currentActorId()가 항상 mock 사용자 "1"이라 실제 로그인 사용자가 활동 로그에 반영되지 않는다.
// 남은 과제는 document_고무서에 별도 기록.
@Tag(name = "업무 체크리스트", description = "업무 안 체크리스트 항목 조회/생성/수정/삭제 API")
@RestController
@RequestMapping("/api/v1/projects/{projectId}/tasks/{taskId}/checklists")
public class ChecklistController {
    private final ChecklistRepository checklistRepository;
    private final TaskRepository taskRepository;
    private final DemoDataService demoDataService;
    private final ActivityService activityService;
    private final ChecklistAiService checklistAiService;
    private final ChecklistApplyService checklistApplyService;
    // 업무 ID를 고정 개수 버킷에 매핑한 스트라이프 락. 같은 업무 동시 저장 시 조회-후-저장 경합으로
    // 중복 저장되는 것을 막으면서, 업무 수에 비례해 락 객체가 무한 증가하지 않도록 상한을 둔다(단일 인스턴스 기준).
    private static final int APPLY_LOCK_STRIPES = 64;
    private final Object[] applyLocks = new Object[APPLY_LOCK_STRIPES];

    public ChecklistController(
        ChecklistRepository checklistRepository,
        TaskRepository taskRepository,
        DemoDataService demoDataService,
        ActivityService activityService,
        ChecklistAiService checklistAiService,
        ChecklistApplyService checklistApplyService
    ) {
        this.checklistRepository = checklistRepository;
        this.taskRepository = taskRepository;
        this.demoDataService = demoDataService;
        this.activityService = activityService;
        this.checklistAiService = checklistAiService;
        this.checklistApplyService = checklistApplyService;
        for (int i = 0; i < APPLY_LOCK_STRIPES; i++) {
            this.applyLocks[i] = new Object();
        }
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
    @PreAuthorize("@projectAccess.isMember(#projectId)")
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
    @PreAuthorize("@projectAccess.isMember(#projectId)")
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

    @Operation(summary = "체크리스트 AI 미리보기", description = "업무 정보를 바탕으로 AI가 체크리스트 항목을 제안합니다. 저장하지 않습니다.")
    @PostMapping("/generate-preview")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<ChecklistPreviewDto>> generatePreview(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId
    ) {
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        List<String> existingTitles = checklistRepository.findByTaskIdOrderByCreatedAtAsc(taskId).stream()
            .map(Checklist::getTitle).toList();
        ChecklistPreviewResult result = checklistAiService.generatePreview(task, existingTitles);
        return ResponseEntity.ok(ApiResponse.ok(new ChecklistPreviewDto(result.titles(), result.engine())));
    }

    @Operation(summary = "체크리스트 AI 결과 적용", description = "미리보기에서 확정한 항목을 기존 체크리스트 뒤에 저장합니다.")
    @PostMapping("/apply-generated")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<List<ChecklistItemDto>>> applyGenerated(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody ChecklistApplyRequest request
    ) {
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        List<String> requestedTitles = request == null ? null : request.titles();
        List<Checklist> saved;
        // 커밋까지 락 안에서 이뤄지도록, 트랜잭션 경계를 가진 서비스 호출을 락으로 감싼다.
        synchronized (applyLocks[(int) Math.floorMod(taskId, APPLY_LOCK_STRIPES)]) {
            saved = checklistApplyService.saveGenerated(taskId, requestedTitles);
        }
        if (saved.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("NO_ITEMS", "저장할 체크리스트 항목이 없습니다."));
        }
        activityService.record(
            task.getProjectId(), currentActorId(), "CHECKLIST_CREATED", taskId,
            "AI 체크리스트 " + saved.size() + "개를 추가했습니다."
        );
        List<ChecklistItemDto> dtos = saved.stream().map(ChecklistItemDto::from).toList();
        return ResponseEntity.ok(ApiResponse.ok(dtos));
    }

    @Operation(summary = "체크리스트 항목 수정", description = "체크리스트 항목의 내용 또는 완료 여부를 부분 수정합니다.")
    @PatchMapping("/{checklistId}")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
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
    @PreAuthorize("@projectAccess.isMember(#projectId)")
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
