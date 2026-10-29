"""WisDM 服务记录的领域规则、来源校验与 API 序列化。"""

from __future__ import annotations

import copy
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Callable, Iterable, Mapping, Optional, Sequence


WORKFLOW_CREATED = "CREATED"
WORKFLOW_WHITELIST_DONE = "WHITELIST_DONE"
WORKFLOW_PROVISIONING_DONE = "PROVISIONING_DONE"
WORKFLOW_ALL_DONE = "ALL_DONE"


class WisdmValidationError(ValueError):
    """WisDM 业务输入不符合要求。"""


class WisdmRequestNotFoundError(WisdmValidationError):
    """关联的预配置请求不存在。"""


class WisdmAssociationMismatchError(WisdmValidationError):
    """提交的 Barcode 与来源请求不一致。"""


class WisdmDuplicateSOError(RuntimeError):
    """同一 SO 已存在服务记录。"""


class WisdmVersionConflictError(RuntimeError):
    """服务记录已被其他请求更新。"""


@dataclass(frozen=True)
class ValidatedAssociations:
    """保存前复核后的关联，以及可用于补齐记录的 Company。"""

    associations: list[dict[str, str]]
    company_name: str


def _user_role(user: Mapping[str, Any]) -> str:
    role = _trimmed_text(user.get("role")).lower()
    if role in {"user", "rakwireless", "admin"}:
        return role
    email = _trimmed_text(user.get("email")).lower()
    return "rakwireless" if email.endswith("@rakwireless.com") else "user"


def is_wisdm_internal_user(user: Mapping[str, Any]) -> bool:
    return _user_role(user) in {"rakwireless", "admin"}


def actor_snapshot(user: Mapping[str, Any]) -> dict[str, Any]:
    """只从认证上下文生成操作者快照。"""

    return {
        "id": user.get("id"),
        "name": _trimmed_text(user.get("name")) or _trimmed_text(user.get("email")),
        "email": _trimmed_text(user.get("email")),
    }


def can_edit_wisdm_content(
    user: Mapping[str, Any],
    record: Mapping[str, Any],
) -> bool:
    """判断内容字段编辑权限；管理员也不能绕过 CREATED 限制。"""

    if not is_wisdm_internal_user(user) or record.get("workflow") != WORKFLOW_CREATED:
        return False
    if _user_role(user) == "admin":
        return True
    if _trimmed_text(record.get("source_type")).lower() in {"automatic", "auto"}:
        return True

    created_by = record.get("created_by")
    creator_id = created_by.get("id") if isinstance(created_by, Mapping) else created_by
    if creator_id is None:
        creator_id = record.get("created_by_id")
    return creator_id is not None and str(creator_id) == str(user.get("id"))


def can_update_wisdm_workflow(user: Mapping[str, Any]) -> bool:
    return is_wisdm_internal_user(user)


def can_delete_wisdm_record(
    user: Mapping[str, Any],
    record: Mapping[str, Any],
) -> bool:
    """管理员可删除任意记录，其他内部账号只能删除自己创建的记录。"""

    if not is_wisdm_internal_user(user):
        return False
    if _user_role(user) == "admin":
        return True

    created_by = record.get("created_by")
    creator_id = created_by.get("id") if isinstance(created_by, Mapping) else created_by
    if creator_id is None:
        creator_id = record.get("created_by_id")
    return creator_id is not None and str(creator_id) == str(user.get("id"))


def build_wisdm_history_item(
    record_id: str,
    event_type: str,
    user: Mapping[str, Any],
    *,
    source_type: str,
    previous_workflow: Optional[str] = None,
    new_workflow: Optional[str] = None,
    reason: str = "",
    created_at: Optional[str] = None,
) -> dict[str, Any]:
    """构建创建或 Workflow 变化历史，操作者始终来自认证用户。"""

    event_time = created_at or datetime.now(timezone.utc).isoformat()
    return {
        "record_id": record_id,
        "event_key": f"{event_time}#{uuid.uuid4()}",
        "event_type": event_type,
        "source_type": source_type,
        "previous_workflow": previous_workflow,
        "new_workflow": new_workflow,
        "reason": _trimmed_text(reason),
        "actor": actor_snapshot(user),
        "created_at": event_time,
    }


