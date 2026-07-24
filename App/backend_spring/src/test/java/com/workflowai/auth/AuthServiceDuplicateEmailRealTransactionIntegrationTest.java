package com.workflowai.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.workflowai.security.JwtService;
import com.workflowai.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.NoOpPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * AuthService.signup()은 saveAndFlush()가 던지는 DataIntegrityViolationException을 같은
 * @Transactional 메서드 안에서 잡아 EmailAlreadyExistsException으로 바꿔 던진다. Mockito 기반
 * AuthServiceTest는 실제 Spring 트랜잭션 프록시를 거치지 않으므로, 이 catch가 트랜잭션을
 * rollback-only로 표시된 채 커밋을 시도해 UnexpectedRollbackException/500으로 새는지는 검증하지
 * 못한다 — 진짜 @Transactional 프록시 + H2로만 확인 가능하다.
 * (검증 결과: EmailAlreadyExistsException이 RuntimeException으로 정상 전파되어 Spring이 커밋이
 * 아니라 롤백을 선택하므로, Hibernate가 이미 표시한 rollback-only 상태와 일치해 안전하다.)
 *
 * @DataJpaTest는 기본적으로 테스트 메서드 전체를 트랜잭션으로 감싸고 끝에 롤백하는데, 그러면
 * signup()의 @Transactional이 그 트랜잭션에 합류해버려 위 시나리오(물리 트랜잭션 커밋/롤백)를
 * 재현할 수 없다. Propagation.NOT_SUPPORTED로 그 기본 동작을 꺼서 운영과 동일하게 "주변
 * 트랜잭션 없음" 상태에서 signup()이 직접 물리 트랜잭션을 열도록 한다.
 */
@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import(AuthService.class)
@TestPropertySource(properties = {
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
    "spring.flyway.enabled=false"
})
class AuthServiceDuplicateEmailRealTransactionIntegrationTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @MockBean
    private GoogleOAuthService googleOAuthService;

    @MockBean
    private JwtService jwtService;

    @TestConfiguration
    static class Config {
        @Bean
        PasswordEncoder passwordEncoder() {
            return NoOpPasswordEncoder.getInstance();
        }
    }

    @Test
    void secondSignupWithSameEmail_throwsEmailAlreadyExistsException_notUnexpectedRollback() {
        authService.signup("dup@example.com", "12345678", "이름", "MEMBER", true);

        assertThatThrownBy(() ->
            authService.signup("dup@example.com", "12345678", "이름2", "MEMBER", true)
        ).isInstanceOf(EmailAlreadyExistsException.class);

        assertThat(userRepository.existsByEmail("dup@example.com")).isTrue();
        assertThat(userRepository.findAll()).hasSize(1);
    }
}
