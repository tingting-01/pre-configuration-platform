import os
import sys
import unittest
import json
from decimal import Decimal


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from change_history import (  # noqa: E402
    CONTENT_OMITTED_VALUE,
    REDACTED_VALUE,
    build_activity_data,
    build_configuration_change_activity,
    coalesce_history_file_changes,
    compute_config_changes,
    resolve_activity_author,
    serialize_activity_for_api,
)


class ConfigChangeTests(unittest.TestCase):
    def test_nested_multiple_fields_decimal_array_and_key_order(self):
        old = {
            "network": {"port": Decimal("1883"), "enabled": True},
            "channels": [1, 2],
            "ordered": {"a": 1, "b": 2},
        }
        new = {
            "ordered": {"b": 2, "a": 1},
            "network": {"port": 8883, "enabled": False},
            "channels": [2, 1],
        }

        changes = compute_config_changes(old, new)

        self.assertEqual(
            [change["field"] for change in changes],
            ["channels", "network.enabled", "network.port"],
        )
        self.assertEqual(changes[0]["from"], [1, 2])
        self.assertEqual(changes[0]["to"], [2, 1])
        self.assertEqual(changes[2]["from"], 1883)

    def test_missing_null_and_empty_string_are_equivalent(self):
        self.assertEqual(compute_config_changes({}, {"value": None}), [])
        self.assertEqual(compute_config_changes({"value": None}, {"value": ""}), [])

    def test_sensitive_and_raw_content_are_never_stored(self):
        old_secret = "old-secret"
        new_secret = "new-secret"
        old_content = "A" * 5000
        new_content = "B" * 5000

        changes = compute_config_changes(
            {"mqtt": {"password": old_secret}, "certificateContent": old_content},
            {"mqtt": {"password": new_secret}, "certificateContent": new_content},
        )

        self.assertEqual(changes[0]["from"], CONTENT_OMITTED_VALUE)
        self.assertEqual(changes[1]["from"], REDACTED_VALUE)
        serialized = str(changes)
        self.assertNotIn(old_secret, serialized)
        self.assertNotIn(new_secret, serialized)
        self.assertNotIn(old_content, serialized)
        self.assertNotIn(new_content, serialized)

    def test_file_metadata_is_summarized_without_internal_ids(self):
        changes = compute_config_changes(
            {"extensions": {"extensionFiles": [{"id": "secret-id", "name": "a.zip", "size": 10}]}},
            {"extensions": {"extensionFiles": [
                {"id": "other-id", "name": "a.zip", "size": 10},
                {"id": "new-id", "name": "b.zip", "size": Decimal("20")},
            ]}},
        )

        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["field"], "extensions.extensionFiles")
        self.assertEqual(changes[0]["to"]["count"], 2)
        self.assertEqual(changes[0]["to"]["totalSize"], 30)
        self.assertNotIn("secret-id", str(changes))
        self.assertNotIn("other-id", str(changes))
        self.assertNotIn("new-id", str(changes))

    def test_parallel_file_fields_create_one_history_change(self):
        changes = compute_config_changes(
            {
                "other": {
                    "configFiles": [],
                    "configFileNames": [],
                    "configFileSizes": [],
                }
            },
            {
                "other": {
                    "configFiles": [{
                        "id": "internal-file-id",
                        "name": "customer.pdf",
                        "size": 1821,
                    }],
                    "configFileNames": ["customer.pdf"],
                    "configFileSizes": [1821],
                }
            },
        )

        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["field"], "other.configFiles")
        self.assertEqual(changes[0]["to"]["count"], 1)
        self.assertEqual(changes[0]["to"]["files"][0]["name"], "customer.pdf")
        self.assertEqual(changes[0]["to"]["totalSize"], 1821)
        self.assertNotIn("internal-file-id", str(changes))

    def test_old_parallel_file_changes_are_coalesced(self):
        changes = coalesce_history_file_changes([
            {
                "field": "other.configFileNames",
                "from": [],
                "to": ["customer.pdf"],
            },
            {
                "field": "other.configFileSizes",
                "from": [],
                "to": [1821],
            },
            {
                "field": "other.configFiles",
                "from": {"count": 0, "files": []},
                "to": {
                    "count": 1,
                    "files": [{"name": "customer.pdf", "size": 1821}],
                    "totalSize": 1821,
                },
            },
        ])

        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["field"], "other.configFiles")
        self.assertEqual(changes[0]["to"]["files"][0]["name"], "customer.pdf")

    def test_activity_has_authenticated_actor_snapshot_and_round_trip_shape(self):
        activity = build_activity_data(
            "REQ1",
            {"id": 7, "name": "Irving", "email": "irving@example.com"},
            "configuration_changed",
            "Configuration updated",
            changes=[{"field": "general.pid", "from": "A", "to": "B"}],
        )
        copied = json.loads(json.dumps(activity))

        self.assertEqual(copied["actor_name"], "Irving")
        self.assertEqual(copied["actor_email"], "irving@example.com")
        self.assertEqual(copied["changes"][0]["to"], "B")
        self.assertNotIn("changes", {"activity_type": "created"})

    def test_one_save_builds_one_activity_and_ignores_spoofed_actor(self):
        activity = build_configuration_change_activity(
            "REQ1",
            {"general": {"pid": "A", "model": "X"}},
            {
                "configData": {"general": {"pid": "B", "model": "Y"}},
                "actor_name": "Spoofed",
                "actor_email": "spoofed@example.com",
            },
            {"id": 7, "name": "Irving", "email": "irving@example.com"},
        )

        self.assertIsNotNone(activity)
        self.assertEqual(activity["activity_type"], "configuration_changed")
        self.assertEqual(len(activity["changes"]), 2)
        self.assertEqual(activity["actor_name"], "Irving")
        self.assertEqual(activity["actor_email"], "irving@example.com")

    def test_no_config_or_same_config_does_not_build_activity(self):
        user = {"id": 7, "email": "irving@example.com"}
        self.assertIsNone(build_configuration_change_activity("REQ1", {"a": 1}, {}, user))
        self.assertIsNone(
            build_configuration_change_activity(
                "REQ1", {"a": Decimal("1")}, {"configData": {"a": 1}}, user
            )
        )

