from __future__ import annotations

from fastapi import APIRouter

from ..checklist_pipeline import generate_checklist
from ..checklist_schema import ChecklistGenerateRequest, ChecklistGenerateResponse

router = APIRouter(prefix="/ai/checklist", tags=["checklist"])


@router.post("/generate", response_model=ChecklistGenerateResponse)
def generate(request: ChecklistGenerateRequest) -> ChecklistGenerateResponse:
    return generate_checklist(request)
