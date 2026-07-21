package com.workflowai.notification;

import com.workflowai.common.ApiResponse;
import com.workflowai.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "알림", description = "로그인 사용자의 알림 조회/읽음 처리 API")
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    private final NotificationRepository notificationRepository;

    public NotificationController(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    @Operation(summary = "내 알림 목록 조회", description = "로그인 사용자의 알림을 최신순으로 최대 50건 조회합니다.")
    @GetMapping
    public ResponseEntity<ApiResponse<List<NotificationDto>>> getNotifications() {
        Long userId = CurrentUser.id();
        List<NotificationDto> notifications = notificationRepository
            .findTop50ByUserIdOrderByCreatedAtDesc(userId)
            .stream()
            .map(NotificationDto::from)
            .toList();
        return ResponseEntity.ok(ApiResponse.ok(notifications));
    }

    @Operation(summary = "안 읽은 알림 개수 조회")
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<UnreadCountResponse>> getUnreadCount() {
        Long userId = CurrentUser.id();
        long count = notificationRepository.countByUserIdAndReadFalse(userId);
        return ResponseEntity.ok(ApiResponse.ok(new UnreadCountResponse(count)));
    }

    @Operation(summary = "전체 읽음 처리")
    @PatchMapping("/read-all")
    public ResponseEntity<ApiResponse<Void>> markAllRead() {
        Long userId = CurrentUser.id();
        List<Notification> unread = notificationRepository.findByUserIdAndReadFalse(userId);
        unread.forEach(Notification::markRead);
        notificationRepository.saveAll(unread);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
