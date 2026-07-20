package com.workflowai.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.workflowai.common.DemoDataService;
import com.workflowai.project.ProjectMember;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRole;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

@ExtendWith(MockitoExtension.class)
class ProjectAccessTest {

    @Mock
    private ProjectMemberRepository projectMemberRepository;

    @Mock
    private DemoDataService demoDataService;

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void hasRoleReturnsTrueForReviewer() {
        ProjectAccess projectAccess = new ProjectAccess(projectMemberRepository, demoDataService);
        authenticate(4L);
        when(projectMemberRepository.findByProjectIdAndUserId(1L, 4L))
            .thenReturn(Optional.of(new ProjectMember(1L, 4L, ProjectRole.REVIEWER)));

        assertThat(projectAccess.hasRole(1L, "REVIEWER")).isTrue();
    }

    @Test
    void hasRoleReturnsFalseForNonReviewer() {
        ProjectAccess projectAccess = new ProjectAccess(projectMemberRepository, demoDataService);
        authenticate(2L);
        when(projectMemberRepository.findByProjectIdAndUserId(1L, 2L))
            .thenReturn(Optional.of(new ProjectMember(1L, 2L, ProjectRole.MEMBER)));

        assertThat(projectAccess.hasRole(1L, "REVIEWER")).isFalse();
    }

    private void authenticate(Long userId) {
        UserPrincipal principal = new UserPrincipal(userId, "user@example.com", "사용자");
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(principal, null));
    }
}
