package com.workflowai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * 애플리케이션 컨텍스트가 실제로 기동되는지 검증한다.
 *
 * <p>본문이 비어 있는 것이 정상이다. 이 테스트가 검증하는 것은 메서드 안의 코드가 아니라
 * "@SpringBootTest가 컨텍스트를 띄우는 데 성공했는가"이기 때문이다. 빈 배선이 깨져 있으면
 * 테스트 메서드에 진입하기도 전에 실패한다.
 *
 * <p>단위 테스트는 협력 객체를 손으로 조립하므로 Spring의 빈 생성 경로를 전혀 타지 않는다.
 * 생성자 주입 모호성, 순환 참조, 누락된 프로퍼티, 프로파일 조건으로 사라진 빈 같은 배선
 * 오류는 컨테이너를 실제로 띄워야만 드러난다.
 *
 * <p>H2로는 대체할 수 없다. 엔티티와 스키마가 Postgres 전용 타입에 의존하므로 실제
 * Postgres 컨테이너를 띄운다. Docker가 없는 환경에서는 실패 대신 건너뛴다.
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest
class ApplicationContextLoadTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse("pgvector/pgvector:pg17").asCompatibleSubstituteFor("postgres")
    );

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
        .withExposedPorts(6379);

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));

        // 스키마 자체가 아니라 빈 배선을 검증하는 테스트이므로 Hibernate가 스키마를 만들게 한다.
        // create-drop이 아니라 create인 이유: 컨테이너가 Spring 컨텍스트보다 먼저 종료되므로
        // 종료 시 drop DDL이 연결을 얻지 못해 30초를 대기하다 실패한다. 컨테이너는 어차피 폐기된다.
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "create");
        registry.add("spring.flyway.enabled", () -> "false");

        // 기본값이 없는 필수 프로퍼티. 값이 없으면 플레이스홀더 해석 단계에서 기동이 실패한다.
        registry.add("workflow.jwt.secret", () -> "test-secret-key-for-context-load-test-32bytes-minimum-length");
        registry.add("workflow.ai.internal-key", () -> "test-internal-key");
    }

    @Test
    @DisplayName("애플리케이션 컨텍스트가 기동된다")
    void contextLoads() {
        // 의도적으로 비어 있다. 컨텍스트 기동 실패 시 이 지점에 도달하지 못한다.
    }
}
