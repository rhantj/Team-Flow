package com.workflowai.meeting;

import com.workflowai.common.DemoDataService;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MeetingAnalysisPersistence {
    private final MeetingRepository meetingRepository;
    private final MeetingAnalysisRepository meetingAnalysisRepository;
    private final MeetingActionItemRepository meetingActionItemRepository;
    private final UserRepository userRepository;
    private final DemoDataService demoDataService;

    public MeetingAnalysisPersistence(
        MeetingRepository meetingRepository,
        MeetingAnalysisRepository meetingAnalysisRepository,
        MeetingActionItemRepository meetingActionItemRepository,
        UserRepository userRepository,
        DemoDataService demoDataService
    ) {
        this.meetingRepository = meetingRepository;
        this.meetingAnalysisRepository = meetingAnalysisRepository;
        this.meetingActionItemRepository = meetingActionItemRepository;
        this.userRepository = userRepository;
        this.demoDataService = demoDataService;
    }

    @Transactional
    public void saveAnalysisSuccess(Long meetingId, MeetingAnalysisResult result, String analysisSource) {
        Meeting meeting = meetingRepository.findById(meetingId).orElseThrow(
            () -> new IllegalStateException("Meeting not found: " + meetingId));

        meetingAnalysisRepository.save(new MeetingAnalysis(
            meetingId, result.summary(), result.decisions(), result.risks(), result.keywords(), analysisSource
        ));

        for (MeetingTodo todo : result.todos()) {
            meetingActionItemRepository.save(new MeetingActionItem(
                meetingId,
                todo.title(),
                todo.description(),
                todo.category(),
                resolveAssigneeByName(todo.assignee_candidate()),
                resolveAssignee(todo.assignee_id()),
                parseDateOrNull(todo.due_date()),
                todo.priority(),
                null
            ));
        }

        meeting.setAnalysisStatus("completed");
        meeting.setAnalysisErrorMessage(null);
        meetingRepository.save(meeting);
    }

    @Transactional
    public void saveAnalysisFailure(Long meetingId, String errorMessage) {
        meetingRepository.findById(meetingId).ifPresent(meeting -> {
            meeting.setAnalysisStatus("failed");
            meeting.setAnalysisErrorMessage(errorMessage);
            meetingRepository.save(meeting);
        });
    }

    private Long resolveAssigneeByName(String name) {
        if (name == null || name.isBlank()) return null;
        return userRepository.findFirstByName(name).map(User::getId).orElse(null);
    }

    private Long resolveAssignee(String assigneeIdParam) {
        if (assigneeIdParam == null || assigneeIdParam.isBlank()) return null;
        Long resolved = demoDataService.resolveUserId(assigneeIdParam);
        if (resolved != null) return resolved;
        try {
            return Long.parseLong(assigneeIdParam);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private LocalDate parseDateOrNull(String date) {
        if (date == null || date.isBlank()) return null;
        try {
            return LocalDate.parse(date);
        } catch (Exception e) {
            return null;
        }
    }
}
