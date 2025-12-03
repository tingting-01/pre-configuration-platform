# 预配置平台 - 完整权限文档

## 一、用户角色系统

### 1.1 角色定义

系统支持三种用户角色：

| 角色 | 识别方式 | 说明 |
|------|---------|------|
| **user** | 默认（非 `@rakwireless.com` 邮箱） | 普通用户（外部用户） |
| **rakwireless** | 自动识别（`@rakwireless.com` 邮箱） | RAK Wireless 员工 |
| **admin** | 手动设置（数据库 `role` 字段） | 管理员（仅 `admin@rakwireless.com`） |

### 1.2 角色识别逻辑

```python
def get_user_role(email: str, db_role: str = None) -> str:
    """
    获取用户角色
    优先级：数据库 role > 邮箱自动判断
    """
    # 1. 如果数据库中有明确的角色设置，使用数据库值
    if db_role and db_role in ['user', 'rakwireless', 'admin']:
        return db_role
    
    # 2. 否则基于邮箱自动判断
    if email and email.lower().endswith("@rakwireless.com"):
        return "rakwireless"
    
    # 3. 默认返回 user
    return "user"
```

### 1.3 默认 Admin 用户

- **邮箱**: `admin@rakwireless.com`
- **密码**: `rakwireless`
- **角色**: `admin`
- **说明**: 系统启动时自动创建/更新

---

## 二、完整权限矩阵

### 2.1 请求管理权限

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **创建请求** | ✅ | ✅ | ✅ |
| **查看请求** | 仅自己创建 | ✅ 所有请求 | ✅ 所有请求 |
| **编辑请求** | 仅自己创建 | ✅ 所有请求 | ✅ 所有请求 |
| **删除请求** | 仅自己创建 | 仅自己创建 | ✅ **任何请求** ⭐ |
| **批量删除** | 仅自己创建 | 仅自己创建 | ✅ **任何请求** ⭐ |
| **修改工作流状态** | ❌ | ✅ | ✅ |
| **分配请求** | ❌ | ✅ | ✅ |
| **导出请求** | 仅自己创建 | ✅ 所有请求 | ✅ 所有请求 |

⭐ = Admin 独有的特殊权限

### 2.2 用户管理权限

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **查看用户列表** | ❌ | ✅（基本信息） | ✅（基本信息） |
| **查看用户详情** | ❌ | ✅ | ✅ |
| **更新用户角色** | ❌ | ❌ | ❌（已禁用） |
| **查看所有用户（含角色）** | ❌ | ❌ | ❌（已禁用） |

### 2.3 模板管理权限

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **创建模板** | ✅ | ✅ | ✅ |
| **查看模板** | 公开或自己创建 | 所有 | 所有 |
| **编辑模板** | 仅自己创建 | 仅自己创建 | 仅自己创建 |
| **删除模板** | 仅自己创建 | 仅自己创建 | 仅自己创建 |
| **应用模板** | ✅ | ✅ | ✅ |

### 2.4 评论和活动权限

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **添加评论** | 仅自己创建的请求 | ✅ 所有请求 | ✅ 所有请求 |
| **查看评论** | 仅自己创建的请求 | ✅ 所有请求 | ✅ 所有请求 |
| **上传评论附件** | 仅自己创建的请求 | ✅ 所有请求 | ✅ 所有请求 |
| **查看历史记录** | 仅自己创建的请求 | ✅ 所有请求 | ✅ 所有请求 |

### 2.5 文件管理权限

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **上传文件** | ✅ | ✅ | ✅ |
| **下载文件** | 仅自己创建的请求 | ✅ 所有请求 | ✅ 所有请求 |
| **删除文件** | 仅自己创建的请求 | ✅ 所有请求 | ✅ 所有请求 |

### 2.6 通知权限

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **查看通知** | ✅ | ✅ | ✅ |
| **清除通知** | ✅ | ✅ | ✅ |

---

## 三、详细权限说明

### 3.1 请求查看权限

#### user（普通用户）
- **Dashboard 页面**:
  - 只能看到自己创建的请求
  - 只能看到 "All Requests" 筛选（没有 "New Requests"）
- **Request Details 页面**:
  - 只能查看自己创建的请求
  - 访问他人请求会返回 `403 Forbidden` 错误

#### rakwireless（RAK Wireless 员工）
- **Dashboard 页面**:
  - 可以看到所有用户提交的请求
  - 可以筛选 "All Requests" 和 "New Requests"
