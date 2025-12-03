# 邮件提醒功能实现方案

## 一、功能概述

在现有页面提醒功能的基础上，增加邮件提醒功能。邮件提醒规则与页面提醒规则完全一致。

## 二、提醒规则（与页面提醒一致）

### 规则说明

1. **对于当前用户创建的request**：
   - 所有 `assigned` 活动（无论分配给谁）都发送邮件
   - 所有 `status_changed` 活动（workflow process 更新）都发送邮件

2. **对于非当前用户创建的request**：
   - 只有 `assigned` 活动，且 assignee 是当前用户时，才发送邮件
   - 只有 `unassigned` 活动，且被取消分配的是当前用户时，才发送邮件

### 触发时机

在 `main_simple.py` 的 `update_request` 函数中，当记录 activity 时，同步触发邮件发送：

1. **Workflow Status 变更**（第841行附近）
   - 当 `status_changed` activity 被创建时
   - 检查：如果 request 的 creator 是当前用户，发送邮件给 creator

2. **Assignee 变更**（第872行和第889行附近）
   - 当 `assigned` activity 被创建时：
     - 如果 request 的 creator 是当前用户，发送邮件给 creator（通知其创建的request被分配）
     - 如果 assignee 不是 creator，发送邮件给 assignee（通知其被分配）
   - 当 `unassigned` activity 被创建时：
     - 发送邮件给被取消分配的用户

## 三、技术实现方案

### 1. 依赖库

使用 Python 的 `smtplib` 和 `email` 库（Python 标准库，无需额外安装）。

如果需要更高级的功能，可以使用：
- `aiosmtplib`（异步SMTP，推荐用于FastAPI）
- `emails`（更友好的邮件库）

### 2. 邮件配置

#### 方案A：使用环境变量（推荐）

在 `.env` 文件中配置：

```env
# SMTP配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_USE_TLS=true
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=Pre-configuration Platform
```

#### 方案B：使用配置文件

创建 `email_config.json`：

```json
{
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "use_tls": true,
    "username": "your-email@gmail.com",
    "password": "your-app-password"
  },
  "from": {
    "email": "your-email@gmail.com",
    "name": "Pre-configuration Platform"
  }
}
```

### 3. 邮件服务模块

创建 `auth-prototype-separated/backend/email_service.py`：

```python
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import aiosmtplib  # 如果使用异步版本

class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
        self.from_email = os.getenv("SMTP_FROM_EMAIL", self.smtp_user)
        self.from_name = os.getenv("SMTP_FROM_NAME", "Pre-configuration Platform")
    
    def send_email_sync(
        self, 
        to_email: str, 
        subject: str, 
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """同步发送邮件"""
        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # 添加文本和HTML内容
            if text_content:
                msg.attach(MIMEText(text_content, 'plain'))
            msg.attach(MIMEText(html_content, 'html'))
            
            # 连接SMTP服务器并发送
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.smtp_use_tls:
                    server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            print(f"✅ Email sent successfully to {to_email}")
            return True
        except Exception as e:
            print(f"❌ Failed to send email to {to_email}: {e}")
            return False
    
    async def send_email_async(
        self, 
        to_email: str, 
        subject: str, 
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """异步发送邮件（推荐用于FastAPI）"""
        try:
            message = aiosmtplib.Message(
                from_email=self.from_email,
                to_emails=[to_email],
                subject=subject,
                html=html_content,
                text=text_content or ""
            )
            
            await aiosmtplib.send(
                message,
                hostname=self.smtp_host,
                port=self.smtp_port,
                username=self.smtp_user,
                password=self.smtp_password,
                use_tls=self.smtp_use_tls
            )
            
            print(f"✅ Email sent successfully to {to_email}")
            return True
        except Exception as e:
            print(f"❌ Failed to send email to {to_email}: {e}")
            return False
```

### 4. 邮件模板

创建 `auth-prototype-separated/backend/email_templates.py`：

