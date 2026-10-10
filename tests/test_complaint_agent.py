import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image

from app.services import complaint_agent


def _fake_photo() -> bytes:
    img = Image.new("RGB", (40, 30), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_verify_complaint_degrades_without_credentials(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("BEDROCK_MODEL_ID", raising=False)
    result = complaint_agent.verify_complaint(_fake_photo(), 28.565, 77.175, "test")
    assert result["mode"] == "unavailable"
    assert result["verdict"] is None
    assert result["note"]


def test_verify_closure_degrades_without_credentials(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("BEDROCK_MODEL_ID", raising=False)
    photo = _fake_photo()
    result = complaint_agent.verify_closure(photo, photo, "garbage_burning", 28.565, 77.175)
    assert result["mode"] == "unavailable"
    assert result["verdict"] is None
