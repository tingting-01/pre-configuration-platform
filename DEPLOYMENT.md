# 部署文档

## 概述

本项目使用 DynamoDB 作为数据库，无需单独部署数据库服务器。只需要部署前端和后端应用，并配置 AWS 凭证即可。

## 前置要求

1. **服务器要求**
   - 已安装 Docker 和 Docker Compose
   - 服务器可以访问互联网（用于连接 AWS DynamoDB）
   - 至少 2GB 可用内存

2. **AWS 资源**
   - DynamoDB 表已创建（开发人员已创建）
   - **AWS 访问凭证（需要从开发人员处获取）**
     - AWS Access Key ID
     - AWS Secret Access Key
     - AWS Region（DynamoDB 表所在区域）
   - IAM 用户/角色具有 DynamoDB 读写权限

## 部署步骤

### 1. 获取代码

```bash
# 克隆或拉取代码到服务器
git clone <repository-url>
cd pre-configuration-platform
```

### 2. 配置 AWS 凭证

**方式一：使用 .env 文件（推荐）**

```bash
# 复制环境变量模板
cp env.template .env

# 编辑 .env 文件，填写真实的 AWS 凭证
nano .env
# 或
vi .env
```

在 `.env` 文件中填写：
```env
AWS_ACCESS_KEY_ID=你的真实ACCESS_KEY
AWS_SECRET_ACCESS_KEY=你的真实SECRET_KEY
AWS_REGION=你的区域（如：ap-southeast-2）
```

**方式二：使用系统环境变量**

```bash
export AWS_ACCESS_KEY_ID=你的真实ACCESS_KEY
export AWS_SECRET_ACCESS_KEY=你的真实SECRET_KEY
export AWS_REGION=你的区域
```

### 3. 设置文件权限（如果使用 .env 文件）

```bash
# 设置 .env 文件权限，防止其他用户读取
chmod 600 .env
```

### 4. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 5. 验证部署

1. **检查后端服务**
   ```bash
   curl http://localhost:8000/docs
   ```
   应该能看到 API 文档页面

2. **检查前端服务**
   ```bash
   curl http://localhost:3000
   ```
   应该能访问前端页面

3. **测试登录功能**
   - 访问前端页面
   - 尝试登录
   - 检查后端日志确认能连接 DynamoDB

## 配置说明

### 端口配置

- **前端**: 3000 端口
- **后端**: 8000 端口

如需修改端口，编辑 `docker-compose.yml` 文件。

### 文件存储

上传的文件存储在 `backend/uploads` 目录，已通过 Docker 卷挂载，数据会持久化。

### 环境变量

| 变量名 | 说明 | 是否必需 | 默认值 |
|--------|------|---------|--------|
| `AWS_ACCESS_KEY_ID` | AWS 访问密钥 ID | 是 | - |
| `AWS_SECRET_ACCESS_KEY` | AWS 密钥 | 是 | - |
| `AWS_REGION` | AWS 区域 | 是 | ap-southeast-2 |

## 常见问题

### 1. 无法连接 DynamoDB

**错误**: `Unable to locate credentials` 或 `NoCredentialsError`

**解决方案**:
- 检查 `.env` 文件是否存在且格式正确
- 检查环境变量是否正确设置
- 验证 AWS 凭证是否有效

### 2. 权限错误

**错误**: `AccessDeniedException` 或 `403 Forbidden`

**解决方案**:
- 检查 IAM 用户/角色是否有 DynamoDB 权限
- 确认 DynamoDB 表名与代码中的一致

### 3. 区域不匹配

**错误**: `ResourceNotFoundException`

**解决方案**:
- 确认 `AWS_REGION` 与 DynamoDB 表所在区域一致
- 检查表名是否正确

## 维护操作

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart backend
```

### 停止服务

```bash
# 停止所有服务
docker-compose down

# 停止并删除数据卷（谨慎使用）
docker-compose down -v
```

### 更新代码

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build
```

## 安全建议

1. **保护 .env 文件**
   - 设置文件权限：`chmod 600 .env`
   - 不要将 `.env` 文件提交到 Git
   - 定期轮换 AWS 凭证

2. **网络安全**
   - 生产环境建议使用反向代理（如 Nginx）
   - 配置防火墙规则
   - 使用 HTTPS

3. **监控**
   - 监控 Docker 容器状态
   - 监控 AWS DynamoDB 使用情况
   - 设置日志轮转

## 联系信息

如有部署问题，请联系开发团队。

