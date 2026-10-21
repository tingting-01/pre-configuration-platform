import os
import sys
import unittest
from functools import wraps
from inspect import iscoroutinefunction
from unittest.mock import Mock, patch


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from fastapi import HTTPException  # noqa: E402
import main_simple  # noqa: E402
from wisdm_service import (  # noqa: E402
    WisdmDuplicateSOError,
    WisdmVersionConflictError,
)


INTERNAL_USER = {
    "id": 7,
    "name": "Operator",
    "email": "operator@rakwireless.com",
    "role": "rakwireless",
}
ADMIN_USER = {
    "id": 9,
    "name": "Admin",
    "email": "admin@rakwireless.com",
    "role": "admin",
}
OUTSIDE_USER = {
    "id": 10,
    "name": "Customer",
    "email": "customer@example.com",
    "role": "user",
}


def source_request(request_id="REQ1", barcode="BC1", so="SO-1", company="Source Co"):
    return {
        "request_id": request_id,
        "company_name": company,
        "config_data": {
            "general": {"barcode": barcode, "orderId": so},
            "system": {"wisdmWhitelist": True},
        },
    }


def service_record(**overrides):
    record = {
        "pk": "RECORD#WDM0001",
        "record_id": "WDM0001",
        "so_number": "SO-1",
        "so_number_key": "SO-1",
        "company_name": "Company",
        "associations": [{"request_id": "REQ1", "barcode": "BC1"}],
        "whitelist_required": True,
        "provisioning_required": False,
        "jira_keys": ["DEMO-1"],
        "workflow": "CREATED",
        "notes": "",
        "source_type": "manual",
        "created_by": {"id": 7, "name": "Operator", "email": "operator@rakwireless.com"},
        "version": 1,
    }
    record.update(overrides)
    return record


def _run_immediate_coroutine(test_method):
    """这些路由不挂起 I/O，可直接驱动协程，避开受限环境的事件循环。"""

    @wraps(test_method)
    def wrapper(*args, **kwargs):
        coroutine = test_method(*args, **kwargs)
        try:
            coroutine.send(None)
        except StopIteration:
            return None
        finally:
            coroutine.close()
        raise RuntimeError("测试路由出现了未预期的异步挂起")

    return wrapper


class ImmediateAsyncTestCase(unittest.TestCase):
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        for name, value in list(cls.__dict__.items()):
            if name.startswith("test_") and iscoroutinefunction(value):
                setattr(cls, name, _run_immediate_coroutine(value))


