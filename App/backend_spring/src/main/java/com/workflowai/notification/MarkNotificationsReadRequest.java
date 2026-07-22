package com.workflowai.notification;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "알림 읽음 처리 요청")
public record MarkNotificationsReadRequest(
    @Schema(description = "읽음 처리할 알림 id 목록") List<Long> ids
) {}
