## Why

现有请求 History 只展示创建、流程状态和分配事件，编辑预配置时会直接覆盖 `configData`，无法说明具体修改了哪些字段。同时，历史活动仅通过 `user_id` 实时关联用户，关联失败时即使描述中已有操作者邮箱，界面仍显示 `Unknown User`。

## What Changes

- 在现有 Activities 机制中新增 `configuration_changed` 活动，由后端根据数据库旧配置和本次提交的新配置生成字段级差异。
- 一次配置保存只生成一条活动；没有实际字段变化时不生成配置变更活动。
- 扩展 `/api/requests/{request_id}/activities` 的兼容响应，为配置变更活动提供可选的 `changes` 数据，同时保持所有原有字段和旧活动展示行为不变。
- 沿用现有 History 页面和卡片设计，在带有 `changes` 的活动卡片中按配置模块分组展示字段变更，显示每组变更数量并支持折叠；长值先显示预览，用户可按需展开或收起完整内容。
- 在新活动中保存认证用户的姓名和邮箱快照，并为旧活动提供批量用户关联和已知描述格式兜底，减少 `Unknown User`。
- 对文件类配置只记录文件名、数量、大小等可读元数据摘要，不写入原始文件、Base64 或证书正文；敏感配置只记录发生变化并对新旧值脱敏。
- 使用 DynamoDB `TransactWriteItems` 原子提交 Request 配置更新和 Activities 历史写入，任一操作失败时整体失败；事务异常仅记录错误码、取消原因和 AWS RequestId 等诊断信息，不记录配置内容。
- 为差异计算、新旧活动兼容、操作者解析及写入失败场景增加测试。

## Capabilities

### New Capabilities

- `configuration-change-history`: 记录并展示预配置字段级变更历史，同时兼容现有活动数据并可靠显示操作者。

### Modified Capabilities

无。

## Impact

- 后端请求更新流程：`backend/main_simple.py`
- DynamoDB Activities 读写封装：`backend/dynamodb_client.py`
- History 前端类型与兼容渲染：`frontend/src/components/History.tsx`
- History 字段分组、标签和值预览格式化：`frontend/src/utils/historyFormatters.ts`
- `/api/requests/{request_id}/activities` 继续返回数组，原有字段不删除、不改名；仅增加可选字段，因此不构成破坏性 API 变更。
- 复用现有 `preconfig-activities` 表并与 `preconfig-requests` 进行跨表事务写入；不新增数据表、不迁移或改写旧历史数据、不增加恢复或版本管理能力。
