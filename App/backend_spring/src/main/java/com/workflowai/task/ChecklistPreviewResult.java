package com.workflowai.task;

import java.util.List;

/** 미리보기 생성 결과: 저장 전 제목 목록과 생성 엔진(ollama/rule-based). */
public record ChecklistPreviewResult(List<String> titles, String engine) {}
