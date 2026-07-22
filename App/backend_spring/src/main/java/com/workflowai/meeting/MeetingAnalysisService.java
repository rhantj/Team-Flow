package com.workflowai.meeting;

import com.workflowai.common.DemoDataService;
import com.workflowai.notification.Notification;
import com.workflowai.notification.NotificationRepository;
import com.workflowai.project.ProjectMember;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.rag.RagIngestService;
import com.workflowai.security.CurrentUser;
import com.workflowai.task.Task;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MeetingAnalysisService {
    private static final Logger log = LoggerFactory.getLogger(MeetingAnalysisService.class);

    private final MeetingAnalysisRunner meetingAnalysisRunner;
    private final DemoDataService demoDataService;
    private final MeetingRepository meetingRepository;
    private final MeetingAttendeeRepository meetingAttendeeRepository;
    private final MeetingAnalysisRepository meetingAnalysisRepository;
    private final MeetingActionItemRepository meetingActionItemRepository;
    private final TaskRepository taskRepository;
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final RagIngestService ragIngestService;
    private final MeetingAnalysisPersistence meetingAnalysisPersistence;
    private final String uploadsDir;

    public MeetingAnalysisService(
        MeetingAnalysisRunner meetingAnalysisRunner,
        DemoDataService demoDataService,
        MeetingRepository meetingRepository,
        MeetingAttendeeRepository meetingAttendeeRepository,
        MeetingAnalysisRepository meetingAnalysisRepository,
        MeetingActionItemRepository meetingActionItemRepository,
        TaskRepository taskRepository,
        NotificationRepository notificationRepository,
        UserRepository userRepository,
        ProjectMemberRepository projectMemberRepository,
        RagIngestService ragIngestService,
        MeetingAnalysisPersistence meetingAnalysisPersistence,
        @Value("${workflow.uploads.dir}") String uploadsDir
    ) {
        this.meetingAnalysisRunner = meetingAnalysisRunner;
        this.demoDataService = demoDataService;
        this.meetingRepository = meetingRepository;
        this.meetingAttendeeRepository = meetingAttendeeRepository;
        this.meetingAnalysisRepository = meetingAnalysisRepository;
        this.meetingActionItemRepository = meetingActionItemRepository;
        this.taskRepository = taskRepository;
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.ragIngestService = ragIngestService;
        this.meetingAnalysisPersistence = meetingAnalysisPersistence;
        this.uploadsDir = uploadsDir;
    }

    @Transactional
    public MeetingAnalysisResponse analyze(
        String projectId,
        MultipartFile file,
        String title,
        String meetingDate,
        String meetingKind,
        String sourceType,
        List<String> participants,
        List<Long> attendeeIds
    ) {
        Long projectDbId = requireProjectMember(projectId);
        List<Long> safeAttendeeIds = attendeeIds == null
            ? List.of()
            : attendeeIds.stream().filter(id -> id != null).distinct().toList();
        if (!safeAttendeeIds.isEmpty()) {
            validateAttendeeIds(projectDbId, safeAttendeeIds);
        }

        String fileName = file == null ? null : file.getOriginalFilename();
        String text = extractText(file);
        String resolvedTitle = defaultString(title, "회의록 AI 분석 회의");
        String resolvedDate = defaultString(meetingDate, LocalDate.now().toString());
        String resolvedSourceType = defaultString(sourceType, "document");

        Meeting meeting = meetingRepository.save(new Meeting(
            projectDbId,
            resolvedTitle,
            resolvedSourceType,
            null,
            "processing",
            LocalDate.parse(resolvedDate),
            meetingKind,
            fileName,
            null,
            file == null ? null : file.getSize()
        ));

        meeting.setFilePath(storeUploadedFile(meeting.getId(), file));
        meetingRepository.save(meeting);

        List<String> resolvedParticipantNames;
        if (!safeAttendeeIds.isEmpty()) {
            saveAttendeesByIds(meeting.getId(), safeAttendeeIds);
            resolvedParticipantNames = userRepository.findAllById(safeAttendeeIds).stream().map(User::getName).toList();
        } else {
            List<String> names = safeParticipants(participants);
            saveAttendees(meeting.getId(), projectDbId, names);
            resolvedParticipantNames = names;
        }

        AiAnalyzeRequest request = new AiAnalyzeRequest(
            projectId,
            resolvedTitle,
            resolvedDate,
            defaultString(meetingKind, "정기회의"),
            resolvedSourceType,
            fileName,
            text,
            resolvedParticipantNames
        );
        runAnalysisAfterCommit(meeting.getId(), request);

        String meetingId = String.valueOf(meeting.getId());
        return new MeetingAnalysisResponse(
            meetingId, projectId, "PROCESSING", resolvedSourceType, fileName, null, null, null,
            buildAttendeeSummaries(meeting.getId(), projectDbId)
        );
    }

    public MeetingAnalysisResponse find(String projectId, String meetingId) {
        Meeting meeting = requireProjectMeeting(projectId, meetingId);
        if (meeting == null) return null;
        Long id = parseLongOrNull(meetingId);

        if (!"completed".equals(meeting.getAnalysisStatus())) {
            String status = "failed".equals(meeting.getAnalysisStatus()) ? "FAILED" : "PROCESSING";
            String errorMessage = "FAILED".equals(status)
                ? MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE
                : null;
            return new MeetingAnalysisResponse(
                meetingId,
                toResponseProjectId(meeting.getProjectId()),
                status,
                meeting.getFileType(),
                meeting.getOriginalFileName(),
                null,
                null,
                errorMessage,
                buildAttendeeSummaries(id, meeting.getProjectId())
            );
        }

        MeetingAnalysis analysis = meetingAnalysisRepository.findById(id).orElse(null);
        if (analysis == null) return null;

        List<MeetingTodo> todos = meetingActionItemRepository.findByMeetingId(id).stream()
            .map(this::toMeetingTodo)
            .toList();
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            analysis.getSummary(),
            analysis.getDecisions(),
            todos,
            analysis.getRisks(),
            analysis.getKeywords(),
            new MeetingMeta(
                meeting.getTitle(),
                meeting.getMeetingDate() == null ? null : meeting.getMeetingDate().toString(),
                List.of()
            )
        );
        return new MeetingAnalysisResponse(
            meetingId,
            toResponseProjectId(meeting.getProjectId()),
            "COMPLETED",
            meeting.getFileType(),
            meeting.getOriginalFileName(),
            analysis.getAnalysisEngine(),
            result,
            null,
            buildAttendeeSummaries(id, meeting.getProjectId())
        );
    }

    public MeetingStatusResponse findStatus(String projectId, String meetingId) {
        Meeting meeting = requireProjectMeeting(projectId, meetingId);
        if (meeting == null) return null;
        String status = switch (meeting.getAnalysisStatus()) {
            case "completed" -> "COMPLETED";
            case "failed" -> "FAILED";
            default -> "PROCESSING";
        };
        String errorMessage = "FAILED".equals(status)
            ? MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE
            : null;
        return new MeetingStatusResponse(meetingId, status, errorMessage);
    }

    public MeetingAnalysisResponse retry(String projectId, String meetingId) {
        Meeting meeting = requireProjectMeeting(projectId, meetingId);
        if (meeting == null) return null;
        Long id = parseLongOrNull(meetingId);
        if (!"failed".equals(meeting.getAnalysisStatus())) {
            throw new IllegalStateException("MEETING_NOT_FAILED");
        }

        String text = extractTextFromStoredFile(meeting);
        if (text == null) {
            String errorMessage = MeetingAnalysisPersistence.REUPLOAD_REQUIRED_ERROR_MESSAGE;
            meetingAnalysisPersistence.saveAnalysisFailure(id, errorMessage);
            return new MeetingAnalysisResponse(
                meetingId,
                toResponseProjectId(meeting.getProjectId()),
                "FAILED",
                meeting.getFileType(),
                meeting.getOriginalFileName(),
                null,
                null,
                errorMessage,
                buildAttendeeSummaries(id, meeting.getProjectId())
            );
        }
        if (text.isBlank()) {
            String errorMessage = MeetingAnalysisPersistence.REUPLOAD_READ_ERROR_MESSAGE;
            meetingAnalysisPersistence.saveAnalysisFailure(id, errorMessage);
            return new MeetingAnalysisResponse(
                meetingId,
                toResponseProjectId(meeting.getProjectId()),
                "FAILED",
                meeting.getFileType(),
                meeting.getOriginalFileName(),
                null,
                null,
                errorMessage,
                buildAttendeeSummaries(id, meeting.getProjectId())
            );
        }
        List<String> participantNames = meetingAttendeeRepository.findByMeetingId(id).stream()
            .map(attendee -> userRepository.findById(attendee.getUserId()).map(User::getName).orElse(null))
            .filter(name -> name != null)
            .toList();

        AiAnalyzeRequest request = new AiAnalyzeRequest(
            toResponseProjectId(meeting.getProjectId()),
            meeting.getTitle(),
            meeting.getMeetingDate() == null ? LocalDate.now().toString() : meeting.getMeetingDate().toString(),
            defaultString(meeting.getMeetingType(), "정기회의"),
            defaultString(meeting.getFileType(), "document"),
            meeting.getOriginalFileName(),
            text,
            participantNames
        );

        meeting.setAnalysisStatus("processing");
        meetingRepository.save(meeting);

        meetingAnalysisRunner.runAnalysis(id, request);

        return new MeetingAnalysisResponse(
            meetingId,
            toResponseProjectId(meeting.getProjectId()),
            "PROCESSING",
            meeting.getFileType(),
            meeting.getOriginalFileName(),
            null,
            null,
            null,
            buildAttendeeSummaries(id, meeting.getProjectId())
        );
    }

    public List<MeetingSummary> findByProject(String projectId) {
        Long projectDbId = requireProjectMember(projectId);
        return meetingRepository.findByProjectIdOrderByCreatedAtDesc(projectDbId).stream()
            .map(m -> new MeetingSummary(
                String.valueOf(m.getId()),
                m.getTitle(),
                m.getMeetingDate() == null ? null : m.getMeetingDate().toString(),
                m.getMeetingType(),
                m.getAnalysisStatus()
            ))
            .toList();
    }

    /** 프로젝트 멤버별 회의 참석 횟수/참석률 요약 — 기여도 화면의 회의 참여 지표로 쓰인다. */
    public List<MeetingAttendanceSummary> attendanceSummary(String projectId) {
        Long projectDbId = requireProjectMember(projectId);
        List<Meeting> meetings = meetingRepository.findByProjectIdOrderByCreatedAtDesc(projectDbId);
        int totalMeetings = meetings.size();

        List<Long> meetingIds = meetings.stream().map(Meeting::getId).toList();
        Map<Long, Long> attendedCountByUserId = meetingIds.isEmpty()
            ? Map.of()
            : meetingAttendeeRepository.findByMeetingIdIn(meetingIds).stream()
                .collect(Collectors.groupingBy(MeetingAttendee::getUserId, Collectors.counting()));

        List<ProjectMember> members = projectMemberRepository.findAllByProjectId(projectDbId);
        Map<Long, User> usersById = userRepository
            .findAllById(members.stream().map(ProjectMember::getUserId).toList())
            .stream()
            .collect(Collectors.toMap(User::getId, user -> user));

        return members.stream()
            .map(member -> {
                User user = usersById.get(member.getUserId());
                int attended = attendedCountByUserId.getOrDefault(member.getUserId(), 0L).intValue();
                int rate = totalMeetings == 0 ? 0 : Math.round(attended * 100f / totalMeetings);
                return new MeetingAttendanceSummary(
                    member.getUserId(),
                    user != null ? user.getName() : null,
                    attended,
                    totalMeetings,
                    rate
                );
            })
            .toList();
    }

    @Transactional
    public MeetingDeleteResponse delete(String projectId, String meetingId, boolean deleteLinkedTasks) {
        Meeting meeting = requireProjectMeeting(projectId, meetingId);
        if (meeting == null) return null;
        requireUploader(meeting);

        Long meetingDbId = parseLongOrNull(meetingId);
        if (meetingDbId == null) return null;
        String filePath = meeting.getFilePath();
        meetingAttendeeRepository.deleteByMeetingId(meetingDbId);
        if (meetingAnalysisRepository.existsById(meetingDbId)) {
            meetingAnalysisRepository.deleteById(meetingDbId);
        }
        if (deleteLinkedTasks) {
            meetingActionItemRepository.deleteByMeetingId(meetingDbId);
            taskRepository.deleteBySourceMeetingId(meetingDbId);
        } else {
            meetingActionItemRepository.clearMeetingId(meetingDbId);
            taskRepository.clearSourceMeetingId(meetingDbId);
        }
        meetingRepository.delete(meeting);
        deleteUploadedFile(filePath);

        return new MeetingDeleteResponse(meetingId, "DELETED");
    }

    @Transactional
    public TaskRegisterResponse registerTasks(String projectId, String meetingId, TaskRegisterRequest request) {
        Meeting meeting = requireProjectMeeting(projectId, meetingId);
        if (meeting == null) return null;
        Long meetingDbId = parseLongOrNull(meetingId);
        List<MeetingTodo> todos = request == null || request.todos() == null ? List.of() : request.todos();
        Long currentLeaderId = demoDataService.resolveUserId("1");

        int registeredCount = 0;
        for (MeetingTodo todo : todos) {
            if (registerSingleTask(meetingDbId, todo, currentLeaderId)) {
                registeredCount++;
            }
        }
        return new TaskRegisterResponse(meetingId, registeredCount, "REGISTERED");
    }

    private boolean registerSingleTask(Long meetingId, MeetingTodo todo, Long createdBy) {
        Long assigneeId = resolveAssignee(todo.assignee_id());
        LocalDate dueDate = parseDateOrNull(todo.due_date());

        Optional<MeetingActionItem> existingItem =
            meetingActionItemRepository.findFirstByMeetingIdAndTitle(meetingId, todo.title());
        if (existingItem.isPresent() && existingItem.get().getCreatedTaskId() != null) {
            return false;
        }

        Optional<Task> existingTask = taskRepository.findFirstBySourceMeetingIdAndTitleAndAssigneeIdAndDueDate(
            meetingId, todo.title(), assigneeId, dueDate
        );
        if (existingTask.isPresent()) {
            existingItem.ifPresent(item -> {
                item.setCreatedTaskId(existingTask.get().getId());
                meetingActionItemRepository.save(item);
            });
            return false;
        }

        Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
        Long taskProjectId = meeting == null ? null : meeting.getProjectId();
        double position = taskRepository.findTopByProjectIdAndStatusOrderByPositionDesc(taskProjectId, "todo")
            .map(t -> t.getPosition() + 1)
            .orElse(0.0);
        Task task = taskRepository.save(new Task(
            taskProjectId,
            todo.title(),
            defaultString(todo.category(), "ETC"),
            "todo",
            assigneeId,
            dueDate,
            defaultString(todo.priority(), "MEDIUM"),
            todo.description(),
            "MEETING_AI",
            meetingId,
            createdBy,
            position
        ));
        ragIngestService.ingestBestEffort(task.getProjectId(), "task", task.getId(), buildTaskIngestContent(task), task.getAssigneeId());

        MeetingActionItem item = existingItem.orElseGet(() -> new MeetingActionItem(
            meetingId, todo.title(), todo.description(), todo.category(),
            resolveAssigneeByName(todo.assignee_candidate()), assigneeId, dueDate, todo.priority(), todo.evidence_text()
        ));
        item.setFinalAssigneeId(assigneeId);
        item.setDueDate(dueDate);
        item.setApproved(true);
        item.setCreatedTaskId(task.getId());
        meetingActionItemRepository.save(item);

        if (assigneeId != null) {
            notificationRepository.save(new Notification(
                assigneeId,
                "TASK_ASSIGNED",
                "새 업무가 배정되었습니다",
                "'" + todo.title() + "' 업무가 배정되었습니다.",
                "task",
                task.getId()
            ));
        }
        return true;
    }

    /** 요청한 사용자가 projectId 프로젝트의 멤버인지 확인하고, 실제 DB projectId를 반환한다. 멤버가 아니면 403. */
    private Long requireProjectMember(String projectIdParam) {
        Long projectDbId = demoDataService.resolveProjectId(projectIdParam);
        Long userId = CurrentUser.id();
        if (!projectMemberRepository.existsByProjectIdAndUserId(projectDbId, userId)) {
            throw new AccessDeniedException("프로젝트 멤버만 접근할 수 있습니다.");
        }
        return projectDbId;
    }

    /**
     * 요청한 사용자가 projectId 멤버인지 확인(아니면 403)한 뒤, meetingId가 실제로 그 프로젝트
     * 소속인 회의록인지 조회한다. 다른 프로젝트의 회의록이거나 존재하지 않으면 null(404)을 반환한다.
     */
    private Meeting requireProjectMeeting(String projectIdParam, String meetingIdParam) {
        Long projectDbId = requireProjectMember(projectIdParam);
        Long meetingDbId = parseLongOrNull(meetingIdParam);
        if (meetingDbId == null) return null;
        return meetingRepository.findByIdAndProjectId(meetingDbId, projectDbId).orElse(null);
    }

    /** 회의록을 업로드한 본인만 통과한다. 업로더가 아니거나 uploadedBy가 비어있으면 403. */
    private void requireUploader(Meeting meeting) {
        Long userId = CurrentUser.id();
        if (meeting.getUploadedBy() == null || !meeting.getUploadedBy().equals(userId)) {
            throw new AccessDeniedException("본인이 업로드한 회의록만 삭제할 수 있습니다.");
        }
    }

    private void validateAttendeeIds(Long projectId, List<Long> attendeeIds) {
        for (Long attendeeId : attendeeIds) {
            if (!projectMemberRepository.existsByProjectIdAndUserId(projectId, attendeeId)) {
                throw new IllegalArgumentException("프로젝트 멤버가 아닌 참석자가 포함되어 있습니다: " + attendeeId);
            }
        }
    }

    private void saveAttendeesByIds(Long meetingId, List<Long> attendeeIds) {
        for (Long userId : attendeeIds.stream().distinct().toList()) {
            meetingAttendeeRepository.save(new MeetingAttendee(meetingId, userId));
        }
    }

    private List<AttendeeSummary> buildAttendeeSummaries(Long meetingId, Long projectId) {
        List<MeetingAttendee> attendeeRows = meetingAttendeeRepository.findByMeetingId(meetingId);
        if (attendeeRows.isEmpty()) return List.of();

        Map<Long, User> usersById = userRepository
            .findAllById(attendeeRows.stream().map(MeetingAttendee::getUserId).toList())
            .stream()
            .collect(Collectors.toMap(User::getId, user -> user));
        Map<Long, ProjectMember> membersByUserId = projectMemberRepository.findAllByProjectId(projectId).stream()
            .collect(Collectors.toMap(ProjectMember::getUserId, member -> member));

        return attendeeRows.stream()
            .map(attendee -> {
                User user = usersById.get(attendee.getUserId());
                ProjectMember member = membersByUserId.get(attendee.getUserId());
                return new AttendeeSummary(
                    attendee.getUserId(),
                    user != null ? user.getName() : null,
                    member != null ? member.getRole().toKorean() : null
                );
            })
            .toList();
    }

    private Long resolveAssigneeByName(String name) {
        if (name == null || name.isBlank()) return null;
        return userRepository.findFirstByName(name).map(User::getId).orElse(null);
    }

    private MeetingTodo toMeetingTodo(MeetingActionItem item) {
        return new MeetingTodo(
            item.getTitle(),
            item.getDescription(),
            resolveNameById(item.getRecommendedAssigneeId()),
            item.getFinalAssigneeId() == null ? null : String.valueOf(item.getFinalAssigneeId()),
            item.getDueDate() == null ? null : item.getDueDate().toString(),
            item.getPriority(),
            item.getCategory(),
            item.getFinalAssigneeId() == null,
            item.getBasis() == null ? "" : item.getBasis()
        );
    }

    private String resolveNameById(Long userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).map(User::getName).orElse(null);
    }

    private String storeUploadedFile(Long meetingId, MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        try {
            Path dir = Path.of(uploadsDir, String.valueOf(meetingId)).toAbsolutePath().normalize();
            Files.createDirectories(dir);
            String safeName = sanitizeFileName(file.getOriginalFilename());
            Path target = dir.resolve(safeName).normalize();
            if (!target.startsWith(dir)) {
                throw new IOException("Invalid upload file name: " + file.getOriginalFilename());
            }
            file.transferTo(target);
            return target.toString();
        } catch (IOException e) {
            return null;
        }
    }

    private String sanitizeFileName(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) return "upload.bin";
        String name = originalFilename.replace('\\', '/');
        int slashIndex = name.lastIndexOf('/');
        if (slashIndex >= 0) {
            name = name.substring(slashIndex + 1);
        }
        name = name.replaceAll("[\\p{Cntrl}:*?\"<>|]+", "_").trim();
        if (name.isBlank() || ".".equals(name) || "..".equals(name)) {
            return "upload.bin";
        }
        return name;
    }

    private void deleteUploadedFile(String filePath) {
        if (filePath == null || filePath.isBlank()) return;
        try {
            Path target = Path.of(filePath).toAbsolutePath().normalize();
            Files.deleteIfExists(target);
            Path parent = target.getParent();
            if (parent != null && Files.isDirectory(parent)) {
                try (var children = Files.list(parent)) {
                    if (children.findAny().isEmpty()) {
                        Files.deleteIfExists(parent);
                    }
                }
            }
        } catch (IOException ignored) {
            // 파일 삭제 실패는 회의록 DB 삭제를 막지 않는다.
        }
    }

    private void saveAttendees(Long meetingId, Long projectId, List<String> participantNames) {
        Set<Long> savedUserIds = new HashSet<>();
        for (String name : participantNames) {
            userRepository.findFirstByName(name)
                .filter(user -> projectMemberRepository.existsByProjectIdAndUserId(projectId, user.getId()))
                .filter(user -> savedUserIds.add(user.getId()))
                .ifPresent(user -> meetingAttendeeRepository.save(new MeetingAttendee(meetingId, user.getId())));
        }
    }

    private void runAnalysisAfterCommit(Long meetingId, AiAnalyzeRequest request) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            meetingAnalysisRunner.runAnalysis(meetingId, request);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                meetingAnalysisRunner.runAnalysis(meetingId, request);
            }
        });
    }

    private String toResponseProjectId(Long projectDbId) {
        try {
            Long demoProjectId = demoDataService.resolveProjectId("demo-project");
            if (demoProjectId != null && demoProjectId.equals(projectDbId)) {
                return "demo-project";
            }
        } catch (Exception ignored) {
            // 데모 시딩이 꺼진 운영 환경에서는 DB id를 그대로 응답한다.
        }
        return String.valueOf(projectDbId);
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

    private Long parseLongOrNull(String value) {
        try {
            return Long.parseLong(value);
        } catch (Exception e) {
            return null;
        }
    }

    private List<String> safeParticipants(List<String> participants) {
        if (participants == null) return List.of();
        return participants.stream().filter(p -> p != null && !p.isBlank()).toList();
    }

    private String extractText(MultipartFile file) {
        if (file == null || file.isEmpty()) return "";
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        boolean textLike = contentType.startsWith("text/")
            || name.endsWith(".txt")
            || name.endsWith(".md")
            || name.endsWith(".csv")
            || name.endsWith(".json");
        if (name.endsWith(".docx")) {
            return extractDocxText(file);
        }
        if (name.endsWith(".pdf") || contentType.equals("application/pdf")) {
            return extractPdfText(file);
        }
        if (!textLike) {
            return "업로드 파일명: " + file.getOriginalFilename() + ". 바이너리 문서는 FastAPI 문서 파서 또는 STT 단계에서 텍스트 추출 예정.";
        }
        try {
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalArgumentException("회의록 파일을 읽을 수 없습니다.");
        }
    }

    private String extractTextFromStoredFile(Meeting meeting) {
        String filePath = meeting.getFilePath();
        if (filePath == null || filePath.isBlank()) return "";
        String fileName = meeting.getOriginalFileName() == null ? "" : meeting.getOriginalFileName().toLowerCase();
        boolean textLike = fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv") || fileName.endsWith(".json");
        try {
            byte[] bytes = Files.readAllBytes(Path.of(filePath));
            if (fileName.endsWith(".docx")) {
                return extractDocxTextFromBytes(bytes);
            }
            if (fileName.endsWith(".pdf")) {
                return extractPdfTextFromBytes(bytes);
            }
            if (!textLike) {
                return null;
            }
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException | IllegalArgumentException e) {
            log.warn("회의록 재분석용 파일 텍스트 추출 실패: meetingId={}, filePath={}", meeting.getId(), filePath, e);
            return "";
        }
    }

    private String extractDocxText(MultipartFile file) {
        try {
            return extractDocxTextFromBytes(file.getBytes());
        } catch (IOException e) {
            throw new IllegalArgumentException("DOCX 회의록을 읽을 수 없습니다.");
        }
    }

    private String extractPdfText(MultipartFile file) {
        try {
            return extractPdfTextFromBytes(file.getBytes());
        } catch (IOException e) {
            throw new IllegalArgumentException("PDF 회의록을 읽을 수 없습니다.");
        }
    }

    private String extractPdfTextFromBytes(byte[] bytes) {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper()
                .getText(document)
                .replaceAll("\\s+\\n", "\n")
                .replaceAll("\\n\\s+", "\n")
                .trim();
            if (text.isBlank()) {
                throw new IllegalArgumentException("PDF에서 분석할 텍스트를 추출하지 못했습니다.");
            }
            return text;
        } catch (IOException ignored) {
            throw new IllegalArgumentException("PDF 텍스트 추출에 실패했습니다.");
        }
    }

    private String extractDocxTextFromBytes(byte[] bytes) {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!"word/document.xml".equals(entry.getName())) continue;
                String xml = new String(zip.readAllBytes(), StandardCharsets.UTF_8);
                String text = xml
                    .replaceAll("<w:p[^>]*>", "\n")
                    .replaceAll("<[^>]+>", " ")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&amp;", "&")
                    .replace("&quot;", "\"")
                    .replace("&apos;", "'")
                    .replaceAll("\\s+", " ")
                    .trim();
                if (text.isBlank()) {
                    throw new IllegalArgumentException("DOCX에서 분석할 텍스트를 추출하지 못했습니다.");
                }
                return text;
            }
        } catch (IOException ignored) {
            throw new IllegalArgumentException("DOCX 텍스트 추출에 실패했습니다.");
        }
        throw new IllegalArgumentException("DOCX 본문을 찾을 수 없습니다.");
    }

    private String defaultString(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private String buildTaskIngestContent(Task task) {
        StringBuilder content = new StringBuilder(task.getTitle());
        if (task.getDescription() != null && !task.getDescription().isBlank()) {
            content.append(" - ").append(task.getDescription());
        }
        return content.toString();
    }
}
