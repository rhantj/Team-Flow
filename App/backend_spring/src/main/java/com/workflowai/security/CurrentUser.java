package com.workflowai.security;

import org.springframework.security.core.context.SecurityContextHolder;

public final class CurrentUser {
    private CurrentUser() {
    }

    public static UserPrincipal principal() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (principal instanceof UserPrincipal userPrincipal) {
            return userPrincipal;
        }
        throw new IllegalStateException("인증 정보를 확인할 수 없습니다.");
    }

    public static Long id() {
        return principal().id();
    }
}
