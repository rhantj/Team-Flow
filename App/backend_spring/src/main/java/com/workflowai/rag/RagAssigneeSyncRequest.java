package com.workflowai.rag;

// 필드명은 FastAPI RagAssigneeSyncRequest 스키마와 동일한 snake_case 사용.
public record RagAssigneeSyncRequest(Long project_id, String source_type, Long source_id, Long assignee_id) {}
