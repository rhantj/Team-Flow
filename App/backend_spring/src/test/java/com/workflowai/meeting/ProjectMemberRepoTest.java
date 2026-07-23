package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;

import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRepository;
import com.workflowai.project.ProjectMember;
import com.workflowai.project.Project;
import com.workflowai.project.ProjectRole;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@TestPropertySource(properties = {
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
    "spring.flyway.enabled=false"
})
class ProjectMemberRepoTest {

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void findByProjectIdAndRoleReturnsTheSingleLeader() {
        // Arrange
        User user1 = new User("leader@example.com", "Leader", "email", "leader");
        User user2 = new User("member@example.com", "Member", "email", "member");
        User saved_user1 = userRepository.save(user1);
        User saved_user2 = userRepository.save(user2);

        Project project = new Project("Test Project", "Type", "Description");
        Project saved_project = projectRepository.save(project);

        ProjectMember leader = new ProjectMember(saved_project.getId(), saved_user1.getId(), ProjectRole.LEADER);
        ProjectMember member = new ProjectMember(saved_project.getId(), saved_user2.getId(), ProjectRole.MEMBER);
        projectMemberRepository.save(leader);
        projectMemberRepository.save(member);

        // Act
        var leaderOpt = projectMemberRepository.findByProjectIdAndRole(saved_project.getId(), ProjectRole.LEADER);

        // Assert
        assertThat(leaderOpt).isPresent();
        assertThat(leaderOpt.get().getRole()).isEqualTo(ProjectRole.LEADER);
    }

    @Test
    void findByProjectIdAndRoleReturnsEmptyWhenNoMatchingRole() {
        // Arrange
        User user = new User("user@example.com", "User", "email", "user");
        User saved_user = userRepository.save(user);

        Project project = new Project("Test Project", "Type", "Description");
        Project saved_project = projectRepository.save(project);

        ProjectMember member = new ProjectMember(saved_project.getId(), saved_user.getId(), ProjectRole.MEMBER);
        projectMemberRepository.save(member);

        // Act
        var reviewerOpt = projectMemberRepository.findByProjectIdAndRole(saved_project.getId(), ProjectRole.REVIEWER);

        // Assert
        assertThat(reviewerOpt).isEmpty();
    }
}
