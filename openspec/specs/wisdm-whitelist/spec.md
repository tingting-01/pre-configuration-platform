# WisDM Whitelist Specification

## Purpose

让预配置工单能够明确记录 WisDM Whitelist 是否启用，并保证该布尔值在创建、编辑、模板复用、详情查看和配置导出过程中保持一致，兼容尚未包含该字段的旧工单。

## Requirements

### Requirement: WisDM Whitelist 可独立配置
系统 SHALL 在 WisDM Configuration 中、WisDM Provisioning 上方提供 `WisDM Whitelist` 复选框，并将其作为 `system.wisdmWhitelist` 布尔字段保存。该选项与 WisDM Provisioning 相互独立。

#### Scenario: 配置 WisDM Whitelist
- **WHEN** 用户启用 WisDM 主开关并勾选或取消勾选 WisDM Whitelist
- **THEN** 表单显示所选状态，且 WisDM Provisioning 的选择状态不因该操作改变

#### Scenario: 关闭 WisDM 主开关
- **WHEN** 用户关闭 WisDM 主开关
- **THEN** 表单按现有 WisDM 子选项规则隐藏 WisDM Whitelist，且不因隐藏而改写已选值

### Requirement: WisDM Whitelist 在配置流程中保真
系统 SHALL 在创建、编辑和复制新建工单时保存和回填 `system.wisdmWhitelist`；模板创建、模板编辑及从模板新建 SHALL 保留该字段。

#### Scenario: 保存并重新编辑工单
- **WHEN** 用户保存包含 WisDM Whitelist 选择状态的工单，并再次打开编辑表单
- **THEN** 复选框显示此前保存的状态

#### Scenario: 复用配置
- **WHEN** 用户从包含 WisDM Whitelist 的工单复制新建，或从包含该字段的模板载入配置
- **THEN** 新表单继承该字段的布尔值，用户仍可独立修改后保存

#### Scenario: 读取旧配置
- **WHEN** 工单或模板的 `system` 配置中不存在 `wisdmWhitelist`
- **THEN** 表单将该选项显示为未勾选，并可正常保存，无需迁移旧数据

### Requirement: WisDM Whitelist 可查看和导出
系统 SHALL 在工单详情中呈现 WisDM Whitelist 的启用状态，并在配置导出时保留启用的 `wisdmWhitelist` 值。

#### Scenario: 查看已启用状态
- **WHEN** 用户打开启用了 WisDM Whitelist 的工单详情
- **THEN** System Configuration 展示 WisDM Whitelist 为启用

#### Scenario: 导出已启用状态
- **WHEN** 用户导出启用了 WisDM Whitelist 的工单配置
- **THEN** 导出的系统配置包含 `wisdmWhitelist: true`