class WisdmServiceAPITests(ImmediateAsyncTestCase):
    async def test_non_internal_user_is_rejected(self):
        with patch.object(main_simple, "db_client", Mock()):
            with self.assertRaises(HTTPException) as raised:
                await main_simple.get_wisdm_service_records(current_user=OUTSIDE_USER)
        self.assertEqual(raised.exception.status_code, 403)

    async def test_list_combines_search_status_and_exact_association_filters(self):
        db = Mock()
        db.scan_wisdm_service_records.return_value = [
            service_record(),
            service_record(
                pk="RECORD#WDM0002",
                record_id="WDM0002",
                so_number="SO-2",
                company_name="Other",
                associations=[{"request_id": "REQ2", "barcode": "BC2"}],
                workflow="ALL_DONE",
            ),
        ]
        with patch.object(main_simple, "db_client", db):
            payload = await main_simple.get_wisdm_service_records(
                search="company",
                filter="created",
                preconfigRequestId="req1",
                barcode="bc1",
                current_user=INTERNAL_USER,
            )
        self.assertEqual([item["recordId"] for item in payload["records"]], ["WDM0001"])

    async def test_manual_create_validates_source_and_fills_company(self):
        db = Mock()
        db.scan_requests_for_list.return_value = [source_request(so="SO-SOURCE")]

        def create(record_data, history):
            self.assertEqual(record_data["workflow"], "CREATED")
            self.assertEqual(record_data["company_name"], "Source Co")
            self.assertEqual(
                record_data["associations"],
                [{"request_id": "REQ1", "barcode": "BC1"}],
            )
            self.assertEqual(record_data["created_by"]["id"], 7)
            self.assertEqual(history["event_type"], "created")
            return service_record(company_name="Source Co")

        db.create_wisdm_service_record.side_effect = create
        with patch.object(main_simple, "db_client", db):
            result = await main_simple.create_wisdm_service_record(
                {
                    "soNumber": "SO-1",
                    "barcodes": ["bc1"],
                    "whitelistRequired": True,
                    "provisioningRequired": False,
                    "createdBy": {"id": 999},
                },
                INTERNAL_USER,
            )
        self.assertEqual(result["recordId"], "WDM0001")
        self.assertEqual(result["workflow"], "CREATED")

    async def test_manual_create_allows_same_barcode_for_different_service_so(self):
        db = Mock()
        db.scan_requests_for_list.return_value = [source_request(so="")]
        db.create_wisdm_service_record.side_effect = lambda record, history: service_record(
            so_number=record["so_number"],
            associations=record["associations"],
        )
        payload = {
            "barcodes": ["BC1"],
            "whitelistRequired": True,
        }

        with patch.object(main_simple, "db_client", db):
            first = await main_simple.create_wisdm_service_record(
                {**payload, "soNumber": "SO-A"},
                INTERNAL_USER,
            )
            second = await main_simple.create_wisdm_service_record(
                {**payload, "soNumber": "SO-B"},
                INTERNAL_USER,
            )

        self.assertEqual(first["barcodes"], second["barcodes"])
        self.assertEqual(db.create_wisdm_service_record.call_count, 2)

    async def test_manual_create_rejects_ambiguous_historical_barcode(self):
        db = Mock()
        db.scan_requests_for_list.return_value = [
            source_request(request_id="REQ1", barcode="BC1", so="SO-A"),
            source_request(request_id="REQ2", barcode="bc1", so="SO-B"),
        ]
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as ambiguous:
                await main_simple.create_wisdm_service_record(
                    {
                        "soNumber": "SO-C",
                        "barcodes": ["BC1"],
                        "whitelistRequired": True,
                    },
                    INTERNAL_USER,
                )

        self.assertEqual(ambiguous.exception.status_code, 400)
        self.assertIn("REQ1", ambiguous.exception.detail)
        self.assertIn("REQ2", ambiguous.exception.detail)
        db.create_wisdm_service_record.assert_not_called()

    async def test_manual_create_maps_missing_source_and_duplicate_so(self):
        db = Mock()
        db.scan_requests_for_list.return_value = []
        payload = {
            "soNumber": "SO-1",
            "barcodes": ["BC1"],
            "whitelistRequired": True,
        }
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as no_service:
                await main_simple.create_wisdm_service_record(
                    {
                        "soNumber": "SO-1",
                        "barcodes": ["BC1"],
                    },
                    INTERNAL_USER,
                )
            with self.assertRaises(HTTPException) as missing:
                await main_simple.create_wisdm_service_record(payload, INTERNAL_USER)
        self.assertEqual(no_service.exception.status_code, 400)
        self.assertEqual(missing.exception.status_code, 400)

        db.scan_requests_for_list.return_value = [source_request()]
        db.create_wisdm_service_record.side_effect = WisdmDuplicateSOError("duplicate")
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as duplicate:
                await main_simple.create_wisdm_service_record(payload, INTERNAL_USER)
        self.assertEqual(duplicate.exception.status_code, 409)

    async def test_content_permissions_and_whitelist_clear(self):
        db = Mock()
        db.get_wisdm_service_record.return_value = service_record(
            source_type="automatic",
            created_by={"id": 99},
        )
        db.get_request.return_value = source_request(so="SO-OTHER")
        db.update_wisdm_service_record.return_value = service_record(
            source_type="automatic",
            whitelist_required=False,
            provisioning_required=True,
            jira_keys=[],
            version=2,
        )
        with patch.object(main_simple, "db_client", db):
            result = await main_simple.update_wisdm_service_record(
                "WDM0001",
                {
                    "version": 1,
                    "whitelistRequired": False,
                    "provisioningRequired": True,
                    "jiraKeys": ["SHOULD-CLEAR"],
                },
                INTERNAL_USER,
            )
        update_data = db.update_wisdm_service_record.call_args.args[1]
        self.assertEqual(update_data["jira_keys"], [])
        self.assertTrue(result["permissions"]["canEditContent"])
        db.put_wisdm_service_history.assert_not_called()
        db.update_wisdm_workflow_with_history.assert_not_called()

        db.get_wisdm_service_record.return_value = service_record(
            created_by={"id": 99},
        )
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as forbidden:
                await main_simple.update_wisdm_service_record(
                    "WDM0001", {"version": 1, "notes": "x"}, INTERNAL_USER
                )
        self.assertEqual(forbidden.exception.status_code, 403)

        db.get_wisdm_service_record.return_value = service_record(workflow="ALL_DONE")
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as readonly:
                await main_simple.update_wisdm_service_record(
                    "WDM0001", {"version": 1, "notes": "x"}, ADMIN_USER
                )
        self.assertEqual(readonly.exception.status_code, 403)

    async def test_workflow_update_supports_jump_rollback_and_idempotency(self):
        db = Mock()
        record = service_record(whitelist_required=True, provisioning_required=True)
        db.get_wisdm_service_record.return_value = record
        db.update_wisdm_workflow_with_history.return_value = service_record(
            whitelist_required=True,
            provisioning_required=True,
            workflow="ALL_DONE",
            version=2,
        )
        with patch.object(main_simple, "db_client", db):
            result = await main_simple.update_wisdm_service_record(
                "WDM0001",
                {"workflow": "ALL_DONE", "version": 1},
                INTERNAL_USER,
            )
        self.assertEqual(result["workflow"], "ALL_DONE")
        history = db.update_wisdm_workflow_with_history.call_args.args[2]
        self.assertEqual(history["previous_workflow"], "CREATED")
        self.assertEqual(history["new_workflow"], "ALL_DONE")

        db.reset_mock()
        db.get_wisdm_service_record.return_value = service_record(workflow="CREATED")
        with patch.object(main_simple, "db_client", db):
            same = await main_simple.update_wisdm_service_record(
                "WDM0001",
                {"workflow": "CREATED", "version": 1},
                INTERNAL_USER,
            )
        self.assertEqual(same["workflow"], "CREATED")
        db.update_wisdm_workflow_with_history.assert_not_called()

        db.reset_mock()
        db.get_wisdm_service_record.return_value = service_record(
            whitelist_required=True,
            provisioning_required=True,
            workflow="ALL_DONE",
            version=2,
        )
        db.update_wisdm_workflow_with_history.return_value = service_record(
            whitelist_required=True,
            provisioning_required=True,
            workflow="CREATED",
            version=3,
        )
        with patch.object(main_simple, "db_client", db):
            rolled_back = await main_simple.update_wisdm_service_record(
                "WDM0001",
                {"workflow": "CREATED", "version": 2},
                INTERNAL_USER,
            )
        self.assertEqual(rolled_back["workflow"], "CREATED")
        self.assertTrue(rolled_back["permissions"]["canEditContent"])

    async def test_illegal_workflow_and_version_conflict_map_to_400_and_409(self):
        db = Mock()
        db.get_wisdm_service_record.return_value = service_record()
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as invalid:
                await main_simple.update_wisdm_service_record(
                    "WDM0001",
                    {"workflow": "PROVISIONING_DONE", "version": 1},
                    INTERNAL_USER,
                )
        self.assertEqual(invalid.exception.status_code, 400)

        db.update_wisdm_workflow_with_history.side_effect = WisdmVersionConflictError("conflict")
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as conflict:
                await main_simple.update_wisdm_service_record(
                    "WDM0001",
                    {"workflow": "ALL_DONE", "version": 1},
                    INTERNAL_USER,
                )
        self.assertEqual(conflict.exception.status_code, 409)

    async def test_detail_returns_newest_history_and_missing_is_404(self):
        db = Mock()
        db.get_wisdm_service_record.return_value = service_record()
        db.query_wisdm_service_history.return_value = [{
            "event_key": "2026-10-19#2",
            "event_type": "created",
            "created_at": "2026-10-19",
        }]
        with patch.object(main_simple, "db_client", db):
            result = await main_simple.get_wisdm_service_record("WDM0001", INTERNAL_USER)
        self.assertEqual(result["history"][0]["eventType"], "created")

        db.get_wisdm_service_record.return_value = None
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as missing:
                await main_simple.get_wisdm_service_record("WDM404", INTERNAL_USER)
        self.assertEqual(missing.exception.status_code, 404)

    async def test_content_update_maps_missing_and_version_conflict(self):
        db = Mock()
        db.get_wisdm_service_record.return_value = None
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as missing:
                await main_simple.update_wisdm_service_record(
                    "WDM404", {"version": 1, "notes": "x"}, INTERNAL_USER
                )
        self.assertEqual(missing.exception.status_code, 404)

        db.get_wisdm_service_record.return_value = service_record()
        db.get_request.return_value = source_request()
        db.update_wisdm_service_record.side_effect = WisdmVersionConflictError("conflict")
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as conflict:
                await main_simple.update_wisdm_service_record(
                    "WDM0001", {"version": 1, "notes": "x"}, INTERNAL_USER
                )
        self.assertEqual(conflict.exception.status_code, 409)

    async def test_service_edit_never_writes_back_to_preconfig_request(self):
        db = Mock()
        db.get_wisdm_service_record.return_value = service_record()
        db.get_request.return_value = source_request()
        db.update_wisdm_service_record.return_value = service_record(notes="updated", version=2)
        with patch.object(main_simple, "db_client", db):
            await main_simple.update_wisdm_service_record(
                "WDM0001",
                {"version": 1, "notes": "updated"},
                INTERNAL_USER,
            )
        db.update_request.assert_not_called()
        db.update_request_with_activity.assert_not_called()
        db.update_request_with_wisdm_sync.assert_not_called()


