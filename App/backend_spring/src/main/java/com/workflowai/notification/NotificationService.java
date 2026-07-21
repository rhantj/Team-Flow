package com.workflowai.notification;

import org.springframework.stereotype.Service;

/** TaskController 등이 업무 생성/수정/삭제/이동 시 알림을 남기기 위해 쓰는 공용 서비스. ActivityService와 같은 포지션. */
@Service
public class NotificationService {
    private final NotificationRepository notificationRepository;

    public NotificationService(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    public void notify(Long userId, String type, String title, String content, String targetType, Long targetId) {
        notificationRepository.save(new Notification(userId, type, title, content, targetType, targetId));
    }
}
