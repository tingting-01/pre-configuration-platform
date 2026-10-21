import os
import sys
import unittest
from decimal import Decimal


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from wisdm_service import (  # noqa: E402
    WORKFLOW_ALL_DONE,
    WORKFLOW_CREATED,
    WORKFLOW_PROVISIONING_DONE,
    WORKFLOW_WHITELIST_DONE,
    WisdmAssociationMismatchError,
    WisdmRequestNotFoundError,
    WisdmValidationError,
    allowed_workflows,
    build_auto_sync_plan,
    build_wisdm_history_item,
    can_edit_wisdm_content,
    can_update_wisdm_workflow,
    extract_preconfig_reference,
    filter_wisdm_records,
    is_wisdm_internal_user,
    merge_auto_supplement,
    normalize_barcode,
    normalize_jira_keys,
    normalize_so_number,
    serialize_wisdm_record_detail,
    serialize_wisdm_record_list,
    conflicting_barcode_request_ids,
    resolve_manual_barcodes,
    validate_barcode_associations,
)


class WisdmDomainRuleTests(unittest.TestCase):
    def test_normalization_handles_whitespace_case_and_duplicates(self):
        self.assertEqual(normalize_so_number("  so-1001  "), "SO-1001")
        self.assertEqual(normalize_barcode(" bc10001a "), "BC10001A")
        self.assertEqual(
            normalize_jira_keys([" demo-1 ", "DEMO-1", "", "demo-2"]),
            ["DEMO-1", "DEMO-2"],
        )

    def test_allowed_workflows_follow_service_combination(self):
        self.assertEqual(
            allowed_workflows(True, True),
            (
                WORKFLOW_CREATED,
                WORKFLOW_WHITELIST_DONE,
                WORKFLOW_PROVISIONING_DONE,
                WORKFLOW_ALL_DONE,
            ),
        )
        self.assertEqual(
            allowed_workflows(True, False),
            (WORKFLOW_CREATED, WORKFLOW_WHITELIST_DONE, WORKFLOW_ALL_DONE),
        )
        self.assertEqual(
            allowed_workflows(False, True),
            (WORKFLOW_CREATED, WORKFLOW_PROVISIONING_DONE, WORKFLOW_ALL_DONE),
        )
        self.assertEqual(allowed_workflows(False, False), ())

    def test_auto_merge_adds_barcode_and_service_but_keeps_workflow(self):
        original = {
            "associations": [{"request_id": "REQ1", "barcode": "BC1"}],
            "whitelist_required": True,
            "provisioning_required": False,
            "workflow": WORKFLOW_WHITELIST_DONE,
            "company_name": "Existing Company",
        }

        merged, changed = merge_auto_supplement(
            original,
            [{"requestId": "REQ2", "barcode": " bc2 "}],
            whitelist_required=False,
            provisioning_required=True,
            company_name="Incoming Company",
        )

        self.assertTrue(changed)
        self.assertEqual(
            merged["associations"],
            [
                {"request_id": "REQ1", "barcode": "BC1"},
                {"request_id": "REQ2", "barcode": "BC2"},
            ],
        )
        self.assertTrue(merged["whitelist_required"])
        self.assertTrue(merged["provisioning_required"])
        self.assertEqual(merged["workflow"], WORKFLOW_WHITELIST_DONE)
        self.assertEqual(merged["company_name"], "Existing Company")
        self.assertEqual(original["associations"], [{"request_id": "REQ1", "barcode": "BC1"}])

    def test_auto_merge_no_change_is_idempotent_and_fills_blank_company_once(self):
        original = {
            "associations": [{"request_id": "REQ1", "barcode": "BC1"}],
            "whitelist_required": True,
            "provisioning_required": False,
            "workflow": WORKFLOW_ALL_DONE,
            "company_name": "Company",
        }
        merged, changed = merge_auto_supplement(
            original,
            [{"requestId": "REQ1", "barcode": "bc1"}],
            whitelist_required=True,
            provisioning_required=False,
            company_name="Other",
        )
        self.assertFalse(changed)
        self.assertEqual(merged["workflow"], WORKFLOW_ALL_DONE)

        blank_company = dict(original, company_name="")
        filled, changed = merge_auto_supplement(
            blank_company,
            [{"requestId": "REQ1", "barcode": "BC1"}],
            whitelist_required=True,
            provisioning_required=False,
            company_name="Source Company",
        )
        self.assertTrue(changed)
        self.assertEqual(filled["company_name"], "Source Company")

    def test_permissions_follow_role_source_creator_and_workflow(self):
        creator = {"id": 7, "email": "creator@rakwireless.com", "role": "rakwireless"}
        coworker = {"id": 8, "email": "ops@rakwireless.com", "role": "rakwireless"}
        admin = {"id": 9, "email": "admin@rakwireless.com", "role": "admin"}
        outsider = {"id": 10, "email": "user@example.com", "role": "user"}
        manual = {
            "workflow": "CREATED",
            "source_type": "manual",
            "created_by": {"id": 7},
        }
        automatic = dict(manual, source_type="automatic")

        self.assertTrue(is_wisdm_internal_user(creator))
        self.assertFalse(is_wisdm_internal_user(outsider))
        self.assertTrue(can_edit_wisdm_content(creator, manual))
        self.assertFalse(can_edit_wisdm_content(coworker, manual))
        self.assertTrue(can_edit_wisdm_content(admin, manual))
        self.assertTrue(can_edit_wisdm_content(coworker, automatic))
        self.assertFalse(
            can_edit_wisdm_content(admin, dict(manual, workflow="ALL_DONE"))
        )
        self.assertTrue(can_update_wisdm_workflow(coworker))
        self.assertFalse(can_update_wisdm_workflow(outsider))

    def test_history_actor_is_taken_from_authenticated_user(self):
        event = build_wisdm_history_item(
            "WDM0001",
            "created",
            {"id": 7, "name": "Real", "email": "real@rakwireless.com"},
            source_type="manual",
            new_workflow="CREATED",
        )
        self.assertEqual(event["actor"]["name"], "Real")
        self.assertEqual(event["record_id"], "WDM0001")
        self.assertTrue(event["event_key"].startswith(event["created_at"]))

    def test_auto_sync_plan_ignores_master_switch_and_requires_service(self):
        base = {
            "request_id": "REQ1",
            "company_name": "Company",
            "config_data": {
                "general": {"barcode": "bc1", "orderId": "SO-1"},
                "system": {
                    "wisdmEnabled": False,
                    "wisdmWhitelist": True,
                    "wisdmConnect": False,
                },
            },
        }
        plan = build_auto_sync_plan(base)
        self.assertIsNotNone(plan)
        self.assertTrue(plan["whitelist_required"])
        self.assertNotIn("wisdmEnabled", plan)

        no_service = dict(base)
        no_service["config_data"] = {
            "general": {"barcode": "BC1", "orderId": "SO-1"},
            "system": {"wisdmEnabled": True},
        }
        self.assertIsNone(build_auto_sync_plan(no_service))

    def test_record_filters(self):
        records = [
            {
                "record_id": "WDM0001",
                "so_number": "SO-A",
                "company_name": "Alpha",
                "associations": [{"request_id": "REQ1", "barcode": "BC-100"}],
                "jira_keys": ["DEMO-1"],
                "workflow": "CREATED",
                "created_at": "2026-01-03",
                "updated_at": "2026-01-01",
            },
            {
                "record_id": "WDM0002",
                "so_number": "SO-B",
                "company_name": "Beta",
                "associations": [{"request_id": "REQ2", "barcode": "BC-200"}],
                "jira_keys": [],
                "workflow": "ALL_DONE",
                "created_at": "2026-01-02",
                "updated_at": "2026-01-04",
            },
            {
                "record_id": "WDM0003",
                "so_number": "SO-C",
                "company_name": "Gamma",
                "associations": [{"request_id": "REQ3", "barcode": "BC-300"}],
                "jira_keys": [],
                "workflow": "CREATED",
                "updated_at": "2026-01-05",
            },
        ]
        self.assertEqual(
            [item["record_id"] for item in filter_wisdm_records(records, search="demo-1")],
            ["WDM0001"],
        )
        self.assertEqual(
            [item["record_id"] for item in filter_wisdm_records(
                records,
                workflow_filter="all_done",
                preconfig_request_id="req2",
                barcode="bc-200",
            )],
            ["WDM0002"],
        )
        self.assertEqual(
            [item["record_id"] for item in filter_wisdm_records(records)],
            ["WDM0003", "WDM0001", "WDM0002"],
        )