```python
def get_assignment_email_html(
    request_id: str,
    company_name: str,
    assigner_name: str,
    assignee_name: str,
    dashboard_url: str = "http://localhost:3000/dashboard"
) -> str:
    """生成分配邮件的HTML内容"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #7c3aed; color: white; padding: 20px; text-align: center; }}
            .content {{ background-color: #f9fafb; padding: 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>New Request Assignment</h1>
            </div>
            <div class="content">
                <p>Hello {assignee_name},</p>
                <p><strong>{assigner_name}</strong> has assigned a new request to you:</p>
                <ul>
                    <li><strong>Request ID:</strong> {request_id}</li>
                    <li><strong>Company:</strong> {company_name}</li>
                </ul>
                <a href="{dashboard_url}" class="button">View Request</a>
                <p>Please review and take action on this request.</p>
            </div>
            <div class="footer">
                <p>This is an automated notification from Pre-configuration Platform.</p>
            </div>
        </div>
    </body>
    </html>
    """

def get_unassignment_email_html(
    request_id: str,
    company_name: str,
    operator_name: str,
    dashboard_url: str = "http://localhost:3000/dashboard"
) -> str:
    """生成取消分配邮件的HTML内容"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #f59e0b; color: white; padding: 20px; text-align: center; }}
            .content {{ background-color: #f9fafb; padding: 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Request Unassigned</h1>
            </div>
            <div class="content">
                <p>Hello,</p>
                <p><strong>{operator_name}</strong> has unassigned you from the following request:</p>
                <ul>
                    <li><strong>Request ID:</strong> {request_id}</li>
                    <li><strong>Company:</strong> {company_name}</li>
                </ul>
                <a href="{dashboard_url}" class="button">View Dashboard</a>
            </div>
            <div class="footer">
                <p>This is an automated notification from Pre-configuration Platform.</p>
            </div>
        </div>
    </body>
    </html>
    """

def get_workflow_update_email_html(
    request_id: str,
    company_name: str,
    old_status: str,
    new_status: str,
    operator_name: str,
    dashboard_url: str = "http://localhost:3000/dashboard"
) -> str:
    """生成workflow更新邮件的HTML内容"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #3b82f6; color: white; padding: 20px; text-align: center; }}
            .content {{ background-color: #f9fafb; padding: 20px; }}
            .status-change {{ background-color: #e0e7ff; padding: 15px; border-radius: 6px; margin: 15px 0; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .footer {{ text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Workflow Process Updated</h1>
            </div>
            <div class="content">
                <p>Hello,</p>
                <p>Your request's workflow process has been updated:</p>
                <ul>
                    <li><strong>Request ID:</strong> {request_id}</li>
                    <li><strong>Company:</strong> {company_name}</li>
                </ul>
                <div class="status-change">
                    <p><strong>Status Change:</strong></p>
                    <p>{old_status} → <strong>{new_status}</strong></p>
                    <p><small>Updated by: {operator_name}</small></p>
                </div>
                <a href="{dashboard_url}" class="button">View Request</a>
            </div>
            <div class="footer">
                <p>This is an automated notification from Pre-configuration Platform.</p>
            </div>
        </div>
    </body>
    </html>
    """
```

### 5. 集成到 main_simple.py

在 `update_request` 函数中，在记录 activity 后立即发送邮件：

