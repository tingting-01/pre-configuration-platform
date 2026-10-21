## Context

当前系统是 React/Vite 单页应用与 FastAPI 后端，业务接口集中在 `backend/main_simple.py`，DynamoDB 访问封装在 `backend/dynamodb_client.py`。预配置请求把可选 SO 和 Barcode 保存在 `config_data.general`，把 Whitelist 和 Provisioning 分别保存在 `config_data.system.wisdmWhitelist` 与 `config_data.system.wisdmConnect`；请求列表已有兼容历史字段名的瘦身读取逻辑。Barcode 是独立的预配置标识，配置单上的 SO 可能在后续订单阶段才填写，不作为 Barcode 的归属条件。角色分为 `user`、`rakwireless` 和 `admin`，Dashboard 已采用“内部账号查看全部、创建者或管理员编辑内容”的权限基础。

本变更跨越请求保存、独立服务记录、历史、权限和多个前端页面，且需要在并发保存时保证一个 SO 只有一条记录，因此需要明确数据模型与写入一致性。详见 `proposal.md` 和 `specs/wisdm-service-management/spec.md`。

## Goals / Non-Goals

**Goals:**

- 在现有 FastAPI、React 和 DynamoDB 技术栈内提供可独立维护的 WisDM Services 模块。
- 让手工建档与配置工单自动补充使用同一套规范化、校验、合并和状态规则。
- 以预配置请求 ID 与 Barcode 的组合保存关联。预配置请求保存时保证一条非空 Barcode 只属于一个 `requestId`；WisDM 手工保存时仅按 Barcode 取出该 `requestId`，不同 SO 的服务记录可复用同一关联。
- 保证自动补充幂等，并在同一 SO 的并发写入下不丢失 Barcode、服务或状态变化。
- 在前后端同时执行可用状态与权限校验，以服务端结果为准。

**Non-Goals:**

- 不调用 Odoo、WisDM 或 Jira API；SO 与 Jira key 仅作记录。
- 不让 WisDM Services 的修改反向覆盖预配置请求。
- 不批量回填历史配置工单；旧工单只在后续保存且满足条件时参与自动补充。
- 不增加删除服务记录功能，也不记录普通内容字段的修改历史。
- 不改变 WisDM 主开关及现有配置导出的语义。

## Decisions

### 1. 独立资源模块，复用现有认证与页面框架

新增 `/api/wisdm-service-records` 列表、创建、详情和更新接口。新建和编辑提交的是 Barcode 文本，服务端仅按 Barcode 匹配预配置请求，不使用或校验来源请求上的 SO。前端新增受现有 `Layout` 包裹的列表与详情路由。菜单根据认证用户角色隐藏，但每个后端接口仍统一调用内部账号守卫，避免仅靠前端保护。

列表和编辑页更新 Workflow 时都使用 `PUT /api/wisdm-service-records/{recordId}`，请求体只含 `workflow`；内容编辑使用同一接口提交完整的可编辑字段。后端根据负载类型分别执行状态权限或内容权限校验，不信任前端隐藏状态。

接口统一使用以下错误语义：缺少必填字段、未选择服务、查询条件不合法、Workflow 非法、条码匹配失败或引用的预配置请求已不存在返回 `400`；认证用户无权访问或修改返回 `403`；请求地址上的 WDM 记录不存在返回 `404`；SO 重复或乐观锁版本冲突返回 `409`。所有失败写入不得留下部分服务记录或 History。

备选方案是把数据塞入现有预配置请求，但一个 SO 可关联多张请求且服务状态独立于请求工作流，会造成重复与相互覆盖，因此采用独立资源。

### 2. 使用服务记录表、SO 唯一占位项与独立历史表

新增两张 DynamoDB 表：

- `preconfig-wisdm-service-records`：分区键为字符串 `pk`，无排序键，使用 On-demand capacity。表内包含三类项：
  - 服务记录：`pk = RECORD#<record_id>`，保存 `record_id`、规范化及显示 SO、Company、关联数组、两个服务布尔值、Jira keys、Workflow、Notes、`source_type`、创建/更新操作者快照、时间和 `version`。
  - SO 唯一占位：`pk = SO#<normalized_so>`，保存对应 `record_id`；与服务记录在同一事务条件创建，从而保证一个 SO 只有一条记录。
  - 编号计数器：`pk = COUNTER#WISDM_SERVICE`，保存下一个数字序号。
- `preconfig-wisdm-service-history`：分区键为字符串 `record_id`，排序键为字符串 `event_key`（`timestamp#event_id`），使用 On-demand capacity，保存 `created` 或 `workflow_changed`、前后状态、原因和操作者快照。

