package com.workflowai.project;

import com.workflowai.task.Task;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProjectService {
    private static final String INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int INVITE_CODE_LENGTH = 8;
    private static final String TASK_STATUS_DONE = "완료";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final UserRepository userRepository;
    private final TaskRepository taskRepository;

    public ProjectService(
        ProjectRepository projectRepository,
        ProjectMemberRepository projectMemberRepository,
        UserRepository userRepository,
        TaskRepository taskRepository
    ) {
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.userRepository = userRepository;
        this.taskRepository = taskRepository;
    }

    @Transactional
    public ProjectResponse create(Long creatorUserId, CreateProjectRequest request) {
        if (request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("프로젝트명은 필수입니다.");
        }
        if (request.deadline() == null) {
            throw new IllegalArgumentException("최종 마감일은 필수입니다.");
        }
        if (request.startDate() != null && request.startDate().isAfter(request.deadline())) {
            throw new IllegalArgumentException("시작일은 종료일보다 이전이어야 합니다.");
        }
        if (request.memberLimit() != null && request.memberLimit() < 1) {
            throw new IllegalArgumentException("예상 참여 인원 수는 1명 이상이어야 합니다.");
        }

        Project project = projectRepository.save(new Project(
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
        return toResponse(project);
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
        return projectRepository.findAllByMemberUserId(userId).stream().map(this::toResponse).toList();
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
        projectRepository.deleteById(projectId);
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
        int memberCount = projectMemberRepository.findAllByProjectId(project.getId()).size();
        int taskProgress = computeTaskProgress(project.getId());
        return new ProjectResponse(
            project.getId(),
            project.getTitle(),
            project.getType(),
            project.getDescription(),
            project.getStartDate(),
            project.getDeadline(),
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
}
