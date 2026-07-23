package com.workflowai.project;

import com.workflowai.rag.RagIngestService;
import com.workflowai.task.Task;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionOperations;

@Service
public class ProjectService {
    private static final Logger log = LoggerFactory.getLogger(ProjectService.class);
    private static final String INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int INVITE_CODE_LENGTH = 8;
    private static final int INVITE_CODE_MAX_ATTEMPTS = 20;
    private static final String TASK_STATUS_DONE = "완료";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final UserRepository userRepository;
    private final TaskRepository taskRepository;
    private final TransactionOperations transactionOperations;
    private final RagIngestService ragIngestService;

    public ProjectService(
        ProjectRepository projectRepository,
        ProjectMemberRepository projectMemberRepository,
        UserRepository userRepository,
        TaskRepository taskRepository,
        TransactionOperations transactionOperations,
        RagIngestService ragIngestService
    ) {
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.userRepository = userRepository;
        this.taskRepository = taskRepository;
        this.transactionOperations = transactionOperations;
        this.ragIngestService = ragIngestService;
    }

    public ProjectResponse create(Long creatorUserId, CreateProjectRequest request) {
        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("프로젝트명은 필수입니다.");
        }
        if (request.startDate() != null && request.deadline() != null && request.startDate().isAfter(request.deadline())) {
            throw new IllegalArgumentException("시작일은 종료일보다 이전이어야 합니다.");
        }
        if (request.memberLimit() != null && request.memberLimit() < 1) {
            throw new IllegalArgumentException("예상 참여 인원 수는 1명 이상이어야 합니다.");
        }

