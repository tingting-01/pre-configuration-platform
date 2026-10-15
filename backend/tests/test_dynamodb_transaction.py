import os
import sys
import types
import unittest
from unittest.mock import Mock


try:
    from botocore.exceptions import ClientError
except ModuleNotFoundError:
    class ClientError(Exception):
        def __init__(self, response, operation_name):
            super().__init__(response["Error"]["Message"])
            self.response = response
            self.operation_name = operation_name

    class TypeSerializer:
        def serialize(self, value):
            if isinstance(value, str):
                return {"S": value}
            return {"value": value}

    class Attr:
        def __init__(self, *_args, **_kwargs):
            pass

        def is_in(self, values):
            return values

    fake_resource = Mock()
    fake_resource.Table.side_effect = lambda _name: Mock()
    fake_transaction_client = Mock()
    boto3_module = types.ModuleType("boto3")
    boto3_module.resource = lambda *_args, **_kwargs: fake_resource
    boto3_module.client = lambda *_args, **_kwargs: fake_transaction_client
    botocore_module = types.ModuleType("botocore")
    exceptions_module = types.ModuleType("botocore.exceptions")
    exceptions_module.ClientError = ClientError
    dynamodb_module = types.ModuleType("boto3.dynamodb")
    conditions_module = types.ModuleType("boto3.dynamodb.conditions")
    conditions_module.Attr = Attr
    types_module = types.ModuleType("boto3.dynamodb.types")
    types_module.TypeSerializer = TypeSerializer
    dotenv_module = types.ModuleType("dotenv")
    dotenv_module.load_dotenv = lambda *_args, **_kwargs: None
    sys.modules.update({
        "boto3": boto3_module,
        "botocore": botocore_module,
        "botocore.exceptions": exceptions_module,
        "boto3.dynamodb": dynamodb_module,
        "boto3.dynamodb.conditions": conditions_module,
        "boto3.dynamodb.types": types_module,
        "dotenv": dotenv_module,
    })


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dynamodb_client import DynamoDBClient  # noqa: E402


class DynamoDBTransactionTests(unittest.TestCase):
    def _client(self, transaction_side_effect=None):
        low_level_client = Mock()
        low_level_client.transact_write_items.side_effect = transaction_side_effect
        resource = Mock()
        resource.meta.client = low_level_client
        client = DynamoDBClient.__new__(DynamoDBClient)
        client.dynamodb = resource
        client.transaction_client = low_level_client
        client.tables = {"requests": Mock()}
        return client, low_level_client

    def test_update_and_activity_are_sent_in_one_transaction(self):
        client, low_level_client = self._client()

        result = client.update_request_with_activity(
            "REQ1",
            {"config_data": {"general": {"pid": "B"}}},
            {
                "request_id": "REQ1",
                "user_id": 7,
                "activity_type": "configuration_changed",
                "description": "Configuration updated",
                "created_at": "2026-10-14T10:00:00",
                "actor_name": "Irving",
                "actor_email": "irving@example.com",
                "changes": [{"field": "general.pid", "from": "A", "to": "B"}],
            },
        )

        self.assertTrue(result)
        transaction = low_level_client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(transaction), 2)
        self.assertIn("Update", transaction[0])
        self.assertIn("Put", transaction[1])
        self.assertEqual(
            transaction[0]["Update"]["Key"],
            {"request_id": {"S": "REQ1"}},
        )
        client.tables["requests"].update_item.assert_not_called()

    def test_transaction_failure_does_not_fall_back_to_partial_update(self):
        error = ClientError(
            {
                "Error": {
                    "Code": "TransactionCanceledException",
                    "Message": "cancelled",
                },
                "CancellationReasons": [
                    {"Code": "None", "Message": "None"},
                    {
                        "Code": "ValidationError",
                        "Message": "Invalid activity item",
                        "Item": {"password": {"S": "must-not-be-logged"}},
                    },
                ],
                "ResponseMetadata": {"RequestId": "aws-request-123"},
            },
            "TransactWriteItems",
        )
        client, low_level_client = self._client(error)

        with self.assertLogs("dynamodb_client", level="ERROR") as captured:
            result = client.update_request_with_activity(
                "REQ1",
                {"config_data": {"value": 2}},
                {
                    "request_id": "REQ1",
                    "user_id": 7,
                    "activity_type": "configuration_changed",
                    "description": "Configuration updated",
                    "created_at": "2026-10-14T10:00:00",
                    "changes": [{"field": "value", "from": 1, "to": 2}],
                },
            )

        self.assertFalse(result)
        low_level_client.transact_write_items.assert_called_once()
        client.tables["requests"].update_item.assert_not_called()
        log_output = "\n".join(captured.output)
        self.assertIn("TransactionCanceledException", log_output)
        self.assertIn("ValidationError", log_output)
        self.assertIn("aws-request-123", log_output)
        self.assertIn("Update:preconfig-requests,Put:preconfig-activities", log_output)
        self.assertNotIn("must-not-be-logged", log_output)


if __name__ == "__main__":
    unittest.main()