class RequestSyncRegressionTests(ImmediateAsyncTestCase):
    def setUp(self):
        self._print_patcher = patch("builtins.print")
        self._print_patcher.start()
        self.addCleanup(self._print_patcher.stop)

    async def test_request_create_uses_sync_only_when_plan_is_eligible(self):
        eligible = main_simple.RequestCreate(
            companyName="Company",
            rakId="RAK1",
            configData={
                "general": {"barcode": "BC1", "orderId": "SO-1"},
                "system": {"wisdmWhitelist": True, "wisdmEnabled": False},
            },
            changes={},
            originalConfig={},
        )
        db = Mock()
        db.scan_requests_for_list.return_value = []
        db.create_request_with_wisdm_sync.return_value = True
        with patch.object(main_simple, "db_client", db):
            result = await main_simple.create_request(eligible, INTERNAL_USER)
        self.assertIn("request_id", result)
        db.create_request_with_wisdm_sync.assert_called_once()
        db.create_request.assert_not_called()

        ineligible = main_simple.RequestCreate(
            companyName="Company",
            rakId="RAK1",
            configData={
                "general": {"barcode": "BC1", "orderId": "SO-1"},
                "system": {"wisdmEnabled": True},
            },
            changes={},
            originalConfig={},
        )
        db = Mock()
        db.scan_requests_for_list.return_value = []
        db.create_request.return_value = True
        with patch.object(main_simple, "db_client", db):
            await main_simple.create_request(ineligible, INTERNAL_USER)
        db.create_request.assert_called_once()
        db.create_request_with_wisdm_sync.assert_not_called()

    async def test_request_update_adds_but_removal_does_not_reverse_sync(self):
        existing = source_request()
        existing.update({"user_id": 7, "status": "Open"})
        incoming = {
            "configData": {
                "general": {"barcode": "BC2", "orderId": "SO-1"},
                "system": {"wisdmConnect": True},
            }
        }
        db = Mock()
        db.get_request.return_value = existing
        db.scan_requests_for_list.return_value = [existing]
        db.update_request_with_wisdm_sync.return_value = True
        with patch.object(main_simple, "db_client", db):
            await main_simple.update_request("REQ1", incoming, INTERNAL_USER)
        db.update_request_with_wisdm_sync.assert_called_once()

        removed = {"configData": {"general": {}, "system": {}}}
        db = Mock()
        db.get_request.return_value = existing
        db.update_request_with_activity.return_value = True
        with patch.object(main_simple, "db_client", db):
            await main_simple.update_request("REQ1", removed, INTERNAL_USER)
        db.update_request_with_activity.assert_called_once()
        db.update_request_with_wisdm_sync.assert_not_called()

    async def test_existing_request_detail_shape_is_unchanged(self):
        db = Mock()
        request = source_request()
        request.update({
            "user_id": 7,
            "rak_id": "RAK1",
            "submit_time": "2026-10-19",
            "status": "Open",
            "changes": {},
            "original_config": {},
            "tags": [],
        })
        db.get_request.return_value = request
        db.get_users_by_ids.return_value = {7: {"email": "operator@rakwireless.com"}}
        with patch.object(main_simple, "db_client", db):
            result = await main_simple.get_request("REQ1", INTERNAL_USER)
        self.assertEqual(result["id"], "REQ1")
        self.assertEqual(result["configData"], request["config_data"])
        self.assertNotIn("wisdmServiceRecord", result)

    async def test_create_rejects_barcode_already_used_by_another_request(self):
        payload = main_simple.RequestCreate(
            companyName="Company",
            rakId="RAK1",
            configData={"general": {"barcode": " bc1 ", "orderId": "SO-9"}},
            changes={},
            originalConfig={},
        )
        db = Mock()
        db.scan_requests_for_list.return_value = [
            source_request(request_id="REQ9", barcode="BC1"),
        ]
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as occupied:
                await main_simple.create_request(payload, INTERNAL_USER)
        self.assertEqual(occupied.exception.status_code, 400)
        self.assertIn("REQ9", occupied.exception.detail)
        db.create_request.assert_not_called()
        db.create_request_with_wisdm_sync.assert_not_called()

    async def test_update_allows_current_request_and_rejects_taken_barcode(self):
        existing = source_request()
        existing.update({"user_id": 7, "status": "Open"})
        kept = {
            "configData": {
                "general": {"barcode": " bc1 ", "orderId": "SO-1"},
                "system": {"wisdmWhitelist": True},
            }
        }
        db = Mock()
        db.get_request.return_value = existing
        db.scan_requests_for_list.return_value = [
            source_request(request_id="REQ1", barcode="BC1"),
        ]
        db.update_request_with_wisdm_sync.return_value = True
        with patch.object(main_simple, "db_client", db):
            await main_simple.update_request("REQ1", kept, INTERNAL_USER)
        db.update_request_with_wisdm_sync.assert_called_once()

        taken = {
            "configData": {
                "general": {"barcode": "BC2", "orderId": "SO-1"},
                "system": {"wisdmConnect": True},
            }
        }
        db = Mock()
        db.get_request.return_value = existing
        db.scan_requests_for_list.return_value = [
            existing,
            source_request(request_id="REQ9", barcode=" bc2 "),
        ]
        with patch.object(main_simple, "db_client", db):
            with self.assertRaises(HTTPException) as occupied:
                await main_simple.update_request("REQ1", taken, INTERNAL_USER)
        self.assertEqual(occupied.exception.status_code, 400)
        self.assertIn("REQ9", occupied.exception.detail)
        db.update_request.assert_not_called()
        db.update_request_with_wisdm_sync.assert_not_called()

    async def test_empty_barcode_skips_uniqueness_scan(self):
        payload = main_simple.RequestCreate(
            companyName="Company",
            rakId="RAK1",
            configData={"general": {"orderId": "SO-1"}},
            changes={},
            originalConfig={},
        )
        db = Mock()
        db.create_request.return_value = True
        with patch.object(main_simple, "db_client", db):
            await main_simple.create_request(payload, INTERNAL_USER)
        db.scan_requests_for_list.assert_not_called()
        db.create_request.assert_called_once()


if __name__ == "__main__":
    unittest.main()
