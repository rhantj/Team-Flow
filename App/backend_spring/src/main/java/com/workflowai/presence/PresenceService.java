package com.workflowai.presence;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 중간보고/시연용 접속 상태 레지스트리.
 *
 * <p><b>단일 인스턴스 전용 — 의도된 설계 제약이다.</b> 이 서비스는 JVM 힙의 {@link ConcurrentHashMap}에만
 * 상태를 두므로, 백엔드를 2개 이상 인스턴스로 수평 확장(로드밸런서 뒤 다중 파드/컨테이너 등)하면
 * 동시 로그인 제한이 인스턴스별로 따로 동작해 무력화된다. 현재 배포 구성(docker-compose 단일
 * backend-spring 컨테이너)에서는 문제가 없으나, 향후 다중 인스턴스로 확장할 경우 Redis 등 공유
 * 저장소 기반으로 반드시 재구현해야 한다.
 *
 * <p>heartbeat가 TTL 안에 오지 않으면 자동 만료된다(비정상 종료 대비 - 완벽한 세션 정리는 아님).
 */
@Component
public class PresenceService {
    private static final Duration TTL = Duration.ofSeconds(40);

    private final Map<Long, Map<String, Instant>> lastSeenByUserIdAndSessionId = new ConcurrentHashMap<>();

    /** 테스트 로그인 시도. 다른 곳에서 이미 접속 중(TTL 이내)이면 false를 반환하고 상태를 바꾸지 않는다. */
    public synchronized boolean tryAcquire(Long userId, String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return false;
        }
        Instant now = Instant.now();
        Map<String, Instant> sessions = lastSeenByUserIdAndSessionId.computeIfAbsent(userId, ignored -> new ConcurrentHashMap<>());
        removeExpiredSessions(sessions, now);
        boolean hasOtherActiveSession = sessions.keySet().stream().anyMatch(activeSessionId -> !activeSessionId.equals(sessionId));
        if (hasOtherActiveSession) {
            return false;
        }
        sessions.put(sessionId, now);
        return true;
    }

    /** 로그인 유지(heartbeat). 테스트 로그인에서 획득한 세션만 연장한다. */
    public synchronized boolean touch(Long userId, String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return false;
        }
        Map<String, Instant> sessions = lastSeenByUserIdAndSessionId.get(userId);
        if (sessions == null) {
            return false;
        }
        Instant now = Instant.now();
        removeExpiredSessions(sessions, now);
        if (!sessions.containsKey(sessionId)) {
            if (sessions.isEmpty()) {
                lastSeenByUserIdAndSessionId.remove(userId);
            }
            return false;
        }
        sessions.put(sessionId, now);
        return true;
    }

    /** 로그아웃 시 현재 테스트 세션의 접속 상태만 제거한다. */
    public synchronized void release(Long userId, String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        Map<String, Instant> sessions = lastSeenByUserIdAndSessionId.get(userId);
        if (sessions == null) {
            return;
        }
        sessions.remove(sessionId);
        if (sessions.isEmpty()) {
            lastSeenByUserIdAndSessionId.remove(userId);
        }
    }

    public synchronized boolean isActive(Long userId) {
        Map<String, Instant> sessions = lastSeenByUserIdAndSessionId.get(userId);
        if (sessions == null) {
            return false;
        }
        Instant now = Instant.now();
        removeExpiredSessions(sessions, now);
        if (sessions.isEmpty()) {
            lastSeenByUserIdAndSessionId.remove(userId);
            return false;
        }
        return true;
    }

    /** 주어진 후보 유저 중 현재 활성 상태인 유저 id만 반환한다. */
    public synchronized List<Long> activeUserIds(List<Long> candidateUserIds) {
        return candidateUserIds.stream().filter(this::isActive).toList();
    }

    private boolean isFresh(Instant lastSeen, Instant now) {
        return Duration.between(lastSeen, now).compareTo(TTL) < 0;
    }

    private void removeExpiredSessions(Map<String, Instant> sessions, Instant now) {
        sessions.entrySet().removeIf(entry -> !isFresh(entry.getValue(), now));
    }
}
