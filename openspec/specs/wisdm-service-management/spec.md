# wisdm-service-management Specification

## Purpose

为 RAK 内部运维提供按 Odoo SO 汇总的 WisDM 服务记录，关联已有预配置请求，并独立跟踪 Whitelist、Provisioning、Jira 和人工工作流状态。

## Requirements

### Requirement: 管理员和记录创建者可从列表删除记录
系统 SHALL 允许 `admin` 删除任意 WisDM 服务记录，并 SHALL 允许其他 RAK 内部账号删除自己创建的记录。列表 MUST 仅对有权删除当前记录的账号显示删除入口，删除入口 MUST 位于 `Action` 列现有操作按钮之后，并 MUST 在提交前展示包含 SO Number 和 WDM 记录号的不可恢复确认。

#### Scenario: 管理员确认删除
- **WHEN** 管理员在列表点击删除并确认目标 SO Number 和 WDM 记录号
- **THEN** 系统提交删除，成功后从当前列表移除该记录并显示成功反馈

#### Scenario: 有权用户取消删除
- **WHEN** 有权用户打开删除确认后选择取消
- **THEN** 系统关闭确认提示，不调用删除接口且列表内容保持不变

#### Scenario: 内部账号删除本人记录
- **WHEN** 非管理员的 RAK 内部账号查看由自己创建的 WisDM 服务记录
- **THEN** 系统显示删除入口，并允许其确认后删除该记录

#### Scenario: 内部账号查看他人记录
- **WHEN** 非管理员的 RAK 内部账号查看并非由自己创建的记录
- **THEN** 系统不显示删除入口

#### Scenario: 内部账号越权调用删除接口
- **WHEN** 非管理员直接请求删除并非由自己创建的 WisDM 服务记录
- **THEN** 系统返回 `403`，且不删除任何主记录、SO 占位或 History

#### Scenario: 自动记录没有当前内部创建者
- **WHEN** 自动建档记录的创建者不是当前 RAK 内部账号
- **THEN** 非管理员不能删除该记录，但管理员仍可删除

### Requirement: 删除必须彻底清理服务记录数据
系统 MUST 在删除成功前移除目标服务主记录、对应 SO 唯一占位和该 WDM 记录的全部 History。删除 MUST NOT 修改来源预配置请求或回退 WDM 编号计数器，并 SHALL 支持对未完成清理的安全重试。

#### Scenario: 完整删除记录
- **WHEN** 管理员确认删除一条存在的 WisDM 服务记录
- **THEN** 系统彻底移除该记录、其 SO 唯一占位及全部 History，并仅在全部清理完成后返回成功

#### Scenario: 删除期间发生失败
- **WHEN** 删除过程在全部数据清理完成前失败
- **THEN** 系统不返回成功、保留列表记录，并允许有权用户再次点击 Delete 重试直至清理完成

#### Scenario: 删除不存在的记录
- **WHEN** 管理员请求删除不存在或已经完成删除的 WDM 记录
- **THEN** 系统返回 `404`，且不影响其他服务记录

#### Scenario: 删除后重新使用 SO
- **WHEN** 记录删除成功后用户以相同 SO 手工创建服务记录
- **THEN** 系统允许创建新的 WDM 记录并分配新的递增编号

#### Scenario: 删除后由来源请求重新建档
- **WHEN** 记录删除成功后对应来源预配置请求再次保存且满足自动补充条件
- **THEN** 系统按现有自动建档规则为该 SO 创建新的 WDM 记录

### Requirement: 删除与并发写入不得产生残留或误删
系统 MUST 使用目标记录版本和 SO 占位归属校验协调删除与并发更新或自动补充。发生冲突时 SHALL 返回 `409` 或使当前删除安全重试，不得删除其他记录的 SO 占位、保留可查询的孤立主记录，或在成功响应后残留 History。

#### Scenario: 删除与记录更新并发
- **WHEN** 删除开始时目标记录已被另一请求更新
- **THEN** 系统返回 `409` 或基于最新版本重试删除，不覆盖并发更新且不报告虚假成功

