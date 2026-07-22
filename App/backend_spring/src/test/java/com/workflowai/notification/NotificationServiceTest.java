package com.workflowai.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private NotificationRepository notificationRepository;

    @Test
    void notifySavesNotificationWithGivenFields() {
        NotificationService service = new NotificationService(notificationRepository);
        when(notificationRepository.save(any(Notification.class))).thenAnswer(inv -> inv.getArgument(0));

        service.notify(5L, "TASK_ASSIGNED", "새 업무 배정", "'로그인 API' 업무가 배정되었습니다.", "task", 42L);

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(captor.capture());
        Notification saved = captor.getValue();
        assertThat(saved.getUserId()).isEqualTo(5L);
        assertThat(saved.getType()).isEqualTo("TASK_ASSIGNED");
        assertThat(saved.getTitle()).isEqualTo("새 업무 배정");
        assertThat(saved.getContent()).isEqualTo("'로그인 API' 업무가 배정되었습니다.");
        assertThat(saved.getTargetType()).isEqualTo("task");
        assertThat(saved.getTargetId()).isEqualTo(42L);
        assertThat(saved.isRead()).isFalse();
    }
}
