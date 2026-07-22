package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "미리보기에서 확정한 체크리스트 저장 요청")
public record ChecklistApplyRequest(
    @Schema(description = "저장할 체크리스트 제목 목록") List<String> titles
) {}
