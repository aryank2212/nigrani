"""Photo storage, backed by S3 when configured, with a local-disk fallback
-- same graceful-degradation pattern as the DynamoDB layers. Point
S3_BUCKET (+ the usual AWS credentials) at a real bucket and the exact
same code uploads there; without it, photos land under app/data/photos/
and are served back by the API from disk.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Optional

LOCAL_PHOTO_DIR = Path(__file__).resolve().parent.parent / "data" / "photos"

_s3_client = None
_s3_checked = False


def _get_s3_client():
    global _s3_client, _s3_checked
    if _s3_checked:
        return _s3_client
    _s3_checked = True
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        return None
    try:
        import boto3

        kwargs = {}
        endpoint = os.environ.get("AWS_ENDPOINT_URL")
        if endpoint:
            kwargs["endpoint_url"] = endpoint
            kwargs["aws_access_key_id"] = os.environ.get("AWS_ACCESS_KEY_ID", "test")
            kwargs["aws_secret_access_key"] = os.environ.get("AWS_SECRET_ACCESS_KEY", "test")
        client = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"), **kwargs)
        client.head_bucket(Bucket=bucket)  # raises if the bucket doesn't exist / isn't reachable
        _s3_client = client
        return client
    except Exception:
        _s3_client = None
        return None


def save_photo(image_bytes: bytes, content_type: str = "image/jpeg") -> str:
    """Returns an opaque key: an S3 key if S3 is configured, else a local
    filename. Pass this key to load_photo() / photo_url() later."""
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(content_type, "jpg")
    key = f"{uuid.uuid4()}.{ext}"

    client = _get_s3_client()
    if client is not None:
        try:
            client.put_object(
                Bucket=os.environ["S3_BUCKET"], Key=key, Body=image_bytes, ContentType=content_type
            )
            return key
        except Exception:
            pass

    LOCAL_PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    (LOCAL_PHOTO_DIR / key).write_bytes(image_bytes)
    return key


def load_photo(key: str) -> Optional[bytes]:
    client = _get_s3_client()
    if client is not None:
        try:
            resp = client.get_object(Bucket=os.environ["S3_BUCKET"], Key=key)
            return resp["Body"].read()
        except Exception:
            pass

    path = LOCAL_PHOTO_DIR / key
    if path.exists():
        return path.read_bytes()
    return None


def is_using_s3() -> bool:
    return _get_s3_client() is not None
