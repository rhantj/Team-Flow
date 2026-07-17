package com.workflowai.project;

import com.workflowai.common.ApiResponse;
import com.workflowai.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "초대", description = "프로젝트 팀원/심사자 초대 생성 및 수락")
@RestController
public class InvitationController {
    private final InvitationService invitationService;

    public InvitationController(InvitationService invitationService) {
        this.invitationService = invitationService;
    }

    @Operation(summary = "팀원 또는 심사자 초대 생성", description = "팀장만 가능하다.")
    @PostMapping("/api/v1/projects/{projectId}/invitations")
    @PreAuthorize("@projectAccess.hasRole(#projectId, 'LEADER')")
    public ApiResponse<InvitationResponse> create(
        @PathVariable Long projectId,
        @Valid @RequestBody CreateInvitationRequest request
    ) {
        return ApiResponse.ok(invitationService.create(projectId, request));
    }

    @Operation(summary = "초대 토큰을 사용해 프로젝트 참여 수락")
    @PostMapping("/api/v1/invitations/{token}/accept")
    public ApiResponse<Void> accept(@PathVariable String token) {
        invitationService.accept(token, CurrentUser.id());
        return ApiResponse.ok(null);
    }
}
