from __future__ import annotations

from ml_delay_risk.models.delay_model import CATEGORICAL_COLUMNS, FREQUENCY_ENCODED_COLUMNS
from ml_delay_risk.models.mock_issue_dataset import build_training_dataframe
from ml_delay_risk.models.feature_engineering import RISK_CLASS_NAMES


def test_build_training_dataframe_returns_balanced_classes() -> None:
    df, _, _ = build_training_dataframe(limit=300, num_projects=4, seed=1)

    counts = df["risk_class"].value_counts()
    assert set(counts.index) == set(RISK_CLASS_NAMES.values())
    assert counts.nunique() == 1
    assert counts.iloc[0] == 100


def test_build_training_dataframe_reproducible_with_seed() -> None:
    df1, proxy_map1, median1 = build_training_dataframe(limit=90, num_projects=3, seed=7)
    df2, proxy_map2, median2 = build_training_dataframe(limit=90, num_projects=3, seed=7)

    assert df1.equals(df2)
    assert proxy_map1 == proxy_map2
    assert median1 == median2


def test_build_training_dataframe_varies_with_different_seed() -> None:
    df1, _, _ = build_training_dataframe(limit=90, num_projects=3, seed=1)
    df2, _, _ = build_training_dataframe(limit=90, num_projects=3, seed=2)

    assert not df1["elapsed_hours_at_cutoff"].equals(df2["elapsed_hours_at_cutoff"])


def test_build_training_dataframe_includes_model_contract_columns() -> None:
    df, _, _ = build_training_dataframe(limit=90, num_projects=3, seed=1)

    for column in CATEGORICAL_COLUMNS + FREQUENCY_ENCODED_COLUMNS:
        assert column in df.columns


def test_build_training_dataframe_category_and_priority_diversity_per_label() -> None:
    df, _, _ = build_training_dataframe(limit=900, num_projects=8, seed=3)

    diversity_by_label = df.groupby("risk_class").agg(
        categories=("issuetype_name", "nunique"), priorities=("priority_name", "nunique")
    )
    # 라벨(위험/주의/정상)이 특정 카테고리나 우선순위에만 쏠리면 모델이 얕은 상관관계만
    # 배우게 되므로, 각 라벨 버킷 안에서도 여러 카테고리/우선순위가 섞여 있어야 한다.
    assert (diversity_by_label["categories"] >= 10).all()
    assert (diversity_by_label["priorities"] == 3).all()


def test_build_training_dataframe_status_at_cutoff_never_done() -> None:
    df, _, _ = build_training_dataframe(limit=300, num_projects=4, seed=5)

    assert "Done" not in set(df["status_at_cutoff"].unique())


def test_build_training_dataframe_checklist_progress_is_internally_consistent() -> None:
    df, _, _ = build_training_dataframe(limit=300, num_projects=4, seed=5)

    assert (df["num_unresolved_subtasks"] >= 0).all()
    assert (df["num_unresolved_subtasks"] <= df["num_subtasks"]).all()
    assert (df["elapsed_hours_at_cutoff"] >= 0).all()


def test_build_training_dataframe_returns_proxy_deadline_map_for_all_category_priority_pairs() -> None:
    df, proxy_map, global_median = build_training_dataframe(limit=90, num_projects=3, seed=1)

    assert global_median > 0
    for category in df["issuetype_name"].unique():
        for priority in df["priority_name"].unique():
            assert (category, priority) in proxy_map
            assert proxy_map[(category, priority)] > 0


def test_build_training_dataframe_handles_limit_not_divisible_by_three() -> None:
    df, _, _ = build_training_dataframe(limit=10, num_projects=2, seed=1)

    # 10 // 3 == 3 -> 클래스당 3건, 총 9행으로 내려 맞춰야 한다(균형 유지가 우선).
    counts = df["risk_class"].value_counts()
    assert counts.nunique() == 1
    assert len(df) == 9