- **Request Details 页面**:
  - 可以查看任何请求的详细信息

#### admin（管理员）
- 与 rakwireless 相同

**后端实现**:
```python
# GET /api/requests
if can_view_all(user_role):  # rakwireless 或 admin
    # 显示所有请求
    cursor.execute('SELECT ... FROM requests ...')
else:
    # 只显示自己创建的请求
    cursor.execute('SELECT ... FROM requests WHERE user_id = ?', (current_user["id"],))
```

### 3.2 请求编辑权限

#### user（普通用户）
- 只能编辑自己创建的请求
- 可以修改：`companyName`、`rakId`、`configData`、`tags`
- **不能修改工作流状态**（`status` 字段）

#### rakwireless（RAK Wireless 员工）
- 可以编辑任何请求
- 可以修改：`companyName`、`rakId`、`configData`、`tags`、`status`、`assignee`

#### admin（管理员）
- 与 rakwireless 相同

**后端实现**:
```python
# PUT /api/requests/{request_id}
# 权限检查：只有创建者或 rakwireless/admin 用户可以编辑请求
if not can_view_all(user_role) and not is_creator:
    raise HTTPException(status_code=403, detail="You can only edit your own requests")

# 非 rakwireless/admin 用户不能修改状态（workflow）
if not is_rakwireless(user_role) and "status" in request_data:
    raise HTTPException(status_code=403, detail="Only RAK Wireless employees can update workflow status")
```

### 3.3 请求删除权限

#### user（普通用户）
- ✅ 可以删除自己创建的请求
- ❌ 不能删除其他用户创建的请求

#### rakwireless（RAK Wireless 员工）
- ✅ 可以删除自己创建的请求
- ❌ 不能删除其他用户创建的请求

#### admin（管理员）
- ✅ **可以删除任何请求**（包括他人创建的）⭐

**后端实现**:
```python
# DELETE /api/requests/{request_id}
# 权限检查：
# - Admin 可以删除任何请求
# - 其他用户只能删除自己创建的请求
if can_delete_any(user_role):  # 仅 admin 返回 True
    # Admin 可以删除任何请求
    cursor.execute("DELETE FROM requests WHERE request_id = ?", (request_id,))
elif is_creator:
    # 任何用户都可以删除自己创建的请求
    cursor.execute("DELETE FROM requests WHERE request_id = ? AND user_id = ?", (request_id, current_user["id"]))
else:
    raise HTTPException(status_code=403, detail="You can only delete your own requests")
```

### 3.4 工作流状态修改权限

#### user（普通用户）
- ❌ 不能修改任何请求的工作流状态

#### rakwireless（RAK Wireless 员工）
- ✅ 可以修改任何请求的工作流状态
- 工作流状态包括：
  - `Open`
  - `Pre-configuration file creating`
  - `Pre-configuration file testing`
  - `WisDM Provisioning`（需要确认）
  - `Done`

#### admin（管理员）
- 与 rakwireless 相同

**后端实现**:
```python
# PUT /api/requests/{request_id}
if not is_rakwireless(user_role) and "status" in request_data:
    raise HTTPException(status_code=403, detail="Only RAK Wireless employees can update workflow status")
```

### 3.5 请求分配权限

#### user（普通用户）
- ❌ 不能分配请求

#### rakwireless（RAK Wireless 员工）
- ✅ 可以将请求分配给任何用户
- 可以取消分配（设置为空）

#### admin（管理员）
- 与 rakwireless 相同

**前端实现**:
- Dashboard 页面中，只有 rakwireless 和 admin 用户可以看到 "Assignee" 下拉菜单
- 普通用户只能看到 "Unassigned" 文本

### 3.6 用户列表查看权限

#### user（普通用户）
- ❌ 不能查看用户列表

#### rakwireless（RAK Wireless 员工）
- ✅ 可以查看用户列表（`GET /api/users`）
- 返回信息：`id`、`email`、`name`、`role`

#### admin（管理员）
- 与 rakwireless 相同

**后端实现**:
```python
# GET /api/users
if not is_rakwireless(user_role):
    raise HTTPException(status_code=403, detail="Only RAK Wireless employees can access user list")
```

---

## 四、API 端点权限要求

### 4.1 认证相关

| API | 方法 | 权限要求 | 说明 |
|-----|------|---------|------|
| `/api/register` | POST | 公开 | 用户注册 |
| `/api/login` | POST | 公开 | 用户登录 |
| `/api/users/me` | GET | 所有用户 | 获取当前用户信息 |