class WisdmAssociationValidationTests(unittest.TestCase):
    def setUp(self):
        self.requests = {
            "REQ1": {
                "request_id": "REQ1",
                "company_name": "Company A",
                "config_data": {
                    "general": {"BarCode": "bc-shared", "OrderID": "so-a"},
                    "system": {"wisdmWhitelist": True},
                },
            },
            "REQ2": {
                "requestId": "REQ2",
                "companyName": "Company A",
                "configData": {
                    "General": {"bar_code": "BC-SHARED", "order_id": "SO-A"},
                    "System": {"wisdmConnect": "true"},
                },
            },
            "REQ3": {
                "request_id": "REQ3",
                "company_name": "Company B",
                "config_data": '{"general":{"barcode":"bc-shared","orderId":"SO-B"}}',
            },
            "REQ4": {
                "request_id": "REQ4",
                "company_name": "Company C",
                "config_data": {
                    "general": {"barcode": "bc-unique", "orderId": "SO-SOURCE"},
                },
            },
        }

    def test_extracts_historical_field_variants(self):
        extracted = extract_preconfig_reference(self.requests["REQ2"])
        self.assertEqual(extracted["barcode"], "BC-SHARED")
        self.assertEqual(extracted["so_number_key"], "SO-A")
        self.assertEqual(extracted["company_name"], "Company A")
        self.assertTrue(extracted["provisioning_required"])

    def test_same_barcode_from_different_requests_is_preserved(self):
        result = validate_barcode_associations(
            [
                {"requestId": "REQ1", "barcode": "bc-shared"},
                {"requestId": "REQ2", "barcode": "BC-SHARED"},
                {"requestId": "REQ1", "barcode": "BC-SHARED"},
            ],
            self.requests.get,
        )
        self.assertEqual(
            result.associations,
            [
                {"request_id": "REQ1", "barcode": "BC-SHARED"},
                {"request_id": "REQ2", "barcode": "BC-SHARED"},
            ],
        )
        self.assertEqual(result.company_name, "Company A")

    def test_manual_barcode_resolves_only_by_barcode(self):
        result = resolve_manual_barcodes(
            [" bc-unique ", ""],
            self.requests.values(),
        )
        self.assertEqual(
            result.associations,
            [{"request_id": "REQ4", "barcode": "BC-UNIQUE"}],
        )
        self.assertEqual(result.company_name, "Company C")

    def test_manual_barcode_rejects_duplicates_in_one_record(self):
        with self.assertRaises(WisdmValidationError) as duplicated:
            resolve_manual_barcodes(
                [" bc-shared ", "BC-SHARED", "BC-OTHER"],
                self.requests.values(),
            )
        self.assertIn("BC-SHARED", str(duplicated.exception))
        self.assertIn("duplicated", str(duplicated.exception))

    def test_barcode_ownership_is_global_and_excludes_current_request(self):
        self.assertEqual(
            conflicting_barcode_request_ids("  bc-shared ", self.requests.values()),
            ["REQ1", "REQ2", "REQ3"],
        )
        self.assertEqual(
            conflicting_barcode_request_ids(
                "BC-SHARED",
                self.requests.values(),
                exclude_request_id="REQ1",
            ),
            ["REQ2", "REQ3"],
        )
        self.assertEqual(
            conflicting_barcode_request_ids("", self.requests.values()),
            [],
        )
        self.assertEqual(
            conflicting_barcode_request_ids("BC-NEW", self.requests.values()),
            [],
        )

    def test_manual_barcode_rejects_missing_and_ambiguous_matches(self):
        with self.assertRaises(WisdmRequestNotFoundError):
            resolve_manual_barcodes(["BC-MISSING"], self.requests.values())
        with self.assertRaises(WisdmValidationError) as ambiguous:
            resolve_manual_barcodes(["BC-SHARED"], self.requests.values())
        self.assertIn("REQ1", str(ambiguous.exception))
        self.assertIn("REQ2", str(ambiguous.exception))
        self.assertIn("REQ3", str(ambiguous.exception))

    def test_existing_association_does_not_validate_source_so(self):
        result = validate_barcode_associations(
            [{"requestId": "REQ4", "barcode": "BC-UNIQUE"}],
            self.requests.get,
        )
        self.assertEqual(
            result.associations,
            [{"request_id": "REQ4", "barcode": "BC-UNIQUE"}],
        )

    def test_stale_association_is_rejected(self):
        with self.assertRaises(WisdmAssociationMismatchError):
            validate_barcode_associations(
                [{"requestId": "REQ1", "barcode": "OLD-BC"}],
                self.requests.get,
            )
        with self.assertRaises(WisdmRequestNotFoundError):
            validate_barcode_associations(
                [{"requestId": "REMOVED", "barcode": "BC1"}],
                self.requests.get,
            )


