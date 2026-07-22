package com.workflowai.task;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 미리보기에서 확정한 체크리스트 항목을 정규화 후 원자적으로 저장한다.
 * 여러 항목 저장 중 일부만 커밋되는 부분 저장을 막기 위해 트랜잭션 경계를 둔다.
 * 같은 업무 동시 요청 시 조회-후-저장 경합(중복 저장)은 호출부(ChecklistController)의
 * 업무별 락이 이 메서드 호출을 감싸 커밋까지 직렬화한다.
 */
@Service
public class ChecklistApplyService {
    private final ChecklistRepository checklistRepository;
    private final ChecklistAiService checklistAiService;

    public ChecklistApplyService(ChecklistRepository checklistRepository, ChecklistAiService checklistAiService) {
        this.checklistRepository = checklistRepository;
        this.checklistAiService = checklistAiService;
    }

    @Transactional
    public List<Checklist> saveGenerated(Long taskId, List<String> requestedTitles) {
        List<String> existingTitles = checklistRepository.findByTaskIdOrderByCreatedAtAsc(taskId).stream()
            .map(Checklist::getTitle).toList();
        List<String> titles = checklistAiService.normalizeTitles(requestedTitles, existingTitles);
        return titles.stream()
            .map(title -> checklistRepository.save(new Checklist(taskId, title)))
            .toList();
    }
}
