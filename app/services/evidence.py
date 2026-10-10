"""Deterministic photo checks that don't need a model: format detection and
EXIF metadata consistency, so an old or downloaded photo can be flagged
independently of (and before) the vision model's own judgment.

Most phone browsers strip EXIF on upload through a plain <input type=file>,
so a missing EXIF block is common and NOT itself suspicious — it just
means this check can't add a signal and the vision model's opinion carries
full weight. A present-but-mismatched EXIF block is a much stronger signal.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from PIL import ExifTags, Image

from .jurisdiction import haversine_km

GPS_MISMATCH_THRESHOLD_KM = 2.0
MAX_PHOTO_AGE = timedelta(hours=72)


@dataclass
class PhotoMeta:
    format: str  # "jpeg" | "png" | "webp" | "gif"
    width: int
    height: int
    exif_gps: Optional[tuple[float, float]]
    exif_timestamp: Optional[datetime]


def _convert_to_degrees(value) -> float:
    d, m, s = value
    return float(d) + float(m) / 60 + float(s) / 3600


def _extract_gps(exif: dict) -> Optional[tuple[float, float]]:
    gps_info = exif.get("GPSInfo")
    if not gps_info:
        return None
    try:
        lat = _convert_to_degrees(gps_info[2])
        if gps_info[1] == "S":
            lat = -lat
        lon = _convert_to_degrees(gps_info[4])
        if gps_info[3] == "W":
            lon = -lon
        return (lat, lon)
    except (KeyError, IndexError, TypeError, ZeroDivisionError):
        return None


def read_photo_meta(image_bytes: bytes) -> PhotoMeta:
    img = Image.open(io.BytesIO(image_bytes))
    fmt = (img.format or "jpeg").lower()
    if fmt == "jpg":
        fmt = "jpeg"

    exif_gps = None
    exif_timestamp = None
    raw_exif = img.getexif()
    if raw_exif:
        tagged = {ExifTags.TAGS.get(k, k): v for k, v in raw_exif.items()}
        gps_ifd = raw_exif.get_ifd(ExifTags.IFD.GPSInfo) if hasattr(raw_exif, "get_ifd") else None
        if gps_ifd:
            tagged_gps = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps_ifd.items()}
            exif_gps = _extract_gps({"GPSInfo": tagged_gps})
        raw_dt = tagged.get("DateTimeOriginal") or tagged.get("DateTime")
        if raw_dt:
            try:
                exif_timestamp = datetime.strptime(raw_dt, "%Y:%m:%d %H:%M:%S")
            except (ValueError, TypeError):
                exif_timestamp = None

    return PhotoMeta(
        format=fmt if fmt in ("jpeg", "png", "webp", "gif") else "jpeg",
        width=img.width,
        height=img.height,
        exif_gps=exif_gps,
        exif_timestamp=exif_timestamp,
    )


def check_authenticity(meta: PhotoMeta, claimed_lat: float, claimed_lon: float, claimed_time: datetime) -> dict:
    """Independent, non-AI consistency check. Returns flags; an empty list
    means 'no metadata-based concern' -- not the same as 'verified genuine'."""
    flags = []

    if meta.exif_gps is not None:
        dist_km = haversine_km(claimed_lat, claimed_lon, meta.exif_gps[0], meta.exif_gps[1])
        if dist_km > GPS_MISMATCH_THRESHOLD_KM:
            flags.append(
                f"Photo's embedded GPS is {dist_km:.1f}km from the claimed location — possible reused/old photo."
            )

    if meta.exif_timestamp is not None:
        age = claimed_time - meta.exif_timestamp
        if age > MAX_PHOTO_AGE:
            flags.append(
                f"Photo was taken {age.days} day(s) before this report — may not reflect current conditions."
            )
        elif age < -timedelta(minutes=5):
            flags.append("Photo's embedded timestamp is in the future relative to the report — check device clock.")

    return {
        "has_exif_gps": meta.exif_gps is not None,
        "has_exif_timestamp": meta.exif_timestamp is not None,
        "flags": flags,
    }
