"""DB 연결 모듈 - Supabase PostgreSQL (tasks/milestones/task_checklists).

delay_model.py 자체는 학습 시 사용한 MongoDB(Jira 데이터셋) 구조와 완전히 분리돼 있고
피처 딕셔너리만 입력으로 받으므로, 이 모듈은 실제 서비스 스키마(Supabase Postgres)에서
지연 위험도 예측에 필요한 원본 데이터를 읽어오는 역할만 담당한다.
(services/task_delay_service.py가 이 데이터를 delay_model이 기대하는 피처 딕셔너리로 변환한다.)

ml_workload_score/app/services/workload_db.py와 동일한 접속 방식(DATABASE_URL)을 쓰지만,
서로 다른 기능 슬라이스(FS-3 vs FS-5)라 모듈을 공유하지 않고 독립적으로 둔다.

주의: 비밀번호/연결정보는 절대 코드에 하드코딩하지 않는다. 프로젝트 루트 App/.env에
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres
형식으로 넣을 것 (.env는 .gitignore에 포함되어 있음).
"""

from __future__ import annotations

import os

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")


def get_engine() -> Engine:
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL 환경변수가 없습니다. App/.env에 DATABASE_URL=postgresql://... 형식으로 넣어주세요."
        )
    return create_engine(DATABASE_URL, pool_pre_ping=True)


# tasks 1건당 milestone 마감일과 체크리스트 완료 현황을 함께 실어온다 -
# task_delay_service.py가 이 두 값으로 proxy_deadline_hours와 progress_ratio를 계산한다
# (Jira 데이터셋에는 없던 "실제 마감일"이 이 스키마에는 있어 프록시 추정 없이 바로 쓸 수 있다).
_TASKS_QUERY = text(
    """
    SELECT
        t.id            AS task_id,
        t.project_id,
        t.milestone_id,
        t.title,
        t.category,
        t.status,
        t.assignee_id,
        t.due_date,
        t.priority,
        t.created_at,
        t.updated_at,
        m.due_date      AS milestone_due_date,
        COALESCE(chk.total_items, 0) AS checklist_total,
        COALESCE(chk.done_items, 0)  AS checklist_done
    FROM public.tasks t
    LEFT JOIN public.milestones m ON m.id = t.milestone_id
    LEFT JOIN (
        SELECT
            task_id,
            COUNT(*)                                AS total_items,
            COUNT(*) FILTER (WHERE is_done)          AS done_items
        FROM public.task_checklists
        GROUP BY task_id
    ) chk ON chk.task_id = t.id
    WHERE t.project_id = :project_id
    ORDER BY t.id
    """
)


def load_tasks_for_project(project_id: int, engine: Engine | None = None) -> pd.DataFrame:
    """프로젝트의 모든 업무를 마일스톤 마감일 + 체크리스트 진행률과 함께 읽어온다."""
    engine = engine or get_engine()
    with engine.connect() as conn:
        df = pd.read_sql(_TASKS_QUERY, conn, params={"project_id": project_id})

    df["due_date"] = pd.to_datetime(df["due_date"])
    df["milestone_due_date"] = pd.to_datetime(df["milestone_due_date"])
    df["created_at"] = pd.to_datetime(df["created_at"])
    df["updated_at"] = pd.to_datetime(df["updated_at"])
    return df


def insert_predictions(
    project_id: int,
    predictions: list[dict],
    engine: Engine | None = None,
) -> int:
    """ml_predictions에 예측 결과를 새 행으로 적재한다 (target_type='task', model_type='delay_risk').

    갱신이 아니라 매번 새 행을 추가하는 이력(append-only) 방식이다 - ml_predictions에는
    (project_id, target_type, target_id, model_type) 유니크 제약이 없고, 최신 예측은
    Spring 쪽(dashboard.repository.MlPredictionRepository)에서 target_id별 최신 created_at
    행만 골라 사용한다.
    """
    if not predictions:
        return 0

    engine = engine or get_engine()
    insert_stmt = text(
        """
        INSERT INTO public.ml_predictions (project_id, target_type, target_id, model_type, result, score)
        VALUES (:project_id, 'task', :target_id, 'delay_risk', :result, :score)
        """
    )
    with engine.begin() as conn:
        for prediction in predictions:
            conn.execute(
                insert_stmt,
                {
                    "project_id": project_id,
                    "target_id": prediction["task_id"],
                    "result": prediction["result"],
                    "score": prediction["score"],
                },
            )
    return len(predictions)
