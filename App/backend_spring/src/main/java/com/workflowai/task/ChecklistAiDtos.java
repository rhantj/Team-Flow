package com.workflowai.task;

import java.util.List;

/** FastAPI /ai/checklist/generate 요청·응답 매핑. 필드명은 FastAPI JSON(snake_case)과 일치. */
public final class ChecklistAiDtos {
    private ChecklistAiDtos() {}

    public record ChecklistGenerateAiRequest(
        String title, String description, String category, String priority,
        String due_date, List<String> existing_items
    ) {}

    public record AiChecklistItem(String title, String reason) {}

    public record ChecklistGenerateAiResponse(List<AiChecklistItem> items, String engine) {}
}