        Project project = saveProjectWithInviteCodeRetry(creatorUserId, request);
        return toResponse(project);
    }

    private Project saveProjectWithInviteCodeRetry(Long creatorUserId, CreateProjectRequest request) {
        DataIntegrityViolationException lastCollision = null;
        for (int attempt = 0; attempt < INVITE_CODE_MAX_ATTEMPTS; attempt++) {
            try {
                return transactionOperations.execute(status -> {
                    Project project = projectRepository.saveAndFlush(new Project(
                        request.title(),
                        request.type(),
                        request.description(),
                        request.startDate(),
                        request.deadline(),
                        request.midCheckDate(),
                        request.memberLimit(),
                        request.deliverables(),
                        request.techStack(),
                        request.goals(),
                        generateInviteCode(),
                        creatorUserId
                    ));
                    projectMemberRepository.save(new ProjectMember(project.getId(), creatorUserId, ProjectRole.LEADER));
                    return project;
                });
            } catch (DataIntegrityViolationException e) {
                if (!isInviteCodeConflict(e)) {
                    throw e;
                }
                lastCollision = e;
            }
        }
        throw new DataIntegrityViolationException("프로젝트 초대 코드 생성에 실패했습니다.", lastCollision);
    }

    private String generateInviteCode() {
        StringBuilder code = new StringBuilder(INVITE_CODE_LENGTH);
        for (int i = 0; i < INVITE_CODE_LENGTH; i++) {
            code.append(INVITE_CODE_ALPHABET.charAt(RANDOM.nextInt(INVITE_CODE_ALPHABET.length())));
        }
        return code.toString();
    }

    /** 초대 코드로 참여한다. 이미 멤버면 그대로 현재 상태를 반환한다(중복 가입 에러 대신 멱등 처리). */
    @Transactional
    public ProjectResponse joinByCode(Long userId, String code) {
        Project project = projectRepository.findByInviteCode(code == null ? "" : code.trim().toUpperCase())
            .orElseThrow(() -> new IllegalArgumentException("유효하지 않은 초대 코드입니다."));
        if (!projectMemberRepository.existsByProjectIdAndUserId(project.getId(), userId)) {
            projectMemberRepository.save(new ProjectMember(project.getId(), userId, ProjectRole.MEMBER));
        }
        return toResponse(project);
    }

    public List<ProjectResponse> findAllForUser(Long userId) {
        List<Project> projects = projectRepository.findAllByMemberUserId(userId);
        if (projects.isEmpty()) {
            return List.of();
        }
        List<Long> projectIds = projects.stream().map(Project::getId).toList();
        Map<Long, Integer> memberCounts = memberCountMap(projectIds);
        Map<Long, Integer> progressByProjectId = taskProgressMap(projectIds);
        return projects.stream()
            .map(project -> toResponse(
                project,
                memberCounts.getOrDefault(project.getId(), 0),
                progressByProjectId.getOrDefault(project.getId(), 0)
            ))
            .toList();
    }

    public ProjectResponse find(Long projectId) {
        return toResponse(getProjectOrThrow(projectId));
    }

    @Transactional
    public ProjectResponse update(Long projectId, UpdateProjectRequest request) {
        Project project = getProjectOrThrow(projectId);
        if (request.title() != null) {
            if (request.title().isBlank()) {
                throw new IllegalArgumentException("프로젝트명은 비워둘 수 없습니다.");
            }
            project.setTitle(request.title());
        }
        if (request.type() != null) {
            project.setType(request.type());
        }
        if (request.description() != null) {
            project.setDescription(request.description());
        }
        if (request.startDate() != null) {
            project.setStartDate(request.startDate());
        }
        if (request.deadline() != null) {
            project.setDeadline(request.deadline());
        }
        LocalDate effectiveStart = request.startDate() != null ? request.startDate() : project.getStartDate();
        LocalDate effectiveDeadline = request.deadline() != null ? request.deadline() : project.getDeadline();
        if (effectiveStart != null && effectiveDeadline != null && effectiveStart.isAfter(effectiveDeadline)) {
            throw new IllegalArgumentException("시작일은 종료일보다 이전이어야 합니다.");
        }
        if (request.midCheckDate() != null) {
            project.setMidCheckDate(request.midCheckDate());
        }
        if (request.memberLimit() != null) {
            if (request.memberLimit() < 1) {
                throw new IllegalArgumentException("예상 참여 인원 수는 1명 이상이어야 합니다.");
            }
            project.setMemberLimit(request.memberLimit());
        }
        if (request.deliverables() != null) {
            project.setDeliverables(request.deliverables());
        }
        if (request.techStack() != null) {
            project.setTechStack(request.techStack());
        }
        if (request.goals() != null) {
            project.setGoals(request.goals());
        }
        return toResponse(project);
    }

    @Transactional
    public void delete(Long projectId) {
        ragIngestService.recordDeleteProjectIntent(projectId);
        projectRepository.deleteById(projectId);
        runAfterCommit(() -> ragIngestService.deleteProjectSourcesBestEffort(projectId));
    }

    private void runAfterCommit(Runnable operation) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    runAfterCommitOperationSafely(operation);
                }
            });
            return;
        }
        runAfterCommitOperationSafely(operation);
    }

    private void runAfterCommitOperationSafely(Runnable operation) {
        try {
            operation.run();
        } catch (RuntimeException exception) {
            log.warn("RAG after-commit 작업 제출 실패. errorType={}", exception.getClass().getSimpleName());
        }
    }

    public List<MemberResponse> members(Long projectId) {
        List<ProjectMember> members = projectMemberRepository.findAllByProjectId(projectId);
        Map<Long, User> usersById = userRepository
            .findAllById(members.stream().map(ProjectMember::getUserId).toList())
            .stream()
            .collect(Collectors.toMap(User::getId, user -> user));

        return members.stream()
            .map(member -> {
                User user = usersById.get(member.getUserId());
                return new MemberResponse(
                    member.getUserId(),
                    user != null ? user.getName() : null,
                    user != null ? user.getEmail() : null,
                    member.getRole().toKorean()
                );
            })
            .toList();
    }

    @Transactional
    public MemberResponse updateMemberRole(Long projectId, Long userId, String koreanRole) {
        ProjectMember member = projectMemberRepository.findByProjectIdAndUserId(projectId, userId)
            .orElseThrow(() -> new IllegalArgumentException("프로젝트 멤버를 찾을 수 없습니다."));
        member.setRole(ProjectRole.fromKorean(koreanRole));
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        return new MemberResponse(user.getId(), user.getName(), user.getEmail(), member.getRole().toKorean());
    }

    private Project getProjectOrThrow(Long projectId) {
        return projectRepository.findById(projectId)
            .orElseThrow(() -> new IllegalArgumentException("프로젝트를 찾을 수 없습니다."));
    }

    private ProjectResponse toResponse(Project project) {
        int memberCount = Math.toIntExact(projectMemberRepository.countByProjectId(project.getId()));
        int taskProgress = computeTaskProgress(project.getId());
        return toResponse(project, memberCount, taskProgress);
    }

    private ProjectResponse toResponse(Project project, int memberCount, int taskProgress) {
        return new ProjectResponse(
            project.getId(),
            project.getTitle(),
            project.getType(),
            project.getDeadline(),
            project.getDescription(),
            project.getStartDate(),
            project.getMidCheckDate(),
            project.getMemberLimit(),
            project.getDeliverables(),
            project.getTechStack(),
            project.getGoals(),
            project.getInviteCode(),
            project.getCreatedBy(),
            memberCount,
            taskProgress
        );
    }

    /** 업무가 하나도 없으면 0%. 있으면 완료 업무 비율(반올림). */
    private int computeTaskProgress(Long projectId) {
        List<Task> tasks = taskRepository.findByProjectIdOrderByCreatedAtDesc(projectId);
        if (tasks.isEmpty()) {
            return 0;
        }
        long done = tasks.stream().filter(task -> TASK_STATUS_DONE.equals(task.getStatus())).count();
        return Math.round(done * 100f / tasks.size());
    }

    private Map<Long, Integer> memberCountMap(List<Long> projectIds) {
        return projectMemberRepository.countMembersByProjectIds(projectIds).stream()
            .collect(Collectors.toMap(
                ProjectMemberRepository.ProjectMemberCountView::getProjectId,
                row -> Math.toIntExact(row.getMemberCount())
            ));
    }

    private Map<Long, Integer> taskProgressMap(List<Long> projectIds) {
        return taskRepository.summarizeProgressByProjectIds(projectIds, TASK_STATUS_DONE).stream()
            .collect(Collectors.toMap(
                TaskRepository.TaskProgressView::getProjectId,
                row -> {
                    long total = row.getTotalCount() == null ? 0L : row.getTotalCount();
                    long done = row.getDoneCount() == null ? 0L : row.getDoneCount();
                    return total == 0L ? 0 : Math.round(done * 100f / total);
                }
            ));
    }

    private boolean isInviteCodeConflict(DataIntegrityViolationException e) {
        String message = e.getMostSpecificCause() == null ? e.getMessage() : e.getMostSpecificCause().getMessage();
        return message != null && (message.contains("uq_projects_invite_code") || message.contains("invite_code"));
    }
}
