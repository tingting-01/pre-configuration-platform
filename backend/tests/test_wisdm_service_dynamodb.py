import os
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from unittest.mock import Mock

from botocore.exceptions import ClientError


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dynamodb_client import DynamoDBClient, TABLES  # noqa: E402
from wisdm_service import (  # noqa: E402
    WisdmDuplicateSOError,
    WisdmVersionConflictError,
)


class AtomicCounterTable:
    def __init__(self):
        self._lock = threading.Lock()
        self.sequence = 0

    def update_item(self, **_kwargs):
        with self._lock:
            self.sequence += 1
            return {"Attributes": {"sequence": Decimal(self.sequence)}}


class UniqueSOTransactionClient:
    def __init__(self):
        self._lock = threading.Lock()
        self.so_keys = set()
        self.attempted_record_ids = []
        self.created_record_ids = []

    def transact_write_items(self, TransactItems):
        record_item = TransactItems[0]["Put"]["Item"]
        lock_item = TransactItems[1]["Put"]["Item"]
        record_id = record_item["record_id"]["S"]
        so_key = lock_item["pk"]["S"]
        with self._lock:
            self.attempted_record_ids.append(record_id)
            if so_key in self.so_keys:
                raise ClientError(
                    {
                        "Error": {
                            "Code": "TransactionCanceledException",
                            "Message": "duplicate SO",
                        },
                        "CancellationReasons": [
                            {"Code": "None"},
                            {"Code": "ConditionalCheckFailed"},
                        ],
                    },
                    "TransactWriteItems",
                )
            self.so_keys.add(so_key)
            self.created_record_ids.append(record_id)


