package com.workflowai.task;

import com.workflowai.common.ApiResponse;
import com.workflowai.common.DemoDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "업무", description = "프로젝트 업무(Task) 조회 API")
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
        List<TaskListItem> tasks = taskRepository.findByProjectIdOrderByCreatedAtDesc(projectDbId).stream()
            .map(TaskListItem::from)
            .toList();
        return ApiResponse.ok(tasks);
    }
}
