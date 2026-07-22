package com.workflowai.presence;

import com.workflowai.common.ApiResponse;
import com.workflowai.common.DemoDataService;
import com.workflowai.project.ProjectMember;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRole;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "접속 상태", description = "중간보고/시연용 프로젝트 접속자 목록 (heartbeat 기반)")
@RestController
@RequestMapping("/api/v1/projects/{projectId}/presence")
public class PresenceController {
    private final ProjectMemberRepository projectMemberRepository;
    private final UserRepository userRepository;
    private final DemoDataService demoDataService;
    private final PresenceService presenceService;

    public PresenceController(
        ProjectMemberRepository projectMemberRepository,
        UserRepository userRepository,
        DemoDataService demoDataService,
        PresenceService presenceService
    ) {
        this.projectMemberRepository = projectMemberRepository;
        this.userRepository = userRepository;
        this.demoDataService = demoDataService;
        this.presenceService = presenceService;
    }

    @Operation(
        summary = "프로젝트 접속자 목록 조회",
        description = "heartbeat(TTL 40초) 기준으로 현재 접속 중인 프로젝트 멤버 목록을 반환한다. "
            + "프론트에서 10~30초 간격으로 폴링해 헤더의 접속자 아바타를 갱신하는 용도."
    )
    @GetMapping
    @PreAuthorize("@projectAccess.isMember(#projectId)")
    public ApiResponse<List<PresenceUserDto>> getPresence(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId
    ) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        List<ProjectMember> members = projectMemberRepository.findAllByProjectId(projectDbId);
        List<Long> memberUserIds = members.stream().map(ProjectMember::getUserId).toList();
        List<Long> activeUserIds = presenceService.activeUserIds(memberUserIds);
        if (activeUserIds.isEmpty()) {
            return ApiResponse.ok(List.of());
        }

        Map<Long, User> usersById = userRepository.findAllById(activeUserIds).stream()
            .collect(Collectors.toMap(User::getId, user -> user));
        Map<Long, ProjectRole> roleByUserId = members.stream()
            .collect(Collectors.toMap(ProjectMember::getUserId, ProjectMember::getRole));

        List<PresenceUserDto> result = activeUserIds.stream()
            .map(userId -> {
                User user = usersById.get(userId);
                ProjectRole role = roleByUserId.get(userId);
                if (user == null || role == null) return null;
                return new PresenceUserDto(userId, user.getName(), role.toKorean());
            })
            .filter(Objects::nonNull)
            .toList();
        return ApiResponse.ok(result);
    }
}
