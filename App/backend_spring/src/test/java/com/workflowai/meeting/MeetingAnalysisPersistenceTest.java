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
import java.util.Map;
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
    @Mock private MeetingAttendeeRepository meetingAttendeeRepository;
    @Mock private UserRepository userRepository;
    @Mock private DemoDataService demoDataService;
    @Mock private RagIngestService ragIngestService;
    @Mock private ProjectMemberRepository projectMemberRepository;

    private MeetingAnalysisPersistence newPersistence() {
        return new MeetingAnalysisPersistence(
            meetingRepository, meetingAnalysisRepository, meetingActionItemRepository, meetingAttendeeRepository,
            userRepository, demoDataService, ragIngestService, projectMemberRepository
        );
    }

    private Meeting newMeeting() {
        return new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
    }

    private void stubSaves() {
        when(meetingAnalysisRepository.save(any(MeetingAnalysis.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(meetingActionItemRepository.save(any(MeetingActionItem.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private void stubMember(String name, Long userId) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(userId);
        when(userRepository.findFirstByName(name)).thenReturn(Optional.of(user));
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, userId)).thenReturn(true);
    }

    @Test
    void saveAnalysisSuccessMarksMeetingCompletedAndStoresTodos() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(5L)).thenReturn(List.of());
        stubSaves();

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
    void assignsTodoWhenCandidateIsProjectMemberAndMeetingAttendee() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        stubSaves();
        stubMember("박지수", 3L);
        when(meetingAttendeeRepository.findByMeetingId(5L)).thenReturn(List.of(new MeetingAttendee(5L, 3L)));

        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "박지수", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("박지수"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository).save(actionItemCaptor.capture());
        assertThat(actionItemCaptor.getValue().getFinalAssigneeId()).isEqualTo(3L);
    }

    @Test
    void leavesTodoUnassignedWhenCandidateIsProjectMemberButNotMeetingAttendee() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        stubSaves();
        // 유소은은 프로젝트 멤버지만 이번 회의의 참석자로 체크되지 않았다.
        // 참석자 여부를 먼저 검사하므로 프로젝트 멤버십 조회 자체가 호출되지 않는다.
        User outsider = mock(User.class);
        when(outsider.getId()).thenReturn(9L);
        when(userRepository.findFirstByName("유소은")).thenReturn(Optional.of(outsider));
        when(meetingAttendeeRepository.findByMeetingId(5L)).thenReturn(
            List.of(new MeetingAttendee(5L, 1L), new MeetingAttendee(5L, 2L))
        );

        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "유소은", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("김민준", "이서연"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository).save(actionItemCaptor.capture());
        assertThat(actionItemCaptor.getValue().getFinalAssigneeId()).isNull();
        assertThat(actionItemCaptor.getValue().getRecommendedAssigneeId()).isEqualTo(9L);
    }

    @Test
    void leavesTodoUnassignedWhenCandidateIsNotProjectMemberOrSystemUser() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        stubSaves();
        when(userRepository.findFirstByName("고무서")).thenReturn(Optional.empty());
        when(meetingAttendeeRepository.findByMeetingId(5L)).thenReturn(
            List.of(new MeetingAttendee(5L, 1L), new MeetingAttendee(5L, 2L))
        );

        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "고무서", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("김민준", "이서연"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository).save(actionItemCaptor.capture());
        assertThat(actionItemCaptor.getValue().getFinalAssigneeId()).isNull();
        assertThat(actionItemCaptor.getValue().getRecommendedAssigneeId()).isNull();
    }

    @Test
    void onlyAttendeeMatchedCandidateIsAssignedAmongManyBodyNames() {
        // 업로드 시 체크된 참석자: 김민준, 이서연, 박지수, 최동혁.
        // 회의록 본문에는 고무서/곽진아/박지수/허영주/유소은/박상준/이은주가 담당자로 언급된다.
        // 참석자이자 프로젝트 멤버인 박지수만 자동 배정되고 나머지는 모두 미배정이어야 한다.
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));
        stubSaves();

        Map<String, Long> outsiderIds = Map.of(
            "고무서", 101L, "곽진아", 102L, "허영주", 103L,
            "유소은", 104L, "박상준", 105L, "이은주", 106L
        );
        outsiderIds.forEach((name, userId) -> {
            User outsider = mock(User.class);
            when(outsider.getId()).thenReturn(userId);
            when(userRepository.findFirstByName(name)).thenReturn(Optional.of(outsider));
            // 참석자 여부를 먼저 검사하므로, 참석자가 아닌 이들은 프로젝트 멤버십 조회까지 가지 않는다.
        });
        stubMember("박지수", 3L);

        when(meetingAttendeeRepository.findByMeetingId(5L)).thenReturn(List.of(
            new MeetingAttendee(5L, 1L), // 김민준
            new MeetingAttendee(5L, 2L), // 이서연
            new MeetingAttendee(5L, 3L), // 박지수
            new MeetingAttendee(5L, 4L)  // 최동혁
        ));

        List<MeetingTodo> todos = List.of(
            new MeetingTodo("t1", "설명", "고무서", null, "2026-07-20", "HIGH", "ETC", true),
            new MeetingTodo("t2", "설명", "곽진아", null, "2026-07-20", "HIGH", "ETC", true),
            new MeetingTodo("t3", "설명", "박지수", null, "2026-07-20", "HIGH", "ETC", true),
            new MeetingTodo("t4", "설명", "허영주", null, "2026-07-20", "HIGH", "ETC", true),
            new MeetingTodo("t5", "설명", "유소은", null, "2026-07-20", "HIGH", "ETC", true),
            new MeetingTodo("t6", "설명", "박상준", null, "2026-07-20", "HIGH", "ETC", true),
            new MeetingTodo("t7", "설명", "이은주", null, "2026-07-20", "HIGH", "ETC", true)
        );
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약", List.of("결정1"), todos, List.of("위험1"), List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("김민준", "이서연", "박지수", "최동혁"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<MeetingActionItem> actionItemCaptor = ArgumentCaptor.forClass(MeetingActionItem.class);
        verify(meetingActionItemRepository, org.mockito.Mockito.times(7)).save(actionItemCaptor.capture());
        Map<String, Long> finalAssigneeByTitle = new java.util.HashMap<>();
        actionItemCaptor.getAllValues().forEach(item -> finalAssigneeByTitle.put(item.getTitle(), item.getFinalAssigneeId()));

        assertThat(finalAssigneeByTitle.get("t3")).isEqualTo(3L);
        assertThat(finalAssigneeByTitle.get("t1")).isNull();
        assertThat(finalAssigneeByTitle.get("t2")).isNull();
        assertThat(finalAssigneeByTitle.get("t4")).isNull();
        assertThat(finalAssigneeByTitle.get("t5")).isNull();
        assertThat(finalAssigneeByTitle.get("t6")).isNull();
        assertThat(finalAssigneeByTitle.get("t7")).isNull();
    }

    @Test
    void saveAnalysisFailureMarksMeetingFailedWithMessage() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(7L)).thenReturn(Optional.of(meeting));

        persistence.saveAnalysisFailure(7L, "FastAPI 연결 실패");

        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getValue().getAnalysisStatus()).isEqualTo("failed");
        verify(meetingAnalysisRepository, never()).save(any());
    }
}
