package com.workflowai.assistant;

import java.time.Duration;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * threadId ↔ userId 매핑. threadId만 알면 남의 그래프를 재개할 수 있으면 안 되므로
 * resume 요청의 세션 사용자와 대조한다. TTL은 FastAPI 체크포인트와 같은 30분.
 */
@Component
public class AssistantThreadOwnership {
    private static final Duration TTL = Duration.ofMinutes(30);
    private static final String KEY_PREFIX = "assistant_thread:";

    private final StringRedisTemplate redisTemplate;

    public AssistantThreadOwnership(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void remember(String threadId, Long userId) {
        redisTemplate.opsForValue().set(KEY_PREFIX + threadId, String.valueOf(userId), TTL);
    }

    public boolean isOwnedBy(String threadId, Long userId) {
        String owner = redisTemplate.opsForValue().get(KEY_PREFIX + threadId);
        return owner != null && owner.equals(String.valueOf(userId));
    }
}
