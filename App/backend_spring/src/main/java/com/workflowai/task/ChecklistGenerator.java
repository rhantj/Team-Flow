package com.workflowai.task;

import java.util.List;

/**
 * 업무 정보로 체크리스트 항목 후보를 만든다.
 * 지금은 {@link RuleBasedChecklistGenerator} 하나만 있지만, 나중에 LLM 기반 구현체를
 * 추가하고 이 인터페이스로 교체/폴백할 수 있도록 분리해둔다.
 */
public interface ChecklistGenerator {
    List<String> generate(Task task);
}
