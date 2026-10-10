"""One-time setup: create the DynamoDB table against LocalStack (or real AWS).

Usage:
    docker compose up -d
    AWS_ENDPOINT_URL=http://localhost:4566 python scripts/setup_dynamodb.py
"""
import os

import boto3

endpoint = os.environ.get("AWS_ENDPOINT_URL", "http://localhost:4566")
table_name = os.environ.get("DYNAMODB_TABLE", "saferecess-readings")

client = boto3.client(
    "dynamodb",
    endpoint_url=endpoint,
    region_name=os.environ.get("AWS_REGION", "us-east-1"),
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "test"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "test"),
)

existing = client.list_tables().get("TableNames", [])
if table_name in existing:
    print(f"Table {table_name!r} already exists at {endpoint}.")
else:
    client.create_table(
        TableName=table_name,
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
    print(f"Created table {table_name!r} at {endpoint}.")
