package com.workflowai.rag;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RagRateLimiterTest {

    @Test
    void allowsRequestsUnderLimit() {
        RagRateLimiter limiter = new RagRateLimiter(3, 60);

        assertThat(limiter.tryAcquire(1L)).isTrue();
        assertThat(limiter.tryAcquire(1L)).isTrue();
        assertThat(limiter.tryAcquire(1L)).isTrue();
    }

    @Test
    void blocksRequestsOverLimit() {
        RagRateLimiter limiter = new RagRateLimiter(2, 60);

        assertThat(limiter.tryAcquire(1L)).isTrue();
        assertThat(limiter.tryAcquire(1L)).isTrue();
        assertThat(limiter.tryAcquire(1L)).isFalse();
    }

    @Test
    void tracksEachProjectIndependently() {
        RagRateLimiter limiter = new RagRateLimiter(1, 60);

        assertThat(limiter.tryAcquire(1L)).isTrue();
        assertThat(limiter.tryAcquire(2L)).isTrue();
        assertThat(limiter.tryAcquire(1L)).isFalse();
    }
}
