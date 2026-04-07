import json
import uuid
import os
import shutil
import asyncio
import threading
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Any, Optional, List
import hashlib
import jwt
from dynamodb_client import db_client
from urllib import request as urllib_request
from urllib import parse as urllib_parse
from urllib.error import HTTPError, URLError

app = FastAPI(title="Auth Prototype API", version="1.0.0")

# CORS配置 - 支持局域网访问
# 定义允许的来源列表
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://0.0.0.0:3000",
    # 支持局域网IP访问
    "http://192.168.0.0/16",
    "http://10.0.0.0/8",
    "http://172.16.0.0/12",
    # 支持所有本地网络
    "*"  # 允许所有来源，支持局域网访问
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # 预检请求缓存1小时
)

# 添加CORS调试中间件
@app.middleware("http")
async def cors_debug_middleware(request, call_next):
    # 记录请求信息
    origin = request.headers.get("origin")
    method = request.method
    path = request.url.path
    
    print(f"🌐 CORS请求: {method} {path}")
    print(f"📍 来源: {origin}")
    print(f"🔧 允许的来源: {allowed_origins}")
    
    # 处理OPTIONS预检请求
    if method == "OPTIONS":
        print("✅ 处理OPTIONS预检请求")
        from fastapi.responses import Response
        
        # 确定正确的Origin
        if origin is None or origin == "null":
            host = request.headers.get("host", "localhost:3000")
            if ":" in host:
                allow_origin = f"http://{host}"
            else:
                allow_origin = f"http://{host}:3000"
        else:
            allow_origin = origin
        
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": allow_origin,
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "3600"
            }
        )
    
    response = await call_next(request)
    
    # 添加CORS头部 - 处理Origin为None的情况
    if origin is None or origin == "null":
        # 当Origin为None时，使用请求的Host作为Origin
        host = request.headers.get("host", "localhost:3000")
        if ":" in host:
            response.headers["Access-Control-Allow-Origin"] = f"http://{host}"
        else:
            response.headers["Access-Control-Allow-Origin"] = f"http://{host}:3000"
    else:
        response.headers["Access-Control-Allow-Origin"] = origin
    
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    
    print(f"✅ CORS响应已添加头部")
    return response

# DynamoDB 已通过 dynamodb_client 配置，无需数据库文件路径

# JWT配置
JWT_SECRET = "your-secret-key-change-in-production"
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# 文件存储目录（使用绝对路径）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# 数据模型
class UserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class CommentCreate(BaseModel):
    content: str
    attachments: Optional[List[str]] = []  # 文件ID列表

class ActivityCreate(BaseModel):
    activity_type: str
    description: str

class RequestCreate(BaseModel):
    companyName: str
    rakId: str
    configData: dict
    changes: dict
    originalConfig: dict
    tags: Optional[List[dict]] = []

class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = "Custom"
    configData: dict
    variables: Optional[List[dict]] = []
    tags: Optional[List[str]] = []
    isPublic: Optional[bool] = False

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    configData: Optional[dict] = None
    variables: Optional[List[dict]] = None
    tags: Optional[List[str]] = None
    isPublic: Optional[bool] = None