def _trimmed_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_so_number(value: Any) -> str:
    """生成用于比较和唯一约束的 SO key。"""

    return _trimmed_text(value).upper()


def normalize_barcode(value: Any) -> str:
    return _trimmed_text(value).upper()


def normalize_jira_keys(values: Optional[Iterable[Any]]) -> list[str]:
    """按输入顺序规范化并去重 Jira key。"""

    if values is None:
        return []
    if isinstance(values, (str, bytes)):
        values = [values]

    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _trimmed_text(value).upper()
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def allowed_workflows(
    whitelist_required: bool,
    provisioning_required: bool,
) -> tuple[str, ...]:
    """返回当前服务组合允许的 Workflow；无服务时没有合法状态。"""

    if whitelist_required and provisioning_required:
        return (
            WORKFLOW_CREATED,
            WORKFLOW_WHITELIST_DONE,
            WORKFLOW_PROVISIONING_DONE,
            WORKFLOW_ALL_DONE,
        )
    if whitelist_required:
        return (WORKFLOW_CREATED, WORKFLOW_WHITELIST_DONE, WORKFLOW_ALL_DONE)
    if provisioning_required:
        return (WORKFLOW_CREATED, WORKFLOW_PROVISIONING_DONE, WORKFLOW_ALL_DONE)
    return ()


def normalize_associations(
    associations: Optional[Iterable[Mapping[str, Any]]],
) -> list[dict[str, str]]:
    """规范化 `{requestId, barcode}` 关联并按组合去重。"""

    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for association in associations or []:
        request_id = _trimmed_text(
            association.get("request_id", association.get("requestId"))
        )
        barcode = normalize_barcode(association.get("barcode"))
        if not request_id or not barcode:
            raise WisdmValidationError("Each barcode association must include a requestId and a barcode")
        key = (request_id, barcode)
        if key in seen:
            continue
        seen.add(key)
        result.append({"request_id": request_id, "barcode": barcode})
    return result


def merge_auto_supplement(
    existing_record: Mapping[str, Any],
    associations: Iterable[Mapping[str, Any]],
    *,
    whitelist_required: bool,
    provisioning_required: bool,
    company_name: Any = "",
) -> tuple[dict[str, Any], bool]:
    """按并集合并自动补充内容，且始终保持已有 Workflow。"""

    merged = copy.deepcopy(dict(existing_record))
    original_workflow = merged.get("workflow")
    stored_associations = merged.get("associations")
    current_associations = normalize_associations(
        stored_associations if stored_associations is not None else merged.get("barcodes", [])
    )
    incoming_associations = normalize_associations(associations)
    seen = {
        (item["request_id"], item["barcode"])
        for item in current_associations
    }
    changed = False
    for association in incoming_associations:
        key = (association["request_id"], association["barcode"])
        if key not in seen:
            seen.add(key)
            current_associations.append(association)
            changed = True

    if stored_associations != current_associations:
        # 历史草稿可能使用 barcodes；写回时统一为 associations。
        merged["associations"] = current_associations
        changed = True
    if "barcodes" in merged:
        merged.pop("barcodes")
        changed = True

    old_whitelist = bool(merged.get("whitelist_required"))
    old_provisioning = bool(merged.get("provisioning_required"))
    new_whitelist = old_whitelist or bool(whitelist_required)
    new_provisioning = old_provisioning or bool(provisioning_required)
    if new_whitelist != old_whitelist:
        merged["whitelist_required"] = new_whitelist
        changed = True
    if new_provisioning != old_provisioning:
        merged["provisioning_required"] = new_provisioning
        changed = True

    existing_company = _trimmed_text(
        merged.get("company_name", merged.get("companyName"))
    )
    incoming_company = _trimmed_text(company_name)
    if not existing_company and incoming_company:
        merged["company_name"] = incoming_company
        changed = True

    if original_workflow is not None:
        merged["workflow"] = original_workflow
    return merged, changed


def _mapping_section(raw: Mapping[str, Any], section_name: str) -> dict[str, Any]:
    direct = raw.get(section_name)
    if isinstance(direct, Mapping):
        return dict(direct)
    expected = section_name.lower()
    for key, value in raw.items():
        if isinstance(key, str) and key.lower() == expected and isinstance(value, Mapping):
            return dict(value)
    return {}


