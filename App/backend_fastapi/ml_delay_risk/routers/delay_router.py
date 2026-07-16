from __future__ import annotations

from fastapi import APIRouter, HTTPException

from App.backend_fastapi.ml_delay_risk.schema.delay_schema import (
    BatchPredictRequest,
    BatchPredictResponse,
    HealthResponse,
    PredictRequest,
    PredictResponse,
)
from ml_delay_risk.models import _notebook_runtime
from App.backend_fastapi.ml_delay_risk.services.delay_service import predict_for_issue

load_artifact = _notebook_runtime.load().load_artifact

router = APIRouter(prefix="/ai/delay-risk", tags=["delay-risk"])
# router = APIRouter(prefix="/ai/predict", tags=["delay-risk"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        load_artifact()
        model_loaded = True
    except FileNotFoundError:
        model_loaded = False
    return HealthResponse(service="ml-delayrisk-classification", status="UP", model_loaded=model_loaded)


@router.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    try:
        result = predict_for_issue(request.issue_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return PredictResponse(**result)


@router.post("/predict/batch", response_model=BatchPredictResponse)
def predict_batch(request: BatchPredictRequest) -> BatchPredictResponse:
    results = []
    for issue_key in request.issue_keys:
        try:
            results.append(PredictResponse(**predict_for_issue(issue_key)))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return BatchPredictResponse(results=results)
