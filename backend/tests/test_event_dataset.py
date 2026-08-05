"""Boot-time event dataset: when hubris/data/EMX_canonical.xlsx exists the
app's baseline IS that dataset (a restart never loses the real network);
when it is absent or unreadable, boot falls back to the synthetic baseline
and must never crash (the demo never dies)."""

import io

from fastapi.testclient import TestClient

from hubris.api.main import app
from hubris.data import event_dataset


def _canonical_workbook_bytes(client: TestClient) -> bytes:
    """A guaranteed-canonical workbook: the round-trip exporter's own output."""
    response = client.get("/export/network.xlsx")
    assert response.status_code == 200
    return response.content


def test_returns_none_when_file_absent(tmp_path, monkeypatch):
    monkeypatch.setattr(event_dataset, "EVENT_DATASET_PATH", tmp_path / "EMX_canonical.xlsx")
    assert event_dataset.load_event_baseline() is None


def test_loads_canonical_workbook_as_baseline(tmp_path, monkeypatch):
    with TestClient(app) as client:
        content = _canonical_workbook_bytes(client)
        baseline_counts = client.get("/network").json()

    path = tmp_path / "EMX_canonical.xlsx"
    path.write_bytes(content)
    monkeypatch.setattr(event_dataset, "EVENT_DATASET_PATH", path)
    monkeypatch.delenv(event_dataset.DISABLE_ENV, raising=False)  # this test WANTS the loader live

    model = event_dataset.load_event_baseline()
    assert model is not None
    assert len(model.hubs) == len(baseline_counts["hubs"])
    assert len(model.zones) == len(baseline_counts["zones"])


def test_unreadable_file_falls_back_to_none_not_crash(tmp_path, monkeypatch):
    path = tmp_path / "EMX_canonical.xlsx"
    path.write_bytes(b"this is not a workbook")
    monkeypatch.setattr(event_dataset, "EVENT_DATASET_PATH", path)
    monkeypatch.delenv(event_dataset.DISABLE_ENV, raising=False)
    assert event_dataset.load_event_baseline() is None


def test_appstate_boot_uses_loader(monkeypatch, tmp_path):
    """AppState must consult the loader and still boot when it yields None."""
    from hubris.api import state as state_module

    monkeypatch.setattr(event_dataset, "EVENT_DATASET_PATH", tmp_path / "missing.xlsx")
    fresh = state_module.AppState()
    assert fresh.baseline is not None
    assert len(fresh.baseline.hubs) > 0  # synthetic fallback carried us


def _unused_io_guard() -> None:  # keep io import honest for the workbook helper
    io.BytesIO(b"")
