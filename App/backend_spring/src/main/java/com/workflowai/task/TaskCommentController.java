package com.workflowai.task;

import com.workflowai.common.ApiResponse;
import com.workflowai.common.DemoDataService;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// TODO: 실제 인증이 도입되면 프로젝트 멤버십/작성자 권한 검사(본인 코멘트만 수정/삭제 등)를 여기에도 추가해야 한다.
@Tag(name = "업무 코멘트", description = "업무에 대한 코멘트 조회/작성/수정/삭제 API")
@RestController
@RequestMapping("/api/v1/projects/{projectId}/tasks/{taskId}/comments")
public class TaskCommentController {
    private final TaskCommentRepository taskCommentRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final DemoDataService demoDataService;

    public TaskCommentController(
        TaskCommentRepository taskCommentRepository,
        TaskRepository taskRepository,
        UserRepository userRepository,
        DemoDataService demoDataService
    ) {
        this.taskCommentRepository = taskCommentRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.demoDataService = demoDataService;
    }

    private Task resolveTaskOrNull(String projectId, Long taskId) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        Task task = taskRepository.findById(taskId).orElse(null);
        if (task == null || !task.getProjectId().equals(projectDbId)) {
            return null;
        }
        return task;
    }

    // 데모 유저는 provider="demo"이고 providerId가 곧 프론트가 쓰는 mock id("1"~"4")다.
    private TaskCommentDto toDto(TaskComment comment, Map<Long, User> userCache) {
        User author = userCache.get(comment.getAuthorId());
        String authorName = author != null ? author.getName() : "알 수 없음";
        String authorMockId = author != null ? author.getProviderId() : null;
        return TaskCommentDto.from(comment, authorName, authorMockId);
    }

    @Operation(summary = "코멘트 조회", description = "업무에 등록된 코멘트를 작성 순서대로 조회합니다.")
    @GetMapping
    public ResponseEntity<ApiResponse<List<TaskCommentDto>>> getComments(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId
    ) {
        if (resolveTaskOrNull(projectId, taskId) == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        List<TaskComment> comments = taskCommentRepository.findByTaskIdOrderByCreatedAtAsc(taskId);
        Map<Long, User> userCache = userRepository.findAllById(
            comments.stream().map(TaskComment::getAuthorId).distinct().toList()
        ).stream().collect(Collectors.toMap(User::getId, u -> u));
        List<TaskCommentDto> dtos = comments.stream().map(c -> toDto(c, userCache)).toList();
        return ResponseEntity.ok(ApiResponse.ok(dtos));
    }

    @Operation(summary = "코멘트 작성", description = "업무에 새 코멘트를 남깁니다.")
    @PostMapping
    public ResponseEntity<ApiResponse<TaskCommentDto>> createComment(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @RequestBody TaskCommentCreateRequest request
    ) {
        if (request.content() == null || request.content().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("CONTENT_REQUIRED", "코멘트 내용은 필수입니다."));
        }
        if (resolveTaskOrNull(projectId, taskId) == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        // TODO: 로그인이 없어 요청에 담긴 mock 작성자 id를 그대로 쓴다. 실제 인증이 붙으면 로그인 사용자 id로 교체.
        Long authorDbId = demoDataService.resolveUserId(request.authorId());
        if (authorDbId == null) {
            authorDbId = demoDataService.resolveUserId("1");
        }
        TaskComment saved = taskCommentRepository.save(new TaskComment(taskId, authorDbId, request.content()));
        User author = userRepository.findById(authorDbId).orElse(null);
        String authorName = author != null ? author.getName() : "알 수 없음";
        String authorMockId = author != null ? author.getProviderId() : null;
        return ResponseEntity.ok(ApiResponse.ok(TaskCommentDto.from(saved, authorName, authorMockId)));
    }

    @Operation(summary = "코멘트 수정", description = "코멘트 내용을 수정합니다.")
    @PatchMapping("/{commentId}")
    public ResponseEntity<ApiResponse<TaskCommentDto>> updateComment(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @Parameter(description = "코멘트 ID") @PathVariable Long commentId,
        @RequestBody TaskCommentUpdateRequest request
    ) {
        if (request.content() == null || request.content().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("CONTENT_REQUIRED", "코멘트 내용은 비워둘 수 없습니다."));
        }
        if (resolveTaskOrNull(projectId, taskId) == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        TaskComment comment = taskCommentRepository.findById(commentId).orElse(null);
        if (comment == null || !comment.getTaskId().equals(taskId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("COMMENT_NOT_FOUND", "코멘트를 찾을 수 없습니다."));
        }
        comment.setContent(request.content());
        taskCommentRepository.save(comment);
        User author = userRepository.findById(comment.getAuthorId()).orElse(null);
        String authorName = author != null ? author.getName() : "알 수 없음";
        String authorMockId = author != null ? author.getProviderId() : null;
        return ResponseEntity.ok(ApiResponse.ok(TaskCommentDto.from(comment, authorName, authorMockId)));
    }

    @Operation(summary = "코멘트 삭제", description = "코멘트를 삭제합니다.")
    @DeleteMapping("/{commentId}")
    public ResponseEntity<ApiResponse<Void>> deleteComment(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "업무 ID") @PathVariable Long taskId,
        @Parameter(description = "코멘트 ID") @PathVariable Long commentId
    ) {
        if (resolveTaskOrNull(projectId, taskId) == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("TASK_NOT_FOUND", "업무를 찾을 수 없습니다."));
        }
        TaskComment comment = taskCommentRepository.findById(commentId).orElse(null);
        if (comment == null || !comment.getTaskId().equals(taskId)) {
            return ResponseEntity.status(404).body(ApiResponse.fail("COMMENT_NOT_FOUND", "코멘트를 찾을 수 없습니다."));
        }
        taskCommentRepository.delete(comment);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
