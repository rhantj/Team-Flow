package com.workflowai.rag;

import java.util.List;

public record RagQueryResponse(String answer, List<RagSourceDto> sources) {}
