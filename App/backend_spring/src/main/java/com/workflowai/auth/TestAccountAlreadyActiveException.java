package com.workflowai.auth;

/** 테스트 계정이 이미 다른 곳에서 로그인되어 있을 때(TTL 이내 heartbeat 존재) 던진다. */
public class TestAccountAlreadyActiveException extends RuntimeException {
    public TestAccountAlreadyActiveException() {
        super("현재 이 계정은 다른 곳에서 로그인 중입니다. 다른 계정으로 로그인하거나 기존 접속을 종료한 뒤 다시 시도해주세요.");
    }
}
