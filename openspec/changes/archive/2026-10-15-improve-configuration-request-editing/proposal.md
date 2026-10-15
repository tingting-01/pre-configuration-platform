## Why

预配置表单缺少 WisDM Whitelist 选项，新建和编辑时无法记录这一配置。工单详情缺少编辑入口，列表横向滚动时操作列会移出视野，而离开配置表单缺少统一的取消确认，容易造成操作中断或误丢修改。共用表单还需要区分工单与模板入口，避免取消后返回错误页面或短暂露出已放弃的编辑页。

## What Changes

- 在 WisDM Configuration 中新增 `WisDM Whitelist` 复选框，保存字段为 `system.wisdmWhitelist`，并覆盖已有工单回填、模板、详情与导出流程。
- 在工单详情提供 Edit 入口，其可用状态和权限与现有列表 Edit 保持一致。
- 在工单列表横向滚动时，将 Actions 列固定在右侧。
- 在共用配置表单的新建和编辑场景增加 Cancel，离开前二次确认放弃未保存内容；复制新建和从模板新建按工单新建场景处理，从模板菜单新建或编辑模板时返回模板列表，并保持取消后的导航链清晰稳定。

## Capabilities

### New Capabilities

- `wisdm-whitelist`: 定义 WisDM Whitelist 配置的输入、持久化、回填及展示行为。
- `configuration-request-actions`: 定义工单编辑入口、列表操作列可见性和配置表单取消确认行为。

### Modified Capabilities

无。现有 `request-copy-create` 的复制保存语义保持不变；复制新建仅增加共用表单的取消行为。

## Impact

- 前端：配置表单、工单详情、工单列表、模板列表入口、模板字段映射和配置导出。
- 后端接口和存储结构保持不变，新字段继续通过现有 `configData.system` 保存。
- 无新增依赖或数据迁移；旧工单缺少 `wisdmWhitelist` 时按 `false` 处理。
