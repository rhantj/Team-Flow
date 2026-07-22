"""쿼리 노이즈 강건성 데이터셋 생성 스크립트.

실제 운영 코퍼스(document_chunks)를 정답 passage로 삼아 clean_query를 만들고,
카테고리화된 노이즈 템플릿에서 청크당 여러 개를 샘플링해 noisy_query를 생성한다.
이전 실험(document_고무서/notebooks/01_data_prep.ipynb)의 8개 템플릿은 다양성이
부족해 모델이 템플릿 자체를 암기할 위험이 있었다 - 이를 5개 카테고리 x
카테고리당 여러 변형으로 확장해 청크당 8개씩 샘플링, 총 ~1000행을 만든다.

실행:
    source App/backend_fastapi/.venv/bin/activate
    python document_고무서/dataset/build_query_noise_dataset.py

산출물: document_고무서/dataset/query_noise_robustness_dataset.csv
"""

import os
import random
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / "App" / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
OUTPUT_PATH = Path(__file__).resolve().parent / "query_noise_robustness_dataset.csv"
VARIANTS_PER_CHUNK = 8
SEED = 42

_QUESTION_TEMPLATES = {
    "task": "{title} 업무는 어떤 내용이야?",
    "action_item": "{title} 관련해서 뭘 해야 해?",
    "meeting": "회의에서 {title} 관련해서 어떤 이야기가 나왔어?",
}

# 카테고리별 노이즈 템플릿 - 실제 실패 사례("(langsmith 트레이싱 테스트)" 부가설명)를
# 포함해 5개 유형으로 분류했다. 카테고리당 여러 변형을 두어 특정 문구 암기를 방지한다.
_NOISE_TEMPLATES = {
    "부가설명형": [
        "{q} ({noise_topic} 테스트)",
        "{q} (참고용으로 물어보는 거야)",
        "{q} (그냥 확인차 물어봄)",
        "{q} ({noise_topic} 관련 확인용 질문)",
    ],
    "대화맥락형": [
        "아까 말한 거에 이어서, {q}",
        "저번에 물어봤던 거 말고 이번엔 {q}",
        "다른 거 말고, {q}",
        "이어서 궁금한 게 있는데 {q}",
    ],
    "사교인사형": [
        "혹시 바쁘신데 죄송한데, {q}",
        "수고 많으세요, {q}",
        "안녕하세요, {q}",
    ],
    "감정재촉형": [
        "{q}?! 빨리 좀 알려줄 수 있어?",
        "{q} 급한데 빨리 부탁해",
        "{q} 좀 답답해서 그러는데",
    ],
    "구어체잡음형": [
        "{q} ㅋㅋ 그냥 확인차",
        "음.. {q}",
        "{q} 근데 이거 그냥 궁금해서 물어보는 거야",
        "{q}~ 궁금해서!",
    ],
}
_NOISE_TOPICS = ["디버깅", "langsmith", "성능", "QA", "회의"]

_ALL_NOISE_ENTRIES = [
    (category, template)
    for category, templates in _NOISE_TEMPLATES.items()
    for template in templates
]


def fetch_chunks() -> pd.DataFrame:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        query = """
            SELECT id, project_id, source_type, source_id, content
            FROM document_chunks
            ORDER BY id
        """
        return pd.read_sql(query, conn)
    finally:
        conn.close()


def extract_title(content: str) -> str:
    return content.split(" - ", 1)[0].strip()


def build_clean_query(row: pd.Series) -> str:
    title = extract_title(row["content"])[:60]
    template = _QUESTION_TEMPLATES.get(row["source_type"], "{title}에 대해 알려줘")
    return template.format(title=title)


def build_noisy_variants(clean_query: str, chunk_id: int, rng: random.Random) -> list[tuple[str, str]]:
    sampled = rng.sample(_ALL_NOISE_ENTRIES, k=min(VARIANTS_PER_CHUNK, len(_ALL_NOISE_ENTRIES)))
    variants = []
    for category, template in sampled:
        noisy_query = template.format(q=clean_query, noise_topic=rng.choice(_NOISE_TOPICS))
        variants.append((category, noisy_query))
    return variants


def main() -> None:
    chunks = fetch_chunks()
    chunks["clean_query"] = chunks.apply(build_clean_query, axis=1)

    rows = []
    for _, row in chunks.iterrows():
        rng = random.Random(SEED + int(row["id"]))
        for category, noisy_query in build_noisy_variants(row["clean_query"], row["id"], rng):
            rows.append(
                {
                    "chunk_id": row["id"],
                    "project_id": row["project_id"],
                    "source_type": row["source_type"],
                    "source_id": row["source_id"],
                    "content": row["content"],
                    "clean_query": row["clean_query"],
                    "noise_category": category,
                    "noisy_query": noisy_query,
                }
            )

    dataset = pd.DataFrame(rows)
    dataset = dataset.sample(frac=1.0, random_state=SEED).reset_index(drop=True)
    dataset.to_csv(OUTPUT_PATH, index=False)

    print(f"청크 수: {len(chunks)}")
    print(f"생성된 (clean, noisy) 쌍: {len(dataset)}")
    print(dataset["noise_category"].value_counts())
    print(f"저장 위치: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
