-- ============================================================================
-- WorkFlow AI - Database Schema (MySQL DDL)
-- 출처: docs/WorkFlow_AI_PRD.md, docs/WorkFlow_AI_API_명세서.md,
--       docs/WorkFlow_AI_7인_구현_상세.md, docs/WorkFlow_AI_Data_Architecture.pptx
-- 스코프: P0+P1+P2 전체 기능 (20개 테이블)
-- 용도: ERD Cloud(erdcloud.com) "SQL 가져오기"로 임포트해 ERD 시각화
-- 주의: 실제 서비스 스택은 PostgreSQL + pgvector(§6.4). 이 스크립트는 ERD 시각화용
--       MySQL 방언이며, document_chunks.embedding은 pgvector VECTOR 대신 JSON으로 표현.
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. 인증 / 프로젝트
-- ----------------------------------------------------------------------------

CREATE TABLE users (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    provider    VARCHAR(20)  NOT NULL COMMENT 'google 등 OAuth 제공자',
    provider_id VARCHAR(255) NOT NULL COMMENT 'OAuth sub (불변 식별자)',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_provider (provider, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='사용자';

CREATE TABLE projects (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    type        VARCHAR(50)  COMMENT '캡스톤디자인/해커톤/공모전 등',
    deadline    DATE,
    description TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='프로젝트';

CREATE TABLE project_members (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    role       VARCHAR(20) NOT NULL COMMENT '팀장/팀원/심사자 (프로젝트별 role)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_project_members (project_id, user_id),
    CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='프로젝트 멤버십/역할';

CREATE TABLE invitations (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    email      VARCHAR(255) NOT NULL,
    role       VARCHAR(20)  NOT NULL,
    token      VARCHAR(255) NOT NULL,
    status     VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT 'pending/accepted/expired',
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_invitations_token (token),
    CONSTRAINT fk_inv_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='팀원/심사자 초대';

-- ----------------------------------------------------------------------------
-- 2. 업무 / 마일스톤
-- ----------------------------------------------------------------------------

CREATE TABLE milestones (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    title      VARCHAR(200) NOT NULL,
    due_date   DATE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_milestones_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='프로젝트 마일스톤';

CREATE TABLE tasks (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT NOT NULL,
    milestone_id BIGINT NULL,
    title        VARCHAR(200) NOT NULL,
    category     VARCHAR(50)  NOT NULL COMMENT '기획/프론트엔드/백엔드/AI-ML 등 18종',
    status       VARCHAR(20)  NOT NULL COMMENT '할 일/진행 중/보류-블로커/완료',
    assignee_id  BIGINT NULL COMMENT '미배정 가능',
    due_date     DATE,
    priority     VARCHAR(20),
    description  TEXT,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tasks_project   FOREIGN KEY (project_id)   REFERENCES projects(id)   ON DELETE CASCADE,
    CONSTRAINT fk_tasks_assignee  FOREIGN KEY (assignee_id)  REFERENCES users(id)      ON DELETE SET NULL,
    CONSTRAINT fk_tasks_milestone FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='업무 보드 항목';

CREATE TABLE task_checklists (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id    BIGINT NOT NULL,
    title      VARCHAR(200) NOT NULL,
    is_done    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_checklists_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='업무 체크리스트';

-- ----------------------------------------------------------------------------
-- 3. 회의록 AI
-- ----------------------------------------------------------------------------

CREATE TABLE meetings (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT NOT NULL,
    title           VARCHAR(200),
    file_type       VARCHAR(20) NOT NULL COMMENT 'document/audio/video',
    file_path       VARCHAR(500),
    transcript      LONGTEXT,
    analysis_status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '비동기 분석 상태',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_meetings_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회의록/녹음 업로드';

CREATE TABLE meeting_attendees (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    meeting_id BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    UNIQUE KEY uq_meeting_attendees (meeting_id, user_id),
    CONSTRAINT fk_attendees_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendees_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회의 참석자 태깅 (기여도 근거로도 사용)';

CREATE TABLE meeting_analysis (
    meeting_id   BIGINT PRIMARY KEY COMMENT '1:1 - meetings.id',
    summary      TEXT,
    decisions    JSON COMMENT '결정사항 목록',
    risks        JSON COMMENT '위험요소 목록',
    action_items JSON COMMENT 'To-Do 후보 목록',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_analysis_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='회의록 AI 분석 결과';

-- ----------------------------------------------------------------------------
-- 4. 대시보드 / ML / RAG
-- ----------------------------------------------------------------------------

CREATE TABLE activities (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    actor_id   BIGINT NOT NULL,
    type       VARCHAR(50) NOT NULL COMMENT '업무 변경/GitHub/회의록/산출물 등',
    target_id  BIGINT COMMENT '폴리모픽 대상 id (FK 제약 없음)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activities_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_activities_actor   FOREIGN KEY (actor_id)   REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='프로젝트 활동 로그';

CREATE TABLE ml_predictions (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id  BIGINT NOT NULL,
    target_type VARCHAR(20) NOT NULL COMMENT 'task/user (폴리모픽)',
    target_id   BIGINT NOT NULL,
    model_type  VARCHAR(50) NOT NULL COMMENT 'delay_risk/overload/anomaly',
    result      VARCHAR(50) COMMENT '정상/주의/위험 등',
    score       DECIMAL(6,3),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_predictions_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ML 예측 결과 (지연 위험도/업무 편중/이상치)';

CREATE TABLE document_chunks (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id  BIGINT NOT NULL,
    source_type VARCHAR(20) NOT NULL COMMENT 'meeting/task/deliverable/github (폴리모픽)',
    source_id   BIGINT NOT NULL,
    content     TEXT NOT NULL,
    embedding   JSON COMMENT '운영 환경은 PostgreSQL pgvector VECTOR 타입 사용',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chunks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAG 임베딩 청크';

CREATE TABLE assistant_messages (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    role       VARCHAR(10) NOT NULL COMMENT 'user/assistant',
    content    TEXT NOT NULL,
    sources    JSON COMMENT '출처 (회의록/업무/산출물 등)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assistant_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI Assistant 대화 이력';

-- ----------------------------------------------------------------------------
-- 5. 산출물 / GitHub
-- ----------------------------------------------------------------------------

CREATE TABLE deliverables (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    type       VARCHAR(30) NOT NULL COMMENT '발표자료/보고서/README/제안서 등',
    title      VARCHAR(200) NOT NULL,
    content    LONGTEXT,
    status     VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft/review/final',
    file_path  VARCHAR(500),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_deliverables_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='산출물 초안/결과물';

CREATE TABLE github_records (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT NOT NULL,
    type            VARCHAR(20) NOT NULL COMMENT 'commit/pr/issue',
    title           VARCHAR(300) NOT NULL,
    author          VARCHAR(100),
    url             VARCHAR(500),
    linked_task_id  BIGINT NULL COMMENT '선택적 FK - 업무 연결',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_github_project FOREIGN KEY (project_id)     REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_github_task    FOREIGN KEY (linked_task_id) REFERENCES tasks(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='GitHub 커밋/PR/Issue 동기화 기록';

-- ----------------------------------------------------------------------------
-- 6. 심사자 / 기여도 / 평가
-- ----------------------------------------------------------------------------

CREATE TABLE contribution_reports (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    summary    TEXT,
    evidence   JSON COMMENT '업무/회의/GitHub/산출물 근거',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_contribution_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_contribution_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='심사자 전용 기여도 리포트';

CREATE TABLE evaluation_scores (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    score      DECIMAL(5,2) NOT NULL,
    is_public  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_evaluation_scores (project_id, user_id),
    CONSTRAINT fk_scores_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_scores_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='심사자 최종 평가 점수';

CREATE TABLE comments (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT NOT NULL,
    target_type     VARCHAR(10) NOT NULL COMMENT 'personal/team',
    target_user_id  BIGINT NULL COMMENT 'personal일 때만 사용, team이면 NULL',
    author_id       BIGINT NOT NULL,
    content         TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_comments_project     FOREIGN KEY (project_id)     REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_target_user FOREIGN KEY (target_user_id) REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_comments_author      FOREIGN KEY (author_id)      REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='개인/팀 코멘트';

CREATE TABLE audit_logs (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    action      VARCHAR(50) NOT NULL,
    target_type VARCHAR(30),
    target_id   BIGINT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='심사자 조회 등 감사 로그';