创建新记录前对计数器执行原子递增，以 `WDM` 加至少四位补零序号生成 `record_id`，例如 `WDM0001`。编号只要求唯一且递增，不要求完全连续；事务失败造成的序号空洞可以接受。详情与编辑接口使用 WDM 编号，SO 唯一占位用于由 SO 定位和防重。

关联项采用 `{requestId, barcode}`。同一条服务记录按规范化 Barcode 去重；不同 SO 的服务记录可保存相同关联。Company 只在手工/自动创建或现有值为空时从第一条来源请求补齐，后续自动补充不覆盖人工值。

备选方案是把 History 嵌入记录，但长期状态变化会扩大单条记录、增加并发冲突且不便倒序分页，因此独立存储。

#### 人工建表前置条件

实现开始前由用户在与现有 `preconfig-*` 表相同的 AWS Region 和账号中手工创建：

1. `preconfig-wisdm-service-records`
   - Partition key：`pk`（String）
   - Sort key：无
   - Capacity mode：On-demand
   - Secondary indexes：无
2. `preconfig-wisdm-service-history`
   - Partition key：`record_id`（String）
   - Sort key：`event_key`（String）
   - Capacity mode：On-demand
   - Secondary indexes：无

两张表状态必须为 `ACTIVE`。应用 IAM 角色必须对这两张表具有 `dynamodb:DescribeTable`、`GetItem`、`PutItem`、`UpdateItem`、`Scan`、`Query` 和 `TransactWriteItems` 权限。表名沿用项目现有方式，以固定名称加入 DynamoDB 客户端的 `TABLES` 集中映射和低层事务序列化路径，不另建凭证客户端，也不得在代码中写入账号、密钥或固定 Region。

### 3. Barcode 在保存时独立匹配

新建和编辑表单中的 Barcode 是普通文本框，可添加多行、移除多余行。输入时不查询预配置请求，也不展示或生成 `requestId`。

保存时后端扫描已有预配置请求，仅用规范化后的 Barcode 匹配，不使用或校验来源请求上的 SO：

- 只找到一张请求：保存该请求已有的 `requestId` 和大写 Barcode。
- 找不到：拒绝保存，提示条码在预配置请求里不存在。
- 找到多张：拒绝保存，并返回这些 `requestId`，不猜测。这只覆盖历史脏数据；新的预配置请求不再允许产生这种情况。
- 同一条服务记录重复提交同一 Barcode：拒绝保存，并提示该 Barcode 在本条记录中重复。不同 Barcode 可以同时保存，各自带出自己的 `requestId`。
- 不同 SO 的服务记录可以复用同一 Barcode 与同一 `requestId`。

列表和详情仍按“`<BARCODE> <requestId>`”展示已经保存的关联。编辑已有记录时重新加载来源请求，只复核 `requestId` 仍存在且 Barcode 未变化，不比较来源请求 SO。Company 仍只在为空时从匹配到的第一条来源请求补齐。

配置页不在提交前判断 Barcode 是否被占用。创建、复制新建和更新预配置请求在写库前扫描已有请求：Barcode 去除首尾空格后不区分大小写；空 Barcode 跳过；其他请求已使用该 Barcode 时返回 `400` 和已占用的 `requestId`；更新时排除当前请求。复制新建走创建接口，沿用原 Barcode 会被同一规则拒绝。

现有 Barcode 位于嵌套 `config_data`，无法直接用 GSI 检索。预配置请求查重和 WisDM 手工保存都沿用请求列表的投影扫描。如果数据量增长，再在请求写入时冗余规范化 Barcode 并增加索引。

### 4. 配置工单保存与服务补充采用同一事务和乐观并发

从创建与更新请求的有效 `config_data` 中统一提取 SO、Barcode、Whitelist 与 Provisioning；只有 SO、Barcode 和至少一个服务同时存在时才生成同步计划。同步只做集合并集，不因来源请求后续取消选项或改值而删除旧数据。

触发同步的请求写入、配置活动、服务记录写入以及新建记录所需的创建历史使用 DynamoDB 事务提交。更新已有服务记录前先读取 `SO#<normalized_so>` 占位项定位 WDM 记录，再读取其 `version`；事务中以版本条件写入，冲突时重新读取、重新合并并进行有限次数重试。新建时在同一事务中条件创建 WDM 记录、SO 唯一占位和创建历史。这样可以同时避免重复 SO、并发覆盖和“工单已保存但服务记录未补”的半成功状态。

同步函数比较合并前后内容：无新增关联且无新服务时不写服务记录或历史，使重复保存幂等。自动创建的 `created_by` 保存实际请求操作者；`source_type` 用于应用自动记录的内部编辑规则。

备选方案是请求保存后再异步补充，但项目目前没有通用 outbox/队列，失败恢复和状态可见性会显著复杂，因此首版选择事务一致性。

### 5. 自动补充保持已有 Workflow

