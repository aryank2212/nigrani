"""Incident storage, backed by DynamoDB (via LocalStack locally, or real AWS
unchanged) when available, with a local JSON-file fallback otherwise --
same graceful-degradation pattern as storage.py (kept separate rather than
shared, since the two tables have unrelated shapes and lifecycles).

DynamoDB's resource API rejects native Python floats (it requires Decimal
for all numeric types) -- every incident has several (lat, lon, confidence
scores, exposure_score), so this module converts on the way in and back out,
rather than every caller having to remember to.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

TABLE_NAME = os.environ.get("INCIDENTS_TABLE", "nigrani-incidents")
_FALLBACK_PATH = Path(__file__).resolve().parent.parent / "data" / "incidents_fallback.json"

_dynamo_table = None
_dynamo_checked = False


def _get_table():
    # Deliberately does not gate on AWS_ENDPOINT_URL being set: in production
    # credentials come from an IAM instance role (App Runner/Lambda/ECS) with
    # no endpoint override at all, and boto3's default credential chain
    # resolves that on its own. AWS_ENDPOINT_URL only matters for LocalStack,
    # where it also implies the dummy test/test credentials. Either way, any
    # failure (no table, no credentials, no network) falls through to the
    # local JSON file below -- table.load() fails fast, it doesn't hang.
    global _dynamo_table, _dynamo_checked
    if _dynamo_checked:
        return _dynamo_table
    _dynamo_checked = True
    try:
        import boto3

        kwargs = {"region_name": os.environ.get("AWS_REGION", "us-east-1")}
        endpoint = os.environ.get("AWS_ENDPOINT_URL")
        if endpoint:
            kwargs["endpoint_url"] = endpoint
            kwargs["aws_access_key_id"] = os.environ.get("AWS_ACCESS_KEY_ID", "test")
            kwargs["aws_secret_access_key"] = os.environ.get("AWS_SECRET_ACCESS_KEY", "test")
        resource = boto3.resource("dynamodb", **kwargs)
        table = resource.Table(TABLE_NAME)
        table.load()
        _dynamo_table = table
        return table
    except Exception:
        _dynamo_table = None
        return None


def _to_dynamo(obj: Any) -> Any:
    """Recursively convert floats to Decimal (DynamoDB requirement) and drop
    empty strings (DynamoDB historically rejects them in some SDK paths)."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_dynamo(v) for k, v in obj.items() if v != ""}
    if isinstance(obj, list):
        return [_to_dynamo(v) for v in obj]
    return obj


def _from_dynamo(obj: Any) -> Any:
    """Recursively convert Decimal back to int/float for normal JSON use."""
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if isinstance(obj, dict):
        return {k: _from_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_dynamo(v) for v in obj]
    return obj


def _load_fallback() -> list[dict]:
    if _FALLBACK_PATH.exists():
        try:
            return json.loads(_FALLBACK_PATH.read_text())
        except json.JSONDecodeError:
            return []
    return []


def _save_fallback(items: list[dict]) -> None:
    _FALLBACK_PATH.write_text(json.dumps(items, indent=2, default=str))


def create_incident(item: dict) -> dict:
    item = dict(item)
    item.setdefault("id", str(uuid.uuid4()))
    item.setdefault("created_at", time.time())
    item.setdefault("updated_at", item["created_at"])

    table = _get_table()
    if table is not None:
        try:
            table.put_item(Item=_to_dynamo(item))
            return item
        except Exception:
            pass
    items = _load_fallback()
    items.append(item)
    _save_fallback(items)
    return item


def update_incident(incident_id: str, updates: dict) -> Optional[dict]:
    updates = dict(updates)
    updates["updated_at"] = time.time()

    table = _get_table()
    if table is not None:
        try:
            existing = table.get_item(Key={"id": incident_id}).get("Item")
            if existing is None:
                return None
            merged = {**existing, **_to_dynamo(updates)}
            table.put_item(Item=merged)
            return _from_dynamo(merged)
        except Exception:
            pass

    items = _load_fallback()
    for i, item in enumerate(items):
        if item["id"] == incident_id:
            items[i] = {**item, **updates}
            _save_fallback(items)
            return items[i]
    return None


def get_incident(incident_id: str) -> Optional[dict]:
    table = _get_table()
    if table is not None:
        try:
            item = table.get_item(Key={"id": incident_id}).get("Item")
            return _from_dynamo(item) if item else None
        except Exception:
            pass
    for item in _load_fallback():
        if item["id"] == incident_id:
            return item
    return None


def list_incidents(status: Optional[str] = None) -> list[dict]:
    table = _get_table()
    if table is not None:
        try:
            items = []
            resp = table.scan()
            items.extend(resp.get("Items", []))
            while "LastEvaluatedKey" in resp:
                resp = table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
                items.extend(resp.get("Items", []))
            items = [_from_dynamo(i) for i in items]
        except Exception:
            items = _load_fallback()
    else:
        items = _load_fallback()

    if status:
        items = [i for i in items if i.get("status") == status]
    items.sort(key=lambda i: i.get("created_at", 0), reverse=True)
    return items
