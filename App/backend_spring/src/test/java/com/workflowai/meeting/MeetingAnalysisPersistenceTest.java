package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.workflowai.common.DemoDataService;
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

    private MeetingAnalysisPersistence newPersistence() {
        return new MeetingAnalysisPersistence(
            meetingRepository, meetingAnalysisRepository, meetingActionItemRepository, userRepository, demoDataService
        );
    }

    @Test
    void saveAnalysisSuccessMarksMeetingCompletedAndStoresTodos() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));

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
        assertThat(meetingCaptor.getValue().getAnalysisErrorMessage()).isEqualTo("FastAPI 연결 실패");
    }
}