#### Scenario: SO 占位已指向其他记录
- **WHEN** 删除最终清理时对应 SO 占位不再属于目标 WDM 记录
- **THEN** 系统不得删除该 SO 占位，并返回冲突而不是影响新记录

### Requirement: WisDM Services 仅供 RAK 内部账号使用
系统 SHALL 仅向角色为 `rakwireless` 或 `admin` 的账号显示 WisDM Services 菜单，并 SHALL 对该资源的所有接口执行相同的服务端权限校验。

#### Scenario: 内部账号访问
- **WHEN** RAK 内部账号进入 WisDM Services
- **THEN** 系统显示菜单并允许其查看全部服务记录

#### Scenario: 非内部账号访问
- **WHEN** 非 RAK 内部账号直接访问页面路由或调用服务记录接口
- **THEN** 系统不显示菜单，并拒绝该请求且不返回服务记录数据

#### Scenario: 手工记录内容编辑权限
- **WHEN** 手工记录处于 `CREATED` 且操作者是记录创建者或管理员
- **THEN** 系统允许编辑除 SO Number 外的内容字段

#### Scenario: 自动记录内容编辑权限
- **WHEN** 自动生成的记录处于 `CREATED` 且操作者是 RAK 内部账号
- **THEN** 系统允许编辑除 SO Number 外的内容字段

#### Scenario: 非 CREATED 记录内容只读
- **WHEN** 记录状态不是 `CREATED`
- **THEN** 系统禁止修改 Company、Barcode 关联、服务选项、Jira keys 和 Notes，但仍允许有权的内部账号更新 Workflow

### Requirement: 一个 SO 唯一对应一条服务记录
系统 SHALL 对 SO Number 去除首尾空格并按不区分大小写的值保证唯一；SO Number 创建后 MUST 不可修改。系统 SHALL 为每条记录生成唯一且不可修改的 `WDM` 前缀编号，并在列表、详情和详情路由中使用该编号。每条记录 SHALL 至少关联一张有效预配置请求，并至少选择 WisDM Whitelist 或 WisDM Provisioning 中的一项。

#### Scenario: 创建有效记录
- **WHEN** 用户提交唯一 SO、至少一条有效预配置请求关联以及至少一项服务
- **THEN** 系统创建一条状态为 `CREATED` 的服务记录，并返回形如 `WDM0001` 的唯一记录号

#### Scenario: 展示和访问记录号
- **WHEN** 用户在列表查看记录或进入记录详情
- **THEN** 系统在 SO 下方展示该记录的 WDM 编号，并使用该编号加载详情与编辑页面

#### Scenario: SO 已存在
- **WHEN** 用户手工创建的 SO 已有服务记录
- **THEN** 系统拒绝重复创建并提示用户编辑现有记录

#### Scenario: 缺少必要数据
- **WHEN** 用户未提供 SO、未选择有效 Barcode 关联或未选择任何服务
- **THEN** 系统拒绝保存并返回对应字段错误

#### Scenario: Company 自动补全
- **WHEN** 创建记录时 Company 为空
- **THEN** 系统使用第一条所选预配置请求的 Company；自动补充已有记录时仅在原 Company 为空时补入来源请求的 Company

### Requirement: Barcode 必须关联已有预配置请求
新建和编辑表单 SHALL 以普通文本输入 Barcode。保存时系统 MUST 去除首尾空格并转为大写，再仅按该 Barcode 在全部已有预配置请求中匹配 `requestId`，不得使用或校验来源预配置请求上的 SO。同一 Barcode MAY 被不同 SO 的服务记录复用，但在同一条服务记录内 MUST NOT 重复。列表和详情展示 MUST 使用“`<BARCODE> <requestId>`”格式。客户端不得自行生成 `requestId`。

#### Scenario: 按 Barcode 匹配唯一请求
- **WHEN** 用户输入条码并保存，且全部预配置请求中只有一张请求使用该条码
- **THEN** 系统保存该请求已有的 `requestId` 与大写 Barcode

#### Scenario: 不同 SO 复用同一 Barcode
- **WHEN** 不同 SO 的服务记录提交同一 Barcode，且该 Barcode 唯一对应一张预配置请求
- **THEN** 系统允许各服务记录保存同一 Barcode 与相同的 `requestId`，不比较来源请求上的 SO

