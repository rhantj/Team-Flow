package com.workflowai.auth;

/** 회원가입 시 이미 가입된 이메일일 때 던진다. */
public class EmailAlreadyExistsException extends RuntimeException {
    public EmailAlreadyExistsException() {
        super("이미 가입된 이메일입니다.");
    }
}
