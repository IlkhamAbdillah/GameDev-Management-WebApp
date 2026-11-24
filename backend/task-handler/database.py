"""DynamoDB access for GameVaultTasks. No HTTP or validation logic here."""
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError


class TaskNotFound(Exception):
    pass


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class TaskRepository:
    def __init__(self, table):
        self._table = table

    @classmethod
    def from_table_name(cls, table_name):
        return cls(boto3.resource("dynamodb").Table(table_name))

    def create(self, fields):
        now = utc_now()
        item = {"taskId": str(uuid.uuid4()), **fields, "createdAt": now, "updatedAt": now}
        self._table.put_item(Item=item, ConditionExpression="attribute_not_exists(taskId)")
        return item

    def get(self, task_id):
        item = self._table.get_item(Key={"taskId": task_id}).get("Item")
        if not item:
            raise TaskNotFound(task_id)
        return item

    def list(self, search=None, status=None, priority=None, category=None, assignee=None):
        items, kwargs = [], {}
        while True:
            page = self._table.scan(**kwargs)
            items.extend(page.get("Items", []))
            if "LastEvaluatedKey" not in page:
                break
            kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

        if search:
            needle = search.lower()
            items = [i for i in items if needle in i.get("title", "").lower()]
        for field, wanted in (
            ("status", status), ("priority", priority), ("category", category), ("assignee", assignee),
        ):
            if wanted:
                items = [i for i in items if i.get(field) == wanted]
        # Tasks with a due date first (earliest first), then undated by creation time.
        return sorted(items, key=lambda i: (not i.get("dueDate"), i.get("dueDate", ""), i.get("createdAt", "")))

    def update(self, task_id, fields):
        fields = {**fields, "updatedAt": utc_now()}
        names = {f"#{k}": k for k in fields}
        values = {f":{k}": v for k, v in fields.items()}
        expression = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
        try:
            result = self._table.update_item(
                Key={"taskId": task_id},
                UpdateExpression=expression,
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
                ConditionExpression="attribute_exists(taskId)",
                ReturnValues="ALL_NEW",
            )
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise TaskNotFound(task_id) from err
            raise
        return result["Attributes"]

    def delete(self, task_id):
        try:
            self._table.delete_item(
                Key={"taskId": task_id}, ConditionExpression="attribute_exists(taskId)"
            )
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise TaskNotFound(task_id) from err
            raise

    def ping(self):
        """Connectivity check: raises if the table is unreachable."""
        self._table.load()
