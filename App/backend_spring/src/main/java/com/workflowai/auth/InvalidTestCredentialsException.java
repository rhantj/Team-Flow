package com.workflowai.auth;

/** 테스트 로그인(아이디/비밀번호)의 아이디가 없거나 비밀번호가 틀렸을 때 던진다. */
public class InvalidTestCredentialsException extends RuntimeException {
    public InvalidTestCredentialsException() {
        super("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
}
