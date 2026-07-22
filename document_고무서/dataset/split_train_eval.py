"""query_noise_robustness_dataset.csv를 train/eval로 분할한다.

행(row) 단위가 아니라 chunk_id 단위로 분할한다 - 같은 청크의 노이즈 변형 8개가
train/eval에 걸쳐 나뉘면 같은 정답 passage를 양쪽에서 다 보게 되어(data leakage)
eval 지표가 실제보다 부풀려진다.

실행:
    source App/backend_fastapi/.venv/bin/activate
    python document_고무서/dataset/split_train_eval.py

산출물: document_고무서/dataset/train_pairs.csv, eval_pairs.csv
"""

from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

DATASET_DIR = Path(__file__).resolve().parent
SEED = 42
TEST_SIZE = 0.2

dataset = pd.read_csv(DATASET_DIR / "query_noise_robustness_dataset.csv")

unique_chunk_ids = dataset["chunk_id"].drop_duplicates()
train_chunk_ids, eval_chunk_ids = train_test_split(
    unique_chunk_ids, test_size=TEST_SIZE, random_state=SEED
)

train_df = dataset[dataset["chunk_id"].isin(train_chunk_ids)].rename(columns={"chunk_id": "id"})
eval_df = dataset[dataset["chunk_id"].isin(eval_chunk_ids)].rename(columns={"chunk_id": "id"})

train_path = DATASET_DIR / "train_pairs.csv"
eval_path = DATASET_DIR / "eval_pairs.csv"
train_df.to_csv(train_path, index=False)
eval_df.to_csv(eval_path, index=False)

print(f"전체 청크: {len(unique_chunk_ids)}개 (train {len(train_chunk_ids)} / eval {len(eval_chunk_ids)})")
print(f"train pairs: {len(train_df)}건 -> {train_path}")
print(f"eval pairs : {len(eval_df)}건 -> {eval_path}")
