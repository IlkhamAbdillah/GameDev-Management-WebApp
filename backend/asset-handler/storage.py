"""S3 access for asset files: pre-signed URLs and object management."""
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from filetypes import asset_prefix

UPLOAD_URL_EXPIRY_SECONDS = 300
DOWNLOAD_URL_EXPIRY_SECONDS = 900


class AssetStorage:
    def __init__(self, client, bucket):
        self._client = client
        self._bucket = bucket

    @classmethod
    def from_bucket_name(cls, bucket):
        return cls(boto3.client("s3", config=Config(signature_version="s3v4")), bucket)

    def ping(self):
        """Connectivity/permission check: raises if the bucket is unreachable."""
        self._client.head_bucket(Bucket=self._bucket)

    def create_upload(self, asset_id, file_name, content_type, file_size):
        """Pre-signed PUT URL. Content-Type and size are signed, so S3 rejects mismatching uploads."""
        key = f"{asset_prefix(asset_id)}{uuid.uuid4().hex}-{file_name}"
        url = self._client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self._bucket,
                "Key": key,
                "ContentType": content_type,
                "ContentLength": file_size,
            },
            ExpiresIn=UPLOAD_URL_EXPIRY_SECONDS,
        )
        return {
            "uploadUrl": url,
            "method": "PUT",
            "headers": {"Content-Type": content_type},
            "s3Key": key,
            "expiresIn": UPLOAD_URL_EXPIRY_SECONDS,
        }

    def download_url(self, key, file_name):
        """Pre-signed GET that forces a download with the original filename."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self._bucket,
                "Key": key,
                "ResponseContentDisposition": f'attachment; filename="{file_name}"',
            },
            ExpiresIn=DOWNLOAD_URL_EXPIRY_SECONDS,
        )

    def preview_url(self, key):
        """Pre-signed GET for inline display (images/audio)."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=DOWNLOAD_URL_EXPIRY_SECONDS,
        )

    def object_exists(self, key):
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError as err:
            if err.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def delete_object(self, key):
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def delete_asset_files(self, asset_id):
        """Delete every object under this asset's own prefix (never anything else)."""
        prefix = asset_prefix(asset_id)
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
            if objects:
                self._client.delete_objects(Bucket=self._bucket, Delete={"Objects": objects})
