package com.workflowai.presence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PresenceServiceTest {

    @Test
    void release_removesOnlyMatchingSession() {
        PresenceService service = new PresenceService();

        assertThat(service.tryAcquire(1L, "session-a")).isTrue();
        service.release(1L, "session-b");

        assertThat(service.isActive(1L)).isTrue();
        service.release(1L, "session-a");
        assertThat(service.isActive(1L)).isFalse();
    }

    @Test
    void tryAcquire_blocksDifferentActiveSessionForSameUser() {
        PresenceService service = new PresenceService();

        assertThat(service.tryAcquire(1L, "session-a")).isTrue();
        assertThat(service.tryAcquire(1L, "session-b")).isFalse();
        assertThat(service.tryAcquire(1L, "session-a")).isTrue();
    }

    @Test
    void touch_doesNotCreateUnacquiredSession() {
        PresenceService service = new PresenceService();

        assertThat(service.touch(1L, "unknown-session")).isFalse();

        assertThat(service.isActive(1L)).isFalse();
    }

    @Test
    void touch_extendsOnlyAcquiredSession() {
        PresenceService service = new PresenceService();

        assertThat(service.tryAcquire(1L, "session-a")).isTrue();
        assertThat(service.touch(1L, "session-a")).isTrue();
        assertThat(service.touch(1L, "session-b")).isFalse();

        assertThat(service.isActive(1L)).isTrue();
    }
}