class WisdmDynamoDBTests(unittest.TestCase):
    def _client(self, records_table=None, history_table=None, transaction_client=None):
        client = DynamoDBClient.__new__(DynamoDBClient)
        client.tables = {
            "wisdm_service_records": records_table or Mock(),
            "wisdm_service_history": history_table or Mock(),
        }
        client.transaction_client = transaction_client or Mock()
        return client

    def test_fixed_table_names_are_registered(self):
        self.assertEqual(
            TABLES["wisdm_service_records"],
            "preconfig-wisdm-service-records",
        )
        self.assertEqual(
            TABLES["wisdm_service_history"],
            "preconfig-wisdm-service-history",
        )

    def test_counter_is_unique_under_concurrency(self):
        table = AtomicCounterTable()
        client = self._client(records_table=table)
        with ThreadPoolExecutor(max_workers=8) as executor:
            record_ids = list(
                executor.map(
                    lambda _index: client.next_wisdm_service_record_id(),
                    range(40),
                )
            )
        self.assertEqual(len(set(record_ids)), 40)
        self.assertEqual(min(record_ids), "WDM0001")
        self.assertEqual(max(record_ids), "WDM0040")

    def test_duplicate_so_only_creates_once_and_counter_gaps_are_allowed(self):
        table = AtomicCounterTable()
        transaction_client = UniqueSOTransactionClient()
        client = self._client(table, transaction_client=transaction_client)
        record_data = {
            "so_number": " SO-1001 ",
            "associations": [{"requestId": "REQ1", "barcode": "bc1"}],
            "whitelist_required": True,
            "provisioning_required": False,
        }

        def create_once(_index):
            try:
                return client.create_wisdm_service_record(record_data)
            except WisdmDuplicateSOError:
                return None

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(create_once, range(12)))

        created = [item for item in results if item]
        self.assertEqual(len(created), 1)
        self.assertEqual(table.sequence, 12)
        self.assertEqual(len(set(transaction_client.attempted_record_ids)), 12)
        self.assertEqual(len(transaction_client.created_record_ids), 1)
        # 冲突已消耗编号但未创建记录，允许出现空洞。
        self.assertGreater(table.sequence, len(transaction_client.created_record_ids))

    def test_read_by_wdm_and_so_uses_record_and_lock_keys(self):
        table = Mock()
        table.get_item.side_effect = [
            {"Item": {"pk": "SO#SO-1", "record_id": "WDM0001"}},
            {"Item": {"pk": "RECORD#WDM0001", "record_id": "WDM0001"}},
        ]
        client = self._client(records_table=table)

        result = client.get_wisdm_service_record_by_so(" so-1 ")

        self.assertEqual(result["record_id"], "WDM0001")
        self.assertEqual(
            table.get_item.call_args_list[0].kwargs["Key"],
            {"pk": "SO#SO-1"},
        )
        self.assertEqual(
            table.get_item.call_args_list[1].kwargs["Key"],
            {"pk": "RECORD#WDM0001"},
        )

    def test_scan_returns_only_main_records_across_pages(self):
        table = Mock()
        table.scan.side_effect = [
            {
                "Items": [
                    {"pk": "RECORD#WDM0001", "record_id": "WDM0001"},
                    {"pk": "COUNTER#WISDM_SERVICE", "sequence": 2},
                ],
                "LastEvaluatedKey": {"pk": "RECORD#WDM0001"},
            },
            {
                "Items": [
                    {"pk": "SO#SO-1", "record_id": "WDM0001"},
                    {"pk": "RECORD#WDM0002", "record_id": "WDM0002"},
                ]
            },
        ]
        client = self._client(records_table=table)

        result = client.scan_wisdm_service_records()

        self.assertEqual(
            [item["record_id"] for item in result],
            ["WDM0001", "WDM0002"],
        )
        self.assertIn(
            "begins_with",
            table.scan.call_args_list[0].kwargs["FilterExpression"],
        )

    def test_version_conflict_raises_specific_error(self):
        table = Mock()
        table.update_item.side_effect = ClientError(
            {
                "Error": {
                    "Code": "ConditionalCheckFailedException",
                    "Message": "version mismatch",
                }
            },
            "UpdateItem",
        )
        client = self._client(records_table=table)

        with self.assertRaises(WisdmVersionConflictError):
            client.update_wisdm_service_record(
                "WDM0001",
                {"notes": "changed"},
                expected_version=2,
            )
        self.assertEqual(
            table.update_item.call_args.kwargs["ExpressionAttributeValues"][
                ":expected_version"
            ],
            2,
        )

    def test_history_is_queried_and_returned_newest_first(self):
        history_table = Mock()
        history_table.query.return_value = {
            "Items": [
                {"event_key": "2026-10-18T10:00:00Z#2"},
                {"event_key": "2026-10-19T10:00:00Z#3"},
                {"event_key": "2026-10-17T10:00:00Z#1"},
            ]
        }
        client = self._client(history_table=history_table)

        result = client.query_wisdm_service_history("WDM0001")

        self.assertEqual(
            [item["event_key"] for item in result],
            [
                "2026-10-19T10:00:00Z#3",
                "2026-10-18T10:00:00Z#2",
                "2026-10-17T10:00:00Z#1",
            ],
        )
        self.assertFalse(history_table.query.call_args.kwargs["ScanIndexForward"])

    def test_workflow_and_history_are_written_in_one_transaction(self):
        records_table = Mock()
        history_table = Mock()
        transaction_client = Mock()
        client = self._client(records_table, history_table, transaction_client)
        record = {
            "record_id": "WDM0001",
            "workflow": "CREATED",
            "version": 2,
        }
        history = {
            "event_key": "2026-10-19T10:00:00Z#1",
            "event_type": "workflow_changed",
        }

        updated = client.update_wisdm_workflow_with_history(
            record,
            "ALL_DONE",
            history,
            expected_version=2,
        )

        items = transaction_client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(items), 2)
        self.assertIn("Update", items[0])
        self.assertIn("Put", items[1])
        self.assertEqual(updated["workflow"], "ALL_DONE")
        self.assertEqual(updated["version"], 3)
        records_table.update_item.assert_not_called()
        history_table.put_item.assert_not_called()

    def test_workflow_conflict_leaves_no_partial_fallback(self):
        error = ClientError(
            {
                "Error": {
                    "Code": "TransactionCanceledException",
                    "Message": "version conflict",
                },
                "CancellationReasons": [
                    {"Code": "ConditionalCheckFailed"},
                    {"Code": "None"},
                ],
            },
            "TransactWriteItems",
        )
        records_table = Mock()
        history_table = Mock()
        transaction_client = Mock()
        transaction_client.transact_write_items.side_effect = error
        client = self._client(records_table, history_table, transaction_client)

        with self.assertRaises(WisdmVersionConflictError):
            client.update_wisdm_workflow_with_history(
                {"record_id": "WDM0001", "workflow": "CREATED", "version": 1},
                "ALL_DONE",
                {"event_key": "time#id", "event_type": "workflow_changed"},
                expected_version=1,
            )
        records_table.update_item.assert_not_called()
        history_table.put_item.assert_not_called()

    def test_request_create_and_automatic_record_share_one_transaction(self):
        counter = AtomicCounterTable()
        transaction_client = Mock()
        client = self._client(counter, transaction_client=transaction_client)
        client.get_wisdm_service_record_by_so = Mock(return_value=None)
        request = {
            "request_id": "REQ1",
            "company_name": "Company",
            "config_data": {
                "general": {"barcode": "bc1", "orderId": "SO-1"},
                "system": {"wisdmWhitelist": True, "wisdmConnect": False},
            },
        }
        activity = {
            "id": "ACT1",
            "request_id": "REQ1",
            "created_at": "2026-10-19T10:00:00",
        }

        result = client.create_request_with_wisdm_sync(
            request,
            {"id": 7, "name": "Operator", "email": "ops@example.com"},
            activity,
        )

        self.assertTrue(result)
        items = transaction_client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(items), 5)
        self.assertEqual(items[0]["Put"]["TableName"], TABLES["requests"])
        self.assertEqual(items[1]["Put"]["TableName"], TABLES["activities"])
        self.assertEqual(items[2]["Put"]["TableName"], TABLES["wisdm_service_records"])
        self.assertEqual(items[3]["Put"]["TableName"], TABLES["wisdm_service_records"])
        self.assertEqual(items[4]["Put"]["TableName"], TABLES["wisdm_service_history"])
        self.assertEqual(items[2]["Put"]["Item"]["source_type"], {"S": "automatic"})
        self.assertEqual(items[2]["Put"]["Item"]["workflow"], {"S": "CREATED"})

    def test_existing_auto_supplement_keeps_workflow_and_writes_no_history(self):
        transaction_client = Mock()
        client = self._client(transaction_client=transaction_client)
        existing = {
            "record_id": "WDM0001",
            "so_number": "SO-1",
            "company_name": "Company",
            "associations": [{"request_id": "REQ1", "barcode": "BC1"}],
            "whitelist_required": True,
            "provisioning_required": False,
            "workflow": "ALL_DONE",
            "version": 4,
        }
        client.get_wisdm_service_record_by_so = Mock(return_value=existing)
        effective_request = {
            "request_id": "REQ2",
            "company_name": "Other",
            "config_data": {
                "general": {"barcode": "bc2", "orderId": "SO-1"},
                "system": {"wisdmConnect": True},
            },
        }

        client.update_request_with_wisdm_sync(
            "REQ2",
            {"config_data": effective_request["config_data"]},
            effective_request,
            {"id": 7, "email": "ops@example.com"},
        )

        items = transaction_client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(items), 2)
        wisdm_update = items[1]["Update"]
        updated_fields = set(wisdm_update["ExpressionAttributeNames"].values())
        self.assertIn("associations", updated_fields)
        self.assertIn("provisioning_required", updated_fields)
        self.assertNotIn("workflow", updated_fields)
        self.assertFalse(any(
            item.get("Put", {}).get("TableName") == TABLES["wisdm_service_history"]
            for item in items
        ))

    def test_repeated_auto_supplement_only_writes_request(self):
        transaction_client = Mock()
        client = self._client(transaction_client=transaction_client)
        existing = {
            "record_id": "WDM0001",
            "so_number": "SO-1",
            "company_name": "Company",
            "associations": [{"request_id": "REQ1", "barcode": "BC1"}],
            "whitelist_required": True,
            "provisioning_required": False,
            "workflow": "WHITELIST_DONE",
            "version": 4,
        }
        client.get_wisdm_service_record_by_so = Mock(return_value=existing)
        effective_request = {
            "request_id": "REQ1",
            "company_name": "Company",
            "config_data": {
                "general": {"barcode": "BC1", "orderId": "SO-1"},
                "system": {"wisdmWhitelist": True},
            },
        }

        client.update_request_with_wisdm_sync(
            "REQ1",
            {"config_data": effective_request["config_data"]},
            effective_request,
            {"id": 7, "email": "ops@example.com"},
        )

        items = transaction_client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(items), 1)
        self.assertIn("Update", items[0])

    def test_auto_supplement_retries_version_conflict(self):
        conflict = ClientError(
            {
                "Error": {
                    "Code": "TransactionCanceledException",
                    "Message": "conflict",
                },
                "CancellationReasons": [
                    {"Code": "None"},
                    {"Code": "ConditionalCheckFailed"},
                ],
            },
            "TransactWriteItems",
        )
        transaction_client = Mock()
        transaction_client.transact_write_items.side_effect = [conflict, None]
        client = self._client(transaction_client=transaction_client)
        base_record = {
            "record_id": "WDM0001",
            "so_number": "SO-1",
            "associations": [],
            "whitelist_required": True,
            "provisioning_required": False,
            "workflow": "ALL_DONE",
        }
        client.get_wisdm_service_record_by_so = Mock(side_effect=[
            dict(base_record, version=1),
            dict(base_record, version=2),
        ])
        effective_request = {
            "request_id": "REQ1",
            "config_data": {
                "general": {"barcode": "BC1", "orderId": "SO-1"},
                "system": {"wisdmWhitelist": True},
            },
        }

        result = client.update_request_with_wisdm_sync(
            "REQ1",
            {"config_data": effective_request["config_data"]},
            effective_request,
            {"id": 7, "email": "ops@example.com"},
        )

        self.assertTrue(result)
        self.assertEqual(transaction_client.transact_write_items.call_count, 2)
        self.assertEqual(client.get_wisdm_service_record_by_so.call_count, 2)


if __name__ == "__main__":
    unittest.main()
