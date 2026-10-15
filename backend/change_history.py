"""配置变更历史的差异计算、脱敏和操作者解析。"""

from datetime import datetime
from decimal import Decimal
import re
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple


# 敏感数据不能显示：密码、Token、API Key、Secret、私钥等只记录字段已变化，不保存原值和新值。
REDACTED_VALUE = "[REDACTED]"
# 正文或大段原始内容不入库：Base64、二进制、证书正文、PEM、文件正文等只表明内容已变更。
CONTENT_OMITTED_VALUE = "[CONTENT OMITTED]"
UNKNOWN_NAME = "Unknown User"
UNKNOWN_EMAIL = "unknown@example.com"

_MISSING = object()
_SENSITIVE_NAMES = {
    "password",
    "passwd",
    "passphrase",
    "secret",
    "secretkey",
    "secretaccesskey",
    "token",
    "accesstoken",
    "refreshtoken",
    "admintoken",
    "clienttoken",
    "apikey",
    "privatekey",
}
_RAW_CONTENT_NAMES = {
    "base64",
    "binary",
    "filecontent",
    "rawcontent",
    "certificatecontent",
    "certificatebody",
    "certbody",
    "pem",
    "privatekeycontent",
}
_FILE_COLLECTION_NAMES = {
    "extensionfiles",
    "configfiles",
    "certificatefiles",
    "certificates",
}
_DERIVED_FILE_METADATA_NAMES = {
    "configfilenames",
    "configfilesizes",
    "extensionfilenames",
    "extensionfilesizes",
}


