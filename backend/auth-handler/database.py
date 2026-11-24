"""DynamoDB access for GameVaultUsers. No HTTP or validation logic here."""
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError


class UserNotFound(Exception):
    pass


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class UserRepository:
    def __init__(self, table):
        self._table = table

    @classmethod
    def from_table_name(cls, table_name):
        return cls(boto3.resource("dynamodb").Table(table_name))

    def create(self, fields):
        now = utc_now()
        item = {"userId": str(uuid.uuid4()), **fields, "createdAt": now, "updatedAt": now}
        self._table.put_item(Item=item, ConditionExpression="attribute_not_exists(userId)")
        return item

    def get(self, user_id):
        item = self._table.get_item(Key={"userId": user_id}).get("Item")
        if not item:
            raise UserNotFound(user_id)
        return item

    def list(self):
        items, kwargs = [], {}
        while True:
            page = self._table.scan(**kwargs)
            items.extend(page.get("Items", []))
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        return sorted(items, key=lambda i: (i.get("name", "").lower(), i.get("createdAt", "")))

    def get_by_email(self, email):
        """Emails are stored lower-cased; returns None when there is no such user."""
        return next((u for u in self.list() if u.get("email") == email), None)

    def update(self, user_id, fields):
        fields = {**fields, "updatedAt": utc_now()}
        names = {f"#{k}": k for k in fields}
        values = {f":{k}": v for k, v in fields.items()}
        expression = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
        try:
            result = self._table.update_item(
                Key={"userId": user_id},
                UpdateExpression=expression,
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
                ConditionExpression="attribute_exists(userId)",
                ReturnValues="ALL_NEW",
            )
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise UserNotFound(user_id) from err
            raise
        return result["Attributes"]

    def delete(self, user_id):
        try:
            self._table.delete_item(
                Key={"userId": user_id}, ConditionExpression="attribute_exists(userId)"
            )
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise UserNotFound(user_id) from err
            raise

    def ping(self):
        """Connectivity check: raises if the table is unreachable."""
        self._table.load()
