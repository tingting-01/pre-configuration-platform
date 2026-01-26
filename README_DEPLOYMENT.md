# 给部署人员的说明

## 📋 快速开始

1. **获取代码后，创建 `.env` 文件**
   ```bash
   cp env.template .env
   nano .env  # 填写真实的 AWS 凭证
   chmod 600 .env
   ```

2. **启动服务**
   ```bash
   docker-compose up -d
   ```

3. **验证**
   - 前端：http://服务器IP:3000
   - 后端API文档：http://服务器IP:8000/docs

## 📚 详细文档

- **快速检查清单**：查看 `DEPLOYMENT_CHECKLIST.md`
- **完整部署文档**：查看 `DEPLOYMENT.md`

## ⚠️ 重要提示

1. `.env` 文件必须在项目根目录（与 `docker-compose.yml` 同级）
2. 必须设置文件权限：`chmod 600 .env`
3. 不要将 `.env` 文件提交到 Git

## 🔑 需要的信息

部署前请从**开发人员**处获取以下信息：
- **AWS Access Key ID** - 由开发人员提供
- **AWS Secret Access Key** - 由开发人员提供
- **AWS Region** - DynamoDB 表所在区域（开发人员会告知）

⚠️ **重要**：这些凭证是敏感信息，请通过安全渠道获取（如加密邮件、安全通讯工具等），不要通过普通邮件或聊天工具发送。

