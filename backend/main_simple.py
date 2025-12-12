import sqlite3
import json
import uuid
import os
import shutil
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import hashlib
import jwt

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

# 数据库文件
DB_FILE = "auth_prototype.db"

# JWT配置
JWT_SECRET = "your-secret-key-change-in-production"
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# 文件存储目录
UPLOAD_DIR = "uploads"
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

def init_database():
    """初始化SQLite数据库"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 用户表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            role TEXT DEFAULT 'user'
        )
    ''')
    
    # 检查并添加role字段（如果不存在）
    cursor.execute("PRAGMA table_info(users)")
    columns = [column[1] for column in cursor.fetchall()]
    if 'role' not in columns:
        print("Adding role column to users table")
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
        # 自动将现有 @rakwireless.com 用户设置为 'rakwireless'
        cursor.execute("UPDATE users SET role = 'rakwireless' WHERE email LIKE '%@rakwireless.com'")
        print("✅ Migrated existing RAK Wireless users to 'rakwireless' role")
    
    # 请求表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT UNIQUE NOT NULL,
            company_name TEXT,
            rak_id TEXT,
            submit_time TEXT,
            status TEXT DEFAULT 'Open',
            assignee TEXT,
            config_data TEXT,
            changes TEXT,
            original_config TEXT,
            tags TEXT,
            user_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # 检查并添加tags列（如果不存在）
    cursor.execute("PRAGMA table_info(requests)")
    columns = [column[1] for column in cursor.fetchall()]
    if 'tags' not in columns:
        cursor.execute("ALTER TABLE requests ADD COLUMN tags TEXT")
    
    # 迁移现有数据：将'pending'状态更新为'Open'
    try:
        cursor.execute("UPDATE requests SET status = 'Open' WHERE status = 'pending' OR status = 'Pending'")
        conn.commit()
        updated_count = cursor.rowcount
        if updated_count > 0:
            print(f"✅ Migrated {updated_count} requests from 'pending' to 'Open'")
    except Exception as e:
        print(f"⚠️ Migration warning: {e}")
        conn.rollback()
    
    # 检查并添加created_at字段（如果不存在）
    cursor.execute("PRAGMA table_info(requests)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'created_at' not in columns:
        print("Adding created_at column to requests table")
        cursor.execute('ALTER TABLE requests ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
    
    # 创建/更新 admin 用户
    admin_user_email = "admin@rakwireless.com"
    admin_user_password = "rakwireless"
    admin_user_name = "Admin"
    
    # 检查 admin 用户是否已存在
    cursor.execute("SELECT id, role FROM users WHERE email = ?", (admin_user_email,))
    existing_admin = cursor.fetchone()
    
    if not existing_admin:
        # 创建 admin 用户
        password_hash = get_password_hash(admin_user_password)
        cursor.execute('''
            INSERT INTO users (email, password_hash, name, is_active, role)
            VALUES (?, ?, ?, 1, 'admin')
        ''', (admin_user_email, password_hash, admin_user_name))
        print(f"✅ Created admin user: {admin_user_email}")
    else:
        # 更新现有用户为 admin 角色，并更新密码
        password_hash = get_password_hash(admin_user_password)
        cursor.execute('''
            UPDATE users 
            SET role = 'admin', password_hash = ?, name = ?
            WHERE email = ?
        ''', (password_hash, admin_user_name, admin_user_email))
        print(f"✅ Updated admin user: {admin_user_email} (role: admin, password updated)")
    
    # 模板表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'Custom',
            config_data TEXT NOT NULL,
            variables TEXT,
            tags TEXT,
            is_public BOOLEAN DEFAULT 0,
            created_by INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            version INTEGER DEFAULT 1,
            usage_count INTEGER DEFAULT 0,
            FOREIGN KEY (created_by) REFERENCES users (id)
        )
    ''')
    
    # 模板使用记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS template_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id TEXT NOT NULL,
            request_id TEXT,
            used_by INTEGER NOT NULL,
            used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            variables_used TEXT,
            FOREIGN KEY (template_id) REFERENCES templates (template_id),
            FOREIGN KEY (used_by) REFERENCES users (id)
        )
    ''')
    
    # 模板收藏表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS template_favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (template_id) REFERENCES templates (template_id),
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(template_id, user_id)
        )
    ''')
    
    conn.commit()
    conn.close()

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
        
        # 从数据库获取用户信息
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, name, role FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        conn.close()
        
        if not user:
            print(f"❌ User not found in database: {email}")
            raise HTTPException(status_code=401, detail="User not found")
        
        print(f"✅ User found: {user}")
        user_dict = {
            "id": user[0],
            "email": user[1], 
            "name": user[2],
            "role": user[3] if len(user) > 3 else None  # 兼容旧数据
        }
        # 获取用户角色（优先使用数据库值，否则基于邮箱判断）
        user_role = get_user_role(user[1], user_dict.get("role"))
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
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 查找用户
        cursor.execute("SELECT id, email, password_hash, name FROM users WHERE email = ?", (user_data.email,))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        user_id, email, password_hash, name = user
        
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
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": email,
                "name": display_name
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/auth/register")
async def register(user_data: UserCreate):
    """用户注册"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查用户是否已存在
        cursor.execute("SELECT id FROM users WHERE email = ?", (user_data.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # 创建新用户
        password_hash = get_password_hash(user_data.password)
        # 自动设置角色：@rakwireless.com 邮箱自动设置为 'rakwireless'
        auto_role = get_user_role(user_data.email)
        cursor.execute('''
            INSERT INTO users (email, password_hash, name, is_active, role)
            VALUES (?, ?, ?, 1, ?)
        ''', (user_data.email, password_hash, user_data.name, auto_role))
        
        conn.commit()
        return {"message": "User created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    """获取所有用户列表（仅RAK Wireless和Admin用户可用）"""
    user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
    
    if not is_rakwireless(user_role):
        raise HTTPException(status_code=403, detail="Only RAK Wireless employees can access user list")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT id, email, name, role FROM users
            WHERE is_active = 1
            ORDER BY email ASC
        ''')
        
        users = []
        for row in cursor.fetchall():
            # 如果没有role，基于邮箱自动判断
            role = row[3] if len(row) > 3 and row[3] else get_user_role(row[1])
            users.append({
                "id": row[0],
                "email": row[1],
                "name": row[2] if row[2] else row[1].split('@')[0],
                "role": role  # 添加角色信息
            })
        
        return users
    except Exception as e:
        print(f"❌ Error in get_users: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/requests")
async def get_requests(current_user: dict = Depends(get_current_user)):
    """获取所有请求 - 根据用户权限过滤"""
    print(f"=== GET /api/requests ===")
    print(f"Current user: {current_user}")
    print(f"Is RAK Wireless user: {current_user.get('is_rakwireless', False)}")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 先检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='requests'")
        table_exists = cursor.fetchone()
        print(f"Requests table exists: {table_exists}")
        
        # 检查表结构
        cursor.execute("PRAGMA table_info(requests)")
        columns = cursor.fetchall()
        print(f"Requests table columns: {columns}")
        
        # 根据用户权限构建查询
        # rakwireless 和 admin 用户可以看到所有请求，其他用户只能看到自己创建的请求
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        if can_view_all(user_role):
            # RAK Wireless用户：显示所有请求
            print("✅ RAK Wireless user - showing all requests")
            cursor.execute('''
                SELECT r.request_id, r.company_name, r.rak_id, r.submit_time, r.status, r.assignee, r.config_data, r.changes, r.original_config, r.tags, u.email as creator_email
                FROM requests r
                LEFT JOIN users u ON r.user_id = u.id
                ORDER BY r.id DESC
            ''')
        else:
            # 非RAK Wireless用户：只显示自己创建的请求
            print(f"✅ External user - showing only own requests (user_id={current_user['id']})")
            cursor.execute('''
                SELECT r.request_id, r.company_name, r.rak_id, r.submit_time, r.status, r.assignee, r.config_data, r.changes, r.original_config, r.tags, u.email as creator_email
                FROM requests r
                LEFT JOIN users u ON r.user_id = u.id
                WHERE r.user_id = ?
                ORDER BY r.id DESC
            ''', (current_user["id"],))
        
        requests = []
        for row in cursor.fetchall():
            requests.append({
                "id": row[0],
                "companyName": row[1],
                "rakId": row[2],
                "submitTime": row[3],
                "status": row[4],
                "assignee": row[5],
                "configData": json.loads(row[6]) if row[6] else {},
                "changes": json.loads(row[7]) if row[7] else {},
                "originalConfig": json.loads(row[8]) if row[8] else {},
                "tags": json.loads(row[9]) if row[9] else [],
                "creatorEmail": row[10]  # 添加创建者邮箱
            })
        
        print(f"Found {len(requests)} requests")
        for req in requests:
            print(f"Request {req['id']}: creator_email = {req.get('creatorEmail', 'NOT_FOUND')}")
        return requests
    except Exception as e:
        print(f"❌ Error in get_requests: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/requests/{request_id}")
async def get_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """获取特定请求 - 检查访问权限"""
    print(f"=== GET REQUEST ===")
    print(f"Request ID: {request_id}")
    print(f"Current user: {current_user}")
    print(f"Is RAK Wireless user: {current_user.get('is_rakwireless', False)}")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT r.request_id, r.company_name, r.rak_id, r.submit_time, r.status, r.assignee, r.config_data, r.changes, r.original_config, r.tags, u.email as creator_email, r.user_id
            FROM requests r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.request_id = ?
        ''', (request_id,))
        
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Request not found")
        
        # 权限检查：非 rakwireless/admin 用户只能访问自己创建的请求
        creator_user_id = row[11]  # user_id
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        
        if not can_view_all(user_role) and creator_user_id != current_user["id"]:
            print(f"❌ Permission denied: User {current_user['id']} tried to access request {request_id} created by user {creator_user_id}")
            raise HTTPException(status_code=403, detail="You don't have permission to access this request")
        
        print(f"✅ Permission granted for request {request_id}")
        
        # 调试：检查返回的数据
        config_data = json.loads(row[6]) if row[6] else {}
        print(f"Config Data Keys: {list(config_data.keys()) if config_data else 'None'}")
        print(f"Config Data Sample: {str(config_data)[:200]}...")
        
        return {
            "id": row[0],
            "companyName": row[1],
            "rakId": row[2],
            "submitTime": row[3],
            "status": row[4],
            "assignee": row[5],
            "configData": config_data,
            "changes": json.loads(row[7]) if row[7] else {},
            "originalConfig": json.loads(row[8]) if row[8] else {},
            "tags": json.loads(row[9]) if row[9] else [],
            "creatorEmail": row[10]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/requests")
async def create_request(request_data: RequestCreate, current_user: dict = Depends(get_current_user)):
    """创建新请求"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        request_id = f"REQ{str(uuid.uuid4())[:6].upper()}"
        submit_time = datetime.now().isoformat()
        
        # 调试：检查配置数据
        print(f"=== Creating Request ===")
        print(f"Request ID: {request_id}")
        print(f"Company: {request_data.companyName}")
        print(f"RAK ID: {request_data.rakId}")
        print(f"Config Data Keys: {list(request_data.configData.keys()) if request_data.configData else 'None'}")
        print(f"Config Data Sample: {str(request_data.configData)[:200]}...")
        
        # 处理tags
        tags_json = json.dumps(request_data.tags if request_data.tags else [])
        
        # 使用事务：如果后续步骤失败，回滚整个操作
        cursor.execute('''
            INSERT INTO requests (request_id, company_name, rak_id, submit_time, status, assignee, config_data, changes, original_config, tags, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            request_id,
            request_data.companyName,
            request_data.rakId,
            submit_time,
            "Open",
            "",
            json.dumps(request_data.configData),
            json.dumps(request_data.changes),
            json.dumps(request_data.originalConfig),
            tags_json,
            current_user["id"]
        ))
        
        # 创建初始活动记录（记录创建者信息）
        # 如果活动记录创建失败，不影响主请求的创建
        try:
            creator_name = current_user.get("name") or current_user.get("email", "Unknown")
            cursor.execute('''
                INSERT INTO activities (request_id, user_id, activity_type, description)
                VALUES (?, ?, ?, ?)
            ''', (request_id, current_user["id"], "created", 
                  f"Request created by {creator_name} for {request_data.companyName}"))
        except Exception as activity_error:
            # 活动记录创建失败不影响主请求，只记录日志
            print(f"⚠️ Warning: Failed to create activity record: {str(activity_error)}")
        
        # 一次性提交所有更改
        conn.commit()
        
        print(f"✅ Request created successfully: {request_id}")
        return {"message": "Request created successfully", "request_id": request_id}
    except Exception as e:
        # 如果出错，回滚事务
        conn.rollback()
        print(f"❌ Error creating request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/requests/{request_id}")
async def delete_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """删除单个请求 - 检查删除权限"""
    print(f"=== DELETE REQUEST ===")
    print(f"Request ID: {request_id}")
    print(f"Current User: {current_user}")
    print(f"Is RAK Wireless user: {current_user.get('is_rakwireless', False)}")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查请求是否存在
        cursor.execute("SELECT id, user_id FROM requests WHERE request_id = ?", (request_id,))
        request = cursor.fetchone()
        
        if not request:
            raise HTTPException(status_code=404, detail="Request not found")
        
        request_user_id = request[1]
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
        cursor.execute("DELETE FROM requests WHERE request_id = ?", (request_id,))
        conn.commit()
        
        return {"message": "Request deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.put("/api/requests/{request_id}")
async def update_request(request_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    """更新请求状态或分配人 - 检查编辑权限"""
    print(f"=== UPDATE REQUEST ===")
    print(f"Request ID: {request_id}")
    print(f"Current User: {current_user}")
    print(f"Is RAK Wireless user: {current_user.get('is_rakwireless', False)}")
    print(f"Request Data: {request_data}")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 先检查请求是否存在
        cursor.execute("SELECT id, user_id FROM requests WHERE request_id = ?", (request_id,))
        request = cursor.fetchone()
        
        if not request:
            print(f"❌ Request {request_id} not found in database")
            raise HTTPException(status_code=404, detail="Request not found")
        
        request_user_id = request[1]
        current_user_id = current_user['id']
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        is_creator = request_user_id == current_user_id
        
        print(f"✅ Request found: ID={request[0]}, Creator User ID={request_user_id}")
        print(f"Current user ID: {current_user_id}, Role: {user_role}")
        
        # 权限检查：只有创建者或 rakwireless/admin 用户可以编辑请求
        if not can_view_all(user_role) and not is_creator:
            print(f"❌ Permission denied: User {current_user_id} tried to edit request {request_id} created by user {request_user_id}")
            raise HTTPException(status_code=403, detail="You can only edit your own requests")
        
        # 非 rakwireless/admin 用户不能修改状态（workflow）
        if not is_rakwireless(user_role) and "status" in request_data:
            print(f"❌ Permission denied: Non-RAK Wireless user {current_user_id} tried to update status for request {request_id}")
            raise HTTPException(status_code=403, detail="Only RAK Wireless employees can update workflow status")
        
        print(f"✅ Permission granted for request {request_id}")
        
        # 构建更新字段
        update_fields = []
        update_values = []
        
        if "status" in request_data:
            update_fields.append("status = ?")
            update_values.append(request_data["status"])
        
        if "assignee" in request_data:
            update_fields.append("assignee = ?")
            update_values.append(request_data["assignee"])
        
        if "companyName" in request_data:
            update_fields.append("company_name = ?")
            update_values.append(request_data["companyName"])
        
        if "rakId" in request_data:
            update_fields.append("rak_id = ?")
            update_values.append(request_data["rakId"])
        
        if "configData" in request_data:
            update_fields.append("config_data = ?")
            update_values.append(json.dumps(request_data["configData"]))
        
        if "changes" in request_data:
            update_fields.append("changes = ?")
            update_values.append(json.dumps(request_data["changes"]))
        
        if "originalConfig" in request_data:
            update_fields.append("original_config = ?")
            update_values.append(json.dumps(request_data["originalConfig"]))
        
        if "tags" in request_data:
            update_fields.append("tags = ?")
            update_values.append(json.dumps(request_data["tags"]))
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        # 获取当前请求的旧值（用于记录history）- 必须在UPDATE之前获取
        cursor.execute("SELECT status, assignee FROM requests WHERE request_id = ?", (request_id,))
        old_row = cursor.fetchone()
        old_status = old_row[0] if old_row else None
        old_assignee = old_row[1] if old_row else None
        print(f"📝 Old values - Status: {old_status}, Assignee: {old_assignee}")
        
        # 执行更新
        update_values.append(request_id)
        
        cursor.execute(f"""
            UPDATE requests 
            SET {', '.join(update_fields)}
            WHERE request_id = ?
        """, update_values)
        
        conn.commit()
        
        # 自动记录history到activities表
        # 确保activities表存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'")
        activities_table_exists = cursor.fetchone()
        
        if not activities_table_exists:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS activities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    activity_type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (request_id) REFERENCES requests (request_id),
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            conn.commit()
        
        # 记录status变化
        if "status" in request_data and request_data["status"] != old_status:
            new_status = request_data["status"]
            operator_name = current_user.get("name") or current_user.get("email", "Unknown")
            cursor.execute('''
                INSERT INTO activities (request_id, user_id, activity_type, description)
                VALUES (?, ?, ?, ?)
            ''', (request_id, current_user["id"], "status_changed", 
                  f"{operator_name} updated workflow process of request {request_id} from '{old_status}' to '{new_status}'"))
        
        # 记录assignee变化
        if "assignee" in request_data:
            # 获取新值（处理None、空字符串等情况）
            new_assignee_raw = request_data.get("assignee")
            new_assignee = new_assignee_raw.strip() if new_assignee_raw and isinstance(new_assignee_raw, str) else (new_assignee_raw or "")
            
            # 获取旧值（处理None、空字符串等情况）
            old_assignee_raw = old_assignee
            old_assignee_value = old_assignee_raw.strip() if old_assignee_raw and isinstance(old_assignee_raw, str) else (old_assignee_raw or "")
            
            print(f"📝 Assignee change check - Old: '{old_assignee_value}' (type: {type(old_assignee_raw)}), New: '{new_assignee}' (type: {type(new_assignee_raw)})")
            
            # 比较新旧值（处理None和空字符串的情况）
            if new_assignee != old_assignee_value:
                print(f"✅ Assignee changed from '{old_assignee_value}' to '{new_assignee}', recording activity...")
                if new_assignee:
                    # 获取被分配用户的姓名
                    cursor.execute("SELECT name, email FROM users WHERE email = ?", (new_assignee,))
                    assignee_info = cursor.fetchone()
                    if assignee_info:
                        # 优先使用name，如果name为空则使用email
                        assignee_name = assignee_info[0] if assignee_info[0] else assignee_info[1]
                    else:
                        assignee_name = new_assignee
                    
                    # 获取操作者姓名
                    operator_name = current_user.get("name") or current_user.get("email", "Unknown")
                    
                    description = f"{operator_name} assigned request {request_id} to {assignee_name}"
                    print(f"📝 Recording assignment: {description}")
                    cursor.execute('''
                        INSERT INTO activities (request_id, user_id, activity_type, description)
                        VALUES (?, ?, ?, ?)
                    ''', (request_id, current_user["id"], "assigned", description))
                else:
                    # 取消分配 - 需要记录被取消分配的用户
                    operator_name = current_user.get("name") or current_user.get("email", "Unknown")
                    # 获取被取消分配的用户信息（从旧值中获取）
                    if old_assignee:
                        cursor.execute("SELECT name, email FROM users WHERE email = ?", (old_assignee,))
                        unassignee_info = cursor.fetchone()
                        if unassignee_info:
                            unassignee_name = unassignee_info[0] if unassignee_info[0] else unassignee_info[1]
                        else:
                            unassignee_name = old_assignee
                        description = f"{operator_name} unassigned request {request_id} from {unassignee_name}"
                    else:
                        description = f"{operator_name} unassigned this request"
                    print(f"📝 Recording unassignment: {description}")
                    cursor.execute('''
                        INSERT INTO activities (request_id, user_id, activity_type, description)
                        VALUES (?, ?, ?, ?)
                    ''', (request_id, current_user["id"], "unassigned", description))
            else:
                print(f"⚠️ Assignee unchanged (both are '{old_assignee_value}'), skipping activity record")
        
        conn.commit()
        
        print(f"✅ Request {request_id} updated successfully")
        return {"message": "Request updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/requests/batch/delete")
async def delete_requests_batch(request_data: dict, current_user: dict = Depends(get_current_user)):
    """批量删除请求 - 所有用户都可以删除自己创建的请求"""
    print(f"=== BATCH DELETE REQUESTS ===")
    print(f"Current User: {current_user}")
    user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
    print(f"User Role: {user_role}")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        request_ids = request_data.get("ids", [])
        if not request_ids:
            raise HTTPException(status_code=400, detail="No request IDs provided")
        
        # 检查所有请求是否存在且属于当前用户
        placeholders = ",".join(["?" for _ in request_ids])
        cursor.execute(f"SELECT request_id FROM requests WHERE request_id IN ({placeholders}) AND user_id = ?", 
                      request_ids + [current_user["id"]])
        existing_requests = [row[0] for row in cursor.fetchall()]
        
        # 只删除属于当前用户的请求（Admin可以删除任何请求）
        if not can_delete_any(user_role):
            # 非Admin用户只能删除自己创建的请求
            if len(existing_requests) != len(request_ids):
                raise HTTPException(status_code=403, detail="Some requests not found or you don't have permission to delete them")
        else:
            # Admin可以删除任何请求，检查请求是否存在即可
            placeholders_admin = ",".join(["?" for _ in request_ids])
            cursor.execute(f"SELECT request_id FROM requests WHERE request_id IN ({placeholders_admin})", request_ids)
            existing_requests = [row[0] for row in cursor.fetchall()]
            if len(existing_requests) != len(request_ids):
                raise HTTPException(status_code=404, detail="Some requests not found")
        
        # 批量删除请求
        placeholders = ",".join(["?" for _ in request_ids])
        if can_delete_any(user_role):
            # Admin可以删除任何请求
            cursor.execute(f"DELETE FROM requests WHERE request_id IN ({placeholders})", request_ids)
            deleted_count = cursor.rowcount
        else:
            # 其他用户只能删除自己创建的请求
            cursor.execute(f"DELETE FROM requests WHERE request_id IN ({placeholders}) AND user_id = ?", 
                          request_ids + [current_user["id"]])
            deleted_count = cursor.rowcount
        
        conn.commit()
        
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
    finally:
        conn.close()

@app.get("/api/debug/users")
async def debug_users():
    """调试：查看所有用户"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, email, name, created_at FROM users")
        users = []
        for row in cursor.fetchall():
            users.append({
                "id": row[0],
                "email": row[1],
                "name": row[2],
                "created_at": row[3]
            })
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

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
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查所有表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        # 检查requests表结构
        cursor.execute("PRAGMA table_info(requests)")
        columns = cursor.fetchall()
        
        # 检查requests表数据
        cursor.execute("SELECT COUNT(*) FROM requests")
        count = cursor.fetchone()[0]
        
        return {
            "tables": tables,
            "requests_columns": columns,
            "requests_count": count
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

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
        
        # 存储文件信息到数据库
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # 创建表（如果不存在）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                filename TEXT,
                file_path TEXT,
                file_size INTEGER,
                user_id INTEGER,
                upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # 创建comments表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (request_id) REFERENCES requests (request_id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # 创建activities表（活动流）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                activity_type TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (request_id) REFERENCES requests (request_id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        
        # 检查并添加缺失的列
        try:
            cursor.execute("ALTER TABLE files ADD COLUMN original_name TEXT")
            print("Added original_name column to files table")
        except sqlite3.OperationalError:
            # 列已存在，忽略错误
            print("original_name column already exists")
        
        cursor.execute('''
            INSERT INTO files (id, original_name, filename, file_path, file_size, user_id)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (file_id, file.filename, filename, file_path, file.size, current_user["id"]))
        
        conn.commit()
        conn.close()
        
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
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # 首先尝试查找文件（可能是上传者自己下载）
        cursor.execute('''
            SELECT original_name, file_path FROM files 
            WHERE id = ?
        ''', (file_id,))
        
        row = cursor.fetchone()
        if not row:
            print(f"❌ 文件未找到: {file_id}")
            conn.close()
            raise HTTPException(status_code=404, detail="File not found")
        
        original_name, file_path = row
        
        # 检查文件是否在评论附件中（允许任何人下载评论附件）
        # 或者检查是否是当前用户上传的文件
        cursor.execute('''
            SELECT user_id FROM files WHERE id = ?
        ''', (file_id,))
        file_owner = cursor.fetchone()
        
        # 检查文件是否属于评论附件
        cursor.execute('''
            SELECT request_id FROM comments 
            WHERE attachments LIKE ? OR attachments LIKE ?
        ''', (f'%{file_id}%', f'%"{file_id}"%'))
        
        is_comment_attachment = cursor.fetchone() is not None
        
        # 如果是评论附件或者是文件所有者，允许下载
        if not is_comment_attachment and file_owner and file_owner[0] != current_user["id"]:
            print(f"❌ 权限不足: 用户 {current_user['id']} 尝试下载文件 {file_id}")
            conn.close()
            raise HTTPException(status_code=403, detail="You don't have permission to download this file")
        
        conn.close()
        
        print(f"📄 文件信息: {original_name} -> {file_path}")
        
        if not os.path.exists(file_path):
            print(f"❌ 文件不存在于磁盘: {file_path}")
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
        print(f"Database file: {DB_FILE}")
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # 检查所有表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        conn.close()
        
        result = {
            "status": "success",
            "database_file": DB_FILE,
            "tables": [table[0] for table in tables]
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
            "database_file": DB_FILE
        }

# 评论相关API
@app.get("/api/requests/{request_id}/comments")
async def get_comments(request_id: str, current_user: dict = Depends(get_current_user)):
    """获取请求的评论列表"""
    print(f"=== GET COMMENTS ===")
    print(f"Request ID: {request_id}")
    print(f"Current User: {current_user}")
    
    try:
        print(f"Connecting to database: {DB_FILE}")
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        print("Database connection successful")
        
        # 检查comments表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'")
        table_exists = cursor.fetchone()
        print(f"Comments table exists: {table_exists}")
        
        if not table_exists:
            print("Comments table does not exist, creating it...")
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    attachments TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (request_id) REFERENCES requests (request_id),
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            conn.commit()
            print("Comments table created successfully")
        else:
            # 检查表结构
            cursor.execute("PRAGMA table_info(comments)")
            columns = cursor.fetchall()
            print(f"Comments table columns: {columns}")
            
            # 检查是否有user_id列
            has_user_id = any(col[1] == 'user_id' for col in columns)
            print(f"Has user_id column: {has_user_id}")
            
            if not has_user_id:
                print("Adding user_id column to comments table...")
                cursor.execute("ALTER TABLE comments ADD COLUMN user_id INTEGER")
                conn.commit()
                print("user_id column added successfully")
        
        # 使用JOIN查询获取真实的用户信息
        cursor.execute('''
            SELECT c.id, c.content, c.attachments, c.created_at, u.name, u.email
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.request_id = ?
            ORDER BY c.created_at ASC
        ''', (request_id,))
        
        comments = []
        for row in cursor.fetchall():
            # 解析附件（JSON字符串）
            attachments = []
            if row[2]:  # attachments列
                try:
                    attachments = json.loads(row[2]) if isinstance(row[2], str) else row[2]
                except:
                    attachments = []
            
            comments.append({
                "id": row[0],
                "content": row[1],
                "attachments": attachments,
                "createdAt": row[3],
                "authorName": row[4] or "Unknown User",  # 使用真实用户名
                "authorEmail": row[5] or "unknown@example.com"  # 使用真实邮箱
            })
        
        print(f"✅ Found {len(comments)} comments")
        return comments
    except Exception as e:
        print(f"❌ Error in get_comments: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.post("/api/requests/{request_id}/comments")
async def create_comment(request_id: str, comment_data: CommentCreate, current_user: dict = Depends(get_current_user)):
    """创建新评论"""
    print(f"=== CREATE COMMENT ===")
    print(f"Request ID: {request_id}")
    print(f"Comment Data: {comment_data}")
    print(f"Current User: {current_user}")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查comments表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'")
        table_exists = cursor.fetchone()
        print(f"Comments table exists: {table_exists}")
        
        if not table_exists:
            print("Comments table does not exist, creating it...")
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    attachments TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (request_id) REFERENCES requests (request_id),
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            conn.commit()
            print("Comments table created successfully")
        else:
            # 检查表结构
            cursor.execute("PRAGMA table_info(comments)")
            columns = cursor.fetchall()
            print(f"Comments table columns: {columns}")
            
            # 检查是否有author列
            has_author = any(col[1] == 'author' for col in columns)
            print(f"Has author column: {has_author}")
            
            if has_author:
                print("Comments table has author column, this might cause issues")
                print("Warning: comments table has unexpected 'author' column")
        
        # 检查请求是否存在
        cursor.execute("SELECT id FROM requests WHERE request_id = ?", (request_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Request not found")
        
        # 验证：必须有内容或附件
        if not comment_data.content.strip() and (not comment_data.attachments or len(comment_data.attachments) == 0):
            raise HTTPException(status_code=400, detail="Comment must have content or attachments")
        
        # 插入评论 - 检查表结构来决定INSERT语句
        cursor.execute("PRAGMA table_info(comments)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        print(f"Available columns: {column_names}")
        
        # 检查并添加attachments列（如果不存在）
        has_attachments = any(col[1] == 'attachments' for col in columns)
        if not has_attachments:
            try:
                cursor.execute("ALTER TABLE comments ADD COLUMN attachments TEXT")
                conn.commit()
                print("Added attachments column to comments table")
                # 重新获取列信息
                cursor.execute("PRAGMA table_info(comments)")
                columns = cursor.fetchall()
                column_names = [col[1] for col in columns]
            except sqlite3.OperationalError:
                print("attachments column already exists or failed to add")
        
        # 构建动态INSERT语句
        required_columns = ['request_id', 'user_id', 'content']
        optional_columns = ['author', 'author_email', 'author_name', 'attachments']
        
        # 检查哪些可选列存在
        existing_optional = [col for col in optional_columns if col in column_names]
        print(f"Existing optional columns: {existing_optional}")
        
        # 构建列名和值
        insert_columns = required_columns + existing_optional
        placeholders = ['?' for _ in insert_columns]
        
        # 构建值列表
        values = [request_id, current_user["id"], comment_data.content]
        
        # 添加可选列的值
        if 'author' in existing_optional:
            values.append(current_user.get("name", "Unknown"))
        if 'author_email' in existing_optional:
            values.append(current_user.get("email", "unknown@example.com"))
        if 'author_name' in existing_optional:
            values.append(current_user.get("name", "Unknown"))
        if 'attachments' in existing_optional:
            # 将附件列表转换为JSON字符串
            attachments_json = json.dumps(comment_data.attachments or [])
            values.append(attachments_json)
        
        print(f"Insert columns: {insert_columns}")
        print(f"Insert values: {values}")
        
        # 执行动态INSERT
        insert_sql = f'''
            INSERT INTO comments ({', '.join(insert_columns)})
            VALUES ({', '.join(placeholders)})
        '''
        print(f"SQL: {insert_sql}")
        
        cursor.execute(insert_sql, values)
        
        conn.commit()
        
        # 检查activities表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'")
        activities_table_exists = cursor.fetchone()
        print(f"Activities table exists: {activities_table_exists}")
        
        if not activities_table_exists:
            print("Activities table does not exist, creating it...")
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS activities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    activity_type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (request_id) REFERENCES requests (request_id),
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            conn.commit()
            print("Activities table created successfully")
        
        # 创建活动记录
        cursor.execute('''
            INSERT INTO activities (request_id, user_id, activity_type, description)
            VALUES (?, ?, ?, ?)
        ''', (request_id, current_user["id"], "comment", f"Added a comment: {comment_data.content[:50]}..."))
        
        conn.commit()
        
        print(f"✅ Comment created successfully")
        return {"message": "Comment created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error in create_comment: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.delete("/api/requests/{request_id}/comments/{comment_id}")
async def delete_comment(request_id: str, comment_id: int, current_user: dict = Depends(get_current_user)):
    """删除评论"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查评论是否存在且属于当前用户
        cursor.execute('''
            SELECT id FROM comments 
            WHERE id = ? AND request_id = ? AND user_id = ?
        ''', (comment_id, request_id, current_user["id"]))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Comment not found")
        
        # 删除评论
        cursor.execute('''
            DELETE FROM comments 
            WHERE id = ? AND request_id = ? AND user_id = ?
        ''', (comment_id, request_id, current_user["id"]))
        
        conn.commit()
        
        return {"message": "Comment deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# 活动流相关API
@app.get("/api/requests/{request_id}/activities")
async def get_activities(request_id: str, current_user: dict = Depends(get_current_user)):
    """获取请求的活动流"""
    print(f"=== GET ACTIVITIES ===")
    print(f"Request ID: {request_id}")
    print(f"Current User: {current_user}")
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查activities表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'")
        table_exists = cursor.fetchone()
        print(f"Activities table exists: {table_exists}")
        
        if not table_exists:
            print("Activities table does not exist, creating it...")
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS activities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    activity_type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (request_id) REFERENCES requests (request_id),
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            ''')
            conn.commit()
            print("Activities table created successfully")
        
        # 使用JOIN查询获取真实的用户信息
        cursor.execute('''
            SELECT a.id, a.activity_type, a.description, a.created_at, u.name, u.email
            FROM activities a
            JOIN users u ON a.user_id = u.id
            WHERE a.request_id = ?
            ORDER BY a.created_at DESC
        ''', (request_id,))
        
        activities = []
        for row in cursor.fetchall():
            activities.append({
                "id": row[0],
                "activityType": row[1],
                "description": row[2],
                "createdAt": row[3],
                "authorName": row[4] or "Unknown User",  # 使用真实用户名
                "authorEmail": row[5] or "unknown@example.com"  # 使用真实邮箱
            })
        
        print(f"✅ Found {len(activities)} activities")
        return activities
    except Exception as e:
        print(f"❌ Error in get_activities: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/users/me/assignments")
async def get_my_assignments(current_user: dict = Depends(get_current_user)):
    """获取当前用户相关的活动
    提醒逻辑：
    1. 当前用户创建的request：所有assign和status_changed活动都提醒
    2. 非当前用户创建的request：只有assign/unassigned活动，且assignee是当前用户时才提醒
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        user_email = current_user.get("email")
        user_id = current_user.get("id")
        if not user_email or not user_id:
            return []
        
        # 检查activities表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'")
        table_exists = cursor.fetchone()
        
        if not table_exists:
            return []
        
        print(f"🔍 Searching notifications for user: {user_email} (ID: {user_id})")
        
        # 查询逻辑：
        # 1. 当前用户创建的request：所有assign和status_changed活动
        # 2. 非当前用户创建的request：只有assign/unassigned活动，且assignee是当前用户
        cursor.execute('''
            SELECT DISTINCT a.id, a.request_id, a.activity_type, a.description, a.created_at, u.name, u.email
            FROM activities a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN requests r ON a.request_id = r.request_id
            WHERE (
                -- 情况1: 当前用户创建的request的所有assign和status_changed活动
                (r.user_id = ? AND (
                    a.activity_type = 'assigned' 
                    OR a.activity_type = 'status_changed'
                ))
                -- 情况2: 非当前用户创建的request，只有assign/unassigned活动，且assignee是当前用户
                OR (r.user_id != ? AND (
                    a.activity_type = 'assigned' OR a.activity_type = 'unassigned'
                ) AND (
                    (a.activity_type = 'assigned' AND (
                        r.assignee = ?
                        OR a.description LIKE ?
                    ))
                    OR (a.activity_type = 'unassigned' AND a.description LIKE ?)
                ))
            )
            ORDER BY a.created_at DESC
        ''', (user_id, user_id, user_email, f'%to {user_email}%', f'%from {user_email}%'))
        
        rows = cursor.fetchall()
        print(f"✅ Found {len(rows)} assignment activities (before dedup)")
        
        # 去重：按request_id和activity_type组合去重，保留最新的
        request_activity_map = {}
        for row in rows:
            request_id = row[1]
            activity_type = row[2]
            key = f"{request_id}_{activity_type}"
            
            if key not in request_activity_map:
                request_activity_map[key] = row
            else:
                # 比较时间，保留最新的
                existing_time = request_activity_map[key][4]
                current_time = row[4]
                if current_time > existing_time:
                    request_activity_map[key] = row
        
        activities = []
        for row in request_activity_map.values():
            print(f"  - Activity ID: {row[0]}, Request: {row[1]}, Type: {row[2]}, Description: {row[3]}")
            activities.append({
                "id": row[0],
                "requestId": row[1],
                "activityType": row[2],
                "description": row[3],
                "createdAt": row[4],
                "authorName": row[5] or "Unknown",
                "authorEmail": row[6] or "unknown@example.com"
            })
        
        print(f"✅ Returning {len(activities)} unique assignment activities (after dedup)")
        return activities
    except Exception as e:
        print(f"❌ Error in get_my_assignments: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/requests/{request_id}/activities")
async def create_activity(request_id: str, activity_data: ActivityCreate, current_user: dict = Depends(get_current_user)):
    """创建新活动"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查请求是否存在
        cursor.execute("SELECT id FROM requests WHERE request_id = ?", (request_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Request not found")
        
        # 插入活动
        cursor.execute('''
            INSERT INTO activities (request_id, user_id, activity_type, description)
            VALUES (?, ?, ?, ?)
        ''', (request_id, current_user["id"], activity_data.activity_type, activity_data.description))
        
        conn.commit()
        
        return {"message": "Activity created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

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
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        template_id = f"TMP{str(uuid.uuid4())[:6].upper()}"
        
        cursor.execute('''
            INSERT INTO templates (template_id, name, description, category, config_data, variables, tags, is_public, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            template_id,
            template_data.name,
            template_data.description,
            template_data.category,
            json.dumps(template_data.configData),
            json.dumps(template_data.variables or []),
            json.dumps(template_data.tags or []),
            1 if template_data.isPublic else 0,
            current_user["id"]
        ))
        
        conn.commit()
        return {"message": "Template created successfully", "template_id": template_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.get("/api/templates/categories")
async def get_template_categories(current_user: dict = Depends(get_current_user)):
    """获取模板分类列表"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        query = "SELECT DISTINCT category FROM templates WHERE 1=1"
        params = []
        
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        if not is_rakwireless(user_role):
            query += " AND (is_public = 1 OR created_by = ?)"
            params.append(current_user["id"])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        categories = [row[0] for row in rows if row[0]]
        return categories
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/templates")
async def get_templates(
    category: Optional[str] = None,
    is_public: Optional[bool] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """获取模板列表"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        query = '''
            SELECT t.template_id, t.name, t.description, t.category, t.config_data, t.variables, 
                   t.tags, t.is_public, t.created_at, t.updated_at, t.version, t.usage_count,
                   u.email as created_by_email, u.name as created_by_name
            FROM templates t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE 1=1
        '''
        params = []
        
        # 权限过滤：只能看到公开模板或自己创建的模板
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        if not is_rakwireless(user_role):
            query += " AND (t.is_public = 1 OR t.created_by = ?)"
            params.append(current_user["id"])
        
        if category:
            query += " AND t.category = ?"
            params.append(category)
        
        if is_public is not None:
            query += " AND t.is_public = ?"
            params.append(1 if is_public else 0)
        
        if search:
            query += " AND (t.name LIKE ? OR t.description LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])
        
        query += " ORDER BY t.usage_count DESC, t.created_at DESC"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        templates = []
        for row in rows:
            templates.append({
                "id": row[0],
                "name": row[1],
                "description": row[2],
                "category": row[3],
                "configData": json.loads(row[4]) if row[4] else {},
                "variables": json.loads(row[5]) if row[5] else [],
                "tags": json.loads(row[6]) if row[6] else [],
                "isPublic": bool(row[7]),
                "createdAt": row[8],
                "updatedAt": row[9],
                "version": row[10],
                "usageCount": row[11],
                "createdBy": row[12] or "Unknown",
                "createdByName": row[13] or row[12] or "Unknown"
            })
        
        return templates
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/templates/{template_id}")
async def get_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """获取模板详情"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT t.template_id, t.name, t.description, t.category, t.config_data, t.variables,
                   t.tags, t.is_public, t.created_at, t.updated_at, t.version, t.usage_count,
                   u.email as created_by_email, u.name as created_by_name, t.created_by
            FROM templates t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.template_id = ?
        ''', (template_id,))
        
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # 权限检查
        is_creator = row[14] == current_user["id"]
        is_public = bool(row[7])
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        user_is_rakwireless = is_rakwireless(user_role)
        
        if not is_creator and not is_public and not user_is_rakwireless:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "category": row[3],
            "configData": json.loads(row[4]) if row[4] else {},
            "variables": json.loads(row[5]) if row[5] else [],
            "tags": json.loads(row[6]) if row[6] else [],
            "isPublic": bool(row[7]),
            "createdAt": row[8],
            "updatedAt": row[9],
            "version": row[10],
            "usageCount": row[11],
            "createdBy": row[12] or "Unknown",
            "createdByName": row[13] or row[12] or "Unknown"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.put("/api/templates/{template_id}")
async def update_template(
    template_id: str,
    template_data: TemplateUpdate,
    current_user: dict = Depends(get_current_user)
):
    """更新模板"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查模板是否存在和权限
        cursor.execute("SELECT created_by FROM templates WHERE template_id = ?", (template_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        if row[0] != current_user["id"] and not is_rakwireless(user_role):
            raise HTTPException(status_code=403, detail="Only template creator can update")
        
        # 构建更新语句
        updates = []
        params = []
        
        if template_data.name is not None:
            updates.append("name = ?")
            params.append(template_data.name)
        
        if template_data.description is not None:
            updates.append("description = ?")
            params.append(template_data.description)
        
        if template_data.category is not None:
            updates.append("category = ?")
            params.append(template_data.category)
        
        if template_data.configData is not None:
            updates.append("config_data = ?")
            params.append(json.dumps(template_data.configData))
        
        if template_data.variables is not None:
            updates.append("variables = ?")
            params.append(json.dumps(template_data.variables))
        
        if template_data.tags is not None:
            updates.append("tags = ?")
            params.append(json.dumps(template_data.tags))
        
        if template_data.isPublic is not None:
            updates.append("is_public = ?")
            params.append(1 if template_data.isPublic else 0)
        
        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            updates.append("version = version + 1")
            params.append(template_id)
            
            query = f"UPDATE templates SET {', '.join(updates)} WHERE template_id = ?"
            cursor.execute(query, params)
            conn.commit()
        
        return {"message": "Template updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """删除模板"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 检查权限
        cursor.execute("SELECT created_by FROM templates WHERE template_id = ?", (template_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        
        user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
        # 只有创建者可以删除模板（admin 不享有特殊权限）
        if row[0] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only template creator can delete")
        
        cursor.execute("DELETE FROM templates WHERE template_id = ?", (template_id,))
        cursor.execute("DELETE FROM template_favorites WHERE template_id = ?", (template_id,))
        cursor.execute("DELETE FROM template_usage WHERE template_id = ?", (template_id,))
        conn.commit()
        
        return {"message": "Template deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/templates/{template_id}/apply")
async def apply_template(
    template_id: str,
    variable_values: dict,
    current_user: dict = Depends(get_current_user)
):
    """应用模板（记录使用次数）"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # 获取模板
        cursor.execute("SELECT config_data, variables FROM templates WHERE template_id = ?", (template_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # 增加使用次数
        cursor.execute("UPDATE templates SET usage_count = usage_count + 1 WHERE template_id = ?", (template_id,))
        
        # 记录使用历史
        cursor.execute('''
            INSERT INTO template_usage (template_id, used_by, variables_used)
            VALUES (?, ?, ?)
        ''', (template_id, current_user["id"], json.dumps(variable_values)))
        
        conn.commit()
        
        # 返回配置数据（变量已替换）
        config_data = json.loads(row[0])
        variables = json.loads(row[1]) if row[1] else []
        
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
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

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
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, email, name, role, is_active, created_at FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "id": user[0],
            "email": user[1],
            "name": user[2] or user[1].split('@')[0],
            "role": user[3] or get_user_role(user[1]),
            "isActive": bool(user[4]),
            "createdAt": user[5]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/users/all")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """获取所有用户列表（功能已禁用，admin 仅保留删除权限）"""
    raise HTTPException(
        status_code=403, 
        detail="User management is not available. Admin users can only delete requests."
    )

if __name__ == "__main__":
    print("Starting Auth Prototype Simple Backend...")
    print("Database: SQLite")
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
