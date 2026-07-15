package com.workflowai.rag;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class RagRateLimiter {
    private final int maxRequests;
    private final long windowSeconds;
    private final Map<Long, Deque<Instant>> requestLog = new ConcurrentHashMap<>();

    public RagRateLimiter() {
        this(10, 60);
    }

    public RagRateLimiter(int maxRequests, long windowSeconds) {
        this.maxRequests = maxRequests;
        this.windowSeconds = windowSeconds;
    }

    public synchronized boolean tryAcquire(Long projectId) {
        Instant now = Instant.now();
        Deque<Instant> log = requestLog.computeIfAbsent(projectId, key -> new ArrayDeque<>());

        while (!log.isEmpty() && log.peekFirst().isBefore(now.minusSeconds(windowSeconds))) {
            log.pollFirst();
        }

        if (log.size() >= maxRequests) {
            return false;
        }

        log.addLast(now);
        return true;
    }
}
