from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ml_delay_risk.schema.delay_schema import TaskDelayPredictResponse
from ml_delay_risk.services.task_delay_service import run_delay_risk_for_project

router = APIRouter(prefix="/ai/delay-risk", tags=["delay-risk"])


@router.post("/tasks/predict", response_model=TaskDelayPredictResponse)
def predict_tasks_for_project(project_id: int) -> TaskDelayPredictResponse:
    """Supabase tasks/milestones/task_checklists를 읽어 프로젝트의 미완료 업무 전체를
    예측하고 ml_predictions에 적재한 뒤 결과를 반환한다 (Spring 대시보드가 이 엔드포인트를 호출)."""
    try:
        predictions = run_delay_risk_for_project(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return TaskDelayPredictResponse(
        project_id=project_id,
        predicted_count=len(predictions),
        results=predictions,
    )
