package com.workflowai.auth;

/** REVIEWER로 가입했지만 아직 관리자 승인(reviewer_status=APPROVED)이 안 된 계정이 로그인을 시도할 때 던진다. */
public class ReviewerApprovalPendingException extends RuntimeException {
    public ReviewerApprovalPendingException() {
        super("아직 관리자 승인 대기 중인 계정입니다. 승인 후 로그인할 수 있습니다.");
    }
}