class WisdmSerializationTests(unittest.TestCase):
    def setUp(self):
        self.record = {
            "record_id": "WDM0007",
            "so_number": "SO-7",
            "company_name": "Company",
            "associations": [{"request_id": "REQ7", "barcode": "BC7"}],
            "whitelist_required": True,
            "provisioning_required": False,
            "jira_keys": ["DEMO-7"],
            "workflow": "WHITELIST_DONE",
            "source_type": "manual",
            "created_by": {"id": Decimal("7"), "name": "Irving", "email": "i@example.com"},
            "version": Decimal("3"),
        }

    def test_list_response_uses_camel_case_source_and_permission_fields(self):
        payload = serialize_wisdm_record_list(
            [self.record],
            lambda _record: (False, True),
        )
        item = payload["records"][0]
        self.assertEqual(item["recordId"], "WDM0007")
        self.assertEqual(item["barcodes"], [{"requestId": "REQ7", "barcode": "BC7"}])
        self.assertEqual(item["workflow"], "WHITELIST_DONE")
        self.assertEqual(item["version"], 3)
        self.assertEqual(
            item["permissions"],
            {"canEditContent": False, "canUpdateWorkflow": True},
        )

    def test_detail_response_adds_serialized_history(self):
        detail = serialize_wisdm_record_detail(
            self.record,
            [{
                "event_key": "2026-10-19T10:00:00Z#1",
                "event_type": "workflow_changed",
                "previous_workflow": "CREATED",
                "new_workflow": "WHITELIST_DONE",
                "actor_name": "Ops",
                "actor_email": "ops@example.com",
                "created_at": "2026-10-19T10:00:00Z",
            }],
            can_edit_content=False,
            can_update_workflow=True,
        )
        self.assertEqual(detail["recordId"], "WDM0007")
        self.assertEqual(detail["history"][0]["eventType"], "workflow_changed")
        self.assertEqual(detail["history"][0]["newWorkflow"], "WHITELIST_DONE")
        self.assertEqual(detail["history"][0]["actor"]["email"], "ops@example.com")


if __name__ == "__main__":
    unittest.main()