def _first_value(raw: Mapping[str, Any], names: Sequence[str]) -> Any:
    for name in names:
        if name in raw:
            return raw[name]
    names_by_lower = {name.lower() for name in names}
    for key, value in raw.items():
        if isinstance(key, str) and key.lower() in names_by_lower:
            return value
    return None


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, Decimal)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def extract_preconfig_reference(request_item: Mapping[str, Any]) -> dict[str, Any]:
    """兼容历史字段名，提取预配置请求的 WisDM 关联信息。"""

    raw_config = request_item.get("config_data", request_item.get("configData")) or {}
    if isinstance(raw_config, str):
        try:
            raw_config = json.loads(raw_config)
        except (json.JSONDecodeError, TypeError):
            raw_config = {}
    if not isinstance(raw_config, Mapping):
        raw_config = {}

    general = _mapping_section(raw_config, "general")
    system = _mapping_section(raw_config, "system")
    request_id = _trimmed_text(
        request_item.get("request_id", request_item.get("requestId"))
    )
    barcode = normalize_barcode(
        _first_value(general, ("barcode", "BarCode", "barCode", "Barcode", "bar_code"))
    )
    so_number = _trimmed_text(
        _first_value(
            general,
            (
                "orderId",
                "order_id",
                "OrderID",
                "OrderId",
                "soNumber",
                "so_number",
                "SO",
            ),
        )
    )
    company_name = _trimmed_text(
        request_item.get("company_name", request_item.get("companyName"))
        or _first_value(general, ("company", "companyName", "company_name"))
    )
    return {
        "request_id": request_id,
        "barcode": barcode,
        "so_number": so_number,
        "so_number_key": normalize_so_number(so_number),
        "company_name": company_name,
        "whitelist_required": _as_bool(
            _first_value(system, ("wisdmWhitelist", "wisdm_whitelist"))
        ),
        "provisioning_required": _as_bool(
            _first_value(system, ("wisdmConnect", "wisdmProvisioning", "wisdm_connect"))
        ),
    }


def conflicting_barcode_request_ids(
    barcode: Any,
    request_items: Iterable[Mapping[str, Any]],
    *,
    exclude_request_id: Any = "",
) -> list[str]:
    """返回已经占用该 Barcode 的其他预配置请求。空 Barcode 不参与比较。"""

    normalized = normalize_barcode(barcode)
    if not normalized:
        return []
    excluded = _trimmed_text(exclude_request_id)
    owners: list[str] = []
    seen: set[str] = set()
    for request_item in request_items:
        source = extract_preconfig_reference(request_item)
        request_id = source["request_id"]
        if (
            source["barcode"] != normalized
            or not request_id
            or request_id == excluded
            or request_id in seen
        ):
            continue
        seen.add(request_id)
        owners.append(request_id)
    return owners


def build_auto_sync_plan(request_item: Mapping[str, Any]) -> Optional[dict[str, Any]]:
    """从保存后的请求生成单向同步计划；WisDM 主开关不参与判断。"""

    source = extract_preconfig_reference(request_item)
    if (
        not source["request_id"]
        or not source["barcode"]
        or not source["so_number_key"]
        or not (
            source["whitelist_required"]
            or source["provisioning_required"]
        )
    ):
        return None
    return {
        "so_number": source["so_number"],
        "company_name": source["company_name"],
        "associations": [{
            "request_id": source["request_id"],
            "barcode": source["barcode"],
        }],
        "whitelist_required": source["whitelist_required"],
        "provisioning_required": source["provisioning_required"],
    }


