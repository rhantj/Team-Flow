package com.workflowai.auth;

/** 비밀번호 로그인 시도한 계정이 Google OAuth 전용(password_hash 없음)일 때 던진다. */
public class GoogleAccountRequiredException extends RuntimeException {
    public GoogleAccountRequiredException() {
        super("Google 계정으로 로그인해주세요.");
    }
}
