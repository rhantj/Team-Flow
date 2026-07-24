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

    // Boolean(래퍼 타입)이라 요청 JSON에 이 필드가 없으면 null로 바인딩된다. @AssertTrue는
    // null을 통과시키므로(false만 검증 실패), 이 필드를 모르는 구버전 클라이언트의 요청도
    // 컨트롤러 검증 단계에서 막히지 않는다 — 실제 동의 여부 판단은 AuthService.signup에서
    // null(누락)과 false(명시적 거부)를 구분해서 처리한다.
    @AssertTrue(message = "이용약관 및 개인정보처리방침에 동의해주세요.")
    @Schema(description = "이용약관/개인정보처리방침 동의 여부. 누락 시 구버전 클라이언트로 간주해 통과되지만 동의 시각은 기록되지 않는다. 명시적으로 false면 회원가입이 거부된다", example = "true")
    Boolean termsAgreed
) {
}
