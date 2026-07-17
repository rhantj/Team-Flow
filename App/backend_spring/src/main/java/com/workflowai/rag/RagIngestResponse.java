package com.workflowai.rag;

import java.util.List;

public record RagIngestResponse(List<Long> chunk_ids, int chunk_count) {}
