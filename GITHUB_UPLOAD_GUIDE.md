# GitHub 上传步骤指南

## 步骤 1: 在 GitHub 上创建新仓库

1. 登录 GitHub 账号
2. 点击右上角的 "+" 号，选择 "New repository"
3. 填写仓库信息：
   - Repository name: `pre-configuration-platform` (或您喜欢的名称)
   - Description: "Gateway Pre-configuration Management Platform"
   - 选择 Public 或 Private
   - **不要**勾选 "Initialize this repository with a README"（因为本地已有代码）
4. 点击 "Create repository"

## 步骤 2: 初始化本地 Git 仓库

在项目根目录 (`auth-prototype-separated`) 打开终端，执行以下命令：

```bash
# 初始化 Git 仓库
git init

# 添加所有文件到暂存区
git add .

# 创建第一次提交
git commit -m "Initial commit: Pre-configuration platform"
```

## 步骤 3: 连接到 GitHub 仓库

```bash
# 添加远程仓库（将 YOUR_USERNAME 和 YOUR_REPO_NAME 替换为您的实际信息）
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 或者使用 SSH（如果您配置了 SSH key）
# git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO_NAME.git
```

## 步骤 4: 推送到 GitHub

```bash
# 推送代码到 GitHub（main 分支）
git branch -M main
git push -u origin main
```

## 后续更新代码

当您修改代码后，使用以下命令更新 GitHub：

```bash
# 添加修改的文件
git add .

# 提交更改
git commit -m "描述您的更改"

# 推送到 GitHub
git push
```

## 注意事项

1. **敏感信息**：确保 `.gitignore` 文件已正确配置，不会上传敏感信息（如数据库文件、环境变量等）
2. **大文件**：如果上传的文件很大，可能需要使用 Git LFS
3. **分支管理**：建议使用分支进行开发，主分支保持稳定

## 常见问题

### 如果遇到认证问题

如果推送时要求输入用户名和密码，您需要：
1. 使用 Personal Access Token 代替密码
2. 或者配置 SSH key

### 如果遇到文件太大问题

某些文件（如 node_modules）不应该上传，确保 `.gitignore` 已正确配置。

