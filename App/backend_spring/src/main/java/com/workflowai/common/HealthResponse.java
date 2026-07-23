package com.workflowai.common;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "서버 상태 확인 응답")
public record HealthResponse(
    @Schema(description = "서비스 이름", example = "workflow-ai-backend") String service,
    @Schema(description = "서버 상태", example = "UP", allowableValues = {"UP", "DOWN"}) String status,
    @Schema(description = "확인 시각 (ISO-8601)", example = "2026-07-09T07:15:46.404976Z") String checkedAt,
    @Schema(description = "Redis 연결 상태", example = "UP", allowableValues = {"UP", "DOWN"}) String redisStatus,
    @Schema(description = "분석 큐 초기화 및 실행 준비 여부", example = "true") boolean workerReady,
    @Schema(description = "분석 큐 worker thread 생존 여부", example = "true") boolean workerAlive
) {}