#### Scenario: 条码不存在
- **WHEN** 全部预配置请求中都没有请求使用该 Barcode
- **THEN** 系统拒绝保存，并提示该条码在预配置请求里不存在

#### Scenario: 同一条码对应多张历史请求
- **WHEN** 该 Barcode 匹配到多张历史预配置请求
- **THEN** 系统拒绝保存并返回这些 `requestId`，不猜测其中一条

#### Scenario: 同一条记录内重复输入
- **WHEN** 同一条服务记录重复提交同一 Barcode
- **THEN** 系统拒绝保存，并提示该 Barcode 在本条记录中重复

#### Scenario: 同一条记录内的不同 Barcode
- **WHEN** 同一条服务记录提交多条不同的 Barcode，且每条都能唯一匹配到预配置请求
- **THEN** 系统保存每条关联，并分别带出对应的 `requestId`

#### Scenario: 保存时重新匹配
- **WHEN** 用户在保存前修改了 Barcode，或来源请求的 Barcode 已经变化
- **THEN** 系统按保存当时的 Barcode 重新匹配，不沿用页面上旧的 `requestId`

### Requirement: 预配置请求的 Barcode 全局唯一
系统 SHALL 在创建和更新预配置请求写库前校验非空 Barcode。比较时 MUST 去除首尾空格并忽略大小写。其他预配置请求已经使用该 Barcode 时，系统 MUST 拒绝保存，返回 `400`，并在错误中包含已占用的 `requestId`。更新时 MUST 排除当前请求。空 Barcode MUST 跳过该校验。复制新建与新建使用同一创建接口，因此沿用已被占用的 Barcode 时 MUST 被拒绝。配置页 MUST NOT 在提交前自行判断占用，提交失败后展示服务端返回的错误。已存在的重复 Barcode 不在本次变更中清理。

#### Scenario: 新建占用已有 Barcode
- **WHEN** 用户新建预配置请求，且该 Barcode 已被另一张预配置请求使用
- **THEN** 系统拒绝保存，返回 `400` 和已占用的 `requestId`，并且不创建新请求

#### Scenario: 复制新建沿用原 Barcode
- **WHEN** 用户从已有请求复制并保存，且未把 Barcode 改成未被占用的值
- **THEN** 系统按新建拒绝保存，并返回原请求的 `requestId`

#### Scenario: 编辑当前请求
- **WHEN** 用户更新某一张预配置请求，且 Barcode 仍只属于该请求
- **THEN** 系统允许保存

#### Scenario: 编辑改成已被占用的 Barcode
- **WHEN** 用户把当前请求的 Barcode 改成另一张预配置请求已经使用的值
- **THEN** 系统拒绝保存，返回 `400` 和已占用的 `requestId`，并且不修改当前请求

#### Scenario: 大小写和空白视为同一条
- **WHEN** 已有请求的 Barcode 与本次提交只在大小写或首尾空白上不同
- **THEN** 系统视为同一条 Barcode 并拒绝新建

#### Scenario: 空 Barcode
- **WHEN** 创建或更新的预配置请求没有 Barcode
- **THEN** 系统跳过 Barcode 唯一性校验

### Requirement: Whitelist 信息与服务选择保持一致
系统 SHALL 允许 Whitelist 关联零个或多个 Jira key。Jira key SHALL 去除首尾空格、转换为大写并去重；未选择 Whitelist 时 MUST 清空 Jira keys。

#### Scenario: 记录多个 Jira key
- **WHEN** 用户选择 Whitelist 并输入多个 Jira key
- **THEN** 系统保存规范化且去重后的 Jira key 列表

#### Scenario: 取消 Whitelist
- **WHEN** `CREATED` 记录取消选择 Whitelist
- **THEN** 系统清空 Jira keys，并在 Provisioning 仍被选择时允许保存

#### Scenario: 取消最后一项服务
- **WHEN** 用户尝试取消记录唯一剩余的服务
- **THEN** 系统拒绝保存并提示至少选择一项服务