### 4.2 请求管理

| API | 方法 | user | rakwireless | admin |
|-----|------|------|-------------|-------|
| `/api/requests` | GET | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| `/api/requests/{id}` | GET | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| `/api/requests` | POST | ✅ | ✅ | ✅ |
| `/api/requests/{id}` | PUT | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| `/api/requests/{id}` | DELETE | 仅自己创建 | 仅自己创建 | ✅ **任何** ⭐ |
| `/api/requests/batch/delete` | POST | 仅自己创建 | 仅自己创建 | ✅ **任何** ⭐ |

### 4.3 用户管理

| API | 方法 | user | rakwireless | admin |
|-----|------|------|-------------|-------|
| `/api/users` | GET | ❌ | ✅ | ✅ |
| `/api/users/{id}` | GET | ❌ | ✅ | ✅ |
| `/api/users/{id}/role` | PUT | ❌ | ❌ | ❌（已禁用） |
| `/api/users/all` | GET | ❌ | ❌ | ❌（已禁用） |

### 4.4 模板管理

| API | 方法 | user | rakwireless | admin |
|-----|------|------|-------------|-------|
| `/api/templates` | GET | 公开或自己创建 | ✅ 所有 | ✅ 所有 |
| `/api/templates` | POST | ✅ | ✅ | ✅ |
| `/api/templates/{id}` | GET | 公开或自己创建 | ✅ 所有 | ✅ 所有 |
| `/api/templates/{id}` | PUT | 仅自己创建 | 仅自己创建 | 仅自己创建 |
| `/api/templates/{id}` | DELETE | 仅自己创建 | 仅自己创建 | 仅自己创建 |
| `/api/templates/{id}/apply` | POST | ✅ | ✅ | ✅ |

### 4.5 评论和活动

| API | 方法 | user | rakwireless | admin |
|-----|------|------|-------------|-------|
| `/api/requests/{id}/comments` | GET | 仅自己创建的请求 | ✅ 所有 | ✅ 所有 |
| `/api/requests/{id}/comments` | POST | 仅自己创建的请求 | ✅ 所有 | ✅ 所有 |
| `/api/requests/{id}/activities` | GET | 仅自己创建的请求 | ✅ 所有 | ✅ 所有 |
| `/api/users/me/assignments` | GET | ✅ | ✅ | ✅ |

### 4.6 文件管理

| API | 方法 | user | rakwireless | admin |
|-----|------|------|-------------|-------|
| `/api/files/{file_id}` | GET | 仅自己创建的请求 | ✅ 所有 | ✅ 所有 |
| `/api/files/upload` | POST | ✅ | ✅ | ✅ |

---

## 五、前端功能权限控制

### 5.1 Dashboard 页面

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **查看请求列表** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **"New Requests" 筛选** | ❌ | ✅ | ✅ |
| **"All Requests" 筛选** | ✅ | ✅ | ✅ |
| **搜索功能** | ✅ | ✅ | ✅ |
| **高级搜索** | ✅ | ✅ | ✅ |
| **批量选择** | ✅ | ✅ | ✅ |
| **批量删除** | 仅自己创建 | 仅自己创建 | ✅ **任何** ⭐ |
| **修改工作流状态** | ❌ | ✅ | ✅ |
| **分配请求** | ❌ | ✅ | ✅ |
| **查看请求详情** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **编辑请求** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **标签统计** | ✅ | ✅ | ✅ |

### 5.2 Request Details 页面

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **查看请求详情** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **编辑请求** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **导出请求** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **查看评论** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **添加评论** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **上传评论附件** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **查看历史记录** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **查看工作流进度** | 仅自己创建 | ✅ 所有 | ✅ 所有 |

### 5.3 Configuration 页面

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **创建新请求** | ✅ | ✅ | ✅ |
| **编辑请求** | 仅自己创建 | ✅ 所有 | ✅ 所有 |
| **从模板创建** | ✅ | ✅ | ✅ |
| **保存为模板** | ✅ | ✅ | ✅ |
| **自动标签** | ✅ | ✅ | ✅ |
| **手动编辑标签** | ✅ | ✅ | ✅ |

