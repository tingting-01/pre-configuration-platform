## Purpose

为预配置请求提供可审计的字段级配置变更历史，使用户能够在现有 History 页面中查看谁在何时修改了哪些字段，同时保持所有既有活动数据和展示行为兼容。

## ADDED Requirements

### Requirement: 系统记录实际配置字段变化
当请求更新包含 `configData` 时，系统 SHALL 根据数据库中的现有配置与本次提交配置计算字段级差异，并在存在实际差异时创建一条 `configuration_changed` 活动。

#### Scenario: 修改单个嵌套字段
- **WHEN** 用户保存配置且一个嵌套配置字段的新值与数据库旧值不同
- **THEN** 系统创建一条 `configuration_changed` 活动，并在 `changes` 中记录该字段路径、旧值和新值

#### Scenario: 一次修改多个字段
- **WHEN** 一次配置保存修改了多个字段
- **THEN** 系统只创建一条 `configuration_changed` 活动，且该活动的 `changes` 包含本次保存的全部可记录变化

#### Scenario: 保存相同配置
- **WHEN** 用户提交的配置与数据库现有配置没有实际差异
- **THEN** 系统不创建 `configuration_changed` 活动

#### Scenario: 请求未提交配置
- **WHEN** 请求更新只包含状态、分配人或其他非配置字段而不包含 `configData`
- **THEN** 系统不执行配置差异记录，现有活动行为保持不变

### Requirement: 系统产生稳定且安全的字段差异
系统 MUST 以稳定、可展示的字段路径表示嵌套配置变化，并 SHALL 避免因数据库数值类型、对象键顺序或等价空值产生无意义历史。文件类配置的可读元数据变化 SHALL 以摘要形式记录；敏感值和原始大体积内容 MUST NOT 以原文写入历史。

#### Scenario: 嵌套对象发生变化
- **WHEN** 嵌套对象中的叶子字段发生变化
- **THEN** `changes.field` 使用稳定路径标识该叶子字段，而不是仅将整个顶层对象标记为变化

#### Scenario: 值仅存在表示差异
- **WHEN** 新旧值只在数据库数值类型、对象键顺序或 `null`、缺失字段、空字符串等价表示上不同
- **THEN** 系统不为该值生成历史变化

#### Scenario: 数组发生变化
- **WHEN** 配置数组的内容或顺序发生变化
- **THEN** 系统将该数组字段作为一个变化记录，并保留可安全展示的新旧 JSON 值

#### Scenario: 敏感字段发生变化
- **WHEN** 密码、密钥、令牌或其他被配置为敏感的字段发生变化
- **THEN** 系统记录该字段已变化，但 MUST 使用固定脱敏标记表示 `from` 和 `to`，不得保存原始敏感值

#### Scenario: 文件元数据发生变化
- **WHEN** 扩展文件、配置文件或证书附件的名称、数量或大小发生变化
- **THEN** 系统在 `changes` 中记录可读的文件元数据摘要，并且不依赖内部文件 ID 向用户说明变化

#### Scenario: 原始文件或大体积内容发生变化
- **WHEN** 配置值包含原始二进制、Base64、完整证书正文或其他不可安全展示的大体积内容
- **THEN** 系统 MUST NOT 将原始内容写入 `changes`，但在能够安全识别其对应配置字段时仍记录该字段发生了变化

### Requirement: 配置与历史保持一致
配置存在实际变化时，系统 MUST 使用 DynamoDB 事务原子提交 Request 更新和对应的 `configuration_changed` Activity。事务中的任一操作失败时，系统 SHALL 返回更新失败，且不得留下仅配置或仅历史写入成功的部分状态。

#### Scenario: 配置和活动事务提交成功
- **WHEN** 配置存在实际变化且 Request 更新与 Activity 写入的事务成功提交
- **THEN** 系统返回更新成功，并且活动接口可读取对应配置变更活动

#### Scenario: 事务中的 Request 更新失败
- **WHEN** 事务中的 Request 更新失败
- **THEN** 系统返回更新失败，并且 Activity 不得单独写入

#### Scenario: 事务中的 Activity 写入失败
- **WHEN** 事务中的 Activity 写入失败
- **THEN** 系统返回更新失败，并且 Request 配置不得单独更新

#### Scenario: 事务失败诊断
- **WHEN** DynamoDB 拒绝事务或取消事务
- **THEN** 系统记录错误码、错误消息、经筛选的取消原因和 AWS RequestId，并且 MUST NOT 记录配置内容、活动内容或取消原因中的原始 Item

