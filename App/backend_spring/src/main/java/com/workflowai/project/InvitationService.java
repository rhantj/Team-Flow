package com.workflowai.project;

import java.time.LocalDateTime;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InvitationService {
    private static final int EXPIRY_DAYS = 7;

    private final InvitationRepository invitationRepository;
    private final ProjectMemberRepository projectMemberRepository;

    public InvitationService(InvitationRepository invitationRepository, ProjectMemberRepository projectMemberRepository) {
        this.invitationRepository = invitationRepository;
        this.projectMemberRepository = projectMemberRepository;
    }

    @Transactional
    public InvitationResponse create(Long projectId, CreateInvitationRequest request) {
        ProjectRole role = ProjectRole.fromKorean(request.role());
        Invitation invitation = invitationRepository.save(new Invitation(
            projectId,
            request.email(),
            role,
            UUID.randomUUID().toString(),
            LocalDateTime.now().plusDays(EXPIRY_DAYS)
        ));
        return toResponse(invitation);
    }

    @Transactional
    public void accept(String token, Long userId) {
        Invitation invitation = invitationRepository.findByToken(token)
            .orElseThrow(() -> new IllegalArgumentException("초대를 찾을 수 없습니다."));
        if (!invitation.isPending()) {
            throw new IllegalStateException("이미 처리된 초대입니다.");
        }
        if (invitation.isExpired()) {
            invitation.setStatus(Invitation.Status.expired.name());
            throw new IllegalStateException("만료된 초대입니다.");
        }

        if (!projectMemberRepository.existsByProjectIdAndUserId(invitation.getProjectId(), userId)) {
            projectMemberRepository.save(new ProjectMember(invitation.getProjectId(), userId, invitation.getRole()));
        }
        invitation.setStatus(Invitation.Status.accepted.name());
    }

    private InvitationResponse toResponse(Invitation invitation) {
        return new InvitationResponse(
            invitation.getProjectId(),
            invitation.getEmail(),
            invitation.getRole().toKorean(),
            invitation.getToken(),
            invitation.getStatus(),
            invitation.getExpiresAt()
        );
    }
}
