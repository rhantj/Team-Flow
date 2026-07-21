package com.workflowai.task;

import com.workflowai.common.ApiResponse;
import com.workflowai.common.DemoDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

// TODO: 실제 인증이 도입되면 userId를 요청 바디 대신 인증 컨텍스트에서 가져와야 한다.
@Tag(name = "업무 작업 내용", description = "업무 상세의 \"작업 내용 작성\" 패널(내용/링크/첨부파일) API. 담당자만 쓸 수 있다.")
@RestController
@RequestMapping("/api/v1/projects/{projectId}/tasks/{taskId}/result")
public class TaskResultController {
    private static final Logger log = LoggerFactory.getLogger(TaskResultController.class);
    private static final int SIGNED_URL_EXPIRES_SECONDS = 3600;

    private final TaskResultRepository taskResultRepository;
    private final TaskResultLinkRepository taskResultLinkRepository;
    private final TaskResultFileRepository taskResultFileRepository;
    private final TaskRepository taskRepository;
    private final DemoDataService demoDataService;
    private final SupabaseStorageClient storageClient;

    public TaskResultController(
        TaskResultRepository taskResultRepository,
        TaskResultLinkRepository taskResultLinkRepository,
        TaskResultFileRepository taskResultFileRepository,
        TaskRepository taskRepository,
        DemoDataService demoDataService,
        SupabaseStorageClient storageClient
    ) {
        this.taskResultRepository = taskResultRepository;
        this.taskResultLinkRepository = taskResultLinkRepository;
        this.taskResultFileRepository = taskResultFileRepository;
        this.taskRepository = taskRepository;
        this.demoDataService = demoDataService;
        this.storageClient = storageClient;
    }

