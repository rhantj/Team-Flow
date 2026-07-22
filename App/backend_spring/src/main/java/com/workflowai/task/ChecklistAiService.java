package com.workflowai.task;

import com.workflowai.task.ChecklistAiDtos.AiChecklistItem;
import com.workflowai.task.ChecklistAiDtos.ChecklistGenerateAiRequest;
import com.workflowai.task.ChecklistAiDtos.ChecklistGenerateAiResponse;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** AI 우선 → 실패 시 기존 규칙 기반(RuleBasedChecklistGenerator)으로 폴백하는 Composite. */
@Service
public class ChecklistAiService {
    private static final Logger log = LoggerFactory.getLogger(ChecklistAiService.class);
    private static final int MAX_ITEMS = 10;
    private static final int MAX_TITLE_LEN = 60;

    private final FastApiChecklistClient client;
    private final RuleBasedChecklistGenerator ruleBased;

    public ChecklistAiService(FastApiChecklistClient client, RuleBasedChecklistGenerator ruleBased) {
        this.client = client;
        this.ruleBased = ruleBased;
    }

    public ChecklistPreviewResult generatePreview(Task task, List<String> existingTitles) {
        List<String> safeExisting = existingTitles == null ? List.of() : existingTitles;
        List<String> rawTitles;
        String engine;
        try {
            ChecklistGenerateAiRequest request = new ChecklistGenerateAiRequest(
                task.getTitle(), task.getDescription(), task.getCategory(), task.getPriority(),
                task.getDueDate() == null ? null : task.getDueDate().toString(), safeExisting);
            ChecklistGenerateAiResponse response = client.generate(request);
            if (response == null || response.items() == null || response.items().isEmpty()) {
                throw new IllegalStateException("AI 응답이 비어 있습니다.");
            }
            rawTitles = new ArrayList<>();
            for (AiChecklistItem item : response.items()) {
                if (item != null) rawTitles.add(item.title());
            }
            engine = response.engine() == null ? "ollama" : response.engine();
        } catch (Exception e) {
            log.warn("체크리스트 AI 생성 실패, 규칙 기반으로 대체합니다.", e);
            rawTitles = ruleBased.generate(task);
            engine = "rule-based";
        }
        return new ChecklistPreviewResult(normalizeTitles(rawTitles, safeExisting), engine);
    }

    /** 저장 직전 정규화·검증(트림/빈값/중복/기존중복 제거, 최대 개수). apply-generated에서도 사용. */
    public List<String> normalizeTitles(List<String> rawTitles, List<String> existingTitles) {
        if (rawTitles == null) return List.of();
        Set<String> seen = normalizedSet(existingTitles);
        List<String> result = new ArrayList<>();
        for (String raw : rawTitles) {
            String title = normalizeTitle(raw);
            if (title == null) continue;
            if (!seen.add(title.toLowerCase(Locale.ROOT))) continue;
            result.add(title);
            if (result.size() >= MAX_ITEMS) break;
        }
        return result;
    }

    private Set<String> normalizedSet(List<String> titles) {
        Set<String> set = new LinkedHashSet<>();
        if (titles != null) {
            for (String t : titles) {
                String n = normalizeTitle(t);
                if (n != null) set.add(n.toLowerCase(Locale.ROOT));
            }
        }
        return set;
    }

    private String normalizeTitle(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;
        return trimmed.length() > MAX_TITLE_LEN ? trimmed.substring(0, MAX_TITLE_LEN) : trimmed;
    }
}