def filter_wisdm_records(
    records: Iterable[Mapping[str, Any]],
    *,
    search: Any = "",
    workflow_filter: Any = "ALL",
    preconfig_request_id: Any = "",
    barcode: Any = "",
) -> list[dict[str, Any]]:
    """执行列表所需的组合搜索、状态和来源关联过滤。"""

    normalized_filter = _trimmed_text(workflow_filter).upper() or "ALL"
    valid_filters = {
        "ALL",
        WORKFLOW_CREATED,
        WORKFLOW_WHITELIST_DONE,
        WORKFLOW_PROVISIONING_DONE,
        WORKFLOW_ALL_DONE,
    }
    if normalized_filter not in valid_filters:
        raise WisdmValidationError("Workflow filter is not valid")

    keyword = _trimmed_text(search).casefold()
    expected_request_id = _trimmed_text(preconfig_request_id).casefold()
    expected_barcode = normalize_barcode(barcode)
    result: list[dict[str, Any]] = []
    for raw_record in records:
        record = dict(raw_record)
        if normalized_filter != "ALL" and record.get("workflow") != normalized_filter:
            continue
        associations = normalize_associations(
            record.get("associations", record.get("barcodes", []))
        )
        if expected_request_id and not any(
            item["request_id"].casefold() == expected_request_id
            for item in associations
        ):
            continue
        if expected_barcode and not any(
            item["barcode"] == expected_barcode for item in associations
        ):
            continue
        if keyword:
            searchable = [
                record.get("so_number"),
                record.get("company_name"),
                *record.get("jira_keys", []),
            ]
            for association in associations:
                searchable.extend((association["request_id"], association["barcode"]))
            if not any(keyword in _trimmed_text(value).casefold() for value in searchable):
                continue
        result.append(record)

    result.sort(
        key=lambda item: item.get("created_at") or item.get("updated_at") or "",
        reverse=True,
    )
    return result


def validate_barcode_associations(
    associations: Iterable[Mapping[str, Any]],
    request_loader: Callable[[str], Optional[Mapping[str, Any]]],
) -> ValidatedAssociations:
    """重新加载来源请求并复核 requestId 与 Barcode。"""

    normalized_associations = normalize_associations(associations)
    if not normalized_associations:
        raise WisdmValidationError("At least one barcode association is required")

    company_name = ""
    validated: list[dict[str, str]] = []
    for submitted in normalized_associations:
        request_id = submitted["request_id"]
        request_item = request_loader(request_id)
        if not request_item:
            raise WisdmRequestNotFoundError(
                f"Preconfiguration request {request_id} was not found. Select the barcode again"
            )
        source = extract_preconfig_reference(request_item)
        if source["barcode"] != submitted["barcode"]:
            raise WisdmAssociationMismatchError(
                f"The barcode on preconfiguration request {request_id} has changed. Select it again"
            )
        if not company_name and source["company_name"]:
            company_name = source["company_name"]
        validated.append(submitted)

    return ValidatedAssociations(validated, company_name)


def _barcode_text(value: Any) -> str:
    if isinstance(value, str):
        return normalize_barcode(value)
    if isinstance(value, Mapping):
        return normalize_barcode(value.get("barcode", value.get("Barcode")))
    return ""


def resolve_manual_barcodes(
    barcode_inputs: Iterable[Any],
    request_items: Iterable[Mapping[str, Any]],
) -> ValidatedAssociations:
    """仅用用户输入的 Barcode 匹配唯一的预配置请求。"""

    barcodes: list[str] = []
    seen_barcodes: set[str] = set()
    duplicated: list[str] = []
    for item in barcode_inputs:
        barcode = _barcode_text(item)
        if not barcode:
            continue
        if barcode in seen_barcodes:
            if barcode not in duplicated:
                duplicated.append(barcode)
            continue
        seen_barcodes.add(barcode)
        barcodes.append(barcode)
    if duplicated:
        raise WisdmValidationError(
            f"Barcode {', '.join(duplicated)} is duplicated in this record"
        )
    if not barcodes:
        raise WisdmValidationError("At least one barcode is required")

    matches_by_barcode: dict[str, list[dict[str, Any]]] = {barcode: [] for barcode in barcodes}
    seen_requests: dict[str, set[str]] = {barcode: set() for barcode in barcodes}
    for request_item in request_items:
        source = extract_preconfig_reference(request_item)
        barcode = source["barcode"]
        request_id = source["request_id"]
        if (
            barcode not in matches_by_barcode
            or not request_id
            or request_id in seen_requests[barcode]
        ):
            continue
        seen_requests[barcode].add(request_id)
        matches_by_barcode[barcode].append(source)

    associations: list[dict[str, str]] = []
    company_name = ""
    for barcode in barcodes:
        matches = matches_by_barcode[barcode]
        if not matches:
            raise WisdmRequestNotFoundError(
                f"Barcode {barcode} does not exist on a preconfiguration request"
            )
        if len(matches) > 1:
            request_ids = ", ".join(item["request_id"] for item in matches)
            raise WisdmValidationError(
                f"Barcode {barcode} matches multiple preconfiguration requests: {request_ids}"
            )
        match = matches[0]
        if not company_name and match["company_name"]:
            company_name = match["company_name"]
        associations.append({
            "request_id": match["request_id"],
            "barcode": match["barcode"],
        })
    return ValidatedAssociations(associations, company_name)


