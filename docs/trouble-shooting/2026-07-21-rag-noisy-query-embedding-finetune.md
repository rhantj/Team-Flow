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

실험 노트북/데이터 파이프라인 준비 완료. **실제 학습·평가 실행 및 결과 수치는 아직 기록되지
않음** — 노트북을 순서대로 실행한 뒤 이 문서의 "실험 결과" 절을 추가할 것.

## 실험 결과

_(01~04 노트북 실행 후 `final_comparison.json` 수치와 결론을 여기에 추가)_
