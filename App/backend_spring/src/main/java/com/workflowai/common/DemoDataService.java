package com.workflowai.common;

import com.workflowai.project.Project;
import com.workflowai.project.ProjectRepository;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.util.List;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 실제 인증/프로젝트 관리 기능이 아직 없는 상태에서, 프론트가 하드코딩해 쓰는
 * projectId="demo-project"와 담당자 mock id("1"~"4")를 실제 DB row(Long id)에
 * 연결하기 위한 데모 데이터 시딩 + 해석기.
 * 서버 시작 시 없으면 생성하고(멱등), 있으면 그대로 재사용한다.
 */
@Component
public class DemoDataService implements ApplicationRunner {
    private static final String DEMO_PROJECT_TITLE = "데모 프로젝트";
    private static final String DEMO_PROJECT_ID_PARAM = "demo-project";
    private static final String DEMO_USER_PROVIDER = "demo";
    private static final List<String[]> DEMO_MEMBERS = List.of(
        new String[] {"1", "김민준"},
        new String[] {"2", "이서연"},
        new String[] {"3", "박지수"},
        new String[] {"4", "최동혁"}
    );

    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final boolean seedEnabled;

    public DemoDataService(
        ProjectRepository projectRepository,
        UserRepository userRepository,
        @Value("${workflow.demo.seed-enabled:true}") boolean seedEnabled
    ) {
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
        this.seedEnabled = seedEnabled;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!seedEnabled) return;

        projectRepository.findFirstByTitle(DEMO_PROJECT_TITLE)
            .orElseGet(() -> projectRepository.save(
                new Project(DEMO_PROJECT_TITLE, "캡스톤디자인", "회의록 AI 데모/개발용 프로젝트")
            ));

        for (String[] member : DEMO_MEMBERS) {
            String mockId = member[0];
            String name = member[1];
            userRepository.findByProviderAndProviderId(DEMO_USER_PROVIDER, mockId)
                .orElseGet(() -> userRepository.save(
                    new User("demo-user-" + mockId + "@workflow.ai", name, DEMO_USER_PROVIDER, mockId)
                ));
        }
    }

    /** projectId 경로 파라미터("demo-project" 등 프론트 하드코딩 값)를 실제 project.id로 변환한다. */
    public Long resolveProjectId(String projectIdParam) {
        if (DEMO_PROJECT_ID_PARAM.equals(projectIdParam)) {
            return projectRepository.findFirstByTitle(DEMO_PROJECT_TITLE)
                .map(Project::getId)
                .orElseThrow(() -> new IllegalStateException("데모 프로젝트가 시딩되지 않았습니다."));
        }
        try {
            return Long.parseLong(projectIdParam);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("알 수 없는 projectId: " + projectIdParam);
        }
    }

    /** 프론트 MEMBERS mock의 담당자 id("1"~"4")를 실제 user.id로 변환한다. 매칭되지 않으면 null. */
    public Long resolveUserId(String mockMemberId) {
        if (mockMemberId == null || mockMemberId.isBlank()) return null;
        return userRepository.findByProviderAndProviderId(DEMO_USER_PROVIDER, mockMemberId)
            .map(User::getId)
            .orElse(null);
    }
}