### Requirement: 保存预配置请求时自动补充服务记录
系统 SHALL 在创建或更新预配置请求成功保存时，使用保存后的有效配置检查 SO、Barcode、`system.wisdmWhitelist` 和 `system.wisdmConnect`。当 SO 与 Barcode 均存在且至少一项服务为真时，系统 SHALL 按 SO 幂等创建或补充服务记录。

#### Scenario: 自动创建记录
- **WHEN** 保存的预配置请求满足自动补充条件且对应 SO 尚无记录
- **THEN** 系统创建 `CREATED` 记录，关联该请求与 Barcode，并打开请求选择的服务

#### Scenario: 自动补充已有记录
- **WHEN** 对应 SO 已有记录
- **THEN** 系统加入尚不存在的请求与 Barcode 关联，并只打开本次新增选择的服务，不移除已有关联或服务

#### Scenario: 重复保存保持幂等
- **WHEN** 同一请求以相同 SO、Barcode 和服务重复保存
- **THEN** 系统不创建重复记录、重复关联或重复历史

#### Scenario: 不满足自动补充条件
- **WHEN** 保存的请求缺少 SO、缺少 Barcode 或两项 WisDM 服务均未选择
- **THEN** 系统不创建或修改服务记录

#### Scenario: WisDM 主开关不参与同步判定
- **WHEN** `system.wisdmEnabled` 改变但 SO、Barcode 和两项服务选择没有产生符合条件的新内容
- **THEN** 系统不因 WisDM 主开关创建、删除或改变服务记录

#### Scenario: 配置工单取消或修改已有值
- **WHEN** 后续保存移除服务、Barcode 或将 SO 改为其他值
- **THEN** 系统不反向删除旧服务记录中的数据；若新值满足条件，则仅对新的 SO 执行幂等补充

#### Scenario: 服务记录编辑不反向同步
- **WHEN** 用户在 WisDM Services 中修改记录内容或 Workflow
- **THEN** 系统不修改任何来源预配置请求

### Requirement: 自动补充已有记录时保持 Workflow
系统 SHALL 在自动补充已有记录时仅追加新的预配置请求与 Barcode 关联，并打开本次新增选择的服务；已有 Barcode、服务选项和 Workflow MUST 保持不变，不得因自动补充重新计算状态。

#### Scenario: 已有记录新增 Barcode
- **WHEN** 自动补充向记录加入新的预配置请求与 Barcode 关联
- **THEN** 系统保留原 Workflow，不因新增 Barcode 回退或前进状态

#### Scenario: 已有记录新增服务
- **WHEN** 自动补充首次打开 Whitelist 或 Provisioning
- **THEN** 系统保留原 Workflow，不根据新服务重新计算状态

#### Scenario: 重复补充没有变化
- **WHEN** 自动补充未加入新关联且未打开新服务
- **THEN** 系统不修改记录或 Workflow

### Requirement: Workflow 由服务选择约束并允许回退
系统 SHALL 允许内部人员在列表或详情中手工更新 Workflow，并 SHALL 根据当前服务选项限制可选值。状态更新 SHALL 在选择后立即保存，且允许在有效状态之间前进、跳转或回退。

#### Scenario: 两项服务均选择
- **WHEN** Whitelist 和 Provisioning 均被选择
- **THEN** 可选状态仅为 `CREATED`、`WHITELIST_DONE`、`PROVISIONING_DONE`、`ALL_DONE`

#### Scenario: 仅选择 Whitelist
- **WHEN** 仅 Whitelist 被选择
- **THEN** 可选状态仅为 `CREATED`、`WHITELIST_DONE`、`ALL_DONE`

#### Scenario: 仅选择 Provisioning
- **WHEN** 仅 Provisioning 被选择
- **THEN** 可选状态仅为 `CREATED`、`PROVISIONING_DONE`、`ALL_DONE`

#### Scenario: 编辑页立即更新 Workflow
- **WHEN** 用户在编辑表单中选择另一个与当前已保存服务匹配的 Workflow
- **THEN** 系统立即单独保存该状态并写入 History；若新状态不是 `CREATED`，内容字段恢复为只读

#### Scenario: 回退到 CREATED
- **WHEN** 有权用户将记录从任意有效状态改回 `CREATED`
- **THEN** 系统保存回退；记录内容按照其来源对应的编辑权限重新变为可编辑

