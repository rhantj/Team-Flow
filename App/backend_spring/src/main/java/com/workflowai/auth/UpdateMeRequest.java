package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

@Schema(description = "내 정보 수정 요청 (전달된 필드만 갱신, null이면 기존 값 유지)")
public record UpdateMeRequest(
    // null(생략)은 "변경 안 함"이라 @NotBlank를 직접 못 쓴다(항상 non-null을 요구하게 됨) —
    // @Pattern은 null은 그대로 통과시키고 값이 있을 때만 검사하므로, "공백 문자만 있는 값"만 걸러낸다.
    @Size(max = 100, message = "이름은 100자 이하여야 합니다.")
    @Pattern(regexp = "(?s).*\\S.*", message = "이름은 공백일 수 없습니다.")
    String name,
    @Size(max = 100, message = "소속은 100자 이하여야 합니다.") String affiliation,
    @Size(max = 10, message = "분야는 최대 10개까지 등록할 수 있습니다.")
    List<
        @NotBlank(message = "분야 태그는 비어 있을 수 없습니다.")
        @Size(max = 50, message = "분야 태그는 50자 이하여야 합니다.")
        String
    > field,
    @Pattern(
        regexp = "^$|^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$",
        message = "올바른 GitHub 아이디 형식이 아닙니다."
    ) String githubUsername
) {
}
