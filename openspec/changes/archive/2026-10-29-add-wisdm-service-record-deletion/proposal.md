# Proposal

## Why

WisDM Services 允许手工建档和工单自动建档，但当前无法清理误建的服务记录，导致错误 SO 长期占用唯一记录并干扰列表使用。需要在列表中为记录创建者和管理员提供明确且可确认的彻底删除能力。

## What Changes

- 在 WisDM Services 列表的操作列增加删除入口：管理员可删除任意记录，其他内部账号只能删除自己创建的记录。
- 删除前展示包含 SO Number 和 WDM 记录号的二次确认，明确提示该操作不可恢复。
- 新增删除服务记录接口；管理员或记录创建者可执行，其他账号返回 `403`，记录不存在返回 `404`。
- 删除时彻底移除服务主记录、SO 唯一占位及该 WDM 记录的全部 History，不修改任何来源预配置请求，也不回退 WDM 编号计数器。
- 删除成功后同一 SO 可重新创建；来源预配置请求后续再次保存且满足自动补充条件时，也可重新生成新的 WDM 记录。
- 删除过程支持安全重试，只有相关数据全部删除后才向客户端返回成功并从列表刷新移除。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `wisdm-service-management`: 增加管理员删除任意记录、内部账号删除本人记录，以及彻底清理关联 SO 占位和 History 的行为与错误语义。

## Impact

- 前端：WisDM Services 列表操作列、删除确认交互、删除请求状态和列表刷新。
- 后端：新增 `DELETE /api/wisdm-service-records/{recordId}`，复用“管理员或创建者”权限判断并处理幂等清理和错误映射。
- 数据层：删除 `RECORD#<recordId>`、`SO#<normalizedSo>` 及历史表中对应 `record_id` 的全部条目；计数器保持不变。
- 权限：应用 IAM 角色需要对两张 WisDM 表具备 `dynamodb:DeleteItem`，批量清理 History 时还需要相应批量写权限。
- 测试：覆盖前端可见性与确认、管理员删除任意记录、内部账号删除本人记录、越权拒绝、完整删除、失败重试、同 SO 重建及后续自动同步重建。