#### Scenario: 提交不适用状态
- **WHEN** 客户端提交与当前服务选择不匹配的 DONE 状态
- **THEN** 服务端拒绝更新并保持原状态

### Requirement: History 记录创建和状态变化
系统 SHALL 为记录创建及每次实际 Workflow 变化保存操作者、时间和动作，并 SHALL 在详情中按时间从新到旧展示。普通内容编辑 SHALL 不创建 History 条目。

#### Scenario: 创建历史
- **WHEN** 记录由用户手工创建或由保存配置工单自动创建
- **THEN** 系统写入包含来源和实际触发人的创建历史

#### Scenario: 手工状态变化
- **WHEN** 用户将 Workflow 从一个状态改为另一个状态
- **THEN** 系统写入旧状态、新状态、操作者和时间

#### Scenario: 重复提交相同状态
- **WHEN** 用户提交的 Workflow 与当前状态相同
- **THEN** 系统不写入重复历史

### Requirement: API 错误语义保持稳定
系统 SHALL 使用可区分的 HTTP 状态码返回校验、权限、资源不存在和并发冲突错误，并 SHALL 在请求失败时保持原数据不变。

#### Scenario: 输入校验失败
- **WHEN** 请求缺少必填字段、未选择服务、Barcode 不存在或匹配到多张预配置请求、同一条服务记录重复提交同一 Barcode、预配置请求的 Barcode 已被其他请求占用，或提交非法 Workflow
- **THEN** 系统返回 `400`

#### Scenario: 权限不足
- **WHEN** 非 RAK 内部账号访问接口，或内部账号尝试执行无权操作
- **THEN** 系统返回 `403`

#### Scenario: 资源不存在
- **WHEN** 请求地址上的 WDM 服务记录不存在
- **THEN** 系统返回 `404`

#### Scenario: 唯一或并发冲突
- **WHEN** 创建重复 SO，或更新时记录版本已经变化
- **THEN** 系统返回 `409`，且不覆盖其他请求已经保存的内容

### Requirement: 服务记录可查询、筛选和查看来源
系统 SHALL 提供包含 SO Number、WDM 记录号、Company、Barcodes、服务选项、Workflow 和操作入口的列表；SHALL 支持按 Workflow 筛选以及对 SO、Company、Barcode、预配置请求号和 Jira key 的不区分大小写搜索。列表接口 SHALL 另外支持按 `preconfigRequestId` 和 `barcode` 精确限定关联记录。列表结果 SHALL 按 `created_at` 从新到旧排列；缺少 `created_at` 时退回 `updated_at`。内容编辑、Workflow 更新和自动补充不得因此改变记录的相对顺序。

#### Scenario: 搜索关联信息
- **WHEN** 用户提交 SO、Company、Barcode、预配置请求号或 Jira key 关键字
- **THEN** 系统返回任一字段匹配的记录

#### Scenario: 触发搜索
- **WHEN** 用户在搜索框按 Enter 或点击 Search
- **THEN** 系统使用当前关键字执行查询并展示结果

#### Scenario: 按来源关联查询
- **WHEN** 调用方传入 `preconfigRequestId` 或 `barcode` 参数
- **THEN** 系统仅返回包含对应预配置请求关联或 Barcode 的服务记录

#### Scenario: 按状态筛选
- **WHEN** 用户选择 Created、Whitelist Done、Provisioning Done 或 All Done
- **THEN** 系统仅返回对应 Workflow 的记录；选择 All 时不按 Workflow 限制

#### Scenario: 列表按创建时间稳定排序
- **WHEN** 用户编辑记录内容、更新 Workflow，或自动补充已有记录
- **THEN** 列表仍按创建时间从新到旧排列，该记录不因修改时间变化而移动

#### Scenario: 从 Barcode 打开来源请求
- **WHEN** 用户点击记录中的 Barcode 或其预配置请求号
- **THEN** 系统打开该关联对应的预配置请求详情

#### Scenario: 查看详情
- **WHEN** 用户打开一条服务记录
- **THEN** 系统展示记录字段、每个 Barcode 的来源请求以及按时间倒序排列的 History
