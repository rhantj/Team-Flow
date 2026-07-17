package com.workflowai.security;

import com.workflowai.project.ProjectMemberRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component("projectAccess")
public class ProjectAccess {
    private final ProjectMemberRepository projectMemberRepository;

    public ProjectAccess(ProjectMemberRepository projectMemberRepository) {
        this.projectMemberRepository = projectMemberRepository;
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

    private Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UserPrincipal principal) {
            return principal.id();
        }
        return null;
    }
}
