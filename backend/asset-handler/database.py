"""DynamoDB access for GameVaultAssets. No HTTP or validation logic here."""
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError


class AssetNotFound(Exception):
    pass


class FolderNotFound(Exception):
    pass


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class AssetRepository:
    def __init__(self, table):
        self._table = table

    @classmethod
    def from_table_name(cls, table_name):
        return cls(boto3.resource("dynamodb").Table(table_name))

    def create(self, fields):
        now = utc_now()
        item = {"assetId": str(uuid.uuid4()), **fields, "createdAt": now, "updatedAt": now}
        self._table.put_item(Item=item, ConditionExpression="attribute_not_exists(assetId)")
        return item

    def get(self, asset_id):
        item = self._table.get_item(Key={"assetId": asset_id}).get("Item")
        if not item:
            raise AssetNotFound(asset_id)
        return item

    def list(self, search=None, asset_type=None, status=None, folder_id=None):
        items, kwargs = [], {}
        while True:
            page = self._table.scan(**kwargs)
            items.extend(page.get("Items", []))
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

        if search:
            needle = search.lower()
            items = [i for i in items if needle in i.get("assetName", "").lower()]
        if asset_type:
            items = [i for i in items if i.get("assetType") == asset_type]
        if status:
            items = [i for i in items if i.get("status") == status]
        if folder_id is not None:  # "" means the root; assets created before folders have no attribute
            items = [i for i in items if i.get("folderId", "") == folder_id]
        return sorted(items, key=lambda i: i.get("createdAt", ""), reverse=True)

    def update(self, asset_id, fields):
        fields = {**fields, "updatedAt": utc_now()}
        names = {f"#{k}": k for k in fields}
        values = {f":{k}": v for k, v in fields.items()}
        expression = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
        try:
            result = self._table.update_item(
                Key={"assetId": asset_id},
                UpdateExpression=expression,
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
                ConditionExpression="attribute_exists(assetId)",
                ReturnValues="ALL_NEW",
            )
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise AssetNotFound(asset_id) from err
            raise
        return result["Attributes"]

    def delete(self, asset_id):
        try:
            self._table.delete_item(
                Key={"assetId": asset_id}, ConditionExpression="attribute_exists(assetId)"
            )
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise AssetNotFound(asset_id) from err
            raise

    def ping(self):
        """Connectivity check: raises if the table is unreachable."""
        self._table.load()


class FolderRepository:
    """DynamoDB access for GameVaultFolders (flat records; the tree is built from parentId)."""

    def __init__(self, table):
        self._table = table

    @classmethod
    def from_table_name(cls, table_name):
        return cls(boto3.resource("dynamodb").Table(table_name))

    def create(self, fields):
        now = utc_now()
        item = {"folderId": str(uuid.uuid4()), **fields, "createdAt": now, "updatedAt": now}
        self._table.put_item(Item=item, ConditionExpression="attribute_not_exists(folderId)")
        return item

    def get(self, folder_id):
        item = self._table.get_item(Key={"folderId": folder_id}).get("Item")
        if not item:
            raise FolderNotFound(folder_id)
        return item

    def exists(self, folder_id):
        return bool(self._table.get_item(Key={"folderId": folder_id}).get("Item"))

    def list(self):
        items, kwargs = [], {}
        while True:
            page = self._table.scan(**kwargs)
            items.extend(page.get("Items", []))
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        return sorted(items, key=lambda i: i.get("name", "").casefold())

    def update(self, folder_id, fields):
        fields = {**fields, "updatedAt": utc_now()}
        names = {f"#{k}": k for k in fields}
        values = {f":{k}": v for k, v in fields.items()}
        expression = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
        try:
            result = self._table.update_item(
                Key={"folderId": folder_id},
                UpdateExpression=expression,
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
                ConditionExpression="attribute_exists(folderId)",
                ReturnValues="ALL_NEW",
            )
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise FolderNotFound(folder_id) from err
            raise
        return result["Attributes"]

    def delete(self, folder_id):
        try:
            self._table.delete_item(
                Key={"folderId": folder_id}, ConditionExpression="attribute_exists(folderId)"
            )
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise FolderNotFound(folder_id) from err
            raise

    def ping(self):
        self._table.load()
