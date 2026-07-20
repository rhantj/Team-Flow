package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.workflowai.common.DemoDataService;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.rag.RagIngestService;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisPersistenceTest {

    @Mock private MeetingRepository meetingRepository;
    @Mock private MeetingAnalysisRepository meetingAnalysisRepository;
    @Mock private MeetingActionItemRepository meetingActionItemRepository;
    @Mock private UserRepository userRepository;
    @Mock private DemoDataService demoDataService;
    @Mock private RagIngestService ragIngestService;
    @Mock private ProjectMemberRepository projectMemberRepository;

    private MeetingAnalysisPersistence newPersistence() {
        return new MeetingAnalysisPersistence(
            meetingRepository, meetingAnalysisRepository, meetingActionItemRepository, userRepository,
            demoDataService, ragIngestService, projectMemberRepository
        );
    }

    @Test
    void saveAnalysisSuccessMarksMeetingCompletedAndStoresTodos() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        when(meetingAnalysisRepository.save(any(MeetingAnalysis.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(meetingActionItemRepository.save(any(MeetingActionItem.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "김민준", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("김민준"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getValue().getAnalysisStatus()).isEqualTo("completed");

        ArgumentCaptor<MeetingAnalysis> analysisCaptor = ArgumentCaptor.forClass(MeetingAnalysis.class);
        verify(meetingAnalysisRepository).save(analysisCaptor.capture());
        MeetingAnalysis savedAnalysis = analysisCaptor.getValue();
        assertThat(savedAnalysis.getSummary()).isEqualTo("요약");
        assertThat(savedAnalysis.getDecisions()).isEqualTo(List.of("결정1"));
        assertThat(savedAnalysis.getRisks()).isEqualTo(List.of("위험1"));
        assertThat(savedAnalysis.getKeywords()).isEqualTo(List.of("키워드1"));
        assertThat(savedAnalysis.getAnalysisEngine()).isEqualTo("FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository).save(actionItemCaptor.capture());
        MeetingActionItem savedActionItem = actionItemCaptor.getValue();
        assertThat(savedActionItem.getTitle()).isEqualTo("업무1");
        assertThat(savedActionItem.getDescription()).isEqualTo("설명");
        assertThat(savedActionItem.getCategory()).isEqualTo("ETC");
        assertThat(savedActionItem.getPriority()).isEqualTo("HIGH");
        assertThat(savedActionItem.getDueDate()).isEqualTo(LocalDate.parse("2026-07-20"));
        assertThat(savedActionItem.getRecommendedAssigneeId()).isNull();
        assertThat(savedActionItem.getFinalAssigneeId()).isNull();
        verify(ragIngestService).ingestBestEffort(1L, "meeting", 5L, "요약\n결정사항: 결정1\n위험요소: 위험1");
    }

    @Test
    void assignsTodoWhenTextMentionedNameIsProjectMember() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        when(meetingAnalysisRepository.save(any(MeetingAnalysis.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(meetingActionItemRepository.save(any(MeetingActionItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
        User member = mock(User.class);
        when(member.getId()).thenReturn(3L);
        when(userRepository.findFirstByName("유소은")).thenReturn(Optional.of(member));
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 3L)).thenReturn(true);

        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "유소은", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("김민준", "이서연", "박지수", "최동혁"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository).save(actionItemCaptor.capture());
        assertThat(actionItemCaptor.getValue().getFinalAssigneeId()).isEqualTo(3L);
    }

    @Test
    void assignsTodoWhenTextMentionedNameIsProjectMemberButNotAttendee() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        when(meetingAnalysisRepository.save(any(MeetingAnalysis.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(meetingActionItemRepository.save(any(MeetingActionItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
        User member = mock(User.class);
        when(member.getId()).thenReturn(4L);
        when(userRepository.findFirstByName("박지수")).thenReturn(Optional.of(member));
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 4L)).thenReturn(true);

        // 회의록 본문의 담당자(박지수)는 참석자 목록(김민준, 이서연)에는 없지만 프로젝트 멤버다.
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "박지수", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("김민준", "이서연"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository).save(actionItemCaptor.capture());
        assertThat(actionItemCaptor.getValue().getFinalAssigneeId()).isEqualTo(4L);
    }

    @Test
    void leavesTodoUnassignedWhenTextMentionedNameIsNotProjectMember() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        when(meetingAnalysisRepository.save(any(MeetingAnalysis.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(meetingActionItemRepository.save(any(MeetingActionItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
        User outsider = mock(User.class);
        when(outsider.getId()).thenReturn(9L);
        when(userRepository.findFirstByName("유소은")).thenReturn(Optional.of(outsider));
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 9L)).thenReturn(false);

        // 유소은은 시스템에 계정은 있지만 이 프로젝트의 멤버가 아니다 -> 미배정으로 남아야 한다.
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "유소은", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("김민준", "이서연", "박지수", "최동혁"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository).save(actionItemCaptor.capture());
        assertThat(actionItemCaptor.getValue().getFinalAssigneeId()).isNull();
        assertThat(actionItemCaptor.getValue().getRecommendedAssigneeId()).isEqualTo(9L);
    }

    @Test
    void doesNotRejectAssignmentSolelyForBeingAbsentFromAttendeeList() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        when(meetingAnalysisRepository.save(any(MeetingAnalysis.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(meetingActionItemRepository.save(any(MeetingActionItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
        User member = mock(User.class);
        when(member.getId()).thenReturn(4L);
        when(userRepository.findFirstByName("박지수")).thenReturn(Optional.of(member));
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 4L)).thenReturn(true);

        // 참석자 목록이 비어 있어도(참석자 정보가 아예 없어도) 프로젝트 멤버라면 배정되어야 한다.
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "박지수", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of())
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository).save(actionItemCaptor.capture());
        assertThat(actionItemCaptor.getValue().getFinalAssigneeId()).isEqualTo(4L);
    }

    @Test
    void saveAnalysisFailureMarksMeetingFailedWithMessage() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(7L)).thenReturn(Optional.of(meeting));

        persistence.saveAnalysisFailure(7L, "FastAPI 연결 실패");

        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getValue().getAnalysisStatus()).isEqualTo("failed");
        verify(meetingAnalysisRepository, never()).save(any());
    }
}
