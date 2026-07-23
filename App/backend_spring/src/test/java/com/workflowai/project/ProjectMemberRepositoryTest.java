package com.workflowai.project;

import static org.assertj.core.api.Assertions.assertThat;

import com.workflowai.WorkFlowAiBackendApplication;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest
// 같은 패키지의 ProjectControllerSecurityTest.MethodSecurityTestConfig가
// @SpringBootConfiguration으로 선언되어 있어, 명시하지 않으면 패키지 스캔 시
// 그 테스트 전용 설정이 잘못 채택된다. 실제 애플리케이션 설정을 명시적으로 지정한다.
@ContextConfiguration(classes = WorkFlowAiBackendApplication.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@TestPropertySource(properties = {
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
    "spring.flyway.enabled=false"
})
class ProjectMemberRepositoryTest {

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
        User savedUser1 = userRepository.save(user1);
        User savedUser2 = userRepository.save(user2);

        Project project = new Project("Test Project", "Type", "Description");
        Project savedProject = projectRepository.save(project);

        ProjectMember leader = new ProjectMember(savedProject.getId(), savedUser1.getId(), ProjectRole.LEADER);
        ProjectMember member = new ProjectMember(savedProject.getId(), savedUser2.getId(), ProjectRole.MEMBER);
        projectMemberRepository.save(leader);
        projectMemberRepository.save(member);

        // Act
        var leaderOpt = projectMemberRepository.findByProjectIdAndRole(savedProject.getId(), ProjectRole.LEADER);

        // Assert
        assertThat(leaderOpt).isPresent();
        assertThat(leaderOpt.get().getRole()).isEqualTo(ProjectRole.LEADER);
    }

    @Test
    void findByProjectIdAndRoleReturnsEmptyWhenNoMatchingRole() {
        // Arrange
        User user = new User("user@example.com", "User", "email", "user");
        User savedUser = userRepository.save(user);

        Project project = new Project("Test Project", "Type", "Description");
        Project savedProject = projectRepository.save(project);

        ProjectMember member = new ProjectMember(savedProject.getId(), savedUser.getId(), ProjectRole.MEMBER);
        projectMemberRepository.save(member);

        // Act
        var reviewerOpt = projectMemberRepository.findByProjectIdAndRole(savedProject.getId(), ProjectRole.REVIEWER);

        // Assert
        assertThat(reviewerOpt).isEmpty();
    }
}
