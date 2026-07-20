"""fetch_model.main()의 다운로드 성공/스킵/실패 분기 테스트."""
from __future__ import annotations

import logging

import pytest

from ml_delay_risk import fetch_model
from ml_delay_risk.config import Settings


def _settings(tmp_path, **overrides) -> Settings:
    defaults = dict(
        model_dir=str(tmp_path / "models"),
        model_filename="delay_model.pkl",
        hf_model_repo_id="someone/some-repo",
        hf_model_revision="",
    )
    defaults.update(overrides)
    return Settings(_env_file=None, **defaults)


def test_skips_when_model_already_exists(tmp_path, monkeypatch, caplog):
    model_dir = tmp_path / "models"
    model_dir.mkdir()
    (model_dir / "delay_model.pkl").write_bytes(b"already here")
    monkeypatch.setattr(fetch_model, "get_settings", lambda: _settings(tmp_path))

    with caplog.at_level(logging.INFO):
        fetch_model.main()

    assert "건너뜁니다" in caplog.text


def test_skips_when_repo_id_not_configured(tmp_path, monkeypatch, caplog):
    monkeypatch.setattr(fetch_model, "get_settings", lambda: _settings(tmp_path, hf_model_repo_id=""))

    with caplog.at_level(logging.INFO):
        fetch_model.main()

    assert "설정되지 않아" in caplog.text
    assert not (tmp_path / "models" / "delay_model.pkl").exists()


def test_downloads_copies_file_and_logs_resolved_commit(tmp_path, monkeypatch, caplog):
    cache_file = tmp_path / "hf_cache" / "snapshots" / "abc123commitsha" / "delay_model.pkl"
    cache_file.parent.mkdir(parents=True)
    cache_file.write_bytes(b"fake model bytes")

    monkeypatch.setattr(fetch_model, "get_settings", lambda: _settings(tmp_path))
    monkeypatch.setattr("huggingface_hub.hf_hub_download", lambda **kwargs: str(cache_file))

    with caplog.at_level(logging.INFO):
        fetch_model.main()

    target = tmp_path / "models" / "delay_model.pkl"
    assert target.read_bytes() == b"fake model bytes"
    assert "abc123commitsha" in caplog.text


def test_swallows_network_error_and_leaves_model_missing(tmp_path, monkeypatch, caplog):
    def raise_connection_error(**kwargs):
        raise ConnectionError("network unreachable")

    monkeypatch.setattr(fetch_model, "get_settings", lambda: _settings(tmp_path))
    monkeypatch.setattr("huggingface_hub.hf_hub_download", raise_connection_error)

    with caplog.at_level(logging.INFO):
        fetch_model.main()  # 예외를 던지지 않고 조용히 반환해야 한다

    assert not (tmp_path / "models" / "delay_model.pkl").exists()
    assert "다운로드 실패" in caplog.text


def test_propagates_unexpected_bug_instead_of_swallowing(tmp_path, monkeypatch):
    def raise_type_error(**kwargs):
        raise TypeError("이런 예외는 코드 버그를 뜻하므로 삼키면 안 된다")

    monkeypatch.setattr(fetch_model, "get_settings", lambda: _settings(tmp_path))
    monkeypatch.setattr("huggingface_hub.hf_hub_download", raise_type_error)

    with pytest.raises(TypeError):
        fetch_model.main()
