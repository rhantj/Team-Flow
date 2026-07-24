package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
    @NotBlank(message = "이메일을 입력해주세요.")
    @Email(message = "올바른 이메일 형식으로 입력해주세요.")
    @Size(max = 255, message = "이메일은 255자 이하로 입력해주세요.")
    @Schema(description = "이메일 (로그인 아이디로 사용)", example = "user@example.com")
    String email,

    @NotBlank(message = "비밀번호를 입력해주세요.")
    @Size(min = 8, max = 128, message = "비밀번호는 8자 이상 128자 이하로 입력해주세요.")
    @Schema(description = "비밀번호 (8자 이상)", example = "12345678")
    String password,

    @NotBlank(message = "이름을 입력해주세요.")
    @Size(max = 100, message = "이름은 100자 이하로 입력해주세요.")
    @Schema(description = "이름", example = "홍길동")
    String name,

    @Pattern(regexp = "(?i)^(MEMBER|REVIEWER)$", message = "가입 유형은 MEMBER 또는 REVIEWER만 선택할 수 있습니다.")
    @Schema(description = "가입 유형: MEMBER(일반 회원) 또는 REVIEWER(심사자, 승인 대기)", example = "MEMBER")
    String roleType,

    // boolean(원시타입)이라 요청 JSON에 이 필드가 아예 없으면 Jackson이 false로 채운다 —
    // @AssertTrue와 합쳐지면 "누락"과 "명시적 false"가 동일하게 검증 실패로 처리된다.
    @AssertTrue(message = "이용약관 및 개인정보처리방침에 동의해주세요.")
    @Schema(description = "이용약관/개인정보처리방침 동의 여부. true가 아니면 회원가입이 거부된다", example = "true")
    boolean termsAgreed
) {
}
