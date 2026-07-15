package com.workflowai.project;

import com.workflowai.common.ApiResponse;
import com.workflowai.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "프로젝트", description = "프로젝트 생성/조회/수정/삭제 및 멤버 역할 관리")
@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {
    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @Operation(summary = "내가 접근 가능한 프로젝트 목록 조회")
    @GetMapping
    public ApiResponse<List<ProjectResponse>> list() {
        return ApiResponse.ok(projectService.findAllForUser(CurrentUser.id()));
    }

    @Operation(summary = "프로젝트 생성", description = "생성한 사용자는 자동으로 팀장(LEADER)이 된다.")
    @PostMapping
    public ApiResponse<ProjectResponse> create(@Valid @RequestBody CreateProjectRequest request) {
        return ApiResponse.ok(projectService.create(CurrentUser.id(), request));
    }

    @Operation(summary = "프로젝트 상세 조회")
    @GetMapping("/{projectId}")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ApiResponse<ProjectResponse> find(@PathVariable Long projectId) {
        return ApiResponse.ok(projectService.find(projectId));
    }

    @Operation(summary = "프로젝트 수정", description = "팀장만 가능하다.")
    @PatchMapping("/{projectId}")
    @PreAuthorize("@projectAccess.hasRole(#projectId, 'LEADER')")
    public ApiResponse<ProjectResponse> update(
        @PathVariable Long projectId,
        @RequestBody UpdateProjectRequest request
    ) {
        return ApiResponse.ok(projectService.update(projectId, request));
    }

    @Operation(summary = "프로젝트 삭제", description = "팀장만 가능하다.")
    @DeleteMapping("/{projectId}")
    @PreAuthorize("@projectAccess.hasRole(#projectId, 'LEADER')")
    public ApiResponse<Void> delete(@PathVariable Long projectId) {
        projectService.delete(projectId);
        return ApiResponse.ok(null);
    }

    @Operation(summary = "프로젝트 멤버 목록 조회")
    @GetMapping("/{projectId}/members")
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ApiResponse<List<MemberResponse>> members(@PathVariable Long projectId) {
        return ApiResponse.ok(projectService.members(projectId));
    }

    @Operation(summary = "프로젝트 멤버 역할 변경", description = "팀장만 가능하다.")
    @PatchMapping("/{projectId}/members/{userId}/role")
    @PreAuthorize("@projectAccess.hasRole(#projectId, 'LEADER')")
    public ApiResponse<MemberResponse> updateMemberRole(
        @PathVariable Long projectId,
        @PathVariable Long userId,
        @Valid @RequestBody UpdateMemberRoleRequest request
    ) {
        return ApiResponse.ok(projectService.updateMemberRole(projectId, userId, request.role()));
    }
}