### Requirement: 活动接口向后兼容
`GET /api/requests/{request_id}/activities` SHALL 保持现有数组响应和原有字段语义，并可为配置变更活动增加可选的 `changes` 字段。

#### Scenario: 返回旧活动
- **WHEN** 历史活动没有 `changes`、操作者快照或其他新增字段
- **THEN** 接口仍返回该活动的原有类型、描述、时间和可解析的操作者信息，不要求迁移旧数据

#### Scenario: 返回配置变更活动
- **WHEN** 历史中存在 `configuration_changed` 活动
- **THEN** 接口在保留 `id`、`activityType`、`description`、`createdAt`、`authorName` 和 `authorEmail` 的同时返回可选的 `changes`

#### Scenario: 混合返回新旧活动
- **WHEN** 同一请求同时拥有旧格式活动和新格式配置变更活动
- **THEN** 接口按现有排序规则在同一个数组中返回全部活动

### Requirement: History 页面兼容展示新旧活动
History 页面 SHALL 沿用现有卡片布局和时间线行为；没有有效 `changes` 的活动 MUST 按原方式展示，带有效 `changes` 的活动 SHALL 在原卡片内追加字段变更明细。

#### Scenario: 展示旧格式活动
- **WHEN** 活动没有 `changes` 或 `changes` 为空
- **THEN** 页面按现有设计展示描述、操作者和时间，不显示空的变更区域

#### Scenario: 展示配置变更活动
- **WHEN** `configuration_changed` 活动包含一个或多个 `changes`
- **THEN** 页面在现有卡片中展示每个字段路径及格式化后的旧值和新值

#### Scenario: 按配置模块组织多项变更
- **WHEN** 一条配置变更活动包含属于一个或多个顶层配置模块的字段变化
- **THEN** 页面按 `changes.field` 的第一个路径段分组，使用可读的模块名称展示每组变更数量，并在组内使用去除顶层模块后的相对字段路径展示明细

#### Scenario: 折叠和展开配置模块
- **WHEN** 页面展示配置变更分组
- **THEN** 每个分组默认折叠且保留模块名称和变更数量，用户展开后可查看该组全部字段变化，并可再次收起

#### Scenario: 展开和收起长值
- **WHEN** 格式化后的旧值或新值超过页面的合理预览长度
- **THEN** 页面默认显示带省略标记的值预览，并提供展开完整值和恢复预览的操作，且旧值与新值可独立控制

#### Scenario: 展示未知配置模块
- **WHEN** `changes.field` 的顶层路径不在已知模块名称映射中
- **THEN** 页面使用基于原始顶层路径生成的可读名称展示该分组，不丢弃其中的字段变化

#### Scenario: 展示复杂或空值
- **WHEN** 变化值为对象、数组、空值或缺失值
- **THEN** 页面安全格式化该值且不因直接渲染非标量值而报错

#### Scenario: 未识别活动类型
- **WHEN** 页面收到未识别的活动类型
- **THEN** 页面继续使用现有默认样式展示该活动

### Requirement: 系统可靠显示活动操作者
系统 SHALL 为新活动保存来自认证用户的姓名和邮箱快照，并在读取活动时优先使用快照、批量用户关联和受控旧描述解析来确定操作者；前端 SHALL 在姓名不可用时正确回退到有效邮箱。

#### Scenario: 新活动保存操作者快照
- **WHEN** 认证用户触发任意新活动
- **THEN** 活动保存该用户的标识、姓名和邮箱快照，且不接受客户端覆盖这些身份字段

#### Scenario: 快照存在
- **WHEN** 活动包含有效的操作者姓名或邮箱快照
- **THEN** 接口使用快照返回 `authorName` 和 `authorEmail`，不依赖用户当前是否仍存在

#### Scenario: 旧活动可以关联用户
- **WHEN** 旧活动没有操作者快照但其 `user_id` 可以关联当前用户
- **THEN** 接口使用关联用户的姓名和邮箱展示操作者

#### Scenario: 旧活动仅能从已知描述恢复身份
- **WHEN** 旧活动无法通过 `user_id` 关联用户，但其类型和描述符合已知格式并包含明确的操作者
- **THEN** 接口使用该已知格式解析出的操作者作为显示兜底

#### Scenario: 操作者无法确定
- **WHEN** 活动既没有有效快照、可关联用户，也无法从已知描述格式确定操作者
- **THEN** 页面显示 `Unknown User`，且系统不得猜测身份

#### Scenario: 姓名为未知占位符但邮箱有效
- **WHEN** `authorName` 为空或为 `Unknown User`，但 `authorEmail` 是有效邮箱
- **THEN** 页面显示 `authorEmail` 而不是未知占位符
