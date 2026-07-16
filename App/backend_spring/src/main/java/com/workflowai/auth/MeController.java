package com.workflowai.auth;

import com.workflowai.common.ApiResponse;
import com.workflowai.project.Project;
import com.workflowai.project.ProjectMember;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRepository;
import com.workflowai.security.CurrentUser;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "내 정보", description = "현재 로그인한 사용자의 기본 정보 및 역할 요약")
@RestController
@RequestMapping("/api/v1/me")
public class MeController {
    private final UserRepository userRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectRepository projectRepository;

    public MeController(
        UserRepository userRepository,
        ProjectMemberRepository projectMemberRepository,
        ProjectRepository projectRepository
    ) {
        this.userRepository = userRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.projectRepository = projectRepository;
    }

    @Operation(summary = "내 정보 조회", description = "현재 로그인한 사용자의 기본 정보와 프로젝트별 역할을 조회한다.")
    @GetMapping
    public ApiResponse<MeResponse> me() {
        User user = userRepository.findById(CurrentUser.id())
            .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        List<ProjectMember> memberships = projectMemberRepository.findAllByUserId(user.getId());
        Map<Long, Project> projectsById = projectRepository
            .findAllById(memberships.stream().map(ProjectMember::getProjectId).toList())
            .stream()
            .collect(Collectors.toMap(Project::getId, project -> project));

        List<ProjectRoleSummary> projectRoles = memberships.stream()
            .map(pm -> {
                Project project = projectsById.get(pm.getProjectId());
                String title = project != null ? project.getTitle() : null;
                return new ProjectRoleSummary(pm.getProjectId(), title, pm.getRole().toKorean());
            })
            .toList();

        UserSummary summary = new UserSummary(user.getId(), user.getEmail(), user.getName());
        return ApiResponse.ok(new MeResponse(summary, projectRoles));
    }

    @Operation(
        summary = "내가 담당한 업무 목록",
        description = "업무 데이터 연동은 회의록/업무 보드 담당 기능에서 채워진다. 현재는 빈 목록을 반환하는 스텁이다."
    )
    @GetMapping("/tasks")
    public ApiResponse<List<Object>> myTasks() {
        return ApiResponse.ok(List.of());
    }

    @Operation(
        summary = "내가 받은/작성한 개인 코멘트",
        description = "코멘트 데이터 연동은 별도 기능 담당에서 채워진다. 현재는 빈 목록을 반환하는 스텁이다."
    )
    @GetMapping("/comments")
    public ApiResponse<List<Object>> myComments() {
        return ApiResponse.ok(List.of());
    }
}