def _plain_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, Mapping):
        return {key: _plain_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_plain_value(item) for item in value]
    return value


def _serialize_actor(value: Any, item: Mapping[str, Any], prefix: str) -> Any:
    if isinstance(value, Mapping):
        return {
            "id": _plain_value(value.get("id")),
            "name": value.get("name") or "",
            "email": value.get("email") or "",
        }
    actor_id = value if value is not None else item.get(f"{prefix}_id")
    actor_name = item.get(f"{prefix}_name")
    actor_email = item.get(f"{prefix}_email")
    if actor_id is None and not actor_name and not actor_email:
        return None
    return {
        "id": _plain_value(actor_id),
        "name": actor_name or "",
        "email": actor_email or "",
    }


def serialize_wisdm_record(
    record: Mapping[str, Any],
    *,
    can_edit_content: bool,
    can_update_workflow: bool,
    can_delete: bool = False,
) -> dict[str, Any]:
    """把存储字段统一转换为前端使用的 camelCase 结构。"""

    associations = normalize_associations(
        record.get("associations", record.get("barcodes", []))
    )
    whitelist_required = bool(record.get("whitelist_required"))
    provisioning_required = bool(record.get("provisioning_required"))
    result = {
        "recordId": record.get("record_id") or "",
        "soNumber": record.get("so_number") or "",
        "companyName": record.get("company_name") or "",
        "barcodes": [
            {"requestId": item["request_id"], "barcode": item["barcode"]}
            for item in associations
        ],
        "whitelistRequired": whitelist_required,
        "provisioningRequired": provisioning_required,
        "jiraKeys": normalize_jira_keys(record.get("jira_keys")),
        "workflow": record.get("workflow") or WORKFLOW_CREATED,
        "notes": record.get("notes") or "",
        "sourceType": record.get("source_type") or "manual",
        "createdBy": _serialize_actor(record.get("created_by"), record, "created_by"),
        "updatedBy": _serialize_actor(record.get("updated_by"), record, "updated_by"),
        "createdAt": record.get("created_at"),
        "updatedAt": record.get("updated_at"),
        "version": _plain_value(record.get("version", 1)),
        "allowedWorkflows": list(
            allowed_workflows(whitelist_required, provisioning_required)
        ),
        "permissions": {
            "canEditContent": bool(can_edit_content),
            "canUpdateWorkflow": bool(can_update_workflow),
            "canDelete": bool(can_delete),
        },
    }
    return _plain_value(result)


def serialize_wisdm_history(event: Mapping[str, Any]) -> dict[str, Any]:
    actor = _serialize_actor(event.get("actor"), event, "actor")
    return _plain_value({
        "eventKey": event.get("event_key") or "",
        "eventType": event.get("event_type") or "",
        "previousWorkflow": event.get("previous_workflow"),
        "newWorkflow": event.get("new_workflow"),
        "reason": event.get("reason") or "",
        "actor": actor,
        "createdAt": event.get("created_at"),
    })


def serialize_wisdm_record_list(
    records: Iterable[Mapping[str, Any]],
    permission_resolver: Callable[[Mapping[str, Any]], tuple[bool, bool, bool]],
) -> dict[str, Any]:
    serialized = []
    for record in records:
        can_edit_content, can_update_workflow, can_delete = permission_resolver(record)
        serialized.append(serialize_wisdm_record(
            record,
            can_edit_content=can_edit_content,
            can_update_workflow=can_update_workflow,
            can_delete=can_delete,
        ))
    return {"records": serialized}


def serialize_wisdm_record_detail(
    record: Mapping[str, Any],
    history: Iterable[Mapping[str, Any]],
    *,
    can_edit_content: bool,
    can_update_workflow: bool,
    can_delete: bool = False,
) -> dict[str, Any]:
    result = serialize_wisdm_record(
        record,
        can_edit_content=can_edit_content,
        can_update_workflow=can_update_workflow,
        can_delete=can_delete,
    )
    result["history"] = [serialize_wisdm_history(event) for event in history]
    return result
