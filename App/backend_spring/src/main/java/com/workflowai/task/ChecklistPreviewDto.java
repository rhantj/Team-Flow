package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "체크리스트 AI 미리보기 결과(저장 전)")
public record ChecklistPreviewDto(
    @Schema(description = "제안 항목 제목 목록") List<String> titles,
    @Schema(description = "생성 엔진", example = "ollama") String engine
) {}
