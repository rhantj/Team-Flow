package com.workflowai.security;

import com.workflowai.common.DemoDataService;
import com.workflowai.project.ProjectMemberRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component("projectAccess")
public class ProjectAccess {
    private final ProjectMemberRepository projectMemberRepository;
    private final DemoDataService demoDataService;

    public ProjectAccess(ProjectMemberRepository projectMemberRepository, DemoDataService demoDataService) {
        this.projectMemberRepository = projectMemberRepository;
        this.demoDataService = demoDataService;
    }

    public boolean hasRole(Long projectId, String role) {
        Long userId = currentUserId();
        if (userId == null || projectId == null) {
            return false;
        }
        return projectMemberRepository.findByProjectIdAndUserId(projectId, userId)
            .map(member -> member.getRole().name().equalsIgnoreCase(role))
            .orElse(false);
    }

    public boolean isMember(Long projectId) {
        Long userId = currentUserId();
        if (userId == null || projectId == null) {
            return false;
        }
        return projectMemberRepository.existsByProjectIdAndUserId(projectId, userId);
    }

    /**
     * 프론트가 경로에 그대로 쓰는 projectId 문자열("demo-project" 등)용 오버로드.
     * DemoDataService.resolveProjectId로 실제 project.id(Long)로 바꾼 뒤 멤버십을 검사한다.
     */
    public boolean isMember(String projectIdParam) {
        try {
            return isMember(demoDataService.resolveProjectId(projectIdParam));
        } catch (RuntimeException e) {
            return false;
        }
    }

    /**
     * 프론트가 경로에 그대로 쓰는 projectId 문자열("demo-project" 등)용 오버로드.
     * DemoDataService.resolveProjectId로 실제 project.id(Long)로 바꾼 뒤 역할을 검사한다.
     */
    public boolean hasRole(String projectIdParam, String role) {
        try {
            return hasRole(demoDataService.resolveProjectId(projectIdParam), role);
        } catch (RuntimeException e) {
            return false;
        }
    }

    private Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UserPrincipal principal) {
            return principal.id();
        }
        return null;
    }
}
