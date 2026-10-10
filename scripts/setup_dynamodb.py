"""One-time setup: create both DynamoDB tables against LocalStack (or real AWS).

Usage:
    docker compose up -d
    AWS_ENDPOINT_URL=http://localhost:4566 python scripts/setup_dynamodb.py
"""
import os

import boto3

endpoint = os.environ.get("AWS_ENDPOINT_URL", "http://localhost:4566")
readings_table = os.environ.get("DYNAMODB_TABLE", "saferecess-readings")
incidents_table = os.environ.get("INCIDENTS_TABLE", "nigrani-incidents")

client = boto3.client(
    "dynamodb",
    endpoint_url=endpoint,
    region_name=os.environ.get("AWS_REGION", "us-east-1"),
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "test"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "test"),
)

existing = client.list_tables().get("TableNames", [])

if readings_table in existing:
    print(f"Table {readings_table!r} already exists at {endpoint}.")
else:
    client.create_table(
        TableName=readings_table,
        KeySchema=[
            {"AttributeName": "school_id", "KeyType": "HASH"},
            {"AttributeName": "timestamp", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "school_id", "AttributeType": "S"},
            {"AttributeName": "timestamp", "AttributeType": "N"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    print(f"Created table {readings_table!r} at {endpoint}.")

if incidents_table in existing:
    print(f"Table {incidents_table!r} already exists at {endpoint}.")
else:
    client.create_table(
        TableName=incidents_table,
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )
    print(f"Created table {incidents_table!r} at {endpoint}.")
