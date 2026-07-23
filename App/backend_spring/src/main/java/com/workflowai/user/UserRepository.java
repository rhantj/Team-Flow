package com.workflowai.user;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByProviderAndProviderId(String provider, String providerId);

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<User> findFirstByName(String name);

    /**
     * profileImagePath가 여전히 oldPath와 같을 때만(=그 사이 다른 요청이 먼저 반영하지 않았을
     * 때만) newPath로 바꾼다. 같은 유저의 동시 아바타 업로드 두 건이 서로 다른 oldPath 스냅샷을
     * 들고 있다가 나중에 도착한 쪽이 앞선 쪽의 반영을 덮어써버리는 경쟁을, 락 없이 DB의 원자적
     * UPDATE 하나로 막는다 — 애플리케이션 인스턴스 수와 무관하게 항상 정확하다. 영향받은 행 수가
     * 0이면 그 사이 다른 요청이 먼저 반영됐다는 뜻이므로, 호출부는 자신이 방금 저장한 새 파일을
     * 지워야 한다(그렇지 않으면 아무도 참조하지 않는 고아 파일로 남는다).
     *
     * @Modifying 쿼리는 save()/saveAndFlush()와 달리 SimpleJpaRepository에 구현체가 없어(직접
     * 선언한 커스텀 쿼리라) 클래스 레벨 @Transactional(readOnly = true)이 적용되지 않는다.
     * 여기에 명시적으로 @Transactional을 붙이지 않으면, 호출부(MeController.uploadAvatar)처럼
     * 별도의 트랜잭션 없이 호출할 때 executeUpdate()가 활성 트랜잭션을 요구해
     * TransactionRequiredException으로 항상 실패한다. 이 애노테이션이 saveAndFlush()가
     * 이미 갖고 있던 것과 동일한 "자기 완결적 트랜잭션" 성질을 이 메서드에도 만들어준다.
     */
    @Modifying
    @Transactional
    @Query(
        "UPDATE User u SET u.profileImagePath = :newPath "
            + "WHERE u.id = :userId "
            + "AND ((:oldPath IS NULL AND u.profileImagePath IS NULL) OR u.profileImagePath = :oldPath)"
    )
    int updateProfileImagePathIfUnchanged(
        @Param("userId") Long userId,
        @Param("oldPath") String oldPath,
        @Param("newPath") String newPath
    );
}