自动同步只合并关联和服务选项，不参与已有记录的 Workflow 判断：

- SO 尚无记录时创建新记录，Workflow 固定为 `CREATED`。
- SO 已有记录时，新增请求/Barcode 关联只加入关联集合，原 Workflow 保持不变。
- 首次新增 Whitelist 或 Provisioning 时只把对应服务设为 true，原 Workflow 保持不变。
- 无新增关联或服务时不写服务记录，保证重复保存幂等。

所有手工 Workflow 值仍按当前服务组合生成允许集合并在服务端校验，允许从任意有效状态跳转或回退。回退 `CREATED` 后才重新开放内容编辑。自动同步不得调用手工状态转换逻辑，也不得产生 Workflow 变化历史。

### 6. 内容权限、流程权限与来源分开判断

所有读取和写入首先要求 `rakwireless` 或 `admin`：

- 所有内部账号可查看全部记录并更新有效 Workflow，以满足运维协作。
- 手工记录只有创建者或管理员可在 `CREATED` 编辑内容，沿用 Dashboard 的内容编辑原则。
- 自动记录没有可靠的内部创建者（来源请求可能由外部账号保存），因此所有内部账号可在 `CREATED` 编辑内容。
- 非 `CREATED` 时内容只读；管理员也不绕过该业务状态限制，但任何有效 Workflow 可回退到 `CREATED`。

操作者信息始终取认证上下文并保存 ID、姓名、邮箱快照，客户端传入的创建者或历史操作者字段全部忽略。

### 7. 前端按 demo 组织交互但以后端规则为准

列表包含状态筛选、组合搜索、关联跳转、列表内 Workflow 下拉和 View/Edit。列表接口按 `created_at` 从新到旧返回；缺少创建时间的记录退回 `updated_at`。内容编辑、Workflow 更新和自动补充不改变已有记录的相对位置。详情展示字段与倒序 History。新建/编辑表单复用同一表单组件，Barcode 为可重复添加的普通输入框；Whitelist 打开时显示多个 Jira key 输入，取消时立即清空。

编辑表单在服务选项和 Notes 之间展示 Workflow Process 下拉。选项来自已保存记录的服务组合，不随表单里尚未保存的服务勾选变化。选择后立即单独保存；若新状态不是 `CREATED`，关闭内容编辑并回到只读详情。新建表单不展示 Workflow，状态固定为 `CREATED`。页头已经展示 SO Number，编辑表单不再重复该字段。

前端根据服务组合过滤 Workflow 选项，根据 `sourceType`、创建者、角色和当前状态显示 Edit，但后端返回的 403、409 与字段错误仍需展示。

## Risks / Trade-offs

- [手工保存和预配置请求查重都要扫描嵌套配置] → 只在 WisDM 创建/内容更新，以及预配置请求创建/更新且 Barcode 非空时扫描，并复用列表投影；数据增长后增加冗余索引字段。历史数据中同一条码对应多张请求时，WisDM 保存拒绝猜测。
- [请求保存事务扩展后逻辑更复杂] → 把提取、规范化、合并、状态计算写成独立纯函数，并用事务与并发测试覆盖。
- [已有 `ALL_DONE` 记录自动增加 Barcode 或服务后仍保持完成状态，可能无法反映新增工作] → 这是原需求明确规定的行为，本次不擅自重算状态；由运维人员根据实际处理情况手工调整 Workflow。
- [回退后可修改服务定义，可能改变已有完成含义] → 仅在 `CREATED` 允许内容修改，修改后所有状态仍必须经过服务组合校验。
- [无历史数据回填会使上线初期列表为空] → 这是明确的非目标；通过后续保存或手工创建逐步建立记录。
- [原子计数器先分配 WDM 编号，后续事务失败可能产生编号空洞] → 接受不连续但唯一递增的编号，避免为展示连续性引入全局锁和复杂回滚。

## Migration Plan

1. 用户按“人工建表前置条件”创建两张 DynamoDB 表并补充 IAM 权限，确认状态均为 `ACTIVE`；在此之前不开始依赖新表的后端实现。
2. 将两张固定表名注册到现有 `TABLES` 映射，并通过 `DescribeTable`、一次测试记录事务和 History 查询验证键结构与权限。
3. 部署新资源接口和请求保存事务同步，完成 Barcode 独立匹配、跨 SO 复用与并发验证，但暂不展示菜单。
4. 部署前端菜单、列表、详情和表单，仅内部角色可见。
5. 使用测试 SO 验证 WDM 编号、手工创建、配置工单自动建档、第二 Barcode 补充与服务新增后 Workflow 保持不变、手工状态前进/回退、搜索筛选和来源跳转。
6. 若需回滚，先隐藏菜单并停止请求保存时的同步调用，再回滚后端；保留新表数据以便恢复，不删除现有记录。
