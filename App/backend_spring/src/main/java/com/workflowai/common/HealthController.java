package com.workflowai.common;

import com.workflowai.meeting.MeetingAnalysisQueueWorker;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(
    name = "백엔드 서버 체크",
    description = "백엔드 서버 실행 상태와 기본 연결 상태를 확인하는 API"
)
@RestController
public class HealthController {

    private final RedisConnectionFactory redisConnectionFactory;
    private final MeetingAnalysisQueueWorker worker;

    public HealthController(
        RedisConnectionFactory redisConnectionFactory,
        MeetingAnalysisQueueWorker worker
    ) {
        this.redisConnectionFactory = redisConnectionFactory;
        this.worker = worker;
    }

    @Operation(
        summary = "백엔드 서버 상태 확인",
        description = "Spring Boot 백엔드 서버가 정상적으로 실행 중인지 확인합니다. 프론트엔드 또는 배포 환경에서 서버 연결 상태를 점검할 때 사용합니다."
    )
    @GetMapping("/api/v1/health")
    public ResponseEntity<ApiResponse<HealthResponse>> health() {
        boolean redisUp = isRedisUp();
        boolean workerReady = worker.isReady();
        boolean workerAlive = worker.isWorkerAlive();
        boolean healthy = redisUp && workerReady && workerAlive;
        HealthResponse health = new HealthResponse(
            "workflow-ai-backend",
            healthy ? "UP" : "DOWN",
            Instant.now().toString(),
            redisUp ? "UP" : "DOWN",
            workerReady,
            workerAlive
        );
        HttpStatus status = healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
        return ResponseEntity.status(status).body(ApiResponse.ok(health));
    }

    private boolean isRedisUp() {
        try (RedisConnection connection = redisConnectionFactory.getConnection()) {
            return "PONG".equalsIgnoreCase(connection.ping());
        } catch (RuntimeException exception) {
            return false;
        }
    }
}
