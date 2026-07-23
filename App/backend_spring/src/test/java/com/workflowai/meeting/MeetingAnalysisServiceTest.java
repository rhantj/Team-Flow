package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.workflowai.common.DemoDataService;
import com.workflowai.notification.NotificationRepository;
import com.workflowai.project.ProjectMember;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.project.ProjectRole;
import com.workflowai.rag.RagIngestService;
import com.workflowai.security.UserPrincipal;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisServiceTest {

    private static final Long CURRENT_USER_ID = 1L;

    @Mock private MeetingAnalysisJobPublisher meetingAnalysisJobPublisher;
    @Mock private DemoDataService demoDataService;
    @Mock private MeetingRepository meetingRepository;
    @Mock private MeetingAttendeeRepository meetingAttendeeRepository;
    @Mock private MeetingAnalysisRepository meetingAnalysisRepository;
    @Mock private MeetingActionItemRepository meetingActionItemRepository;
    @Mock private TaskRepository taskRepository;
    @Mock private NotificationRepository notificationRepository;
    @Mock private UserRepository userRepository;
    @Mock private ProjectMemberRepository projectMemberRepository;
    @Mock private RagIngestService ragIngestService;
    @Mock private MeetingAnalysisPersistence meetingAnalysisPersistence;

    @BeforeEach
    void authenticateAsCurrentUser() {
        UserPrincipal principal = new UserPrincipal(CURRENT_USER_ID, "user@example.com", "김민준");
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(principal, null, List.of())
        );
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private MeetingAnalysisService newService() {
        return new MeetingAnalysisService(
            meetingAnalysisJobPublisher, demoDataService, meetingRepository, meetingAttendeeRepository,
            meetingAnalysisRepository, meetingActionItemRepository, taskRepository, notificationRepository,
            userRepository, projectMemberRepository, ragIngestService, meetingAnalysisPersistence, "/tmp/workflow-uploads"
        );
    }

    private void mockMember(Long projectDbId) {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(projectDbId);
        when(projectMemberRepository.existsByProjectIdAndUserId(projectDbId, CURRENT_USER_ID)).thenReturn(true);
    }

    @Test
    void analyzeSavesMeetingAsProcessingAndReturnsImmediately() {
        mockMember(1L);
        MeetingAnalysisService service = newService();
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
        MeetingAnalysisResponse response = service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of("김민준"), null
        );

        assertThat(response.status()).isEqualTo("PROCESSING");
        assertThat(response.analysis()).isNull();
        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository, atLeastOnce()).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getAllValues().get(0).getAnalysisStatus()).isEqualTo("processing");
        verify(meetingAnalysisJobPublisher).enqueue(any(), any(AiAnalyzeRequest.class));
    }

    @Test
    void analyzeExtractsPdfTextBeforeDispatchingAnalysisRequest() throws Exception {
        mockMember(1L);
        MeetingAnalysisService service = newService();
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MockMultipartFile file = new MockMultipartFile(
            "file",
            "minutes.pdf",
            "application/pdf",
            createPdfBytes("Meeting minutes body: Park Jisu checks retry flow.")
        );

        service.analyze(
            "demo-project", file, "PDF 회의록", "2026-07-20", "정기회의", "document", List.of("박지수"), null
        );

        ArgumentCaptor<AiAnalyzeRequest> requestCaptor = ArgumentCaptor.forClass(AiAnalyzeRequest.class);
        verify(meetingAnalysisJobPublisher).enqueue(any(), requestCaptor.capture());
        assertThat(requestCaptor.getValue().text()).contains("Meeting minutes body");
        assertThat(requestCaptor.getValue().text()).doesNotContain("텍스트 추출 예정");
    }

    @Test
    void analyzeEnqueuesOnlyAfterTransactionCommitWhenSynchronizationIsActive() {
        mockMember(1L);
        MeetingAnalysisService service = newService();
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> {
            Meeting meeting = invocation.getArgument(0);
            ReflectionTestUtils.setField(meeting, "id", 12L);
            return meeting;
        });
        TransactionSynchronizationManager.initSynchronization();

        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
        service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of("김민준"), null
        );

        verify(meetingAnalysisJobPublisher, never()).enqueue(any(), any());
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(meetingAnalysisJobPublisher).enqueue(eq(12L), any(AiAnalyzeRequest.class));
    }

    @Test
    void analyzeMarksMeetingFailedWhenImmediateEnqueueFails() {
        mockMember(1L);
        MeetingAnalysisService service = newService();
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> {
            Meeting meeting = invocation.getArgument(0);
            ReflectionTestUtils.setField(meeting, "id", 13L);
            return meeting;
        });
        doThrow(new IllegalStateException("redis unavailable"))
            .when(meetingAnalysisJobPublisher).enqueue(any(), any());

        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
        service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of("김민준"), null
        );

        verify(meetingAnalysisPersistence).saveAnalysisFailure(
            13L,
            MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE
        );
    }

    @Test
    void analyzeMarksMeetingFailedWhenAfterCommitEnqueueFails() {
        mockMember(1L);
        MeetingAnalysisService service = newService();
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> {
            Meeting meeting = invocation.getArgument(0);
            ReflectionTestUtils.setField(meeting, "id", 14L);
            return meeting;
        });
        doThrow(new IllegalStateException("redis unavailable"))
            .when(meetingAnalysisJobPublisher).enqueue(any(), any());
        TransactionSynchronizationManager.initSynchronization();

        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
        service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of("김민준"), null
        );

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(meetingAnalysisPersistence).saveAnalysisFailure(
            14L,
            MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE
        );
    }

    @Test
    void analyzeRejectsAttendeeThatIsNotProjectMember() {
        mockMember(1L);
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 99L)).thenReturn(false);
        MeetingAnalysisService service = newService();
        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());

        assertThatThrownBy(() -> service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of(), List.of(99L)
        )).isInstanceOf(IllegalArgumentException.class);

        verify(meetingRepository, never()).save(any());
    }

    @Test
    void analyzeSavesValidatedAttendeesAndIncludesThemInResponse() {
        mockMember(1L);
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, 2L)).thenReturn(true);
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> invocation.getArgument(0));
        User attendeeUser = mock(User.class);
        when(attendeeUser.getId()).thenReturn(2L);
        when(attendeeUser.getName()).thenReturn("이서연");
        when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(attendeeUser));
        when(meetingAttendeeRepository.findByMeetingId(any())).thenReturn(List.of(new MeetingAttendee(null, 2L)));
        when(projectMemberRepository.findAllByProjectId(1L)).thenReturn(List.of(new ProjectMember(1L, 2L, ProjectRole.MEMBER)));

        MeetingAnalysisService service = newService();
        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
        MeetingAnalysisResponse response = service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of(), List.of(2L)
        );

        ArgumentCaptor<MeetingAttendee> attendeeCaptor = ArgumentCaptor.forClass(MeetingAttendee.class);
        verify(meetingAttendeeRepository).save(attendeeCaptor.capture());
        assertThat(attendeeCaptor.getValue().getUserId()).isEqualTo(2L);
        assertThat(response.attendees()).hasSize(1);
        assertThat(response.attendees().get(0).id()).isEqualTo(2L);
        assertThat(response.attendees().get(0).name()).isEqualTo("이서연");
        assertThat(response.attendees().get(0).role()).isEqualTo("팀원");
    }

    @Test
    void nonMemberIsDeniedAccessToProjectMeetings() {
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(projectMemberRepository.existsByProjectIdAndUserId(1L, CURRENT_USER_ID)).thenReturn(false);
        MeetingAnalysisService service = newService();

        assertThatThrownBy(() -> service.find("demo-project", "5")).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> service.findByProject("demo-project")).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void findReturnsNullWhenMeetingBelongsToAnotherProject() {
        mockMember(1L);
        when(meetingRepository.findByIdAndProjectId(99L, 1L)).thenReturn(Optional.empty());
        MeetingAnalysisService service = newService();

        assertThat(service.find("demo-project", "99")).isNull();
    }

    @Test
    void findByProjectOnlyQueriesMeetingsScopedToThatProject() {
        mockMember(1L);
        Meeting meeting = new Meeting(1L, "정기회의", "document", "/tmp/x.txt", "processing", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(meeting));
        MeetingAnalysisService service = newService();

        List<MeetingSummary> result = service.findByProject("demo-project");

        assertThat(result).hasSize(1);
        verify(meetingRepository).findByProjectIdOrderByCreatedAtDesc(1L);
    }

    @Test
    void deleteReturnsNullWhenMeetingBelongsToAnotherProject() {
        mockMember(1L);
        when(meetingRepository.findByIdAndProjectId(99L, 1L)).thenReturn(Optional.empty());
        MeetingAnalysisService service = newService();

        assertThat(service.delete("demo-project", "99", false)).isNull();

        verify(meetingRepository, never()).delete(any());
        verify(meetingAttendeeRepository, never()).deleteByMeetingId(any());
        verify(meetingActionItemRepository, never()).deleteByMeetingId(any());
        verify(meetingActionItemRepository, never()).clearMeetingId(any());
        verify(meetingAnalysisRepository, never()).deleteById(any());
        verify(taskRepository, never()).clearSourceMeetingId(any());
        verify(taskRepository, never()).deleteBySourceMeetingId(any());
    }

    @Test
    void deleteRemovesMeetingRelatedRowsAndUploadedFile() throws Exception {
        mockMember(1L);
        Path dir = Files.createTempDirectory("meeting-delete");
        Path file = dir.resolve("notes.txt");
        Files.writeString(file, "삭제할 회의록");
        Meeting meeting = new Meeting(1L, "삭제 회의", "document", file.toString(), "completed", LocalDate.now(), "정기회의", "notes.txt", CURRENT_USER_ID, 5L);
        when(meetingRepository.findByIdAndProjectId(8L, 1L)).thenReturn(Optional.of(meeting));
        when(meetingAnalysisRepository.existsById(8L)).thenReturn(true);
        MeetingAnalysisService service = newService();

        MeetingDeleteResponse response = service.delete("demo-project", "8", false);

        assertThat(response.meetingId()).isEqualTo("8");
        assertThat(response.status()).isEqualTo("DELETED");
        verify(meetingActionItemRepository, never()).deleteByMeetingId(any());
        verify(meetingActionItemRepository).clearMeetingId(8L);
        verify(meetingAttendeeRepository).deleteByMeetingId(8L);
        verify(taskRepository).clearSourceMeetingId(8L);
        verify(taskRepository, never()).deleteBySourceMeetingId(any());
        verify(meetingAnalysisRepository).deleteById(8L);
        verify(meetingRepository).delete(meeting);
        assertThat(Files.exists(file)).isFalse();
        Files.deleteIfExists(dir);
    }

    @Test
    void deleteRejectsWhenCurrentUserIsNotTheUploader() {
        mockMember(1L);
        Long otherUploaderId = 999L;
        Meeting meeting = new Meeting(1L, "삭제 회의", "document", "/tmp/x.txt", "completed", LocalDate.now(), "정기회의", "notes.txt", otherUploaderId, 5L);
        when(meetingRepository.findByIdAndProjectId(10L, 1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisService service = newService();

        assertThatThrownBy(() -> service.delete("demo-project", "10", false))
            .isInstanceOf(AccessDeniedException.class);

        verify(meetingRepository, never()).delete(any());
        verify(meetingActionItemRepository, never()).deleteByMeetingId(any());
        verify(meetingActionItemRepository, never()).clearMeetingId(any());
    }

    @Test
    void deleteRejectsWhenMeetingHasNoRecordedUploader() {
        mockMember(1L);
        Meeting meeting = new Meeting(1L, "삭제 회의", "document", "/tmp/x.txt", "completed", LocalDate.now(), "정기회의", "notes.txt", null, 5L);
        when(meetingRepository.findByIdAndProjectId(11L, 1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisService service = newService();

        assertThatThrownBy(() -> service.delete("demo-project", "11", false))
            .isInstanceOf(AccessDeniedException.class);

        verify(meetingRepository, never()).delete(any());
    }

    @Test
    void deleteCanRemoveLinkedBoardTasksWhenRequested() {
        mockMember(1L);
        Meeting meeting = new Meeting(1L, "삭제 회의", "document", null, "completed", LocalDate.now(), "정기회의", "notes.txt", CURRENT_USER_ID, 5L);
        when(meetingRepository.findByIdAndProjectId(9L, 1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisService service = newService();

        MeetingDeleteResponse response = service.delete("demo-project", "9", true);

        assertThat(response.status()).isEqualTo("DELETED");
        org.mockito.InOrder inOrder = org.mockito.Mockito.inOrder(meetingActionItemRepository, taskRepository, meetingRepository);
        inOrder.verify(meetingActionItemRepository).deleteByMeetingId(9L);
        inOrder.verify(taskRepository).deleteBySourceMeetingId(9L);
        inOrder.verify(meetingRepository).delete(meeting);
        verify(taskRepository).deleteBySourceMeetingId(9L);
        verify(taskRepository, never()).clearSourceMeetingId(any());
        verify(meetingActionItemRepository, never()).clearMeetingId(any());
        verify(meetingRepository).delete(meeting);
    }

    @Test
    void retryRejectsMeetingThatIsNotFailed() {
        mockMember(1L);
        Meeting meeting = new Meeting(1L, "정기회의", "document", "/tmp/x.txt", "processing", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findByIdAndProjectId(3L, 1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisService service = newService();

        assertThatThrownBy(() -> service.retry("demo-project", "3")).isInstanceOf(IllegalStateException.class);
        verify(meetingAnalysisJobPublisher, never()).enqueue(any(), any());
    }

    @Test
    void findUsesConsistentProjectIdAndFileTypeForProcessingAndCompletedResponses() {
        mockMember(1L);
        Meeting meeting = new Meeting(1L, "정기회의", "audio", "/tmp/x.mp3", "processing", LocalDate.now(), "정기회의", "x.mp3", null, 5L);
        when(meetingRepository.findByIdAndProjectId(5L, 1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisService service = newService();

        MeetingAnalysisResponse processing = service.find("demo-project", "5");

        assertThat(processing.projectId()).isEqualTo("demo-project");
        assertThat(processing.sourceType()).isEqualTo("audio");
        assertThat(processing.status()).isEqualTo("PROCESSING");

        meeting.setAnalysisStatus("completed");
        when(meetingAnalysisRepository.findById(5L)).thenReturn(Optional.of(new MeetingAnalysis(
            5L, "요약", List.of("결정"), List.of("위험"), List.of("키워드"), "FASTAPI"
        )));
        when(meetingActionItemRepository.findByMeetingId(5L)).thenReturn(List.of());

        MeetingAnalysisResponse completed = service.find("demo-project", "5");

        assertThat(completed.projectId()).isEqualTo("demo-project");
        assertThat(completed.sourceType()).isEqualTo("audio");
        assertThat(completed.status()).isEqualTo("COMPLETED");
    }

    @Test
    void retryTransitionsFailedMeetingBackToProcessing() throws Exception {
        mockMember(1L);
        Path textFile = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(textFile, "재분석할 회의 내용");
        Meeting meeting = new Meeting(1L, "정기회의", "document", textFile.toString(), "failed", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findByIdAndProjectId(4L, 1L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(4L)).thenReturn(List.of());
        MeetingAnalysisService service = newService();

        MeetingAnalysisResponse response = service.retry("demo-project", "4");

        assertThat(response.status()).isEqualTo("PROCESSING");
        assertThat(meeting.getAnalysisStatus()).isEqualTo("processing");
        verify(meetingAnalysisJobPublisher).enqueue(4L, new AiAnalyzeRequest(
            "demo-project", "정기회의", meeting.getMeetingDate().toString(), "정기회의", "document", "x.txt", "재분석할 회의 내용", List.of()
        ));
        Files.deleteIfExists(textFile);
    }

    @Test
    void retryMarksMeetingFailedWhenEnqueueFails() throws Exception {
        mockMember(1L);
        Path textFile = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(textFile, "재분석할 회의 내용");
        Meeting meeting = new Meeting(1L, "정기회의", "document", textFile.toString(), "failed", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findByIdAndProjectId(8L, 1L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(8L)).thenReturn(List.of());
        doThrow(new IllegalStateException("redis unavailable"))
            .when(meetingAnalysisJobPublisher).enqueue(any(), any());
        MeetingAnalysisService service = newService();

        service.retry("demo-project", "8");

        verify(meetingAnalysisPersistence).saveAnalysisFailure(
            8L,
            MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE
        );
        Files.deleteIfExists(textFile);
    }

    @Test
    void retryFailsWithClearMessageWhenStoredFileIsNotTextExtractable() throws Exception {
        mockMember(1L);
        Path audioFile = Files.createTempFile("meeting-audio", ".mp3");
        Files.write(audioFile, new byte[] { 0, 1, 2, 3 });
        Meeting meeting = new Meeting(
            1L, "정기회의", "audio", audioFile.toString(), "failed", LocalDate.now(), "정기회의", "recording.mp3", null, 5L
        );
        when(meetingRepository.findByIdAndProjectId(6L, 1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisService service = newService();

        MeetingAnalysisResponse response = service.retry("demo-project", "6");

        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.errorMessage()).isEqualTo(MeetingAnalysisPersistence.REUPLOAD_REQUIRED_ERROR_MESSAGE);
        verify(meetingAnalysisPersistence).saveAnalysisFailure(6L, MeetingAnalysisPersistence.REUPLOAD_REQUIRED_ERROR_MESSAGE);
        verify(meetingAnalysisRepository, never()).save(any());
        verify(meetingAnalysisJobPublisher, never()).enqueue(any(), any());
        Files.deleteIfExists(audioFile);
    }

    @Test
    void retryFailsWithClearMessageWhenStoredFileIsEmpty() throws Exception {
        mockMember(1L);
        Path emptyFile = Files.createTempFile("meeting-empty", ".txt");
        Meeting meeting = new Meeting(
            1L, "정기회의", "document", emptyFile.toString(), "failed", LocalDate.now(), "정기회의", "empty.txt", null, 5L
        );
        when(meetingRepository.findByIdAndProjectId(7L, 1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisService service = newService();

        MeetingAnalysisResponse response = service.retry("demo-project", "7");

        assertThat(response.status()).isEqualTo("FAILED");
        assertThat(response.errorMessage()).isEqualTo(MeetingAnalysisPersistence.REUPLOAD_READ_ERROR_MESSAGE);
        verify(meetingAnalysisPersistence).saveAnalysisFailure(7L, MeetingAnalysisPersistence.REUPLOAD_READ_ERROR_MESSAGE);
        verify(meetingAnalysisRepository, never()).save(any());
        verify(meetingAnalysisJobPublisher, never()).enqueue(any(), any());
        Files.deleteIfExists(emptyFile);
    }

    @Test
    void attendanceSummaryComputesAttendedCountAndRatePerMember() {
        mockMember(1L);
        Meeting meetingOne = new Meeting(1L, "1차 회의", "document", null, "completed", LocalDate.now(), "정기회의", "a.txt", null, 1L);
        Meeting meetingTwo = new Meeting(1L, "2차 회의", "document", null, "completed", LocalDate.now(), "정기회의", "b.txt", null, 1L);
        when(meetingRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(meetingOne, meetingTwo));
        when(meetingAttendeeRepository.findByMeetingIdIn(any())).thenReturn(List.of(
            new MeetingAttendee(null, 2L),
            new MeetingAttendee(null, 2L)
        ));
        User attendeeUser = mock(User.class);
        when(attendeeUser.getId()).thenReturn(2L);
        when(attendeeUser.getName()).thenReturn("이서연");
        when(projectMemberRepository.findAllByProjectId(1L)).thenReturn(List.of(new ProjectMember(1L, 2L, ProjectRole.MEMBER)));
        when(userRepository.findAllById(List.of(2L))).thenReturn(List.of(attendeeUser));
        MeetingAnalysisService service = newService();

        List<MeetingAttendanceSummary> summary = service.attendanceSummary("demo-project");

        assertThat(summary).hasSize(1);
        assertThat(summary.get(0).userId()).isEqualTo(2L);
        assertThat(summary.get(0).meetingsAttended()).isEqualTo(2);
        assertThat(summary.get(0).totalMeetings()).isEqualTo(2);
        assertThat(summary.get(0).attendanceRate()).isEqualTo(100);
    }

    @Test
    void attendanceDetailMarksAttendedAndAbsentMeetingsSortedByDate() {
        mockMember(1L);
        Meeting laterMeeting = new Meeting(1L, "12.11 스프린트 리뷰", "document", null, "completed", LocalDate.of(2026, 12, 11), "정기회의", "b.txt", null, 1L);
        Meeting earlierMeeting = new Meeting(1L, "12.10 팀 정기 회의", "document", null, "completed", LocalDate.of(2026, 12, 10), "정기회의", "a.txt", null, 1L);
        when(meetingRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(laterMeeting, earlierMeeting));
        when(meetingAttendeeRepository.findByMeetingIdIn(any())).thenReturn(List.of(
            new MeetingAttendee(null, 2L)
        ));
        MeetingAnalysisService service = newService();

        List<MeetingAttendanceDetail> detail = service.attendanceDetail("demo-project", 2L);

        assertThat(detail).hasSize(2);
        assertThat(detail.get(0).title()).isEqualTo("12.10 팀 정기 회의");
        assertThat(detail.get(0).attended()).isFalse();
        assertThat(detail.get(1).title()).isEqualTo("12.11 스프린트 리뷰");
        assertThat(detail.get(1).attended()).isFalse();
    }

    @Test
    void attendanceDetailMarksAttendedMeetingAsAttended() {
        mockMember(1L);
        Long attendedMeetingId = 50L;

        Meeting attendedMeeting = new Meeting(1L, "12.10 참석한 회의", "document", null, "completed", LocalDate.of(2026, 12, 10), "정기회의", "a.txt", null, 1L);
        ReflectionTestUtils.setField(attendedMeeting, "id", attendedMeetingId);

        Meeting absentMeeting = new Meeting(1L, "12.11 미참석 회의", "document", null, "completed", LocalDate.of(2026, 12, 11), "정기회의", "b.txt", null, 1L);

        when(meetingRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(absentMeeting, attendedMeeting));

        MeetingAttendee attendee = new MeetingAttendee(null, 2L);
        ReflectionTestUtils.setField(attendee, "meetingId", attendedMeetingId);

        when(meetingAttendeeRepository.findByMeetingIdIn(any())).thenReturn(List.of(attendee));

        MeetingAnalysisService service = newService();

        List<MeetingAttendanceDetail> detail = service.attendanceDetail("demo-project", 2L);

        assertThat(detail).hasSize(2);
        assertThat(detail.get(0).title()).isEqualTo("12.10 참석한 회의");
        assertThat(detail.get(0).attended()).isTrue();
        assertThat(detail.get(1).title()).isEqualTo("12.11 미참석 회의");
        assertThat(detail.get(1).attended()).isFalse();
    }

    @Test
    void attendanceDetailReturnsEmptyListWhenNoMeetings() {
        mockMember(1L);
        when(meetingRepository.findByProjectIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());
        MeetingAnalysisService service = newService();

        List<MeetingAttendanceDetail> detail = service.attendanceDetail("demo-project", 2L);

        assertThat(detail).isEmpty();
    }

    private byte[] createPdfBytes(String text) throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(50, 700);
                content.showText(text);
                content.endText();
            }
            document.save(output);
            return output.toByteArray();
        }
    }
}