    private Task resolveTaskOrNull(String projectId, Long taskId) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null || !task.getProjectId().equals(projectDbId)) {
            return null;
        }
        return task;
    }

    private boolean isAssignee(Task task, Long userId) {
        return userId != null && task.getAssigneeId() != null && task.getAssigneeId().equals(userId);
    }

    private List<TaskResultLinkDto> links(Long taskId) {
        return taskResultLinkRepository.findByTaskIdOrderByCreatedAtAsc(taskId).stream()
            .map(TaskResultLinkDto::from)
            .toList();
    }

    private List<TaskResultFileDto> files(Long taskId) {
        return taskResultFileRepository.findByTaskIdOrderByCreatedAtAsc(taskId).stream()
            .map(TaskResultFileDto::from)
            .toList();
    }

    @Operation(summary = "작업 내용 조회", description = "저장된 작업 내용, 관련 링크, 첨부파일 목록을 조회합니다.")
    @GetMapping
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<TaskResultDto>> getResult(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId
    ) {
        if (resolveTaskOrNull(projectId, taskId) == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        TaskResult result = taskResultRepository.findByTaskId(taskId).orElse(null);
        TaskResultDto dto = result == null
            ? TaskResultDto.empty(links(taskId), files(taskId))
            : TaskResultDto.from(result, links(taskId), files(taskId));
        return ResponseEntity.ok(ApiResponse.ok(dto));
    }

    @Operation(summary = "작업 내용 저장", description = "작업 내용을 생성하거나 수정합니다(upsert). 담당자만 가능합니다.")
    @PutMapping
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<TaskResultDto>> saveResult(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody TaskResultSaveRequest request
    ) {
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        if (!isAssignee(task, request.userId())) {
            return ResponseEntity.status(403).body(ApiResponse.fail("FORBIDDEN_NOT_ASSIGNEE", "담당자만 작업 내용을 작성할 수 있습니다."));
        }
        TaskResult result = taskResultRepository.findByTaskId(taskId).orElse(null);
        if (result == null) {
            result = new TaskResult(taskId, request.content());
        } else {
            result.setContent(request.content());
        }
        taskResultRepository.save(result);
        return ResponseEntity.ok(ApiResponse.ok(TaskResultDto.from(result, links(taskId), files(taskId))));
    }

    @Operation(summary = "관련 링크 추가", description = "작업 내용에 관련 링크를 추가합니다. 담당자만 가능합니다.")
    @PostMapping("/links")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<TaskResultLinkDto>> addLink(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody TaskResultLinkCreateRequest request
    ) {
        if (request.url() == null || request.url().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("URL_REQUIRED", "URL은 필수입니다."));
        }
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        if (!isAssignee(task, request.userId())) {
            return ResponseEntity.status(403).body(ApiResponse.fail("FORBIDDEN_NOT_ASSIGNEE", "담당자만 링크를 추가할 수 있습니다."));
        }
        String title = (request.title() == null || request.title().isBlank()) ? request.url() : request.title();
        TaskResultLink saved = taskResultLinkRepository.save(new TaskResultLink(taskId, request.url(), title));
        return ResponseEntity.ok(ApiResponse.ok(TaskResultLinkDto.from(saved)));
    }

    @Operation(summary = "관련 링크 삭제", description = "담당자만 가능합니다.")
    @DeleteMapping("/links/{linkId}")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<Void>> deleteLink(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @Parameter(description = "링크 ID") @PathVariable Long linkId,
        @Parameter(description = "로그인한 사용자 DB id") @RequestParam Long userId
    ) {
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        if (!isAssignee(task, userId)) {
            return ResponseEntity.status(403).body(ApiResponse.fail("FORBIDDEN_NOT_ASSIGNEE", "담당자만 링크를 삭제할 수 있습니다."));
        }
        TaskResultLink link = taskResultLinkRepository.findById(linkId).orElse(null);
        if (link == null || !link.getTaskId().equals(taskId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("LINK_NOT_FOUND", "링크를 찾을 수 없습니다."));
        }
        taskResultLinkRepository.delete(link);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @Operation(summary = "첨부파일 업로드", description = "Supabase Storage에 업로드하고 메타데이터를 저장합니다. 담당자만 가능합니다.")
    @PostMapping(value = "/files")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<TaskResultFileDto>> uploadFile(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestParam Long userId,
        @RequestParam MultipartFile file
    ) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("FILE_REQUIRED", "파일이 비어있습니다."));
        }
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        if (!isAssignee(task, userId)) {
            return ResponseEntity.status(403).body(ApiResponse.fail("FORBIDDEN_NOT_ASSIGNEE", "담당자만 파일을 업로드할 수 있습니다."));
        }
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "file";
        String storagePath = "tasks/" + taskId + "/" + UUID.randomUUID() + "-" + originalName;
        try {
            storageClient.upload(storagePath, file.getBytes(), file.getContentType());
        } catch (IOException | RuntimeException e) {
            log.error("Supabase Storage 업로드 실패: taskId={}, path={}", taskId, storagePath, e);
            return ResponseEntity.status(502).body(ApiResponse.fail("STORAGE_UPLOAD_FAILED", "파일 업로드에 실패했습니다."));
        }
        TaskResultFile saved = taskResultFileRepository.save(
            new TaskResultFile(taskId, originalName, storagePath, file.getSize(), file.getContentType(), userId)
        );
        return ResponseEntity.ok(ApiResponse.ok(TaskResultFileDto.from(saved)));
    }

    @Operation(summary = "첨부파일 삭제", description = "담당자만 가능합니다.")
    @DeleteMapping("/files/{fileId}")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<Void>> deleteFile(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @Parameter(description = "파일 ID") @PathVariable Long fileId,
        @Parameter(description = "로그인한 사용자 DB id") @RequestParam Long userId
    ) {
        Task task = resolveTaskOrNull(projectId, taskId);
        if (task == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        if (!isAssignee(task, userId)) {
            return ResponseEntity.status(403).body(ApiResponse.fail("FORBIDDEN_NOT_ASSIGNEE", "담당자만 파일을 삭제할 수 있습니다."));
        }
        TaskResultFile taskResultFile = taskResultFileRepository.findById(fileId).orElse(null);
        if (taskResultFile == null || !taskResultFile.getTaskId().equals(taskId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("FILE_NOT_FOUND", "파일을 찾을 수 없습니다."));
        }
        try {
            storageClient.delete(taskResultFile.getStoragePath());
        } catch (RuntimeException e) {
            log.error("Supabase Storage 삭제 실패: fileId={}, path={}", fileId, taskResultFile.getStoragePath(), e);
            return ResponseEntity.status(502).body(ApiResponse.fail("STORAGE_DELETE_FAILED", "파일 삭제에 실패했습니다."));
        }
        taskResultFileRepository.delete(taskResultFile);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @Operation(summary = "첨부파일 다운로드 URL 발급", description = "만료시간이 있는 임시 다운로드 URL을 발급합니다.")
    @GetMapping("/files/{fileId}/url")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ResponseEntity<ApiResponse<String>> getFileUrl(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @Parameter(description = "파일 ID") @PathVariable Long fileId
    ) {
        if (resolveTaskOrNull(projectId, taskId) == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        TaskResultFile taskResultFile = taskResultFileRepository.findById(fileId).orElse(null);
        if (taskResultFile == null || !taskResultFile.getTaskId().equals(taskId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("FILE_NOT_FOUND", "파일을 찾을 수 없습니다."));
        }
        try {
            String url = storageClient.createSignedUrl(
                taskResultFile.getStoragePath(), SIGNED_URL_EXPIRES_SECONDS, taskResultFile.getFileName()
            );
            return ResponseEntity.ok(ApiResponse.ok(url));
        } catch (RuntimeException e) {
            log.error("Supabase Storage signed URL 발급 실패: fileId={}, path={}", fileId, taskResultFile.getStoragePath(), e);
            return ResponseEntity.status(502).body(ApiResponse.fail("STORAGE_URL_FAILED", "다운로드 URL 발급에 실패했습니다."));
        }
    }
}
