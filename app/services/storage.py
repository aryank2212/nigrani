"""Optional reading history, backed by DynamoDB (via LocalStack) when available.

This is a genuine boto3/DynamoDB integration: point AWS_ENDPOINT_URL at a real
AWS account instead of LocalStack and the exact same code writes to real
DynamoDB. If no endpoint is configured or reachable, it falls back to a local
JSON file so the app never breaks because infrastructure isn't running.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "saferecess-readings")
_FALLBACK_PATH = Path(__file__).resolve().parent.parent / "data" / "history_fallback.json"

_dynamo_table = None
_dynamo_checked = False


def _get_table():
    global _dynamo_table, _dynamo_checked
    if _dynamo_checked:
        return _dynamo_table
    _dynamo_checked = True
    endpoint = os.environ.get("AWS_ENDPOINT_URL")
    if not endpoint:
        return None
    try:
        import boto3

        resource = boto3.resource(
            "dynamodb",
            endpoint_url=endpoint,
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "test"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "test"),
        )
        table = resource.Table(TABLE_NAME)
        table.load()  # raises if the table doesn't exist / endpoint is unreachable
        _dynamo_table = table
        return table
    except Exception:
        _dynamo_table = None
        return None


def _append_fallback_file(item: dict) -> None:
    history = []
    if _FALLBACK_PATH.exists():
        try:
            history = json.loads(_FALLBACK_PATH.read_text())
        except json.JSONDecodeError:
            history = []
    history.append(item)
    _FALLBACK_PATH.write_text(json.dumps(history[-500:], indent=2))


def log_reading(school_id: str, aqi: int, risk_level: str, mode: str) -> None:
    item = {
        "school_id": school_id,
        "timestamp": int(time.time()),
        "aqi": aqi,
        "risk_level": risk_level,
        "mode": mode,
    }
    table = _get_table()
    if table is not None:
        try:
            table.put_item(Item=item)
            return
        except Exception:
            pass
    _append_fallback_file(item)


def get_history(school_id: str, limit: int = 20) -> list[dict[str, Any]]:
    table = _get_table()
    if table is not None:
        try:
            from boto3.dynamodb.conditions import Key

            resp = table.query(
                KeyConditionExpression=Key("school_id").eq(school_id),
                ScanIndexForward=False,
                Limit=limit,
            )
            return resp.get("Items", [])
        except Exception:
            pass
    if _FALLBACK_PATH.exists():
        try:
            history = json.loads(_FALLBACK_PATH.read_text())
        except json.JSONDecodeError:
            history = []
        matching = [h for h in history if h["school_id"] == school_id]
        return matching[-limit:][::-1]
    return []
