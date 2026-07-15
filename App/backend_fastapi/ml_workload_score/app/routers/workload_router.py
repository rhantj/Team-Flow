from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ml_workload_score.app.schema.workload_schema import WorkloadScoreResponse
from ml_workload_score.app.services.workload_service import get_workload_score

router = APIRouter(prefix="/ai/score", tags=["workload"])


@router.post("/workload", response_model=WorkloadScoreResponse)
def score_workload(project_id: int, use_synthetic_fallback: bool = True):
    """
    FS-5 업무 편중 점수 (팀원별 과부하/저활동 탐지).
    Spring Boot가 내부 호출하는 AI 백엔드 엔드포인트.
    """
    try:
        data = get_workload_score(project_id, use_synthetic_fallback=use_synthetic_fallback)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": {
                    "code": "WORKLOAD_SCORE_FAILED",
                    "message": str(e),
                    "details": {},
                },
            },
        )
