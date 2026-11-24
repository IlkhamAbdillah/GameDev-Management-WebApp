"""S3 access for asset files. Pre-signed upload/download is added in Phase 4."""
import boto3


class AssetStorage:
    def __init__(self, client, bucket):
        self._client = client
        self._bucket = bucket

    @classmethod
    def from_bucket_name(cls, bucket):
        return cls(boto3.client("s3"), bucket)

    def ping(self):
        """Connectivity/permission check: raises if the bucket is unreachable."""
        self._client.head_bucket(Bucket=self._bucket)
