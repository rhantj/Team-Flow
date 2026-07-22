"""ml_delay_risk.models.delay_model 단위 테스트.

delay_model.py는 delay_model.ipynb에서 추론에 필요한 정의(ModelArtifact, load_artifact,
predict_class_probabilities, proxy_deadline_for)만 뽑아낸 평범한 모듈이다. 노트북은 이제
이 모듈을 import해서 쓸 뿐 재정의하지 않으므로, 프로덕션(delay_router.py/delay_service.py)은
더 이상 노트북을 JSON 파싱+exec()할 필요가 없다.
"""
from __future__ import annotations

import threading

import lightgbm as lgb
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier

from ml_delay_risk.models import delay_model


@pytest.fixture(autouse=True)
def _reset_artifact_cache():
    original = delay_model._artifact_cache
    yield
    delay_model._artifact_cache = original


def test_load_artifact_raises_file_not_found_when_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(delay_model, "_model_path", lambda: tmp_path / "missing.pkl")

    with pytest.raises(FileNotFoundError):
        delay_model.load_artifact()


def test_load_artifact_normalizes_unpickle_failure(tmp_path, monkeypatch):
    # 예전 코드(모듈명이 "__main__"이던 시절)로 저장된 것처럼, 언피클 자체가 실패하는 상황을
    # 흉내낸다. AttributeError 등 원인과 무관하게 FileNotFoundError로 통일되어야
    # delay_router.py의 기존 503 처리 경로를 그대로 탈 수 있다.
    bad_path = tmp_path / "corrupt.pkl"
    bad_path.write_bytes(b"not a valid pickle")
    monkeypatch.setattr(delay_model, "_model_path", lambda: bad_path)

    with pytest.raises(FileNotFoundError):
        delay_model.load_artifact()


def _train_fake_artifact() -> "delay_model.ModelArtifact":
    train_x = pd.DataFrame({"elapsed_hours_at_cutoff": [1.0, 10.0, 40.0, 80.0]})
    booster = lgb.train(
        {
            "objective": "multiclass",
            "num_class": 3,
            "verbosity": -1,
            "min_data_in_leaf": 1,
            "min_data_in_bin": 1,
        },
        lgb.Dataset(train_x, label=[0, 0, 1, 2]),
        num_boost_round=3,
    )
    return delay_model.ModelArtifact(
        booster=booster,
        feature_names=["elapsed_hours_at_cutoff"],
        categorical_columns=[],
        frequency_maps={},
        proxy_deadline_map={("Bug", "High"): 48.0},
        global_median_duration_hours=72.0,
    )


def test_save_and_load_artifact_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(delay_model, "_model_path", lambda: tmp_path / "delay_model.pkl")
    artifact = _train_fake_artifact()

    delay_model._save_artifact(artifact)
    delay_model._artifact_cache = None  # 방금 저장한 파일을 실제로 다시 읽는지 확인
    loaded = delay_model.load_artifact()

    assert loaded.feature_names == artifact.feature_names
    assert loaded.proxy_deadline_map == artifact.proxy_deadline_map


def test_predict_class_probabilities_returns_valid_distribution(monkeypatch):
    monkeypatch.setattr(delay_model, "_artifact_cache", _train_fake_artifact())

    probabilities = delay_model.predict_class_probabilities({"elapsed_hours_at_cutoff": 50.0})

    assert len(probabilities) == 3
    assert all(0.0 <= p <= 1.0 for p in probabilities)
    assert sum(probabilities) == pytest.approx(1.0, abs=1e-6)


def test_predict_maps_has_milestone_to_legacy_has_parent_artifact(monkeypatch):
    class CapturingBooster:
        best_iteration = 1

        def predict(self, row_df, num_iteration):
            assert list(row_df.columns) == ["has_parent"]
            assert bool(row_df.iloc[0]["has_parent"]) is True
            return [[0.7, 0.2, 0.1]]

    artifact = delay_model.ModelArtifact(
        booster=CapturingBooster(),
        feature_names=["has_parent"],
        categorical_columns=[],
        frequency_maps={},
        proxy_deadline_map={},
        global_median_duration_hours=72.0,
    )
    monkeypatch.setattr(delay_model, "_artifact_cache", artifact)

    probabilities = delay_model.predict_class_probabilities({"has_milestone": True})

    assert probabilities == [0.7, 0.2, 0.1]


def test_predict_class_probabilities_supports_random_forest_artifact(monkeypatch):
    train_x = pd.DataFrame(
        {
            "elapsed_hours_at_cutoff": [2.0, 12.0, 48.0, 96.0],
            "priority_name_High": [0, 1, 1, 0],
        }
    )
    model = RandomForestClassifier(n_estimators=5, random_state=42).fit(train_x, [0, 0, 1, 2])
    artifact = delay_model.ModelArtifact(
        booster=None,
        feature_names=["elapsed_hours_at_cutoff", "priority_name"],
        categorical_columns=["priority_name"],
        frequency_maps={},
        proxy_deadline_map={},
        global_median_duration_hours=72.0,
        model_type="random_forest",
        model=model,
        model_feature_columns=list(train_x.columns),
    )
    monkeypatch.setattr(delay_model, "_artifact_cache", artifact)

    probabilities = delay_model.predict_class_probabilities(
        {"elapsed_hours_at_cutoff": 50.0, "priority_name": "High"}
    )

    assert len(probabilities) == 3
    assert all(0.0 <= p <= 1.0 for p in probabilities)
    assert sum(probabilities) == pytest.approx(1.0, abs=1e-6)


def test_proxy_deadline_for_looks_up_map_then_falls_back(monkeypatch):
    monkeypatch.setattr(delay_model, "_artifact_cache", _train_fake_artifact())

    assert delay_model.proxy_deadline_for("Bug", "High") == 48.0
    assert delay_model.proxy_deadline_for("Unknown", "Unknown") == 72.0


def test_load_artifact_is_race_free_under_concurrent_access(tmp_path, monkeypatch):
    monkeypatch.setattr(delay_model, "_model_path", lambda: tmp_path / "delay_model.pkl")
    delay_model._save_artifact(_train_fake_artifact())
    delay_model._artifact_cache = None

    call_count = {"n": 0}
    real_load = delay_model.joblib.load

    def counting_load(path, *args, **kwargs):
        call_count["n"] += 1
        return real_load(path, *args, **kwargs)

    monkeypatch.setattr(delay_model.joblib, "load", counting_load)

    n_threads = 16
    barrier = threading.Barrier(n_threads)
    results = [None] * n_threads

    def worker(i):
        barrier.wait()
        results[i] = delay_model.load_artifact()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert all(r is results[0] for r in results)
    assert call_count["n"] == 1
