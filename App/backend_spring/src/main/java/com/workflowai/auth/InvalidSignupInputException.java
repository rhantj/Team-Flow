package com.workflowai.auth;

/** 회원가입 입력값이 유효하지 않을 때(빈 값, 비밀번호 길이 부족 등) 던진다. */
public class InvalidSignupInputException extends RuntimeException {
    public InvalidSignupInputException(String message) {
        super(message);
    }
}
