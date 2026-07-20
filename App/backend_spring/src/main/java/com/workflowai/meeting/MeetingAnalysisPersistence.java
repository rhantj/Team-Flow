package com.workflowai.meeting;

import com.workflowai.common.DemoDataService;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.rag.RagIngestService;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MeetingAnalysisPersistence {
    public static final String DEFAULT_ANALYSIS_ERROR_MESSAGE = "회의록 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    public static final String REUPLOAD_REQUIRED_ERROR_MESSAGE = "원본 음성 파일은 재분석을 위해 다시 업로드해야 합니다.";
    public static final String REUPLOAD_READ_ERROR_MESSAGE = "원본 회의록 내용을 읽을 수 없어 재분석을 위해 다시 업로드해야 합니다.";

    private final MeetingRepository meetingRepository;
    private final MeetingAnalysisRepository meetingAnalysisRepository;
    private final MeetingActionItemRepository meetingActionItemRepository;
    private final UserRepository userRepository;
    private final DemoDataService demoDataService;
    private final RagIngestService ragIngestService;
    private final ProjectMemberRepository projectMemberRepository;

    public MeetingAnalysisPersistence(
        MeetingRepository meetingRepository,
        MeetingAnalysisRepository meetingAnalysisRepository,
        MeetingActionItemRepository meetingActionItemRepository,
        UserRepository userRepository,
        DemoDataService demoDataService,
        RagIngestService ragIngestService,
        ProjectMemberRepository projectMemberRepository
    ) {
        this.meetingRepository = meetingRepository;
        this.meetingAnalysisRepository = meetingAnalysisRepository;
        this.meetingActionItemRepository = meetingActionItemRepository;
        this.userRepository = userRepository;
        this.demoDataService = demoDataService;
        this.ragIngestService = ragIngestService;
        this.projectMemberRepository = projectMemberRepository;
    }

    @Transactional
    public void saveAnalysisSuccess(Long meetingId, MeetingAnalysisResult result, String analysisSource) {
        Meeting meeting = meetingRepository.findById(meetingId).orElseThrow(
            () -> new IllegalStateException("Meeting not found: " + meetingId));

        MeetingAnalysis analysis = meetingAnalysisRepository.save(new MeetingAnalysis(
            meetingId, result.summary(), result.decisions(), result.risks(), result.keywords(), analysisSource
        ));
        ragIngestService.ingestBestEffort(meeting.getProjectId(), "meeting", analysis.getMeetingId(), buildMeetingIngestContent(result));

        for (MeetingTodo todo : result.todos()) {
            MeetingActionItem actionItem = meetingActionItemRepository.save(new MeetingActionItem(
                meetingId,
                todo.title(),
                todo.description(),
                todo.category(),
                resolveAssigneeByName(todo.assignee_candidate()),
                resolveFinalAssignee(todo, meeting.getProjectId()),
                parseDateOrNull(todo.due_date()),
                todo.priority(),
                null
            ));
            if (actionItem != null) {
                ragIngestService.ingestBestEffort(meeting.getProjectId(), "action_item", actionItem.getId(), buildActionItemIngestContent(actionItem));
            }
        }

        meeting.setAnalysisStatus("completed");
        meetingRepository.save(meeting);
    }

    @Transactional
    public void saveAnalysisFailure(Long meetingId, String errorMessage) {
        meetingRepository.findById(meetingId).ifPresent(meeting -> {
            meeting.setAnalysisStatus("failed");
            meetingRepository.save(meeting);
        });
    }

    public static String toSafeErrorMessage(String errorMessage) {
        if (REUPLOAD_REQUIRED_ERROR_MESSAGE.equals(errorMessage)) {
            return REUPLOAD_REQUIRED_ERROR_MESSAGE;
        }
        if (REUPLOAD_READ_ERROR_MESSAGE.equals(errorMessage)) {
            return REUPLOAD_READ_ERROR_MESSAGE;
        }
        return DEFAULT_ANALYSIS_ERROR_MESSAGE;
    }

    private String buildMeetingIngestContent(MeetingAnalysisResult result) {
        StringBuilder content = new StringBuilder(defaultString(result.summary(), ""));
        if (result.decisions() != null && !result.decisions().isEmpty()) {
            content.append("\n결정사항: ").append(String.join(", ", result.decisions()));
        }
        if (result.risks() != null && !result.risks().isEmpty()) {
            content.append("\n위험요소: ").append(String.join(", ", result.risks()));
        }
        return content.toString();
    }

    private String buildActionItemIngestContent(MeetingActionItem item) {
        StringBuilder content = new StringBuilder(defaultString(item.getTitle(), ""));
        if (item.getDescription() != null && !item.getDescription().isBlank()) {
            content.append(" - ").append(item.getDescription());
        }
        if (item.getBasis() != null && !item.getBasis().isBlank()) {
            content.append("\n근거: ").append(item.getBasis());
        }
        return content.toString();
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

    /**
     * 회의록 본문에 적힌 담당자(assignee_candidate)를 1차 기준으로 최종 담당자를 결정한다.
     * 참석자 목록 여부와 무관하며, 이름이 프로젝트 멤버로 매칭될 때만 배정하고 그렇지 않으면 미배정(null)으로 남긴다.
     */
    private Long resolveFinalAssignee(MeetingTodo todo, Long projectId) {
        Long explicitAssigneeId = resolveAssignee(todo.assignee_id());
        if (explicitAssigneeId != null) {
            return projectMemberRepository.existsByProjectIdAndUserId(projectId, explicitAssigneeId) ? explicitAssigneeId : null;
        }
        Long candidateUserId = resolveAssigneeByName(todo.assignee_candidate());
        if (candidateUserId != null && projectMemberRepository.existsByProjectIdAndUserId(projectId, candidateUserId)) {
            return candidateUserId;
        }
        return null;
    }

    private LocalDate parseDateOrNull(String date) {
        if (date == null || date.isBlank()) return null;
        try {
            return LocalDate.parse(date);
        } catch (Exception e) {
            return null;
        }
    }

    private String defaultString(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
