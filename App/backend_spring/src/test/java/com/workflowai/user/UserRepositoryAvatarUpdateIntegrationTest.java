package com.workflowai.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * MeController.uploadAvatar는 updateProfileImagePathIfUnchanged를 (saveAndFlush와 마찬가지로)
 * 별도의 @Transactional 없이, 즉 주변 트랜잭션이 없는 상태에서 호출한다. @Modifying 쿼리는
 * SimpleJpaRepository의 save()/delete()와 달리 클래스 레벨 @Transactional(readOnly = true)이
 * 적용되지 않으므로, 리포지토리 메서드 자체에 @Transactional을 붙이지 않으면 실제 호출 시
 * TransactionRequiredException으로 항상 실패한다.
 *
 * @DataJpaTest는 기본적으로 테스트 메서드 전체를 트랜잭션으로 감싸고 끝에 롤백하는데, 그 기본
 * 동작을 그대로 두면 테스트 자신이 이미 트랜잭션을 열어준 상태라 리포지토리 메서드에
 * @Transactional이 빠져 있어도 우연히 통과해버려 이 버그를 검출하지 못한다.
 * Propagation.NOT_SUPPORTED로 그 기본 트랜잭션을 꺼서, 운영 호출 경로와 동일하게 "주변
 * 트랜잭션 없음" 상태에서 호출되도록 한다.
 */
@DataJpaTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@TestPropertySource(properties = {
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
    "spring.flyway.enabled=false"
})
class UserRepositoryAvatarUpdateIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    // Propagation.NOT_SUPPORTED로 @DataJpaTest의 기본 롤백을 껐기 때문에(클래스 상단 설명 참고),
    // 여기서 저장한 행은 다음 테스트 메서드에도 그대로 남는다 — 메서드마다 다른 이메일을 써서
    // users.email unique 제약과 충돌하지 않게 한다.
    private Long saveTestUser(String email) {
        User user = new User(email, "아바타테스트", "local", email, "hash");
        return userRepository.save(user).getId();
    }

    @Test
    void updatesPathWhenOldPathStillMatches_withoutAnAmbientTransaction() {
        Long userId = saveTestUser("avatar-test-match@workflow.ai");

        int updated = userRepository.updateProfileImagePathIfUnchanged(userId, null, "avatars/1-111.png");

        assertThat(updated).isEqualTo(1);
        assertThat(userRepository.findById(userId).orElseThrow().getProfileImagePath())
            .isEqualTo("avatars/1-111.png");
    }

    @Test
    void skipsUpdateWhenOldPathAlreadyChanged_withoutAnAmbientTransaction() {
        Long userId = saveTestUser("avatar-test-conflict@workflow.ai");
        userRepository.updateProfileImagePathIfUnchanged(userId, null, "avatars/1-111.png");

        // 오래된 스냅샷(null)을 여전히 최신 경로라고 믿고 있는 동시 요청을 흉내낸다.
        int updated = userRepository.updateProfileImagePathIfUnchanged(userId, null, "avatars/1-222.png");

        assertThat(updated).isEqualTo(0);
        assertThat(userRepository.findById(userId).orElseThrow().getProfileImagePath())
            .isEqualTo("avatars/1-111.png");
    }
}
