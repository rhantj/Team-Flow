package com.workflowai.project;

import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProjectService {
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final UserRepository userRepository;

    public ProjectService(
        ProjectRepository projectRepository,
        ProjectMemberRepository projectMemberRepository,
        UserRepository userRepository
    ) {
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public ProjectResponse create(Long creatorUserId, CreateProjectRequest request) {
        Project project = projectRepository.save(
            new Project(request.title(), request.type(), request.deadline(), request.description())
        );
        projectMemberRepository.save(new ProjectMember(project.getId(), creatorUserId, ProjectRole.LEADER));
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
            project.setTitle(request.title());
        }
        if (request.description() != null) {
            project.setDescription(request.description());
        }
        if (request.deadline() != null) {
            project.setDeadline(request.deadline());
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
        return new ProjectResponse(
            project.getId(),
            project.getTitle(),
            project.getType(),
            project.getDeadline(),
            project.getDescription()
        );
    }
}