### 5.4 Templates 页面

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **查看模板列表** | 公开或自己创建 | ✅ 所有 | ✅ 所有 |
| **创建模板** | ✅ | ✅ | ✅ |
| **编辑模板** | 仅自己创建 | 仅自己创建 | 仅自己创建 |
| **删除模板** | 仅自己创建 | 仅自己创建 | 仅自己创建 |
| **应用模板** | ✅ | ✅ | ✅ |

### 5.5 通知功能

| 功能 | user | rakwireless | admin |
|------|------|-------------|-------|
| **查看通知** | ✅ | ✅ | ✅ |
| **清除通知** | ✅ | ✅ | ✅ |
| **清除所有通知** | ✅ | ✅ | ✅ |

---

## 六、权限判断函数

### 6.1 核心权限函数

```python
def get_user_role(email: str, db_role: str = None) -> str:
    """获取用户角色（优先级：数据库 > 邮箱判断）"""
    if db_role and db_role in ['user', 'rakwireless', 'admin']:
        return db_role
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
    """是否可以管理用户（已禁用）"""
    return False  # 功能已禁用
```

### 6.2 权限检查示例

```python
# 检查是否可以查看所有请求
user_role = current_user.get('role') or get_user_role(current_user.get('email', ''))
if can_view_all(user_role):
    # 显示所有请求
    pass
else:
    # 只显示自己创建的请求
    pass

# 检查是否可以删除任何请求
if can_delete_any(user_role):
    # Admin 可以删除任何请求
    pass
elif is_creator:
    # 其他用户只能删除自己创建的请求
    pass
```

---

## 七、特殊权限说明

### 7.1 Admin 用户的唯一特殊权限

Admin 用户相比其他用户的**唯一特殊权限**是：

✅ **可以删除任何请求**（包括他人创建的）

其他所有权限与 rakwireless 用户相同。

### 7.2 已禁用的 Admin 功能

以下功能原本设计为 Admin 专属，但已禁用：

- ❌ 用户角色管理（`PUT /api/users/{user_id}/role`）
- ❌ 查看所有用户信息（`GET /api/users/all`）
- ❌ 删除任何模板（只能删除自己创建的模板）

---

## 八、权限变更历史

### 版本 1.0（当前版本）

1. **用户角色系统**:
   - 支持三种角色：`user`、`rakwireless`、`admin`
   - 基于邮箱自动识别 rakwireless 用户
   - Admin 需要手动设置

2. **删除权限**:
   - 所有用户都可以删除自己创建的请求
   - Admin 可以删除任何请求

3. **工作流权限**:
   - 只有 rakwireless 和 admin 用户可以修改工作流状态

4. **分配权限**:
   - 只有 rakwireless 和 admin 用户可以分配请求

5. **用户管理**:
   - 用户角色管理功能已禁用
   - rakwireless 和 admin 可以查看用户列表

---

## 九、安全注意事项

1. **权限验证**:
   - 所有 API 端点都进行权限验证
   - 前端权限控制仅用于 UI 显示，后端验证是最终保障

2. **Admin 账户**:
   - 默认 Admin 账户：`admin@rakwireless.com` / `rakwireless`
   - 建议首次登录后修改密码
   - 建议限制 Admin 账户数量

3. **数据隔离**:
   - 普通用户只能访问自己创建的数据
   - rakwireless 和 admin 可以访问所有数据

4. **操作审计**:
   - 建议记录关键操作（删除、状态修改等）
   - 历史记录功能已实现部分审计功能

---

## 十、总结

### 10.1 权限层级

```
Admin (最高权限)
  ├─ 可以删除任何请求 ⭐
  └─ 拥有 rakwireless 的所有权限

RAK Wireless (中等权限)
  ├─ 可以查看/编辑所有请求
  ├─ 可以修改工作流状态
  ├─ 可以分配请求
  └─ 可以查看用户列表

User (基础权限)
  ├─ 只能查看/编辑自己创建的请求
  ├─ 可以删除自己创建的请求
  └─ 不能修改工作流状态
```

### 10.2 关键权限点

1. **查看权限**: rakwireless 和 admin 可以查看所有请求
2. **编辑权限**: rakwireless 和 admin 可以编辑所有请求
3. **删除权限**: 所有用户都可以删除自己创建的请求，admin 可以删除任何请求
4. **工作流权限**: 只有 rakwireless 和 admin 可以修改工作流状态
5. **分配权限**: 只有 rakwireless 和 admin 可以分配请求

---

**文档版本**: 1.0  
**最后更新**: 2024年  
**维护者**: 系统管理员

