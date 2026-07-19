from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ml_delay_risk.schema.delay_schema import (
    BatchPredictRequest,
    BatchPredictResponse,
    HealthResponse,
    PredictRequest,
    PredictResponse,
)
from ml_delay_risk.models import _notebook_runtime
from ml_delay_risk.services.delay_service import predict_for_issue

router = APIRouter(prefix="/ai/delay-risk", tags=["delay-risk"])
# router = APIRouter(prefix="/ai/predict", tags=["delay-risk"])

# _notebook_runtime.load()는 여기서 모듈 임포트 시점에 즉시 호출하지 않는다. 그렇게 하면
# delay_model.ipynb가 깨졌을 때 이 라우터뿐 아니라 main.py가 임포트하는 앱 전체(다른
# 라우터 포함)가 기동조차 못 하게 된다. 대신 요청 처리 시점에 로드를 시도해서, 실패해도
# 이 기능만 503으로 열화되고 나머지 API는 정상 동작하도록 한다.
_NOTEBOOK_LOAD_ERRORS = (FileNotFoundError, _notebook_runtime.NotebookRuntimeError)


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        _notebook_runtime.load().load_artifact()
        model_loaded = True
    except _NOTEBOOK_LOAD_ERRORS:
        model_loaded = False
    return HealthResponse(service="ml-delayrisk-classification", status="UP", model_loaded=model_loaded)


@router.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    try:
        result = predict_for_issue(request.issue_key)
    except _NOTEBOOK_LOAD_ERRORS as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return PredictResponse(**result)


@router.post("/predict/batch", response_model=BatchPredictResponse)
def predict_batch(request: BatchPredictRequest) -> BatchPredictResponse:
    results = []
    for issue_key in request.issue_keys:
        try:
            results.append(PredictResponse(**predict_for_issue(issue_key)))
        except _NOTEBOOK_LOAD_ERRORS as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return BatchPredictResponse(results=results)
