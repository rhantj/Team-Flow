# RAG 질문에 섞인 잡음 문구로 인한 검색 실패 - 임베딩 파인튜닝 실험

날짜: 2026-07-21

## 증상

AI 어시스턴트에 `"오늘 결정된 사항을 알려줘 (langsmith 트레이싱 테스트)"`처럼 질문 뒤에
목적과 무관한 문구를 덧붙여 물어보면, 직전에 거의 동일한 질문("오늘 회의에서 결정된 사항이
뭐야?")에는 정상적으로 답했던 것과 달리 `"근거 없음: 관련 자료를 찾지 못했습니다"`가 반환됐다.

## 원인 분석

RAG 파이프라인 (`App/backend_fastapi/llm_rag_assistant/app/services/`):

```
chat_service.answer_question()
  -> embedding_service.embed_text(question)         # 원본 질문 문자열을 그대로 임베딩
  -> retrieval_service.search_similar_chunks(...)    # pgvector 코사인 유사도 top-k
  -> generation_service.generate_answer(question, sources)  # LLM이 sources 관련성 판단
```

- `embed_text(question)`이 질문 원문을 전처리 없이 그대로 임베딩한다 (`embedding_service.py:8-17`).
  괄호로 덧붙은 잡음 문구가 임베딩 벡터를 원래 의도에서 밀어내면 검색된 top-k 청크의 관련성이 낮아진다.
- `search_similar_chunks`는 유사도 임계값 없이 항상 top-k(5)를 반환하므로(`retrieval_service.py`),
  근거 없음 여부는 최종적으로 LLM(`ChatHuggingFace`)이 시스템 프롬프트
  (`"컨텍스트에 질문과 관련된 내용이 없으면 반드시 '근거 없음'..."`, `generation_service.py:8-12`)에
  따라 판단한다 — 검색된 청크가 실제로는 있어도 관련성이 낮으면 LLM이 근거 없음으로 답할 수 있다.

## 검토한 대응 방안

| 방안 | 비용 | 강건성 | 비고 |
| --- | --- | --- | --- |
| 정규식 전처리(괄호/사족 제거) | 거의 없음 | 낮음(패턴 한정) | 즉시 적용 가능, 커버 못하는 잡음 패턴 존재 |
| LLM 쿼리 리라이팅 | RAG 호출마다 LLM 1회 추가 | 높음 | 지연시간/비용 증가 |
| **임베딩 모델 파인튜닝(이 문서)** | 학습 인프라 필요 | 높음, 재사용 가능 | 아래 실험으로 검증 중 |

## 실험 설계 (파인튜닝)

- **목표**: 질문에 잡음이 섞여도 임베딩이 정답 문서와의 유사도를 유지하도록 `BAAI/bge-m3`
  (운영 RAG의 `core/config.py hf_embedding_model` 기본값)를 LoRA로 파인튜닝한다.
- **데이터**: 운영 코퍼스(`document_chunks`, project_id=1, 2026-07-21 기준 task 114 / action_item 11 /
  meeting 3건)에서 실제 콘텐츠를 정답 passage로 삼고, 유형별 템플릿으로 `clean_query`를 합성한 뒤
  실제로 문제를 일으켰던 패턴(괄호 부가설명, 인사말, 잡담체, 재촉, 이모지/의성어)으로 `noisy_query`를
  만든다.
- **학습**: `sentence-transformers`의 `MultipleNegativesRankingLoss` + PEFT LoRA(attention Q/K/V,
  `r=8`), `(noisy_query, passage)` 쌍으로 대조학습.
- **평가**: Recall@1/3/5, MRR을 `clean_query`/`noisy_query` 각각에 대해 파인튜닝 전/후로 측정해
  비교한다 — noisy 지표가 clean 지표에 얼마나 근접하는지가 성공 기준.

## 노트북 (`document_고무서/notebooks/`)

| 순서 | 노트북 | 내용 | 주요 산출물 |
| --- | --- | --- | --- |
| 01 | `01_data_prep.ipynb` | 코퍼스 로드, clean/noisy 질문 생성, train/eval 분할 | `train_pairs.csv`, `eval_pairs.csv` |
| 02 | `02_baseline_retrieval_eval.ipynb` | 파인튜닝 전 bge-m3로 clean/noisy 검색 성능 측정 | `baseline_metrics.json`, `baseline_recall_chart.png` |
| 03 | `03_embedding_finetune.ipynb` | LoRA 파인튜닝 + 어댑터 병합 저장 | `model/` (병합된 SentenceTransformer) |
| 04 | `04_finetuned_eval_compare.ipynb` | 파인튜닝 후 재평가 + 전/후 비교 차트 | `final_comparison.json`, `final_comparison_chart.png` |

산출물은 전부 `document_고무서/output/embedding-finetune/`에 저장된다. 01 → 02 → 03 → 04 순서로
실행해야 하며, 각 노트북은 이전 단계의 CSV/모델 산출물을 그대로 읽는다.

## 실행 방법

```bash
# 저장소 루트 requirements.txt에 실험용 의존성(torch, sentence-transformers, peft, accelerate) 추가됨
pip install -r requirements.txt

# App/.env의 DATABASE_URL(Supabase)을 그대로 사용 — 로컬 docker-compose db에는 document_chunks가 없음
cd document_고무서/notebooks
jupyter notebook  # 01 -> 02 -> 03 -> 04 순서로 실행
```

## 기존 결정과의 관계

- 저장소 루트 `requirements.txt`는 "PyTorch는 용량 문제로 제외"라는 기존 주석이 있었는데, 이번
  실험은 로컬 파인튜닝이 목적이라 `torch`(CPU 빌드)가 불가피하게 필요해 예외로 추가했다.
- Docker 컨테이너(`backend-fastapi`)에는 이 의존성을 설치하지 않는다 — 파인튜닝은 노트북에서만
  일회성으로 실행하고, 검증된 모델만 운영에 반영하는 것을 전제로 한다.

## 상태

실험 완료, 운영 반영 완료 (feature/rag-query-robust-embedding).

## 실험 결과

`document_고무서/output/embedding-finetune/04_training/final_comparison.json` (eval 26건, recall@1 기준):

| | clean | noisy |
| --- | --- | --- |
| baseline (BAAI/bge-m3) | 0.769 | 0.779 |
| finetuned (LoRA) | 0.808 | 0.808 |

recall@3/5, MRR 상단은 이미 포화(1.0)라 recall@1에서만 차이가 나며, 개선 폭은 크지 않지만
(noisy 지표가 clean 지표와 동일해짐) 목표였던 "노이즈 유무에 따른 격차 해소"는 달성했다.

## 운영 반영 내역

1. LoRA 어댑터를 `BAAI/bge-m3`에 병합(`merge_and_unload()`)해 HF Hub
   `rhantj/bge-m3-workflow-query-robust` (public)에 업로드.
2. HF 서버리스 Inference API는 커스텀 업로드 모델을 서빙하지 않아(`StopIteration`),
   원격 API 호출 대신 `embedding_service.py`가 컨테이너 내부에서 `sentence-transformers`로
   직접 로드/추론하도록 변경. `core/config.py`의 `hf_embedding_model_revision`으로 커밋
   SHA를 고정해, 원격 저장소에 새 커밋이 올라가도 배포가 조용히 다른 가중치를 받아쓰지
   않게 함.
3. **Supabase(운영 DB) `document_chunks` 138건 전부 재임베딩 완료** (2026-07-22,
   `python -m llm_rag_assistant.scripts.reembed_document_chunks`). 차원이 그대로
   1024라 스키마 변경(ALTER TABLE)은 불필요했음.
4. 새 환경/새 배포 시 체크리스트: 임베딩 모델이나 `hf_embedding_model_revision`을 바꾸면
   **반드시** 위 재임베딩 스크립트를 대상 DB에 대해 다시 실행할 것 — 실행하지 않으면
   기존 벡터가 옛 모델의 벡터 공간에 남아있어 검색 정확도가 저하된다. 이 단계는
   자동화돼 있지 않으므로(모델이 안 바뀌는 한 매 배포마다 돌릴 필요는 없음) 배포자가
   수동으로 챙겨야 한다.
