package com.workflowai.notification;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findTop50ByUserIdOrderByCreatedAtDesc(Long userId);

    long countByUserIdAndReadFalse(Long userId);

    List<Notification> findByUserIdAndReadFalse(Long userId);

    /** id가 넘어와도 본인 소유가 아니면 걸러진다 — 다른 사람 알림을 id만 알고 읽음 처리할 수 없게 막는다. */
    List<Notification> findByIdInAndUserId(List<Long> ids, Long userId);
}