def _normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def normalize_config_value(value: Any) -> Any:
    """将数据库值转换为稳定、可 JSON 序列化的普通 Python 值。"""
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, Mapping):
        return {
            str(key): normalize_config_value(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [normalize_config_value(item) for item in value]
    return value


def _comparison_value(value: Any) -> Any:
    if value is _MISSING or value is None or value == "":
        return None
    return normalize_config_value(value)


def _display_value(value: Any) -> Any:
    if value is _MISSING or value is None or value == "":
        return None
    return normalize_config_value(value)


def _path_segments(path: str) -> List[str]:
    return [_normalized_name(segment) for segment in path.split(".") if segment]


def is_sensitive_path(path: str) -> bool:
    return any(segment in _SENSITIVE_NAMES for segment in _path_segments(path))


def is_raw_content_path(path: str) -> bool:
    return any(segment in _RAW_CONTENT_NAMES for segment in _path_segments(path))


def is_file_metadata_path(path: str) -> bool:
    segments = _path_segments(path)
    if not segments:
        return False
    last = segments[-1]
    return (
        last in _FILE_COLLECTION_NAMES
        or "certificate" in last
        or last.endswith("file")
        or last.endswith("files")
    )


def is_derived_file_metadata_path(path: str) -> bool:
    segments = _path_segments(path)
    return bool(segments) and segments[-1] in _DERIVED_FILE_METADATA_NAMES


def _file_name(item: Mapping[str, Any]) -> Optional[str]:
    for key in ("name", "fileName", "filename", "originalName", "original_name"):
        value = item.get(key)
        if value not in (None, ""):
            return str(value)
    return None


def _file_size(item: Mapping[str, Any]) -> Optional[Any]:
    for key in ("size", "fileSize", "file_size"):
        value = item.get(key)
        if value not in (None, ""):
            return normalize_config_value(value)
    return None


def summarize_file_metadata(value: Any) -> Dict[str, Any]:
    """仅保留文件名称、数量和大小，不保留 ID 或正文。"""
    normalized = normalize_config_value(value)
    if normalized in (None, ""):
        items: List[Any] = []
    elif isinstance(normalized, list):
        items = normalized
    else:
        items = [normalized]

    files: List[Dict[str, Any]] = []
    total_size = 0
    has_numeric_size = False
    for item in items:
        entry: Dict[str, Any] = {}
        if isinstance(item, Mapping):
            name = _file_name(item)
            size = _file_size(item)
            if name:
                entry["name"] = name
            if size is not None:
                entry["size"] = size
                if isinstance(size, (int, float)) and not isinstance(size, bool):
                    total_size += size
                    has_numeric_size = True
        elif item not in (None, ""):
            entry["name"] = str(item)
        if entry:
            files.append(entry)

    summary: Dict[str, Any] = {"count": len(items), "files": files}
    if has_numeric_size:
        summary["totalSize"] = total_size
    return summary


def _safe_history_value(path: str, value: Any) -> Any:
    if is_sensitive_path(path):
        return REDACTED_VALUE
    if is_raw_content_path(path):
        return CONTENT_OMITTED_VALUE
    if is_file_metadata_path(path):
        return summarize_file_metadata(value)
    return _display_value(value)


def compute_config_changes(old_value: Any, new_value: Any) -> List[Dict[str, Any]]:
    """递归计算配置差异；数组按整个字段比较。"""
    changes: List[Dict[str, Any]] = []

    def walk(old: Any, new: Any, path: str) -> None:
        old_normalized = normalize_config_value(old) if old is not _MISSING else _MISSING
        new_normalized = normalize_config_value(new) if new is not _MISSING else _MISSING

        if _comparison_value(old_normalized) == _comparison_value(new_normalized):
            return

        if path and (is_sensitive_path(path) or is_raw_content_path(path)):
            changes.append({
                "field": path,
                "from": _safe_history_value(path, old_normalized),
                "to": _safe_history_value(path, new_normalized),
            })
            return

        if path and is_file_metadata_path(path):
            old_summary = summarize_file_metadata(old_normalized)
            new_summary = summarize_file_metadata(new_normalized)
            if old_summary == new_summary:
                return
            changes.append({"field": path, "from": old_summary, "to": new_summary})
            return

        if path and (
            isinstance(old_normalized, list)
            or isinstance(new_normalized, list)
        ):
            changes.append({
                "field": path,
                "from": _safe_history_value(path, old_normalized),
                "to": _safe_history_value(path, new_normalized),
            })
            return

        if isinstance(old_normalized, Mapping) or isinstance(new_normalized, Mapping):
            old_dict = old_normalized if isinstance(old_normalized, Mapping) else {}
            new_dict = new_normalized if isinstance(new_normalized, Mapping) else {}
            for key in sorted(set(old_dict) | set(new_dict)):
                child_path = f"{path}.{key}" if path else str(key)
                walk(old_dict.get(key, _MISSING), new_dict.get(key, _MISSING), child_path)
            return

        if path:
            changes.append({
                "field": path,
                "from": _safe_history_value(path, old_normalized),
                "to": _safe_history_value(path, new_normalized),
            })

    walk(old_value, new_value, "")
    return coalesce_history_file_changes(changes)


def coalesce_history_file_changes(changes: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """过滤文件名和大小派生字段，仅保留包含完整摘要的文件集合变化。"""
    return [
        dict(change)
        for change in changes
        if not is_derived_file_metadata_path(str(change.get("field") or ""))
    ]


def build_activity_data(
    request_id: str,
    current_user: Mapping[str, Any],
    activity_type: str,
    description: str,
    *,
    created_at: Optional[str] = None,
    changes: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """仅从认证用户生成活动操作者快照。"""
    actor_name = str(current_user.get("name") or "").strip()
    actor_email = str(current_user.get("email") or "").strip()
    activity: Dict[str, Any] = {
        "request_id": request_id,
        "user_id": current_user.get("id"),
        "activity_type": activity_type,
        "description": description,
        "created_at": created_at or datetime.now().isoformat(),
        "actor_name": actor_name,
        "actor_email": actor_email,
    }
    if changes:
        activity["changes"] = changes
    return activity


def build_configuration_change_activity(
    request_id: str,
    old_config: Any,
    request_data: Mapping[str, Any],
    current_user: Mapping[str, Any],
) -> Optional[Dict[str, Any]]:
    """根据数据库旧配置和本次提交构建单条配置变更活动。"""
    if "configData" not in request_data:
        return None
    changes = compute_config_changes(old_config or {}, request_data.get("configData") or {})
    if not changes:
        return None
    operator_name = current_user.get("name") or current_user.get("email") or "Unknown"
    return build_activity_data(
        request_id,
        current_user,
        "configuration_changed",
        f"{operator_name} updated configuration of request {request_id}",
        changes=changes,
    )


def _valid_name(value: Any) -> str:
    candidate = str(value or "").strip()
    if candidate.lower() in {"unknown", "unknown user"}:
        return ""
    return candidate


def _valid_email(value: Any) -> str:
    candidate = str(value or "").strip()
    if candidate.lower() == UNKNOWN_EMAIL or "@" not in candidate:
        return ""
    return candidate


def parse_legacy_actor(activity_type: str, description: str) -> str:
    patterns = {
        "created": r"^Request created by (?P<actor>.+?) for ",
        "status_changed": r"^(?P<actor>.+?) updated workflow process of request ",
        "status_change": r"^(?P<actor>.+?) updated workflow process of request ",
        "assigned": r"^(?P<actor>.+?) assigned request ",
        "unassigned": r"^(?P<actor>.+?) unassigned (?:request |this request)",
    }
    pattern = patterns.get(str(activity_type or "").lower())
    if not pattern:
        return ""
    match = re.match(pattern, str(description or "").strip())
    return match.group("actor").strip() if match else ""


def _find_user(users_by_id: Mapping[Any, Mapping[str, Any]], user_id: Any) -> Optional[Mapping[str, Any]]:
    candidates: Iterable[Any] = (user_id, str(user_id))
    if user_id is not None:
        try:
            candidates = (user_id, str(user_id), int(user_id))
        except (TypeError, ValueError):
            pass
    for candidate in candidates:
        if candidate in users_by_id:
            return users_by_id[candidate]
    return None


def resolve_activity_author(
    activity: Mapping[str, Any],
    users_by_id: Mapping[Any, Mapping[str, Any]],
) -> Tuple[str, str]:
    """按快照、批量用户关联、受控旧描述的顺序解析操作者。"""
    snapshot_name = _valid_name(activity.get("actor_name"))
    snapshot_email = _valid_email(activity.get("actor_email"))
    if snapshot_name or snapshot_email:
        return snapshot_name or snapshot_email, snapshot_email or UNKNOWN_EMAIL

    user = _find_user(users_by_id, activity.get("user_id"))
    if user:
        user_name = _valid_name(user.get("name"))
        user_email = _valid_email(user.get("email"))
        if user_name or user_email:
            return user_name or user_email, user_email or UNKNOWN_EMAIL

    parsed_actor = parse_legacy_actor(
        str(activity.get("activity_type") or ""),
        str(activity.get("description") or ""),
    )
    if parsed_actor:
        parsed_email = _valid_email(parsed_actor)
        return parsed_actor, parsed_email or UNKNOWN_EMAIL

    return UNKNOWN_NAME, UNKNOWN_EMAIL


def serialize_activity_for_api(
    activity: Mapping[str, Any],
    users_by_id: Mapping[Any, Mapping[str, Any]],
) -> Dict[str, Any]:
    """转换为现有 Activities API 的兼容响应，并仅追加可选 changes。"""
    author_name, author_email = resolve_activity_author(activity, users_by_id)
    result: Dict[str, Any] = {
        "id": activity.get("id") or activity.get("created_at"),
        "activityType": activity.get("activity_type", ""),
        "description": activity.get("description", ""),
        "createdAt": activity.get("created_at", ""),
        "authorName": author_name,
        "authorEmail": author_email,
    }
    changes = activity.get("changes")
    if isinstance(changes, list) and changes:
        result["changes"] = coalesce_history_file_changes(changes)
    return result