# 简单的密码哈希（仅用于演示）
def get_password_hash(password: str) -> str:
    """简单的密码哈希，仅用于演示"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    # 使用SHA256哈希验证
    import hashlib
    return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password

def create_access_token(data: dict) -> str:
    """创建JWT令牌"""
    to_encode = data.copy()
    expire = datetime.utcnow().replace(microsecond=0) + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """验证JWT令牌"""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"email": email}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def build_config_id(customer_id: str, request_id: str, pid: str, barcode: str, order_id: str, status_value: str) -> str:
    """按约定顺序生成 config_id。"""
    parts = [customer_id or "", request_id or "", pid or "", barcode or "", order_id or "", status_value or ""]
    return "_".join(str(part).strip() for part in parts)


# ===== 外部系统同步（bind_config）配置与逻辑 =====
# 取 token：可与 bind 不同 API Gateway；兼容旧变量 EXTERNAL_API_BASE
EXTERNAL_AUTH_API_BASE = os.getenv(
    "EXTERNAL_AUTH_API_BASE",
    os.getenv("EXTERNAL_API_BASE", "https://x9sz8zg9kf.execute-api.eu-central-1.amazonaws.com/prod"),
)
# 绑定 config（外部正式提供的端点所在网关）
EXTERNAL_BIND_API_BASE = os.getenv(
    "EXTERNAL_BIND_API_BASE",
    "https://0xw5pzyzsa.execute-api.eu-central-1.amazonaws.com/prod",
)
EXTERNAL_BIND_PATH = os.getenv("EXTERNAL_BIND_PATH", "/v1/cust_req/bind_config")
EXTERNAL_AUTH_PATH = os.getenv("EXTERNAL_AUTH_PATH", "/v1/auth")
EXTERNAL_SERVICE_USERNAME = os.getenv("EXTERNAL_SERVICE_USERNAME", "")
EXTERNAL_SERVICE_PASSWORD = os.getenv("EXTERNAL_SERVICE_PASSWORD", "")

# 同步重试策略
EXTERNAL_SYNC_MAX_ATTEMPTS = int(os.getenv("EXTERNAL_SYNC_MAX_ATTEMPTS", "10"))
EXTERNAL_SYNC_MIN_RETRY_SECONDS = int(os.getenv("EXTERNAL_SYNC_MIN_RETRY_SECONDS", "60"))
EXTERNAL_SYNC_LOOP_SECONDS = int(os.getenv("EXTERNAL_SYNC_LOOP_SECONDS", "60"))
EXTERNAL_SYNC_HTTP_TIMEOUT = int(os.getenv("EXTERNAL_SYNC_HTTP_TIMEOUT", "20"))

# 内存 token 缓存（24h 有效期，取 23h 作为安全刷新窗口）
_external_token_lock = threading.Lock()
_external_token_cache: dict = {"token": None, "fetched_at": None}


def _utcnow() -> datetime:
    return datetime.utcnow().replace(microsecond=0)


def _parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        # 支持 "2026-03-27T10:53:59" 这类格式
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _compute_next_retry_at(attempts: int, retry_after_seconds: Optional[int] = None) -> str:
    # 最小 60s；指数退避：60, 120, 240, 480... 上限 3600s
    backoff = min(3600, EXTERNAL_SYNC_MIN_RETRY_SECONDS * (2 ** max(0, attempts - 1)))
    if retry_after_seconds is not None:
        backoff = max(backoff, int(retry_after_seconds))
    return (_utcnow() + timedelta(seconds=backoff)).isoformat()


def _http_json(method: str, url: str, headers: dict, body: Optional[dict] = None) -> tuple[int, str, Optional[dict], dict]:
    """
    返回: (http_status, raw_text, json_obj_or_none, response_headers)
    """
    data_bytes = None
    if body is not None:
        data_bytes = json.dumps(body).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
    req = urllib_request.Request(url=url, data=data_bytes, method=method, headers=headers)
    try:
        with urllib_request.urlopen(req, timeout=EXTERNAL_SYNC_HTTP_TIMEOUT) as resp:
            status_code = getattr(resp, "status", resp.getcode())
            resp_headers = dict(resp.headers.items())
            raw = resp.read().decode("utf-8") if status_code != 204 else ""
            try:
                obj = json.loads(raw) if raw else None
            except Exception:
                obj = None
            return status_code, raw, obj, resp_headers
    except HTTPError as e:
        status_code = e.code
        resp_headers = dict(e.headers.items()) if e.headers else {}
        raw = ""
        try:
            raw = e.read().decode("utf-8")
        except Exception:
            raw = ""
        try:
            obj = json.loads(raw) if raw else None
        except Exception:
            obj = None
        return status_code, raw, obj, resp_headers
    except (URLError, TimeoutError) as e:
        # 网络/超时
        return 0, str(e), None, {}


def _external_get_token(force_refresh: bool = False) -> Optional[str]:
    if not EXTERNAL_SERVICE_USERNAME or not EXTERNAL_SERVICE_PASSWORD:
        return None

    with _external_token_lock:
        token = _external_token_cache.get("token")
        fetched_at = _external_token_cache.get("fetched_at")
        if not force_refresh and token and fetched_at:
            age = _utcnow() - fetched_at
            # 24h 有效期，23h 刷新
            if age < timedelta(hours=23):
                return token

        url = f"{EXTERNAL_AUTH_API_BASE}{EXTERNAL_AUTH_PATH}"
        status_code, raw, obj, _ = _http_json(
            method="POST",
            url=url,
            headers={},
            body={"username": EXTERNAL_SERVICE_USERNAME, "password": EXTERNAL_SERVICE_PASSWORD},
        )
        if status_code == 200 and isinstance(obj, dict) and obj.get("success") is True and obj.get("token"):
            token = str(obj["token"])
            _external_token_cache["token"] = token
            _external_token_cache["fetched_at"] = _utcnow()
            return token

        # 获取 token 失败，清空缓存
        _external_token_cache["token"] = None
        _external_token_cache["fetched_at"] = None
        return None


def _external_bind_config(config_id: str, customization_id: str) -> dict:
    """
    调用外部 POST /v1/cust_req/bind_config
    返回结构:
    {
      ok: bool,
      http_status: int,
      retryable: bool,
      next_retry_after: Optional[int],
      error_code: Optional[str],
      message: str
    }
    """
    token = _external_get_token(force_refresh=False)
    if not token:
        return {
            "ok": False,
            "http_status": 0,
            "retryable": True,
            "next_retry_after": EXTERNAL_SYNC_MIN_RETRY_SECONDS,
            "error_code": "NO_TOKEN",
            "message": "No external token available (missing creds or auth failed)",
        }

    query = urllib_parse.urlencode({"username": EXTERNAL_SERVICE_USERNAME, "token": token})
    url = f"{EXTERNAL_BIND_API_BASE}{EXTERNAL_BIND_PATH}?{query}"
    headers = {"Authorization": f"Bearer {token}"}
    body = {"config_id": config_id, "customization_id": customization_id}

    status_code, raw, obj, resp_headers = _http_json(method="POST", url=url, headers=headers, body=body)

    # 成功：200 且 success=true，或 204
    if status_code == 204:
        return {"ok": True, "http_status": 204, "retryable": False, "next_retry_after": None, "error_code": None, "message": "No Content"}
    if status_code == 200 and isinstance(obj, dict) and obj.get("success") is True:
        return {"ok": True, "http_status": 200, "retryable": False, "next_retry_after": None, "error_code": None, "message": str(obj.get("message", ""))}

    # 401：先刷新 token 再重试一次
    if status_code == 401:
        refreshed = _external_get_token(force_refresh=True)
        if refreshed:
            query = urllib_parse.urlencode({"username": EXTERNAL_SERVICE_USERNAME, "token": refreshed})
            url = f"{EXTERNAL_BIND_API_BASE}{EXTERNAL_BIND_PATH}?{query}"
            headers = {"Authorization": f"Bearer {refreshed}"}
            status_code2, raw2, obj2, resp_headers2 = _http_json(method="POST", url=url, headers=headers, body=body)
            if status_code2 == 204:
                return {"ok": True, "http_status": 204, "retryable": False, "next_retry_after": None, "error_code": None, "message": "No Content"}
            if status_code2 == 200 and isinstance(obj2, dict) and obj2.get("success") is True:
                return {"ok": True, "http_status": 200, "retryable": False, "next_retry_after": None, "error_code": None, "message": str(obj2.get("message", ""))}
            # 刷新后仍失败，视为不可自动恢复
            code = obj2.get("error_code") if isinstance(obj2, dict) else None
            msg = obj2.get("message") if isinstance(obj2, dict) else (raw2 or "Unauthorized after refresh")
            return {"ok": False, "http_status": status_code2, "retryable": False, "next_retry_after": None, "error_code": code or "UNAUTHORIZED", "message": str(msg)}

        return {"ok": False, "http_status": 401, "retryable": False, "next_retry_after": None, "error_code": "UNAUTHORIZED", "message": "Unauthorized and token refresh failed"}

    # 403：不重试
    if status_code == 403:
        code = obj.get("error_code") if isinstance(obj, dict) else None
        msg = obj.get("message") if isinstance(obj, dict) else (raw or "Forbidden")
        return {"ok": False, "http_status": 403, "retryable": False, "next_retry_after": None, "error_code": code or "FORBIDDEN", "message": str(msg)}

    # 400：不重试
    if status_code == 400:
        code = obj.get("error_code") if isinstance(obj, dict) else None
        msg = obj.get("message") if isinstance(obj, dict) else (raw or "Bad Request")
        return {"ok": False, "http_status": 400, "retryable": False, "next_retry_after": None, "error_code": code or "BAD_REQUEST", "message": str(msg)}

    # 404：不重试（或最多重试一次：由上层 attempts 控制）
    if status_code == 404:
        code = obj.get("error_code") if isinstance(obj, dict) else None
        msg = obj.get("message") if isinstance(obj, dict) else (raw or "Not Found")
        return {"ok": False, "http_status": 404, "retryable": False, "next_retry_after": None, "error_code": code or "INVALID_CUSTOMIZATION_ID", "message": str(msg)}

    # 409：不重试
    if status_code == 409:
        code = obj.get("error_code") if isinstance(obj, dict) else None
        msg = obj.get("message") if isinstance(obj, dict) else (raw or "Conflict")
        return {"ok": False, "http_status": 409, "retryable": False, "next_retry_after": None, "error_code": code or "CONFIG_ID_CONFLICT", "message": str(msg)}

    # 429：重试，遵循 Retry-After（秒）
    if status_code == 429:
        retry_after = resp_headers.get("Retry-After") or resp_headers.get("retry-after")
        retry_after_seconds = int(retry_after) if retry_after and str(retry_after).isdigit() else EXTERNAL_SYNC_MIN_RETRY_SECONDS
        code = obj.get("error_code") if isinstance(obj, dict) else None
        msg = obj.get("message") if isinstance(obj, dict) else (raw or "Rate limited")
        return {"ok": False, "http_status": 429, "retryable": True, "next_retry_after": retry_after_seconds, "error_code": code or "RATE_LIMITED", "message": str(msg)}

    # 5xx / 网络错误：重试
    if status_code == 0 or status_code >= 500:
        msg = obj.get("message") if isinstance(obj, dict) else (raw or "Server error")
        return {"ok": False, "http_status": status_code, "retryable": True, "next_retry_after": EXTERNAL_SYNC_MIN_RETRY_SECONDS, "error_code": None, "message": str(msg)}

    # 其他 4xx：默认不重试
    msg = obj.get("message") if isinstance(obj, dict) else (raw or f"HTTP {status_code}")
    code = obj.get("error_code") if isinstance(obj, dict) else None
    return {"ok": False, "http_status": status_code, "retryable": False, "next_retry_after": None, "error_code": code, "message": str(msg)}


def _extract_customization_id(request_item: dict, incoming_config_data: Optional[dict] = None) -> str:
    existing_config = request_item.get("config_data") or {}
    general = {}
    if isinstance(existing_config, dict):
        general.update(existing_config.get("general") or {})
    if incoming_config_data and isinstance(incoming_config_data, dict):
        general.update(incoming_config_data.get("general") or {})
    return str(general.get("customizationId") or "").strip()


async def external_sync_retry_loop():
    """轻量后台重试循环：扫描失败记录并重试。"""
    # 若未配置外部服务账号，直接不启用循环
    if not EXTERNAL_SERVICE_USERNAME or not EXTERNAL_SERVICE_PASSWORD:
        print("⚠️ External sync retry loop disabled (missing EXTERNAL_SERVICE_USERNAME/EXTERNAL_SERVICE_PASSWORD)")
        return

    print(f"✅ External sync retry loop started (interval={EXTERNAL_SYNC_LOOP_SECONDS}s)")
    while True:
        try:
            all_requests = db_client.scan_all_requests()
            now = _utcnow()
            for req in all_requests or []:
                status_value = str(req.get("external_sync_status") or "").lower()
                if status_value not in ("failed", "pending"):
                    continue
                attempts = int(req.get("external_sync_attempts") or 0)
                if attempts >= EXTERNAL_SYNC_MAX_ATTEMPTS:
                    continue
                next_retry_at = _parse_iso_datetime(req.get("external_sync_next_retry_at") or "")
                if next_retry_at and next_retry_at > now:
                    continue

                request_id = req.get("request_id")
                config_id = req.get("config_id") or ""
                customization_id = _extract_customization_id(req)
                if not request_id or not config_id or not customization_id:
                    # 数据不完整：标记永久失败
                    db_client.update_request(
                        request_id,
                        {
                            "external_sync_status": "permanent_failed",
                            "external_sync_last_error": "Missing request_id/config_id/customization_id",
                            "external_sync_last_http_status": 0,
                            "external_sync_attempts": attempts,
                            "external_sync_next_retry_at": "",
                        },
                    )
                    continue

                result = _external_bind_config(config_id=config_id, customization_id=customization_id)

                if result["ok"]:
                    db_client.update_request(
                        request_id,
                        {
                            "external_sync_status": "success",
                            "external_sync_last_error": "",
                            "external_sync_last_http_status": int(result["http_status"] or 0),
                            "external_sync_attempts": attempts,
                            "external_sync_next_retry_at": "",
                        },
                    )
                else:
                    # 404：不重试（或最多 1 次）
                    http_status = int(result["http_status"] or 0)
                    retryable = bool(result.get("retryable", False))
                    if http_status == 404 and attempts >= 1:
                        retryable = False

                    new_attempts = attempts + 1
                    if retryable and new_attempts < EXTERNAL_SYNC_MAX_ATTEMPTS:
                        next_retry_at_str = _compute_next_retry_at(new_attempts, result.get("next_retry_after"))
                        new_status = "failed"
                    else:
                        next_retry_at_str = ""
                        new_status = "permanent_failed"

                    db_client.update_request(
                        request_id,
                        {
                            "external_sync_status": new_status,
                            "external_sync_last_error": str(result.get("message") or ""),
                            "external_sync_last_http_status": http_status,
                            "external_sync_attempts": new_attempts,
                            "external_sync_next_retry_at": next_retry_at_str,
                        },
                    )
        except Exception as e:
            print(f"❌ External sync retry loop error: {e}")

        await asyncio.sleep(EXTERNAL_SYNC_LOOP_SECONDS)


@app.on_event("startup")
async def _startup_tasks():
    # 启动后台重试循环
    asyncio.create_task(external_sync_retry_loop())

def init_database():
    """初始化 DynamoDB：确保默认 admin 用户存在"""
    admin_user_email = "admin@rakwireless.com"
    admin_user_password = "rakwireless"
    admin_user_name = "Admin"
    
    # 检查 admin 用户是否已存在
    existing_admin = db_client.get_user_by_email(admin_user_email)
    
    if not existing_admin:
        # 创建 admin 用户
        password_hash = get_password_hash(admin_user_password)
        # 生成一个唯一的 ID（DynamoDB 不需要自增，我们使用时间戳+随机数）
        user_id = int(datetime.now().timestamp() * 1000) % 2147483647  # 限制在 int 范围内
        
        user_data = {
            'id': user_id,
            'email': admin_user_email,
            'password_hash': password_hash,
            'name': admin_user_name,
            'created_at': datetime.now().isoformat(),
            'is_active': True,
            'role': 'admin'
        }
        
        if db_client.create_user(user_data):
            print(f"✅ Created admin user: {admin_user_email}")
        else:
            print(f"❌ Failed to create admin user: {admin_user_email}")
    else:
        # 更新现有用户为 admin 角色，并更新密码
        password_hash = get_password_hash(admin_user_password)
        update_data = {
            'role': 'admin',
            'password_hash': password_hash,
            'name': admin_user_name
        }
        
        if db_client.update_user(admin_user_email, update_data):
            print(f"✅ Updated admin user: {admin_user_email} (role: admin, password updated)")
        else:
            print(f"❌ Failed to update admin user: {admin_user_email}")

# 权限管理函数
def get_user_role(email: str, db_role: str = None) -> str:
    """
    获取用户角色
    优先级：数据库 role > 邮箱自动判断
    """
    # 如果数据库中有明确的角色设置，使用数据库值
    if db_role and db_role in ['user', 'rakwireless', 'admin']:
        return db_role
    
    # 否则基于邮箱自动判断
    if email and email.lower().endswith("@rakwireless.com"):
        return "rakwireless"
    
    return "user"

def is_admin(user_role: str) -> bool:
    """检查是否是管理员"""
    return user_role == "admin"

def is_rakwireless(user_role: str) -> bool:
    """检查是否是 RAK Wireless 员工（包括 admin）"""
    return user_role in ["rakwireless", "admin"]

def can_view_all(user_role: str) -> bool:
    """是否可以查看所有请求"""
    return user_role in ["rakwireless", "admin"]

def can_delete_any(user_role: str) -> bool:
    """是否可以删除任何请求（仅 Admin）"""
    return user_role == "admin"

def can_manage_users(user_role: str) -> bool:
    """是否可以管理用户（仅 Admin）"""
    return user_role == "admin"

# 向后兼容：保留原有函数
def is_rakwireless_user(email: str) -> bool:
    """检查用户是否是rakwireless.com用户（向后兼容）"""
    if not email:
        return False
    return email.lower().endswith("@rakwireless.com")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """获取当前用户"""
    try:
        print(f"=== JWT Token Verification ===")
        print(f"Token: {credentials.credentials[:50]}...")
        print(f"Token length: {len(credentials.credentials)}")
        print(f"JWT Secret: {JWT_SECRET}")
        print(f"JWT Algorithm: {JWT_ALGORITHM}")
        
        # 验证JWT token
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        print(f"Decoded payload: {payload}")
        
        email: str = payload.get("sub")
        if email is None:
            print("❌ No 'sub' field in token")
            raise HTTPException(status_code=401, detail="Invalid token")
        
        print(f"✅ Token verified for email: {email}")
        
        # 从 DynamoDB 获取用户信息
        user = db_client.get_user_by_email(email)
        
        if not user:
            print(f"❌ User not found in database: {email}")
            raise HTTPException(status_code=401, detail="User not found")
        
        print(f"✅ User found: {user}")
        user_dict = {
            "id": user.get("id"),
            "email": user.get("email"), 
            "name": user.get("name"),
            "role": user.get("role")
        }
        # 获取用户角色（优先使用数据库值，否则基于邮箱判断）
        user_role = get_user_role(user.get("email", ""), user_dict.get("role"))
        user_dict["role"] = user_role
        
        # 向后兼容：保留 is_rakwireless 标识
        user_dict["is_rakwireless"] = is_rakwireless(user_role)
        return user_dict
    except jwt.ExpiredSignatureError:
        print("❌ Token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        print(f"❌ Invalid token: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=401, detail="Authentication failed")

@app.post("/api/auth/login")
async def login(user_data: UserLogin):
    """用户登录"""
    try:
        # 从 DynamoDB 查找用户
        user = db_client.get_user_by_email(user_data.email)
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        user_id = user.get("id")
        email = user.get("email")
        password_hash = user.get("password_hash")
        name = user.get("name")
        
        # 验证密码
        print(f"Login attempt: email={user_data.email}")
        print(f"Stored hash: {password_hash}")
        print(f"Input password: {user_data.password}")
        print(f"Input hash: {get_password_hash(user_data.password)}")
        print(f"Password match: {verify_password(user_data.password, password_hash)}")
        
        if not verify_password(user_data.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # 创建JWT令牌
        access_token = create_access_token(data={"sub": email})
        
        # 如果name为空，使用邮箱的用户名部分（@之前的部分）作为默认显示名称
        display_name = name if name and name.strip() else email.split('@')[0] if email else "User"
        
        # 获取用户角色（优先使用数据库值，否则基于邮箱判断）
        user_role = get_user_role(email, user.get("role"))
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": email,
                "name": display_name,
                "role": user_role
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/register")
async def register(user_data: UserCreate):
    """用户注册"""
    try:
        # 检查用户是否已存在
        existing_user = db_client.get_user_by_email(user_data.email)
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # 创建新用户
        password_hash = get_password_hash(user_data.password)
        # 自动设置角色：@rakwireless.com 邮箱自动设置为 'rakwireless'
        auto_role = get_user_role(user_data.email)
        # 生成一个唯一的 ID（使用时间戳）
        user_id = int(datetime.now().timestamp() * 1000) % 2147483647
        
        user_data_dict = {
            'id': user_id,
            'email': user_data.email,
            'password_hash': password_hash,
            'name': user_data.name,
            'created_at': datetime.now().isoformat(),
            'is_active': True,
            'role': auto_role
        }
        
        if db_client.create_user(user_data_dict):
            return {"message": "User created successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to create user")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    """获取所有用户列表（仅RAK Wireless和Admin用户可用）"""
    user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
    
    if not is_rakwireless(user_role):
        raise HTTPException(status_code=403, detail="Only RAK Wireless employees can access user list")
    
    try:
        all_users = db_client.get_all_users()
        
        users = []
        for user in all_users:
            # 只返回活跃用户
            if user.get('is_active', True):
                role = user.get('role') or get_user_role(user.get('email', ''))
                users.append({
                    "id": user.get('id'),
                    "email": user.get('email'),
                    "name": user.get('name') or user.get('email', '').split('@')[0],
                    "role": role
                })
        
        # 按邮箱排序
        users.sort(key=lambda x: x['email'])
        return users
    except Exception as e:
        print(f"❌ Error in get_users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _general_section_from_config(raw: dict) -> dict:
    """从 config_data 根上取出 general（兼容大小写、历史字段名）。"""
    if not isinstance(raw, dict):
        return {}
    gen = raw.get('general')
    if isinstance(gen, dict):
        return gen
    for k, v in raw.items():
        if isinstance(k, str) and k.lower() == 'general' and isinstance(v, dict):
            return v
    return {}


def _first_map_value(gen: dict, candidates: tuple) -> Any:
    for key in candidates:
        if key in gen:
            return gen[key]
    return None


def _slim_config_data_for_request_list(req: dict) -> dict:
    """列表接口只返回 general 中与表格相关的键，减小 payload。"""
    raw = req.get('config_data') or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    gen = _general_section_from_config(raw)
    pid = _first_map_value(
        gen,
        ('pid', 'PID', 'productId', 'ProductID', 'product_id'),
    )
    barcode = _first_map_value(
        gen,
        ('barcode', 'BarCode', 'barCode', 'Barcode', 'bar_code'),
    )
    order_id = _first_map_value(
        gen,
        ('orderId', 'order_id', 'OrderID', 'OrderId'),
    )
    customization_id = _first_map_value(
        gen,
        ('customizationId', 'customisationId', 'CustomizationID', 'customization_id'),
    )
    priority = _first_map_value(gen, ('priority', 'Priority'))
    return {
        'general': {
            'pid': pid,
            'barcode': barcode,
            'orderId': order_id,
            'customizationId': customization_id,
            'priority': priority,
        }
    }


def _get_requests_list_payload_sync(current_user: dict) -> List[dict]:
    """同步构建请求列表；由 get_requests 通过 asyncio.to_thread 调用，避免阻塞事件循环。"""
    user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
    if can_view_all(user_role):
        all_requests = db_client.scan_requests_for_list()
    else:
        all_requests = db_client.query_requests_by_user_for_list(current_user['id'])

    user_ids = list(set(req.get('user_id') for req in all_requests if req.get('user_id')))
    users_dict = db_client.get_users_by_ids(user_ids) if user_ids else {}

    requests: List[dict] = []
    for req in all_requests:
        creator_email = None
        user_id = req.get('user_id')
        if user_id:
            creator = users_dict.get(user_id)
            creator_email = creator.get('email') if creator else None

        requests.append({
            "id": req.get('request_id'),
            "companyName": req.get('company_name'),
            "rakId": req.get('rak_id'),
            "configId": req.get('config_id'),
            "submitTime": req.get('submit_time'),
            "status": req.get('status', 'Open'),
            "assignee": req.get('assignee', ''),
            "configData": _slim_config_data_for_request_list(req),
            "changes": {},
            "originalConfig": {},
            "tags": req.get('tags', []),
            "creatorEmail": creator_email
        })

    requests.sort(key=lambda x: x.get('submitTime', ''), reverse=True)
    return requests


@app.get("/api/requests")
async def get_requests(current_user: dict = Depends(get_current_user)):
    """获取所有请求 - 根据用户权限过滤"""
    try:
        return await asyncio.to_thread(_get_requests_list_payload_sync, current_user)
    except Exception as e:
        print(f"❌ Error in get_requests: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/requests/{request_id}")
async def get_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """获取特定请求 - 检查访问权限"""
    print(f"=== GET REQUEST ===")
    print(f"Request ID: {request_id}")
    print(f"Current user: {current_user}")
    print(f"Is RAK Wireless user: {current_user.get('is_rakwireless', False)}")
    
    try:
        req = db_client.get_request(request_id)
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")
        
        # 权限检查：非 rakwireless/admin 用户只能访问自己创建的请求
        creator_user_id = req.get('user_id')
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        
        if not can_view_all(user_role) and creator_user_id != current_user["id"]:
            print(f"❌ Permission denied: User {current_user['id']} tried to access request {request_id} created by user {creator_user_id}")
            raise HTTPException(status_code=403, detail="You don't have permission to access this request")
        
        print(f"✅ Permission granted for request {request_id}")
        
        # 获取创建者邮箱（优化：使用批量查询）
        creator_email = None
        if creator_user_id:
            users_dict = db_client.get_users_by_ids([creator_user_id])
            creator = users_dict.get(creator_user_id)
            creator_email = creator.get('email') if creator else None
        
        # 调试：检查返回的数据
        config_data = req.get('config_data', {})
        print(f"Config Data Keys: {list(config_data.keys()) if config_data else 'None'}")
        print(f"Config Data Sample: {str(config_data)[:200]}...")
        
        return {
            "id": req.get('request_id'),
            "companyName": req.get('company_name'),
            "rakId": req.get('rak_id'),
            "configId": req.get('config_id'),
            "submitTime": req.get('submit_time'),
            "status": req.get('status', 'Open'),
            "assignee": req.get('assignee', ''),
            "configData": config_data,
            "changes": req.get('changes', {}),
            "originalConfig": req.get('original_config', {}),
            "tags": req.get('tags', []),
            "creatorEmail": creator_email
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/requests")
async def create_request(request_data: RequestCreate, current_user: dict = Depends(get_current_user)):
    """创建新请求"""
    try:
        request_id = f"REQ{str(uuid.uuid4())[:6].upper()}"
        submit_time = datetime.now().isoformat()
        created_at = datetime.now().isoformat()
        
        # 调试：检查配置数据
        print(f"=== Creating Request ===")
        print(f"Request ID: {request_id}")
        print(f"Company: {request_data.companyName}")
        print(f"RAK ID: {request_data.rakId}")
        print(f"Config Data Keys: {list(request_data.configData.keys()) if request_data.configData else 'None'}")
        print(f"Config Data Sample: {str(request_data.configData)[:200]}...")
        
        # 构建请求数据
        # 确保 user_id 是整数类型
        user_id = int(current_user["id"]) if current_user.get("id") else 0
        
        request_dict = {
            'request_id': request_id,
            'company_name': request_data.companyName,
            'rak_id': request_data.rakId,
            'submit_time': submit_time,
            'status': 'Open',
            # 注意：assignee 如果是空字符串，不能包含在 item 中（因为它是 GSI 键）
            # DynamoDB GSI 键不能是空字符串
            'config_data': request_data.configData,
            'changes': request_data.changes,
            'original_config': request_data.originalConfig,
            'tags': request_data.tags if request_data.tags else [],
            'user_id': user_id,  # 确保是整数
            'created_at': created_at
        }
        
        # 只有当 assignee 不为空时才添加（避免 GSI 键为空字符串的错误）
        # assignee 为空时，不包含该字段，这样 GSI 中就不会有这条记录
        # 这是 DynamoDB 的正常行为：GSI 只包含有该键值的项目
        
        print(f"DEBUG: Request dict user_id type: {type(user_id)}, value: {user_id}")
        
        # 创建请求
        try:
            if not db_client.create_request(request_dict):
                raise HTTPException(status_code=500, detail="Failed to create request")
        except Exception as db_error:
            print(f"❌ Database error: {str(db_error)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Database error: {str(db_error)}")
        
        # 创建初始活动记录（记录创建者信息）
        # 如果活动记录创建失败，不影响主请求的创建
        try:
            creator_name = current_user.get("name") or current_user.get("email", "Unknown")
            activity_data = {
                'request_id': request_id,
                'user_id': current_user["id"],
                'activity_type': 'created',
                'description': f"Request created by {creator_name} for {request_data.companyName}",
                'created_at': created_at
            }
            db_client.create_activity(activity_data)
        except Exception as activity_error:
            # 活动记录创建失败不影响主请求，只记录日志
            print(f"⚠️ Warning: Failed to create activity record: {str(activity_error)}")
        
        print(f"✅ Request created successfully: {request_id}")
        return {"message": "Request created successfully", "request_id": request_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error creating request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/requests/{request_id}")
async def delete_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """删除单个请求 - 检查删除权限"""
    print(f"=== DELETE REQUEST ===")
    print(f"Request ID: {request_id}")
    print(f"Current User: {current_user}")
    print(f"Is RAK Wireless user: {current_user.get('is_rakwireless', False)}")
    
    try:
        # 检查请求是否存在
        request = db_client.get_request(request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        
        request_user_id = request.get('user_id')
        current_user_id = current_user['id']
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        is_creator = request_user_id == current_user_id
        
        # 权限检查：
        # - Admin 可以删除任何请求
        # - 其他用户（包括普通用户和 RAK Wireless）只能删除自己创建的请求
        if can_delete_any(user_role):
            # Admin 可以删除任何请求
            print(f"✅ Admin user {current_user_id} deleting request {request_id}")
        elif is_creator:
            # 任何用户都可以删除自己创建的请求
            print(f"✅ User {current_user_id} deleting own request {request_id}")
        else:
            # 不能删除他人创建的请求
            print(f"❌ Permission denied: User {current_user_id} tried to delete request {request_id} created by user {request_user_id}")
            raise HTTPException(status_code=403, detail="You can only delete your own requests")
        
        print(f"✅ Permission granted for deleting request {request_id}")
        
        # 删除请求
        if not db_client.delete_request(request_id):
            raise HTTPException(status_code=500, detail="Failed to delete request")
        
        return {"message": "Request deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/requests/{request_id}")
async def update_request(request_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    """更新请求状态或分配人 - 检查编辑权限"""
    print(f"=== UPDATE REQUEST ===")
    print(f"Request ID: {request_id}")
    print(f"Current User: {current_user}")
    print(f"Is RAK Wireless user: {current_user.get('is_rakwireless', False)}")
    print(f"Request Data: {request_data}")
    
    try:
        # 先检查请求是否存在
        request = db_client.get_request(request_id)
        if not request:
            print(f"❌ Request {request_id} not found in database")
            raise HTTPException(status_code=404, detail="Request not found")
        
        request_user_id = request.get('user_id')
        current_user_id = current_user['id']
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        is_creator = request_user_id == current_user_id
        
        print(f"✅ Request found: Creator User ID={request_user_id}")
        print(f"Current user ID: {current_user_id}, Role: {user_role}")
        
        # 权限检查：只有创建者或管理员可以编辑请求
        # 说明：
        # - 普通用户：只能编辑自己创建的请求
        # - RAK Wireless 员工（非 admin）：可以查看所有请求，但不能编辑他人请求
        # - Admin：可以编辑所有请求
        if not is_admin(user_role) and not is_creator:
            print(f"❌ Permission denied: User {current_user_id} tried to edit request {request_id} created by user {request_user_id}")
            raise HTTPException(status_code=403, detail="You can only edit your own requests")
        
        # 非 rakwireless/admin 用户不能修改状态（workflow）
        if not is_rakwireless(user_role) and "status" in request_data:
            print(f"❌ Permission denied: Non-RAK Wireless user {current_user_id} tried to update status for request {request_id}")
            raise HTTPException(status_code=403, detail="Only RAK Wireless employees can update workflow status")
        
        print(f"✅ Permission granted for request {request_id}")
        
        # 获取当前请求的旧值（用于记录history）
        old_status = request.get('status')
        old_assignee = request.get('assignee', '')
        print(f"📝 Old values - Status: {old_status}, Assignee: {old_assignee}")
        
        # 构建更新数据
        update_data = {}
        
        if "status" in request_data:
            update_data['status'] = request_data["status"]
        
        # 需要删除的字段列表
        remove_fields = []
        
        if "assignee" in request_data:
            new_assignee = request_data.get("assignee", "")
            # 如果新值是空字符串或"Unassign"，使用REMOVE操作删除字段
            if not new_assignee or new_assignee.strip() == "" or new_assignee.strip().lower() == "unassign":
                remove_fields.append('assignee')
            else:
                update_data['assignee'] = new_assignee
        
        if "companyName" in request_data:
            update_data['company_name'] = request_data["companyName"]
        
        if "rakId" in request_data:
            update_data['rak_id'] = request_data["rakId"]
        
        if "configData" in request_data:
            update_data['config_data'] = request_data["configData"]
        
        if "changes" in request_data:
            update_data['changes'] = request_data["changes"]
        
        if "originalConfig" in request_data:
            update_data['original_config'] = request_data["originalConfig"]
        
        if "tags" in request_data:
            update_data['tags'] = request_data["tags"]

        # 当 workflow 到达最终态（前端显示 RELEASED，实际状态值通常为 Done）时，自动生成 config_id
        new_status = request_data.get("status")
        status_lower = new_status.lower() if isinstance(new_status, str) else ""
        if status_lower in ("done", "released"):
            incoming_config_data = request_data.get("configData") or {}
            existing_config_data = request.get("config_data") or {}
            general_data = {}

            if isinstance(existing_config_data, dict):
                general_data.update(existing_config_data.get("general") or {})
            if isinstance(incoming_config_data, dict):
                general_data.update(incoming_config_data.get("general") or {})

            customer_id = request_data.get("rakId") or request.get("rak_id") or ""
            pid = general_data.get("pid") or ""
            barcode = general_data.get("barcode") or ""
            order_id = general_data.get("orderId") or ""

            update_data["config_id"] = build_config_id(
                customer_id=customer_id,
                request_id=request_id,
                pid=pid,
                barcode=barcode,
                order_id=order_id,
                status_value=new_status,
            )
        
        # 检查是否有需要更新的字段或需要删除的字段
        if not update_data and not remove_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        # 执行更新（先确保 config_id / status 已入库）
        if not db_client.update_request(request_id, update_data, remove_fields=remove_fields):
            raise HTTPException(status_code=500, detail="Failed to update request")

        # 如果到达最终态，则尝试同步到外部系统；失败则落库并交由后台重试
        if status_lower in ("done", "released"):
            # 重新读取最新记录（包含 config_id）
            latest = db_client.get_request(request_id) or {}
            config_id_value = str(latest.get("config_id") or update_data.get("config_id") or "").strip()
            customization_id_value = _extract_customization_id(latest, request_data.get("configData"))

            attempts = int(latest.get("external_sync_attempts") or 0)

            if config_id_value and customization_id_value:
                # 立刻尝试一次
                result = _external_bind_config(config_id=config_id_value, customization_id=customization_id_value)

                if result["ok"]:
                    db_client.update_request(
                        request_id,
                        {
                            "external_sync_status": "success",
                            "external_sync_last_error": "",
                            "external_sync_last_http_status": int(result["http_status"] or 0),
                            "external_sync_attempts": attempts,
                            "external_sync_next_retry_at": "",
                        },
                    )
                else:
                    http_status = int(result["http_status"] or 0)
                    retryable = bool(result.get("retryable", False))
                    # 404：不重试（或最多 1 次）
                    if http_status == 404 and attempts >= 1:
                        retryable = False

                    new_attempts = attempts + 1
                    if retryable and new_attempts < EXTERNAL_SYNC_MAX_ATTEMPTS:
                        next_retry_at_str = _compute_next_retry_at(new_attempts, result.get("next_retry_after"))
                        new_sync_status = "failed"
                    else:
                        next_retry_at_str = ""
                        new_sync_status = "permanent_failed"

                    db_client.update_request(
                        request_id,
                        {
                            "external_sync_status": new_sync_status,
                            "external_sync_last_error": str(result.get("message") or ""),
                            "external_sync_last_http_status": http_status,
                            "external_sync_attempts": new_attempts,
                            "external_sync_next_retry_at": next_retry_at_str,
                        },
                    )
            else:
                db_client.update_request(
                    request_id,
                    {
                        "external_sync_status": "permanent_failed",
                        "external_sync_last_error": "Missing config_id or customization_id for external sync",
                        "external_sync_last_http_status": 0,
                        "external_sync_attempts": attempts,
                        "external_sync_next_retry_at": "",
                    },
                )
        
        # 记录status变化
        if "status" in request_data and request_data["status"] != old_status:
            new_status = request_data["status"]
            operator_name = current_user.get("name") or current_user.get("email", "Unknown")
            activity_data = {
                'request_id': request_id,
                'user_id': current_user["id"],
                'activity_type': 'status_changed',
                'description': f"{operator_name} updated workflow process of request {request_id} from '{old_status}' to '{new_status}'",
                'created_at': datetime.now().isoformat()
            }
            db_client.create_activity(activity_data)
        
        # 记录assignee变化
        if "assignee" in request_data:
            new_assignee_raw = request_data.get("assignee", "")
            # 处理Unassign的情况
            if not new_assignee_raw or new_assignee_raw.strip() == "" or new_assignee_raw.strip().lower() == "unassign":
                new_assignee = ""
            else:
                new_assignee = new_assignee_raw.strip() if isinstance(new_assignee_raw, str) else (new_assignee_raw or "")
            old_assignee_value = old_assignee.strip() if old_assignee and isinstance(old_assignee, str) else (old_assignee or "")
            
            print(f"📝 Assignee change check - Old: '{old_assignee_value}', New: '{new_assignee}'")
            
            if new_assignee != old_assignee_value:
                print(f"✅ Assignee changed from '{old_assignee_value}' to '{new_assignee}', recording activity...")
                operator_name = current_user.get("name") or current_user.get("email", "Unknown")
                
                if new_assignee:
                    # 获取被分配用户的姓名
                    assignee_user = db_client.get_user_by_email(new_assignee)
                    if assignee_user:
                        assignee_name = assignee_user.get('name') or assignee_user.get('email', new_assignee)
                    else:
                        assignee_name = new_assignee
                    
                    description = f"{operator_name} assigned request {request_id} to {assignee_name}"
                    print(f"📝 Recording assignment: {description}")
                    activity_data = {
                        'request_id': request_id,
                        'user_id': current_user["id"],
                        'activity_type': 'assigned',
                        'description': description,
                        'created_at': datetime.now().isoformat()
                    }
                    db_client.create_activity(activity_data)
                else:
                    # 取消分配
                    if old_assignee_value:
                        unassignee_user = db_client.get_user_by_email(old_assignee_value)
                        if unassignee_user:
                            unassignee_name = unassignee_user.get('name') or unassignee_user.get('email', old_assignee_value)
                        else:
                            unassignee_name = old_assignee_value
                        description = f"{operator_name} unassigned request {request_id} from {unassignee_name}"
                    else:
                        description = f"{operator_name} unassigned this request"
                    print(f"📝 Recording unassignment: {description}")
                    activity_data = {
                        'request_id': request_id,
                        'user_id': current_user["id"],
                        'activity_type': 'unassigned',
                        'description': description,
                        'created_at': datetime.now().isoformat()
                    }
                    db_client.create_activity(activity_data)
            else:
                print(f"⚠️ Assignee unchanged (both are '{old_assignee_value}'), skipping activity record")
        
        print(f"✅ Request {request_id} updated successfully")
        return {"message": "Request updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error updating request: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/requests/batch/delete")
async def delete_requests_batch(request_data: dict, current_user: dict = Depends(get_current_user)):
    """批量删除请求 - 所有用户都可以删除自己创建的请求"""
    print(f"=== BATCH DELETE REQUESTS ===")
    print(f"Current User: {current_user}")
    user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
    print(f"User Role: {user_role}")
    
    try:
        request_ids = request_data.get("ids", [])
        if not request_ids:
            raise HTTPException(status_code=400, detail="No request IDs provided")
        
        # 检查所有请求是否存在且属于当前用户
        existing_requests = []
        for request_id in request_ids:
            request = db_client.get_request(request_id)
            if request:
                existing_requests.append(request_id)
        
        # 只删除属于当前用户的请求（Admin可以删除任何请求）
        if not can_delete_any(user_role):
            # 非Admin用户只能删除自己创建的请求
            user_requests = []
            for request_id in existing_requests:
                request = db_client.get_request(request_id)
                if request and request.get('user_id') == current_user["id"]:
                    user_requests.append(request_id)
            
            if len(user_requests) != len(request_ids):
                raise HTTPException(status_code=403, detail="Some requests not found or you don't have permission to delete them")
            
            # 批量删除
            deleted_count = db_client.batch_delete_requests(user_requests)
        else:
            # Admin可以删除任何请求
            if len(existing_requests) != len(request_ids):
                raise HTTPException(status_code=404, detail="Some requests not found")
            
            # 批量删除
            deleted_count = db_client.batch_delete_requests(existing_requests)
        
        print(f"✅ Successfully deleted {deleted_count} request(s) out of {len(request_ids)} requested")
        
        if deleted_count < len(request_ids):
            return {
                "message": f"Deleted {deleted_count} request(s) out of {len(request_ids)} requested",
                "deleted_count": deleted_count,
                "requested_count": len(request_ids)
            }
        
        return {"message": f"Successfully deleted {deleted_count} request(s)"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/users")
async def debug_users():
    """调试：查看所有用户"""
    try:
        all_users = db_client.get_all_users()
        users = []
        for user in all_users:
            users.append({
                "id": user.get('id'),
                "email": user.get('email'),
                "name": user.get('name'),
                "created_at": user.get('created_at')
            })
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/debug/hash/{password}")
async def debug_hash(password: str):
    """调试：查看密码哈希"""
    return {
        "password": password,
        "hash": get_password_hash(password)
    }

@app.get("/api/debug/test-auth")
async def test_auth(current_user: dict = Depends(get_current_user)):
    """调试：测试认证"""
    return {
        "message": "Auth successful",
        "user": current_user
    }

@app.get("/api/debug/test-db")
async def test_db():
    """调试：测试数据库连接"""
    try:
        # 测试 DynamoDB 连接
        users = db_client.get_all_users()
        requests = db_client.scan_all_requests()
        
        return {
            "status": "success",
            "database": "DynamoDB",
            "users_count": len(users),
            "requests_count": len(requests)
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/files/upload")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """上传文件"""
    try:
        print(f"=== File Upload Debug ===")
        print(f"User ID: {current_user['id']}")
        print(f"File name: {file.filename}")
        print(f"File size: {file.size}")
        print(f"Content type: {file.content_type}")
        
        # 检查文件大小限制 (10MB)
        if file.size and file.size > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large")
        
        # 生成唯一文件名
        file_id = str(uuid.uuid4())
        file_extension = os.path.splitext(file.filename)[1] if file.filename else ""
        filename = f"{file_id}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        print(f"File ID: {file_id}")
        print(f"File path: {file_path}")
        print(f"Upload dir exists: {os.path.exists(UPLOAD_DIR)}")
        
        # 确保uploads目录存在
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        
        # 保存文件
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        print(f"File saved successfully: {file_path}")
        
        # 存储文件信息到 DynamoDB
        file_data = {
            'id': file_id,
            'original_name': file.filename,
            'filename': filename,
            'file_path': file_path,
            'file_size': file.size if file.size else 0,
            'user_id': int(current_user["id"]),
            'upload_time': datetime.now().isoformat()
        }
        
        if not db_client.create_file(file_data):
            raise HTTPException(status_code=500, detail="Failed to save file metadata")
        
        print(f"✅ File upload completed successfully: {file_id}")
        return {"fileId": file_id, "filename": file.filename, "size": file.size}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ File upload error: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/api/files/test-upload")
async def test_upload():
    """测试文件上传接口"""
    return {"message": "File upload endpoint is working"}

@app.get("/api/files/{file_id}")
async def download_file(file_id: str, current_user: dict = Depends(get_current_user)):
    """下载文件 - 允许下载评论附件或自己上传的文件"""
    try:
        print(f"📁 文件下载请求: {file_id}")
        print(f"👤 用户: {current_user}")
        
        # 从 DynamoDB 查找文件
        file_record = db_client.get_file(file_id)
        if not file_record:
            print(f"❌ 文件未找到: {file_id}")
            raise HTTPException(status_code=404, detail="File not found")
        
        original_name = file_record.get('original_name')
        file_path_from_db = file_record.get('file_path')
        filename_from_db = file_record.get('filename')
        file_owner_id = file_record.get('user_id')
        
        # 调试：打印从数据库获取的文件信息
        print(f"📋 数据库中的文件记录:")
        print(f"   - original_name: {original_name}")
        print(f"   - file_path (from DB): {file_path_from_db}")
        print(f"   - filename (from DB): {filename_from_db}")
        print(f"   - file_owner_id: {file_owner_id}")
        
        # 优先使用 filename 字段构建文件路径（因为它是相对路径，不包含服务器特定路径）
        # 如果 filename 不存在，再尝试使用 file_path
        if filename_from_db:
            file_path = os.path.join(UPLOAD_DIR, filename_from_db)
            print(f"📄 使用 filename 构建路径: {file_path}")
        elif file_path_from_db:
            file_path = file_path_from_db
            print(f"📄 使用 file_path 构建路径: {file_path}")
        else:
            raise HTTPException(status_code=404, detail="File path not found in database")
        
        # 检查文件是否在评论附件中（允许任何人下载评论附件）
        # 扫描所有评论查找包含此文件ID的附件
        is_comment_attachment = False
        all_requests = db_client.scan_all_requests()
        for req in all_requests:
            comments = db_client.get_comments_by_request(req.get('request_id'))
            for comment in comments:
                attachments = comment.get('attachments', [])
                if isinstance(attachments, str):
                    try:
                        attachments = json.loads(attachments)
                    except:
                        attachments = []
                if file_id in attachments:
                    is_comment_attachment = True
                    break
            if is_comment_attachment:
                break
        
        # 获取用户角色
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        
        # 权限检查：允许下载的情况：
        # 1. 评论附件（任何人都可以下载）
        # 2. 文件所有者
        # 3. 管理员（admin）可以下载所有文件
        if not is_comment_attachment and file_owner_id != current_user["id"]:
            if not is_admin(user_role):
                print(f"❌ 权限不足: 用户 {current_user['id']} 尝试下载文件 {file_id}")
                raise HTTPException(status_code=403, detail="You don't have permission to download this file")
            else:
                print(f"✅ 管理员 {current_user['id']} 下载文件 {file_id}")
        
        # 确保文件路径是绝对路径
        if not os.path.isabs(file_path):
            file_path = os.path.normpath(file_path)
        
        print(f"📄 最终文件路径: {file_path}")
        
        if not os.path.exists(file_path):
            print(f"❌ 文件不存在于磁盘: {file_path}")
            print(f"📂 当前工作目录: {os.getcwd()}")
            print(f"📂 脚本目录: {BASE_DIR}")
            print(f"📂 UPLOAD_DIR: {UPLOAD_DIR}")
            # 尝试列出 uploads 目录中的文件（用于调试）
            if os.path.exists(UPLOAD_DIR):
                try:
                    files_in_dir = os.listdir(UPLOAD_DIR)
                    print(f"📂 uploads 目录中的文件: {files_in_dir[:10]}")  # 只显示前10个
                except:
                    pass
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        print(f"✅ 返回文件: {original_name}")
        return FileResponse(
            path=file_path,
            filename=original_name,
            media_type='application/octet-stream'
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 文件下载错误: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# 测试数据库连接
@app.get("/api/test-db")
async def test_db():
    """测试数据库连接"""
    try:
        print(f"=== TEST DB CONNECTION ===")
        print(f"Database: DynamoDB")
        
        # 测试连接：尝试获取所有表
        tables = list(TABLES.keys())
        
        result = {
            "status": "success",
            "database": "DynamoDB",
            "tables": tables
        }
        print(f"✅ Database test successful: {result}")
        return result
    except Exception as e:
        print(f"❌ Database test failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "error": str(e),
            "database": "DynamoDB"
        }

# 评论相关API
@app.get("/api/requests/{request_id}/comments")
async def get_comments(request_id: str, current_user: dict = Depends(get_current_user)):
    """获取请求的评论列表"""
    print(f"=== GET COMMENTS ===")
    print(f"Request ID: {request_id}")
    print(f"Current User: {current_user}")
    
    try:
        # 从 DynamoDB 获取评论
        comments_data = db_client.get_comments_by_request(request_id)
        
        comments = []
        for comment in comments_data:
            # 获取用户信息
            user_id = comment.get('user_id')
            user = None
            if user_id:
                # 通过 user_id 获取用户（需要 GSI 或扫描）
                all_users = db_client.get_all_users()
                user = next((u for u in all_users if u.get('id') == user_id), None)
            
            attachments = comment.get('attachments', [])
            if isinstance(attachments, str):
                try:
                    attachments = json.loads(attachments)
                except:
                    attachments = []
            
            comments.append({
                "id": comment.get('id'),
                "content": comment.get('content', ''),
                "attachments": attachments,
                "createdAt": comment.get('created_at', ''),
                "authorName": user.get('name', 'Unknown User') if user else "Unknown User",
                "authorEmail": user.get('email', 'unknown@example.com') if user else "unknown@example.com"
            })
        
        print(f"✅ Found {len(comments)} comments")
        return comments
    except Exception as e:
        print(f"❌ Error in get_comments: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/requests/{request_id}/comments")
async def create_comment(request_id: str, comment_data: CommentCreate, current_user: dict = Depends(get_current_user)):
    """创建新评论"""
    print(f"=== CREATE COMMENT ===")
    print(f"Request ID: {request_id}")
    print(f"Comment Data: {comment_data}")
    print(f"Current User: {current_user}")
    
    try:
        # 检查请求是否存在
        request = db_client.get_request(request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        
        # 验证：必须有内容或附件
        if not comment_data.content.strip() and (not comment_data.attachments or len(comment_data.attachments) == 0):
            raise HTTPException(status_code=400, detail="Comment must have content or attachments")
        
        # 生成评论ID（使用时间戳+随机数）
        import time
        comment_id = int(time.time() * 1000) + hash(current_user["id"]) % 1000
        
        # 创建评论数据
        comment_item = {
            'id': comment_id,
            'request_id': request_id,
            'user_id': int(current_user["id"]),
            'content': comment_data.content,
            'attachments': json.dumps(comment_data.attachments or []) if comment_data.attachments else None,
            'created_at': datetime.now().isoformat()
        }
        
        if not db_client.create_comment(comment_item):
            raise HTTPException(status_code=500, detail="Failed to create comment")
        
        # 创建活动记录
        activity_data = {
            'request_id': request_id,
            'user_id': int(current_user["id"]),
            'activity_type': 'comment',
            'description': f"Added a comment: {comment_data.content[:50]}...",
            'created_at': datetime.now().isoformat()
        }
        db_client.create_activity(activity_data)
        
        print(f"✅ Comment created successfully")
        return {"message": "Comment created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in create_comment: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/requests/{request_id}/comments/{comment_id}")
async def delete_comment(request_id: str, comment_id: int, current_user: dict = Depends(get_current_user)):
    """删除评论"""
    try:
        # 获取评论
        comments = db_client.get_comments_by_request(request_id)
        comment = next((c for c in comments if str(c.get('id')) == str(comment_id) or c.get('created_at') == str(comment_id)), None)
        
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        
        if comment.get('user_id') != current_user["id"]:
            raise HTTPException(status_code=403, detail="You can only delete your own comments")
        
        # 删除评论（使用 request_id 和 created_at 作为复合主键）
        if not db_client.delete_comment(request_id, comment.get('created_at')):
            raise HTTPException(status_code=500, detail="Failed to delete comment")
        
        return {"message": "Comment deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 活动流相关API
@app.get("/api/requests/{request_id}/activities")
async def get_activities(request_id: str, current_user: dict = Depends(get_current_user)):
    """获取请求的活动流"""
    print(f"=== GET ACTIVITIES ===")
    print(f"Request ID: {request_id}")
    print(f"Current User: {current_user}")
    
    try:
        # 从 DynamoDB 获取活动
        activities_data = db_client.get_activities_by_request(request_id)
        
        activities = []
        for activity in activities_data:
            # 获取用户信息
            user_id = activity.get('user_id')
            user = None
            if user_id:
                all_users = db_client.get_all_users()
                user = next((u for u in all_users if u.get('id') == user_id), None)
            
            activities.append({
                "id": activity.get('id') or activity.get('created_at'),
                "activityType": activity.get('activity_type', ''),
                "description": activity.get('description', ''),
                "createdAt": activity.get('created_at', ''),
                "authorName": user.get('name', 'Unknown User') if user else "Unknown User",
                "authorEmail": user.get('email', 'unknown@example.com') if user else "unknown@example.com"
            })
        
        print(f"✅ Found {len(activities)} activities")
        return activities
    except Exception as e:
        print(f"❌ Error in get_activities: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/users/me/assignments")
async def get_my_assignments(current_user: dict = Depends(get_current_user)):
    """获取当前用户相关的活动
    提醒逻辑：
    1. 当前用户创建的request：所有assign和status_changed活动都提醒
    2. 非当前用户创建的request：只有assign/unassigned活动，且assignee是当前用户时才提醒
    """
    try:
        user_email = current_user.get("email")
        user_id = current_user.get("id")
        if not user_email or not user_id:
            return []
        
        print(f"🔍 Searching notifications for user: {user_email} (ID: {user_id})")
        
        # 情况1: 获取当前用户创建的所有请求
        my_requests = db_client.query_requests_by_user(user_id)
        my_request_ids = {req.get('request_id') for req in my_requests}
        
        # 情况2: 获取分配给当前用户的所有请求
        assigned_requests = db_client.query_requests_by_assignee(user_email)
        assigned_request_ids = {req.get('request_id') for req in assigned_requests}
        
        # 收集所有需要查询的请求ID
        all_request_ids = my_request_ids | assigned_request_ids
        
        # 查询这些请求的所有活动
        all_activities = []
        for req_id in all_request_ids:
            activities = db_client.get_activities_by_request(req_id)
            all_activities.extend(activities)
        
        # 过滤活动
        filtered_activities = []
        for activity in all_activities:
            request_id = activity.get('request_id')
            activity_type = activity.get('activity_type')
            is_my_request = request_id in my_request_ids
            
            # 情况1: 我创建的请求，只保留 assigned 和 status_changed
            if is_my_request:
                if activity_type in ['assigned', 'status_changed']:
                    filtered_activities.append(activity)
            # 情况2: 不是我创建的请求，只保留 assigned/unassigned 且与我相关
            else:
                if activity_type in ['assigned', 'unassigned']:
                    description = activity.get('description', '')
                    # 检查描述中是否包含当前用户邮箱
                    if user_email in description or request_id in assigned_request_ids:
                        filtered_activities.append(activity)
        
        # 获取活动作者信息
        result_activities = []
        for activity in filtered_activities:
            author_id = activity.get('user_id')
            author = db_client.get_user_by_id(author_id) if author_id else None
            
            result_activities.append({
                "id": activity.get('id') or activity.get('created_at'),  # 使用 created_at 作为临时 ID
                "requestId": activity.get('request_id'),
                "activityType": activity.get('activity_type'),
                "description": activity.get('description'),
                "createdAt": activity.get('created_at'),
                "authorName": author.get('name') if author else "Unknown",
                "authorEmail": author.get('email') if author else "unknown@example.com"
            })
        
        # 去重：按request_id和activity_type组合去重，保留最新的
        request_activity_map = {}
        for activity in result_activities:
            key = f"{activity['requestId']}_{activity['activityType']}"
            if key not in request_activity_map:
                request_activity_map[key] = activity
            else:
                # 比较时间，保留最新的
                if activity['createdAt'] > request_activity_map[key]['createdAt']:
                    request_activity_map[key] = activity
        
        # 按时间降序排序
        final_activities = sorted(
            request_activity_map.values(),
            key=lambda x: x['createdAt'],
            reverse=True
        )
        
        print(f"✅ Returning {len(final_activities)} unique assignment activities")
        return final_activities
    except Exception as e:
        print(f"❌ Error in get_my_assignments: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/requests/{request_id}/activities")
async def create_activity(request_id: str, activity_data: ActivityCreate, current_user: dict = Depends(get_current_user)):
    """创建新活动"""
    try:
        # 检查请求是否存在
        request = db_client.get_request(request_id)
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        
        # 创建活动数据
        activity_item = {
            'request_id': request_id,
            'user_id': int(current_user["id"]),
            'activity_type': activity_data.activity_type,
            'description': activity_data.description,
            'created_at': datetime.now().isoformat()
        }
        
        if not db_client.create_activity(activity_item):
            raise HTTPException(status_code=500, detail="Failed to create activity")
        
        return {"message": "Activity created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== Template API ====================

class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = "Custom"
    configData: dict
    variables: Optional[List[dict]] = []
    tags: Optional[List[str]] = []
    isPublic: Optional[bool] = False

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    configData: Optional[dict] = None
    variables: Optional[List[dict]] = None
    tags: Optional[List[str]] = None
    isPublic: Optional[bool] = None

@app.post("/api/templates")
async def create_template(template_data: TemplateCreate, current_user: dict = Depends(get_current_user)):
    """创建模板"""
    try:
        template_id = f"TMP{str(uuid.uuid4())[:6].upper()}"
        
        template_item = {
            'template_id': template_id,
            'name': template_data.name,
            'description': template_data.description or '',
            'category': template_data.category or 'Custom',
            'config_data': json.dumps(template_data.configData),
            'variables': json.dumps(template_data.variables or []),
            'tags': json.dumps(template_data.tags or []),
            'is_public': 1 if template_data.isPublic else 0,
            'created_by': int(current_user["id"]),
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'version': 1,
            'usage_count': 0
        }
        
        if not db_client.create_template(template_item):
            raise HTTPException(status_code=500, detail="Failed to create template")
        
        return {"message": "Template created successfully", "template_id": template_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/templates/categories")
async def get_template_categories(current_user: dict = Depends(get_current_user)):
    """获取模板分类列表"""
    try:
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        
        if is_rakwireless(user_role):
            templates = db_client.scan_templates()
        else:
            templates = db_client.query_templates_by_created_by(current_user["id"])
            public_templates = db_client.query_templates_by_category("Public")  # 假设公开模板有特殊分类
            templates.extend(public_templates)
        
        categories = list(set(t.get('category') for t in templates if t.get('category')))
        return categories
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/templates")
async def get_templates(
    category: Optional[str] = None,
    is_public: Optional[bool] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """获取模板列表"""
    try:
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        
        # 获取模板
        if is_rakwireless(user_role):
            templates_data = db_client.scan_templates()
        else:
            my_templates = db_client.query_templates_by_created_by(current_user["id"])
            public_templates = [t for t in db_client.scan_templates() if t.get('is_public') == 1]
            templates_data = my_templates + public_templates
        
        # 过滤
        if category:
            templates_data = [t for t in templates_data if t.get('category') == category]
        
        if is_public is not None:
            templates_data = [t for t in templates_data if t.get('is_public') == (1 if is_public else 0)]
        
        if search:
            search_lower = search.lower()
            templates_data = [t for t in templates_data 
                            if search_lower in (t.get('name', '') or '').lower() 
                            or search_lower in (t.get('description', '') or '').lower()]
        
        # 批量获取用户信息（优化：避免 N+1 查询）
        created_by_ids = list(set(t.get('created_by') for t in templates_data if t.get('created_by')))
        users_dict = db_client.get_users_by_ids(created_by_ids) if created_by_ids else {}
        
        # 构建响应
        templates = []
        for t in templates_data:
            created_by_id = t.get('created_by')
            user = users_dict.get(created_by_id) if created_by_id else None
            
            config_data = t.get('config_data', '{}')
            variables = t.get('variables', '[]')
            tags = t.get('tags', '[]')
            
            templates.append({
                "id": t.get('template_id'),
                "name": t.get('name', ''),
                "description": t.get('description', ''),
                "category": t.get('category', ''),
                "configData": json.loads(config_data) if isinstance(config_data, str) else config_data,
                "variables": json.loads(variables) if isinstance(variables, str) else variables,
                "tags": json.loads(tags) if isinstance(tags, str) else tags,
                "isPublic": bool(t.get('is_public', 0)),
                "createdAt": t.get('created_at', ''),
                "updatedAt": t.get('updated_at', ''),
                "version": t.get('version', 1),
                "usageCount": t.get('usage_count', 0),
                "createdBy": user.get('email', 'Unknown') if user else "Unknown",
                "createdByName": user.get('name', 'Unknown') if user else "Unknown"
            })
        
        # 排序
        templates.sort(key=lambda x: (x['usageCount'], x['createdAt']), reverse=True)
        
        return templates
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/templates/{template_id}")
async def get_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """获取模板详情"""
    try:
        template = db_client.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # 权限检查
        is_creator = template.get('created_by') == current_user["id"]
        is_public = bool(template.get('is_public', 0))
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        user_is_rakwireless = is_rakwireless(user_role)
        
        if not is_creator and not is_public and not user_is_rakwireless:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # 获取创建者信息（优化：使用批量查询）
        created_by_id = template.get('created_by')
        users_dict = db_client.get_users_by_ids([created_by_id]) if created_by_id else {}
        creator = users_dict.get(created_by_id) if created_by_id else None
        
        config_data = template.get('config_data', '{}')
        variables = template.get('variables', '[]')
        tags = template.get('tags', '[]')
        
        return {
            "id": template.get('template_id'),
            "name": template.get('name', ''),
            "description": template.get('description', ''),
            "category": template.get('category', ''),
            "configData": json.loads(config_data) if isinstance(config_data, str) else config_data,
            "variables": json.loads(variables) if isinstance(variables, str) else variables,
            "tags": json.loads(tags) if isinstance(tags, str) else tags,
            "isPublic": bool(template.get('is_public', 0)),
            "createdAt": template.get('created_at', ''),
            "updatedAt": template.get('updated_at', ''),
            "version": template.get('version', 1),
            "usageCount": template.get('usage_count', 0),
            "createdBy": creator.get('email', 'Unknown') if creator else "Unknown",
            "createdByName": creator.get('name', 'Unknown') if creator else "Unknown"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/templates/{template_id}")
async def update_template(
    template_id: str,
    template_data: TemplateUpdate,
    current_user: dict = Depends(get_current_user)
):
    """更新模板"""
    try:
        # 检查模板是否存在和权限
        template = db_client.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        if template.get('created_by') != current_user["id"] and not is_rakwireless(user_role):
            raise HTTPException(status_code=403, detail="Only template creator can update")
        
        # 构建更新数据
        update_data = {}
        
        if template_data.name is not None:
            update_data['name'] = template_data.name
        
        if template_data.description is not None:
            update_data['description'] = template_data.description
        
        if template_data.category is not None:
            update_data['category'] = template_data.category
        
        if template_data.configData is not None:
            update_data['config_data'] = json.dumps(template_data.configData)
        
        if template_data.variables is not None:
            update_data['variables'] = json.dumps(template_data.variables)
        
        if template_data.tags is not None:
            update_data['tags'] = json.dumps(template_data.tags)
        
        if template_data.isPublic is not None:
            update_data['is_public'] = 1 if template_data.isPublic else 0
        
        if update_data:
            update_data['updated_at'] = datetime.now().isoformat()
            update_data['version'] = template.get('version', 1) + 1
            
            if not db_client.update_template(template_id, update_data):
                raise HTTPException(status_code=500, detail="Failed to update template")
        
        return {"message": "Template updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """删除模板"""
    try:
        # 检查权限
        template = db_client.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        # 只有创建者可以删除模板（admin 不享有特殊权限）
        if template.get('created_by') != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only template creator can delete")
        
        # 删除模板
        if not db_client.delete_template(template_id):
            raise HTTPException(status_code=500, detail="Failed to delete template")
        
        # 删除相关收藏和使用记录（DynamoDB 中这些表可能使用不同的主键结构）
        # 如果需要，可以添加批量删除逻辑
        
        return {"message": "Template deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/templates/{template_id}/apply")
async def apply_template(
    template_id: str,
    variable_values: dict,
    current_user: dict = Depends(get_current_user)
):
    """应用模板（记录使用次数）"""
    try:
        # 获取模板
        template = db_client.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # 增加使用次数
        db_client.increment_template_usage_count(template_id)
        
        # 记录使用历史
        usage_data = {
            'template_id': template_id,
            'used_by': int(current_user["id"]),
            'variables_used': json.dumps(variable_values),
            'created_at': datetime.now().isoformat()
        }
        db_client.create_template_usage(usage_data)
        
        # 返回配置数据（变量已替换）
        config_data_raw = template.get('config_data', '{}')
        variables_raw = template.get('variables', '[]')
        
        config_data = json.loads(config_data_raw) if isinstance(config_data_raw, str) else config_data_raw
        variables = json.loads(variables_raw) if isinstance(variables_raw, str) else variables_raw
        
        # 替换变量
        def replace_vars(obj):
            if isinstance(obj, dict):
                return {k: replace_vars(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [replace_vars(item) for item in obj]
            elif isinstance(obj, str):
                result = obj
                for var in variables:
                    var_name = var.get("name", "")
                    placeholder = f"{{{{{var_name}}}}}"
                    if placeholder in result:
                        result = result.replace(placeholder, variable_values.get(var_name, ""))
                return result
            return obj
        
        config_data_with_values = replace_vars(config_data)
        
        return {"configData": config_data_with_values}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== Admin Management API ====================

class UserRoleUpdate(BaseModel):
    role: str  # 'user', 'rakwireless', 'admin'

@app.put("/api/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    role_data: UserRoleUpdate,
    current_user: dict = Depends(get_current_user)
):
    """更新用户角色（功能已禁用，admin 仅保留删除权限）"""
    raise HTTPException(
        status_code=403, 
        detail="User role management is not available. Admin users can only delete requests."
    )

@app.get("/api/users/{user_id}")
async def get_user(user_id: int, current_user: dict = Depends(get_current_user)):
    """获取用户详细信息（RAK Wireless 和 Admin）"""
    user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
    
    if not is_rakwireless(user_role):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    try:
        user = db_client.get_user_by_id(user_id)
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "id": user.get('id'),
            "email": user.get('email'),
            "name": user.get('name') or user.get('email', '').split('@')[0],
            "role": user.get('role') or get_user_role(user.get('email', '')),
            "isActive": bool(user.get('is_active', True)),
            "createdAt": user.get('created_at', '')
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/users/all")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """获取所有用户列表（功能已禁用，admin 仅保留删除权限）"""
    raise HTTPException(
        status_code=403, 
        detail="User management is not available. Admin users can only delete requests."
    )

if __name__ == "__main__":
    print("Starting Auth Prototype Simple Backend...")
    print("Database: DynamoDB")
    print("API: http://localhost:8000")
    print("API docs: http://localhost:8000/docs")
    
    # 初始化数据库
    init_database()
    
    import uvicorn
    import socket
    
    # 获取本机IP地址
    def get_local_ip():
        try:
            # 创建一个socket连接来获取本机IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"
    
    local_ip = get_local_ip()
    print(f"🌐 本机IP地址: {local_ip}")
    print(f"🔧 后端服务绑定到: 0.0.0.0:8000")
    print(f"📱 局域网访问地址: http://{local_ip}:8000")
    print(f"📚 API文档地址: http://{local_ip}:8000/docs")
    print(f"🔗 登录接口地址: http://{local_ip}:8000/api/auth/login")
    
    uvicorn.run(
        app, 
        host="0.0.0.0",  # 绑定到所有网络接口
        port=8000,
        timeout_keep_alive=30,  # 保持连接30秒
        timeout_graceful_shutdown=30,  # 优雅关闭30秒
        access_log=True,  # 启用访问日志
        log_level="info"  # 日志级别
    )