```python
# 在文件顶部导入
from email_service import EmailService
from email_templates import (
    get_assignment_email_html,
    get_unassignment_email_html,
    get_workflow_update_email_html
)

# 初始化邮件服务
email_service = EmailService()

# 在 update_request 函数中，记录 activity 后：

# 1. Workflow Status 变更后（第842行附近）
if old_status != new_status:
    # ... 记录 activity 的代码 ...
    
    # 发送邮件给 request creator
    cursor.execute("SELECT email, name FROM users WHERE id = (SELECT user_id FROM requests WHERE request_id = ?)", (request_id,))
    creator_info = cursor.fetchone()
    if creator_info:
        creator_email = creator_info[0]
        creator_name = creator_info[1] or creator_email
        # 获取 request 信息
        cursor.execute("SELECT company_name FROM requests WHERE request_id = ?", (request_id,))
        request_info = cursor.fetchone()
        company_name = request_info[0] if request_info else "Unknown"
        
        # 发送邮件（异步）
        html_content = get_workflow_update_email_html(
            request_id=request_id,
            company_name=company_name,
            old_status=old_status,
            new_status=new_status,
            operator_name=operator_name
        )
        # 使用后台任务发送邮件，避免阻塞
        asyncio.create_task(email_service.send_email_async(
            to_email=creator_email,
            subject=f"Workflow Updated: Request {request_id}",
            html_content=html_content
        ))

# 2. Assignee 变更后（第872行和第889行附近）
if new_assignee:
    # ... 记录 assigned activity 的代码 ...
    
    # 发送邮件给 assignee
    cursor.execute("SELECT email, name FROM users WHERE email = ?", (new_assignee,))
    assignee_info = cursor.fetchone()
    if assignee_info:
        assignee_email = assignee_info[0]
        assignee_name = assignee_info[1] or assignee_email
        
        # 获取 request 信息
        cursor.execute("SELECT company_name, user_id FROM requests WHERE request_id = ?", (request_id,))
        request_info = cursor.fetchone()
        company_name = request_info[0] if request_info else "Unknown"
        creator_id = request_info[1] if request_info else None
        
        # 发送邮件给 assignee
        html_content = get_assignment_email_html(
            request_id=request_id,
            company_name=company_name,
            assigner_name=operator_name,
            assignee_name=assignee_name
        )
        asyncio.create_task(email_service.send_email_async(
            to_email=assignee_email,
            subject=f"New Request Assignment: {request_id}",
            html_content=html_content
        ))
        
        # 如果 creator 不是 assignee，也发送邮件给 creator
        if creator_id and creator_id != current_user["id"]:
            cursor.execute("SELECT email, name FROM users WHERE id = ?", (creator_id,))
            creator_info = cursor.fetchone()
            if creator_info:
                creator_email = creator_info[0]
                creator_name = creator_info[1] or creator_email
                html_content = get_assignment_email_html(
                    request_id=request_id,
                    company_name=company_name,
                    assigner_name=operator_name,
                    assignee_name=assignee_name
                )
                asyncio.create_task(email_service.send_email_async(
                    to_email=creator_email,
                    subject=f"Your Request Assigned: {request_id}",
                    html_content=html_content
                ))

else:
    # ... 记录 unassigned activity 的代码 ...
    
    # 发送邮件给被取消分配的用户
    if old_assignee:
        cursor.execute("SELECT email, name FROM users WHERE email = ?", (old_assignee,))
        unassignee_info = cursor.fetchone()
        if unassignee_info:
            unassignee_email = unassignee_info[0]
            unassignee_name = unassignee_info[1] or unassignee_email
            
            # 获取 request 信息
            cursor.execute("SELECT company_name FROM requests WHERE request_id = ?", (request_id,))
            request_info = cursor.fetchone()
            company_name = request_info[0] if request_info else "Unknown"
            
            html_content = get_unassignment_email_html(
                request_id=request_id,
                company_name=company_name,
                operator_name=operator_name
            )
            asyncio.create_task(email_service.send_email_async(
                to_email=unassignee_email,
                subject=f"Request Unassigned: {request_id}",
                html_content=html_content
            ))
```

## 四、配置步骤

### 1. 安装依赖（如果使用异步版本）

```bash
pip install aiosmtplib
```

### 2. 配置环境变量

创建 `.env` 文件（或添加到现有环境变量）：

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_USE_TLS=true
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=Pre-configuration Platform
```

### 3. Gmail 配置（示例）

如果使用 Gmail：
1. 启用"两步验证"
2. 生成"应用专用密码"
3. 使用应用专用密码作为 `SMTP_PASSWORD`

### 4. 其他邮件服务商配置

- **Outlook/Hotmail**: `smtp-mail.outlook.com:587`
- **QQ邮箱**: `smtp.qq.com:587`
- **163邮箱**: `smtp.163.com:587`
- **企业邮箱**: 咨询IT部门获取SMTP配置

## 五、测试建议

1. **单元测试**：测试邮件模板生成
2. **集成测试**：测试SMTP连接和发送
3. **端到端测试**：测试完整的提醒流程

## 六、注意事项

1. **异步发送**：使用 `asyncio.create_task` 异步发送邮件，避免阻塞请求
2. **错误处理**：邮件发送失败不应影响主流程，记录日志即可
3. **邮件队列**：如果邮件量大，考虑使用消息队列（如 Celery + Redis）
4. **邮件频率限制**：避免短时间内发送大量邮件，可能被标记为垃圾邮件
5. **隐私保护**：确保邮件内容不包含敏感信息

## 七、可选增强功能

1. **邮件偏好设置**：允许用户选择是否接收邮件提醒
2. **邮件摘要**：每日/每周邮件摘要，而不是每个活动都发送
3. **邮件模板自定义**：允许管理员自定义邮件模板
4. **邮件发送记录**：记录邮件发送历史，便于排查问题

