package com.workflowai.auth;

import com.workflowai.user.User;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "사용자 기본 정보")
public record UserSummary(
    Long id,
    String email,
    String name,
    String affiliation,
    List<String> field,
    String githubUsername,
    String profileImageUrl
) {
    public static UserSummary from(User user) {
        return new UserSummary(
            user.getId(),
            user.getEmail(),
            user.getName(),
            user.getAffiliation(),
            user.getField(),
            user.getGithubUsername(),
            user.getProfileImagePath() == null ? null : "/uploads/" + user.getProfileImagePath()
        );
    }
}