class ActivityAuthorTests(unittest.TestCase):
    def test_snapshot_has_priority(self):
        result = resolve_activity_author(
            {"actor_name": "Snapshot", "actor_email": "snapshot@example.com", "user_id": 1},
            {1: {"name": "Current", "email": "current@example.com"}},
        )
        self.assertEqual(result, ("Snapshot", "snapshot@example.com"))

    def test_user_batch_lookup_supports_string_numeric_ids(self):
        result = resolve_activity_author(
            {"user_id": "7"},
            {7: {"name": "Irving", "email": "irving@example.com"}},
        )
        self.assertEqual(result, ("Irving", "irving@example.com"))

    def test_known_status_email_description_is_parsed(self):
        result = resolve_activity_author(
            {
                "activity_type": "status_changed",
                "description": "irving.wu@rakwireless.com updated workflow process of request REQ1 from 'Open' to 'Done'",
            },
            {},
        )
        self.assertEqual(result, ("irving.wu@rakwireless.com", "irving.wu@rakwireless.com"))

    def test_assigned_description_uses_operator_not_assignee(self):
        result = resolve_activity_author(
            {
                "activity_type": "assigned",
                "description": "Operator assigned request REQ1 to target@example.com",
            },
            {},
        )
        self.assertEqual(result, ("Operator", "unknown@example.com"))

    def test_unknown_description_stays_unknown(self):
        result = resolve_activity_author(
            {"activity_type": "comment", "description": "target@example.com was mentioned"},
            {},
        )
        self.assertEqual(result, ("Unknown User", "unknown@example.com"))

    def test_api_serialization_keeps_old_shape_and_adds_optional_changes(self):
        old_activity = serialize_activity_for_api(
            {
                "created_at": "2026-01-01T00:00:00",
                "activity_type": "created",
                "description": "Request created by old@example.com for Company",
            },
            {},
        )
        new_activity = serialize_activity_for_api(
            {
                "created_at": "2026-01-02T00:00:00",
                "activity_type": "configuration_changed",
                "description": "Configuration updated",
                "actor_email": "new@example.com",
                "changes": [{"field": "a", "from": 1, "to": 2}],
            },
            {},
        )

        self.assertNotIn("changes", old_activity)
        self.assertEqual(old_activity["authorEmail"], "old@example.com")
        self.assertEqual(new_activity["changes"][0]["field"], "a")
        self.assertEqual(new_activity["authorName"], "new@example.com")


if __name__ == "__main__":
    unittest.main()
