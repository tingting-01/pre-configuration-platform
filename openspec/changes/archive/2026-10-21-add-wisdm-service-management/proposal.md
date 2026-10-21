## Why

当前预配置平台只能在配置工单中记录 WisDM Whitelist 和 WisDM Provisioning 的需求，缺少按 Odoo SO 汇总、跟踪实际服务处理进度的内部工作台。需要新增 WisDM Services，使运维能够把一个 SO 下的多个预配置请求关联起来，并独立记录服务状态、Jira 信息与状态历史。

## What Changes

- 新增仅 RAK 内部账号可见的 WisDM Services 菜单、列表、搜索、筛选、详情、新建和编辑交互。
- 每条服务记录唯一对应一个不可修改的 SO，可关联多条不同的 Barcode；同一 Barcode 也可被不同 SO 的服务记录复用。新建和编辑时 Barcode 为普通文本输入；同一条记录内重复的 Barcode 拒绝保存。保存时仅按 Barcode 查找已有预配置请求，找到后带出该请求的 `requestId`，不使用或校验来源请求上的 SO。
- 创建、复制新建和更新预配置请求时，非空 Barcode 在全部预配置请求中唯一。已被其他请求占用时拒绝保存并返回该 `requestId`。配置页不在提交前查重，只展示服务端返回的错误。
- 支持 WisDM Whitelist、WisDM Provisioning、Jira keys、Notes 及由服务选择动态约束的 Workflow Process。
- 支持在列表和编辑页直接更新 Workflow、前进或回退状态，并记录创建和状态变更历史。编辑页选择后立即单独保存；离开 `CREATED` 后内容字段恢复只读。新建页不展示可编辑 Workflow。
- 保存配置工单时，若同时存在 SO、Barcode 且至少选择一项 WisDM 服务，则按 SO 自动创建或补充服务记录；该同步只从配置工单流向服务记录，不反向修改配置工单。
- 自动补充已有记录时只追加新 Barcode、打开新增服务，不删除已有内容，并保持原 Workflow 不变。
- 内容字段仅在 `CREATED` 状态可编辑；访问与编辑权限复用 Dashboard 的角色判断，并叠加 RAK 内部账号访问限制。

## Capabilities

### New Capabilities

- `wisdm-service-management`: 定义 WisDM 服务记录的数据规则、Barcode 关联、手工与自动建档、状态流转、历史、查询页面及内部权限。

### Modified Capabilities

无。

## Impact

- 前端：新增 WisDM Services 路由、内部菜单、列表/详情/表单页面。新建和编辑表单用普通 Barcode 输入框，不在输入时查询。
- 后端：新增 `/api/wisdm-service-records` 资源接口、Barcode 查询能力、权限校验、状态规则和配置工单保存后的幂等同步。
- 数据层：新增 WisDM 服务记录及其历史存储，并保存 SO 唯一约束、预配置请求关联和审计字段。
- 现有配置工单：创建和更新成功后增加服务记录同步步骤；WisDM 主开关仍只控制网关配置，不触发或改变服务记录。
- 测试：覆盖记录来源、幂等补充、Workflow 保持、权限、查询筛选、Barcode 存在性与本条去重、预配置请求 Barcode 全局唯一和并发更新。
