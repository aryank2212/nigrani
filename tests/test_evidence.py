import io
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image

from app.services.evidence import PhotoMeta, _convert_to_degrees, _extract_gps, check_authenticity, read_photo_meta

NOW = datetime(2026, 10, 10, 12, 0, 0)


def test_convert_degrees_minutes_seconds():
    # 28 deg 37 min 30 sec -> 28 + 37/60 + 30/3600 = 28.625
    assert abs(_convert_to_degrees((28, 37, 30)) - 28.625) < 1e-6


def test_extract_gps_applies_hemisphere_sign():
    tagged_gps = {1: "N", 2: (28, 37, 30), 3: "E", 4: (77, 12, 36)}
    lat, lon = _extract_gps({"GPSInfo": tagged_gps})
    assert abs(lat - 28.625) < 1e-6
    assert abs(lon - 77.21) < 1e-6

    tagged_gps_sw = {1: "S", 2: (28, 37, 30), 3: "W", 4: (77, 12, 36)}
    lat2, lon2 = _extract_gps({"GPSInfo": tagged_gps_sw})
    assert lat2 < 0 and lon2 < 0


def test_real_image_with_no_exif_reads_cleanly():
    img = Image.new("RGB", (40, 30), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    meta = read_photo_meta(buf.getvalue())
    assert meta.format == "jpeg"
    assert meta.width == 40 and meta.height == 30
    assert meta.exif_gps is None
    assert meta.exif_timestamp is None


def test_authenticity_no_metadata_means_no_flags():
    meta = PhotoMeta(format="jpeg", width=100, height=100, exif_gps=None, exif_timestamp=None)
    result = check_authenticity(meta, 28.6, 77.2, NOW)
    assert result["flags"] == []
    assert result["has_exif_gps"] is False


def test_authenticity_flags_gps_mismatch():
    # Claimed location is R.K. Puram; EXIF GPS says ~Noida, >10km away.
    meta = PhotoMeta(format="jpeg", width=100, height=100, exif_gps=(28.5355, 77.3910), exif_timestamp=None)
    result = check_authenticity(meta, 28.5650, 77.1750, NOW)
    assert len(result["flags"]) == 1
    assert "GPS" in result["flags"][0]


def test_authenticity_flags_stale_photo():
    meta = PhotoMeta(format="jpeg", width=100, height=100, exif_gps=None, exif_timestamp=NOW - timedelta(days=5))
    result = check_authenticity(meta, 28.6, 77.2, NOW)
    assert any("day" in f for f in result["flags"])


def test_authenticity_passes_fresh_matching_photo():
    meta = PhotoMeta(format="jpeg", width=100, height=100, exif_gps=(28.565, 77.175), exif_timestamp=NOW - timedelta(minutes=10))
    result = check_authenticity(meta, 28.5650, 77.1750, NOW)
    assert result["flags"] == []
