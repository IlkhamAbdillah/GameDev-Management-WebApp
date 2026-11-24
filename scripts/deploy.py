#!/usr/bin/env python3
"""Idempotent deploy: DynamoDB tables, private S3 bucket, Asset + Task Lambdas with Function URLs.

Usage:  AWS_SHARED_CREDENTIALS_FILE=.aws/credentials AWS_CONFIG_FILE=.aws/config \
        .venv/bin/python scripts/deploy.py
        AWS_PROFILE=awsstudent ... scripts/deploy.py --tables-only   # only if the default role cannot CreateTable

Requires Learner Lab session credentials (role voclabs): LabRole is passed to Lambda.
"""
import io
import json
import sys
import time
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
ROOT = Path(__file__).resolve().parents[1]
TABLES = {"GameVaultAssets": "assetId", "GameVaultFolders": "folderId", "GameVaultTasks": "taskId"}
ROLE_NAME = "LabRole"  # Learner Lab: IAM role creation is not available
OUTPUT = ROOT / ".aws" / "outputs.json"

session = boto3.Session(region_name=REGION)
account = session.client("sts").get_caller_identity()["Account"]
BUCKET = f"gamevault-assets-{account}"
FUNCTIONS = {
    "asset": {
        "name": "GameVaultAssetHandler",
        "dir": ROOT / "backend" / "asset-handler",
        "env": {"ASSETS_TABLE": "GameVaultAssets", "FOLDERS_TABLE": "GameVaultFolders", "ASSET_BUCKET": BUCKET},
    },
    "task": {
        "name": "GameVaultTaskHandler",
        "dir": ROOT / "backend" / "task-handler",
        "env": {"TASKS_TABLE": "GameVaultTasks"},
    },
}
ddb, s3, lam, iam = (session.client(n) for n in ("dynamodb", "s3", "lambda", "iam"))


def ensure_tables():
    existing = set(ddb.list_tables()["TableNames"])
    for table, key in TABLES.items():
        if table in existing:
            print(f"table {table} exists")
            continue
        try:
            ddb.create_table(
                TableName=table,
                KeySchema=[{"AttributeName": key, "KeyType": "HASH"}],
                AttributeDefinitions=[{"AttributeName": key, "AttributeType": "S"}],
                BillingMode="PAY_PER_REQUEST",
            )
        except ClientError as err:
            if err.response["Error"]["Code"] != "AccessDeniedException":
                raise
            print(f"WARNING: not allowed to create {table} with these credentials. Create it in the "
                  f"console (partition key {key}, String, on-demand) and rerun.")
            continue
        ddb.get_waiter("table_exists").wait(TableName=table)
        print(f"created table {table}")


def ensure_bucket():
    try:
        s3.head_bucket(Bucket=BUCKET)
        print(f"bucket {BUCKET} exists")
    except ClientError:
        s3.create_bucket(Bucket=BUCKET)  # us-east-1 needs no LocationConstraint
        print(f"created bucket {BUCKET}")
    s3.put_public_access_block(
        Bucket=BUCKET,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
    s3.put_bucket_encryption(
        Bucket=BUCKET,
        ServerSideEncryptionConfiguration={
            "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
        },
    )
    # Browser uploads/downloads through pre-signed URLs (Phase 4). Tighten origins on deploy.
    s3.put_bucket_cors(
        Bucket=BUCKET,
        CORSConfiguration={
            "CORSRules": [
                {
                    "AllowedMethods": ["GET", "PUT"],
                    "AllowedOrigins": ["*"],
                    "AllowedHeaders": ["*"],
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3000,
                }
            ]
        },
    )


def build_zip(handler_dir):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(handler_dir.glob("*.py")):
            archive.write(path, path.name)
    return buffer.getvalue()


def ensure_function(spec):
    name = spec["name"]
    role_arn = iam.get_role(RoleName=ROLE_NAME)["Role"]["Arn"]
    code = build_zip(spec["dir"])
    env = {"Variables": spec["env"]}
    try:
        lam.get_function(FunctionName=name)
        lam.update_function_code(FunctionName=name, ZipFile=code)
        lam.get_waiter("function_updated").wait(FunctionName=name)
        lam.update_function_configuration(FunctionName=name, Environment=env, Timeout=15)
        lam.get_waiter("function_updated").wait(FunctionName=name)
        print(f"updated function {name}")
    except lam.exceptions.ResourceNotFoundException:
        lam.create_function(
            FunctionName=name,
            Runtime="python3.12",
            Role=role_arn,
            Handler="handler.lambda_handler",
            Code={"ZipFile": code},
            Environment=env,
            Timeout=15,
            MemorySize=256,
        )
        lam.get_waiter("function_active_v2").wait(FunctionName=name)
        print(f"created function {name}")


def ensure_function_url(name):
    """Public Lambda Function URL (payload format 2.0). Used because apigateway:POST is denied."""
    cors = {
        "AllowOrigins": ["*"],
        "AllowMethods": ["GET", "POST", "PUT", "DELETE"],
        "AllowHeaders": ["content-type"],
        "MaxAge": 3600,
    }
    try:
        url = lam.create_function_url_config(FunctionName=name, AuthType="NONE", Cors=cors)["FunctionUrl"]
    except lam.exceptions.ResourceConflictException:
        url = lam.update_function_url_config(FunctionName=name, AuthType="NONE", Cors=cors)["FunctionUrl"]
    statements = [
        dict(StatementId="FunctionURLAllowPublicAccess", Action="lambda:InvokeFunctionUrl",
             FunctionUrlAuthType="NONE"),
        dict(StatementId="FunctionURLAllowPublicInvoke", Action="lambda:InvokeFunction",
             InvokedViaFunctionUrl=True),
    ]
    for stmt in statements:
        try:
            lam.add_permission(FunctionName=name, Principal="*", **stmt)
        except lam.exceptions.ResourceConflictException:
            pass
    print(f"function url ({name}): {url}")
    return url.rstrip("/")


if __name__ == "__main__":
    print(f"account {account} region {REGION}")
    ensure_tables()
    if "--tables-only" in sys.argv:  # for a profile that may create tables but cannot pass roles (awsstudent)
        sys.exit(0)
    ensure_bucket()
    urls = {}
    for key, spec in FUNCTIONS.items():
        ensure_function(spec)
    time.sleep(2)
    for key, spec in FUNCTIONS.items():
        urls[f"{key}ApiUrl"] = ensure_function_url(spec["name"])
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps({**urls, "bucket": BUCKET, "tables": list(TABLES)}, indent=2))
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
