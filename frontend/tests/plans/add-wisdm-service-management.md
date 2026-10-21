# Test Plan: add-wisdm-service-management

## Source

- Type: OpenSpec change
- Reference:
  - `openspec/changes/add-wisdm-service-management/proposal.md`
  - `openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md`
  - `openspec/changes/add-wisdm-service-management/design.md`
  - `openspec/changes/add-wisdm-service-management/tasks.md`
- Feature: WisDM Service Management
- Confirmed scope: 全部 Core 场景；不包含 Optional 场景

## Scope

本计划覆盖 RAK 内部账号使用 WisDM Services 的完整核心流程：访问控制、手工建档、Barcode 到预配置请求的匹配、配置单 Barcode 全局唯一、配置单保存后的自动建档/补充、内容权限、Workflow 与 History、搜索筛选、来源跳转、稳定排序，以及可恢复错误。

关键业务边界：

- WisDM Service 记录按 SO 唯一；SO 创建后不可修改，每条记录生成不可修改的 `WDM` 编号。
- 手工保存 WisDM Service 时，只按规范化后的 Barcode 在全部预配置请求中查找唯一 `requestId`，不使用、也不校验来源请求的 SO。
- 同一 Barcode/`requestId` 可以出现在不同 SO 的 WisDM Service 记录中，但同一条 WisDM Service 记录内不能重复。
- 新创建或更新的预配置请求中，非空 Barcode 必须全局唯一；历史重复数据不在本变更中清理。
- 配置单同步只向 WisDM Service 单向追加，不反向删除或修改来源配置单。

不在本计划范围：跨浏览器兼容性、无障碍专项、刷新/浏览器前进后退专项、历史重复 Barcode 数据清理、旧数据批量回填、DynamoDB/IAM 基础设施本身的验收、非用户可见的纯单元/数据层实现细节。

## Test environment and assumptions

- Application URL: `http://localhost:3000`
- Frontend start command: 在 `frontend` 目录执行 `npm run dev`；默认前端端口为 `3000`。
- Backend: 本地前端所连接的测试后端必须可访问两张 ACTIVE 的 WisDM DynamoDB 表，并具备变更文档声明的权限。
- Browser baseline: Playwright Chromium Desktop；本次规划时因 Windows 沙箱 Crashpad 问题，使用可见 Chrome 完成真实页面探索。
- Roles/accounts:
  - `PW_ADMIN_EMAIL`: 内部管理员；可查看全部记录、编辑符合状态规则的内容并更新 Workflow。
  - `PW_INTERNAL_CREATOR_EMAIL`: 内部账号 A，作为手工记录创建者。
  - `PW_INTERNAL_OTHER_EMAIL`: 内部账号 B，作为非创建者内部账号并验证内部协作权限。
  - `PW_EXTERNAL_EMAIL`: 外部账号，用于验证菜单隐藏、直接路由和接口拒绝。
  - 执行前先通过只读登录确认三个账号的实际角色；若与上述预期不符，停止对应权限场景并修正账号准备条件。
- 凭据安全: 本地账号保存在被 Git 忽略的 `frontend/.env.playwright.local`；测试计划和测试代码不得包含密码、Token 或认证 Cookie。自动化执行时由该文件或测试密钥管理方式注入，并可生成本地 Playwright `storageState`。任何已在非安全渠道出现且可能用于生产的密码都应先轮换。
- 写入安全: 当前本地页面可能连接生产或共享数据，默认只允许登录、菜单可见性、页面访问、列表/详情读取和搜索筛选等只读验证。所有创建、更新、Workflow 变化、自动同步、并发和错误恢复场景必须切换到已明确确认的隔离测试环境，使用唯一测试前缀；不得在生产数据路径运行。
- 建议每次运行生成唯一前缀，例如 `E2E-WDM-<runId>`，并准备以下独立种子：

| Fixture | 说明 |
| --- | --- |
| `REQ-A` / `BC-A` / `SO-SOURCE-A` | Barcode 唯一的预配置请求 |
| `REQ-B` / `BC-B` / `SO-SOURCE-B` | 第二张 Barcode 唯一的预配置请求 |
| `REQ-EMPTY-BC` | Barcode 为空的预配置请求 |
| `BC-HISTORY-DUP` | 仅通过受控种子制造的历史重复 Barcode，对应两个不同 `requestId`；不能经正常 UI 新建 |
| `SO-MANUAL-A/B` | 手工 WisDM Service 测试 SO，与来源请求 SO 可相同或不同 |
| `SO-AUTO-A/B` | 自动同步测试 SO |
| `SO-CONFLICT` | 重复 SO 与并发更新测试 SO |

- 每个场景应自行创建或装载数据，并在结束后按 `runId` 精确清理；场景之间不能依赖执行顺序。
- 已通过真实页面确认的用户可见目标：
  - 侧栏 `WisDM Services`、页头 `New Service Record`。
  - 列表列 `SO Number`、`Company`、`Barcodes`、`Whitelist`、`Provisioning`、`Workflow Process`、`Actions`。
  - 筛选按钮 `All`、`Created`、`Whitelist Done`、`Provisioning Done`、`All Done`。
  - 搜索框 `Search service records` 和按钮 `Search`。
  - 新建表单 `SO Number *`、`Company`、`Barcode 1`、`Add barcode`、`WisDM Whitelist required`、`WisDM Provisioning required`、`Notes`、`Cancel`、`Create`；勾选 Whitelist 后显示 `Jira ticket(s)`、`Jira ticket 1`、`Add Jira key`。
  - 空表单提示 `SO Number is required`、`Barcode is required`、`At least one WisDM service is required`。
  - 详情页包含 WDM 编号、`Barcodes / Preconfig`、服务字段、`Workflow Process`、`Notes`、`History`。
  - 编辑页不重复提供 SO 输入，包含 `Company`、多 Barcode、服务选项、`Workflow Process`、`Notes`、`Cancel`、`Save`。
  - 配置页包含 `Pre-configuration Request Form`、`BarCode`、`SO Number`、`System Configuration` 和 `Save Configuration`。
- 探索阶段未执行任何业务写入；所有需要保存、权限切换、并发或故障注入的期望均依据已确认 OpenSpec，标记为“隔离环境待执行”。

## Acceptance criteria coverage

| Acceptance criterion | Scenario(s) | Coverage note |
| --- | --- | --- |
| AC-01 WisDM Services 仅供 RAK 内部账号使用 | TP-001 | 页面与接口均覆盖；多角色需要隔离账号 |
| AC-02 手工/自动记录内容权限及非 CREATED 只读 | TP-010, TP-014 | 隔离环境待执行 |
| AC-03 SO 唯一、规范化、WDM 编号、必填与 SO 不可改 | TP-002, TP-003 | 表单结构和必填提示已观察；保存路径待执行 |
| AC-04 Barcode 仅按 Barcode 匹配请求，可跨 SO 复用，本记录内去重 | TP-004, TP-005, TP-006, TP-007 | 页面输入/展示已观察；负向保存待执行 |
| AC-05 预配置请求 Barcode 全局唯一 | TP-008, TP-009 | 配置页字段已观察；服务端冲突待执行 |
| AC-06 服务选择、Jira 规范化与取消联动 | TP-011 | Jira 动态输入已观察；持久化待执行 |
| AC-07 配置单保存自动创建/补充且单向同步 | TP-012, TP-013 | 隔离环境待执行 |
| AC-08 自动补充幂等并保持 Workflow | TP-013 | 隔离环境待执行 |
| AC-09 Workflow 选项受服务约束并支持即时前进、跳转、回退 | TP-014 | 三种服务组合的真实下拉选项已观察；状态写入待执行 |
| AC-10 History 记录创建和实际 Workflow 变化 | TP-002, TP-014, TP-015 | 详情 History 结构与创建事件已观察；变化写入待执行 |
| AC-11 400/403/404/409 错误语义且失败不改变数据 | TP-003, TP-007, TP-008, TP-010, TP-014, TP-017 | 需受控数据/并发/响应注入 |
| AC-12 搜索、筛选、精确关联、来源跳转、详情和稳定排序 | TP-005, TP-016 | 列表、Enter 搜索、详情、来源链接已观察；排序变更待执行 |

## Scenarios

### TP-001: 内部账号可访问，非内部账号被前后端同时拒绝

**Relevant acceptance criteria:** AC-01

**Preconditions:**

- 准备 `admin`、`rakwireless` 和非内部 `user` 三类账号。
- 至少存在一条隔离 WisDM Service 记录。

**Steps and expected results:**

1. 以 `admin` 登录并查看侧栏。
   - Expected: 显示 `WisDM Services`；进入后可看到页面标题、筛选、搜索和服务记录列表。
2. 以 `rakwireless` 登录并进入 `/wisdm-services`。
   - Expected: 页面可访问并能读取全部服务记录，而不只限于本人创建的数据。
3. 以非内部 `user` 登录并查看侧栏。
   - Expected: 不显示 `WisDM Services`。
4. 非内部账号直接打开 `/wisdm-services` 与一个已知 `/wisdm-services/<WDM ID>`。
   - Expected: 页面拒绝访问，不泄露列表或详情内容。
5. 在同一账号上下文直接请求 WisDM Service 列表和详情接口。
   - Expected: 均返回 `403`，响应不包含服务记录数据。

### TP-002: 手工创建有效记录并生成 WDM 编号、Company 与创建历史

**Relevant acceptance criteria:** AC-03, AC-10

**Preconditions:**

- 使用内部管理员账号。
- `REQ-A` 的 Barcode 为 `BC-A`，Company 已设置；`SO-MANUAL-A` 尚无服务记录。

**Steps and expected results:**

1. 在 `WisDM Services` 点击 `New Service Record`。
   - Expected: 打开新建弹窗；显示 SO、Company、Barcode、服务、Notes；不显示可编辑 Workflow，初始状态固定为 `CREATED`。
2. 输入唯一 `SO-MANUAL-A`，Company 留空，输入 `BC-A`，至少勾选一项服务并点击 `Create`。
   - Expected: 创建成功，关闭弹窗并显示新记录；SO 下方出现唯一、不可修改且形如 `WDM0001` 的编号。
3. 打开该记录详情。
   - Expected: Company 自动取 `REQ-A` 的 Company；`Barcodes / Preconfig` 显示规范化 Barcode 和 `REQ-A` 的现有 `requestId`；Workflow 为 `Created`。
4. 查看 `History`。
   - Expected: 存在一条创建事件，包含手工来源、实际操作者和时间。

### TP-003: 必填、重复 SO、SO 规范化及创建后不可修改

**Relevant acceptance criteria:** AC-03, AC-11

**Preconditions:**

- 使用内部管理员账号。
- 已存在 `SO-CONFLICT` 的服务记录；准备唯一有效 `BC-A`。

**Steps and expected results:**

1. 打开 `New Service Record`，不填写任何字段，点击 `Create`。
   - Expected: 分别显示 `SO Number is required`、`Barcode is required`、`At least one WisDM service is required`；不创建记录。
2. 只填写 SO 和 Barcode，但不勾选服务，再次提交。
   - Expected: 仍拒绝保存并提示至少选择一项服务。
3. 使用与 `SO-CONFLICT` 仅大小写或首尾空白不同的 SO 提交有效表单。
   - Expected: 返回重复 SO 冲突，提示编辑现有记录；接口状态为 `409`；不存在第二条记录或部分历史。
4. 打开已有记录的 `Edit`。
   - Expected: 页头显示 SO 和 WDM 编号；编辑表单不提供 SO 输入字段。
5. 尝试通过接口更新 SO。
   - Expected: 请求被拒绝，原 SO、版本和其他内容保持不变。

### TP-004: Barcode 规范化后仅按 Barcode 匹配唯一 requestId

**Relevant acceptance criteria:** AC-04

**Preconditions:**

- `REQ-A` 的 Barcode 为 `BC-A`，其来源 SO 为 `SO-SOURCE-A`。
- 新服务记录使用与来源不同的 `SO-MANUAL-A`。

**Steps and expected results:**

1. 新建服务记录，在 Barcode 输入框填写带首尾空格且大小写混合的 `BC-A`，SO 填写 `SO-MANUAL-A` 并选择服务。
   - Expected: 输入阶段不查询、不生成或展示 `requestId`。
2. 点击 `Create`。
   - Expected: 后端按保存当时的 Barcode 匹配；来源 SO 不同不影响保存。
3. 打开列表和详情。
   - Expected: Barcode 以去空格后的大写值展示，并关联 `REQ-A` 的既有 `requestId`；客户端未产生新 `requestId`。
4. 在编辑页把 Barcode 改为 `BC-B` 后保存。
   - Expected: 保存时重新匹配为 `REQ-B`，不沿用旧 `requestId`。

### TP-005: 一个 SO 关联多条不同 Barcode，并正确展示和跳转来源

**Relevant acceptance criteria:** AC-04, AC-12

**Preconditions:**

- `BC-A`、`BC-B` 分别唯一对应 `REQ-A`、`REQ-B`。
- `SO-MANUAL-A` 尚无记录。

**Steps and expected results:**

1. 打开新建弹窗，点击 `Add barcode`。
   - Expected: 出现 `Barcode 1`、`Barcode 2` 及各自移除按钮；可以继续添加或移除输入行。
2. 输入 `BC-A`、`BC-B`，填写唯一 SO 并至少选择一项服务，点击 `Create`。
   - Expected: 创建一条服务记录而不是两条；保存两条不同关联。
3. 在列表和详情查看 Barcodes。
   - Expected: 两条均按 `<BARCODE> <requestId>` 展示，分别对应 `REQ-A`、`REQ-B`。
4. 点击每个关联的请求号/Barcode 来源链接。
   - Expected: 打开正确的 `/request-details/<requestId>`；返回来源参数指向 WisDM Services 列表或当前详情页。

### TP-006: 不同 SO 的服务记录复用同一 Barcode 与 requestId

**Relevant acceptance criteria:** AC-04

**Preconditions:**

- `BC-A` 在全部预配置请求中只对应 `REQ-A`。
- `SO-MANUAL-A`、`SO-MANUAL-B` 均无服务记录。

**Steps and expected results:**

1. 为 `SO-MANUAL-A` 创建关联 `BC-A` 的服务记录。
   - Expected: 创建成功并保存 `REQ-A` 的 `requestId`。
2. 为 `SO-MANUAL-B` 再创建关联同一 `BC-A` 的服务记录。
   - Expected: 同样创建成功，不因来源请求 SO 或另一条服务记录已使用该 Barcode 而拒绝。
3. 搜索 `BC-A`。
   - Expected: 两个不同 SO 的服务记录均出现，且展示相同 Barcode/`requestId` 关联。

### TP-007: Barcode 不存在、历史歧义和本记录重复时拒绝且无部分写入

**Relevant acceptance criteria:** AC-04, AC-11

**Preconditions:**

- 准备不存在的 `BC-NOT-FOUND`。
- 通过受控数据种子准备 `BC-HISTORY-DUP`，使其对应两个历史 `requestId`。
- 准备有效 `BC-A`。

**Steps and expected results:**

1. 使用 `BC-NOT-FOUND` 提交新建表单。
   - Expected: 返回 `400`，提示该 Barcode 在预配置请求中不存在；不创建服务记录或 History。
2. 使用 `BC-HISTORY-DUP` 提交。
   - Expected: 返回 `400`，错误列出所有匹配的历史 `requestId`；系统不按 SO 或其他字段猜选一张。
3. 在同一表单的两个 Barcode 输入行分别填写 `BC-A` 和仅大小写/首尾空白不同的 `BC-A`。
   - Expected: 返回 `400`，提示本记录内 Barcode 重复；不写入任何一条关联。
4. 对已有记录执行相同三类无效编辑。
   - Expected: 都拒绝保存，原 Company、关联、服务、Workflow、版本与 History 保持不变。

### TP-008: 配置单新建、复制和编辑时执行 Barcode 全局唯一校验

**Relevant acceptance criteria:** AC-05, AC-11

**Preconditions:**

- 已有预配置请求 `REQ-A` 使用 `BC-A`。
- 准备第二张可编辑请求 `REQ-B`。

**Steps and expected results:**

1. 打开 `Configuration`，在 `BarCode` 输入 `BC-A`，填完其他必填项并点击 `Save Configuration`。
   - Expected: 配置页不在提交前自行判断占用；提交后展示服务端错误，包含占用者 `REQ-A` 的 `requestId`；接口状态为 `400`，不创建请求。
2. 从 `REQ-A` 发起复制新建，不修改复制来的 Barcode 并保存。
   - Expected: 按新建处理并拒绝，错误包含 `REQ-A` 的 `requestId`；不产生副本。
3. 编辑 `REQ-B`，把 Barcode 改为 `BC-A` 并保存。
   - Expected: 返回 `400` 和占用者 `REQ-A`；`REQ-B` 保留原 Barcode 和其他内容。

### TP-009: 配置单 Barcode 唯一比较的自身排除、空值、大小写和空白边界

**Relevant acceptance criteria:** AC-05

**Preconditions:**

- `REQ-A` 唯一使用 `BC-A`。
- `REQ-B` 使用另一唯一 Barcode。

**Steps and expected results:**

1. 编辑 `REQ-A`，保持 Barcode 不变并保存。
   - Expected: 更新时排除当前请求，保存成功。
2. 新建请求，Barcode 使用与 `BC-A` 仅大小写不同的值。
   - Expected: 视为同一 Barcode，返回 `400` 和 `REQ-A` 的 `requestId`。
3. 新建请求，Barcode 使用带首尾空白的 `BC-A`。
   - Expected: 去空白后视为已占用，拒绝创建。
4. 新建或更新请求时把 Barcode 留空，其他字段有效。
   - Expected: 跳过 Barcode 唯一性校验，按原有配置单规则保存。

### TP-010: 手工记录、自动记录和非 CREATED 状态的内容权限

**Relevant acceptance criteria:** AC-02, AC-11

**Preconditions:**

- 一条由内部账号 A 手工创建且处于 `CREATED` 的记录。
- 一条自动生成且处于 `CREATED` 的记录。
- 一条状态不是 `CREATED` 的记录。
- 准备内部账号 A、内部账号 B、管理员及非内部账号。

**Steps and expected results:**

1. 账号 A 和管理员分别打开手工记录的 `Edit`。
   - Expected: 可编辑除 SO 外的 Company、Barcode、服务、Jira、Notes；Workflow 仍可更新。
2. 内部账号 B 打开账号 A 的手工记录并尝试改内容。
   - Expected: 内容编辑入口不可用或保存返回 `403`；记录不变；Workflow 更新仍按内部协作权限开放。
3. 内部账号 B 打开自动记录。
   - Expected: 在 `CREATED` 状态可编辑除 SO 外的内容字段。
4. 管理员或任一有权内部账号打开非 `CREATED` 记录。
   - Expected: Company、Barcode、服务、Jira、Notes 为只读；仍可选择有效 Workflow。
5. 非内部账号直接提交内容或 Workflow 更新。
   - Expected: 返回 `403`，不修改记录或 History。

### TP-011: Whitelist、Provisioning 与 Jira keys 的联动和规范化

**Relevant acceptance criteria:** AC-06

**Preconditions:**

- 使用有权编辑的 `CREATED` 记录或新建表单。
- 至少保留一个有效 Barcode。

**Steps and expected results:**

1. 勾选 `WisDM Whitelist required`。
   - Expected: 动态出现 `Jira ticket(s)`、`Jira ticket 1` 和 `Add Jira key`。
2. 添加多行 Jira key，输入包含首尾空白、大小写差异和重复值的数据后保存。
   - Expected: 保存为去空白、转大写、去重后的 Jira key 列表。
3. 同时勾选 `WisDM Provisioning required`，再取消 Whitelist 并保存。
   - Expected: Jira keys 被清空；因 Provisioning 仍选择，保存成功。
4. 尝试取消当前唯一剩余的服务并保存。
   - Expected: 拒绝保存并提示至少选择一项服务；原服务和 Jira 数据保持不变。

### TP-012: 配置单满足条件时自动建档，不满足条件或仅切换主开关时不建档

**Relevant acceptance criteria:** AC-07

**Preconditions:**

- 使用隔离配置单数据；`SO-AUTO-A` 尚无服务记录。
- 能在 `System Configuration` 设置 WisDM Whitelist/Provisioning 选项。

**Steps and expected results:**

1. 在配置页填写 `SO-AUTO-A`、唯一 Barcode、其他必填字段，并至少选择一项 WisDM 服务后点击 `Save Configuration`。
   - Expected: 配置请求与一条对应 SO 的 WisDM Service 原子成功；服务记录状态为 `CREATED`，关联该请求并打开所选服务；创建 History 记录实际操作者和自动来源。
2. 分别保存缺少 SO、缺少 Barcode、两项服务均未选择的有效配置请求。
   - Expected: 配置请求按其原有规则保存，但不创建或修改 WisDM Service。
3. 在 SO、Barcode 和两项服务均未形成新增有效同步内容时，仅开关 `wisdmEnabled` 并保存。
   - Expected: 不因主开关创建、删除或改变 WisDM Service。

### TP-013: 自动补充做并集、保持 Workflow、幂等且不反向删除

**Relevant acceptance criteria:** AC-07, AC-08

**Preconditions:**

- `SO-AUTO-B` 已有一条服务记录，关联 `BC-A`，仅选择 Whitelist，并把 Workflow 设置为 `WHITELIST_DONE`。
- `REQ-B` 使用同一 `SO-AUTO-B`、唯一 `BC-B` 并选择 Provisioning。

**Steps and expected results:**

1. 保存 `REQ-B`。
   - Expected: 现有记录追加 `BC-B`/`REQ-B`，打开 Provisioning；保留 `BC-A`、Whitelist 和原 Workflow `WHITELIST_DONE`；不产生 Workflow History。
2. 不改变 SO、Barcode 和服务，再次保存 `REQ-B`。
   - Expected: 不重复关联、不创建第二条 SO 记录、不重复 History，也不改变版本可见内容或 Workflow。
3. 在来源配置单中移除服务、Barcode，或把 SO 改为其他值后保存。
   - Expected: 旧服务记录中的关联和服务不被反向删除；若新 SO/Barcode/服务组合满足条件，只对新 SO 幂等创建或补充。
4. 在 WisDM Services 中修改内容或 Workflow，再打开来源配置请求。
   - Expected: 来源预配置请求未被反向修改。

### TP-014: Workflow 选项集合、即时保存、跳转和回退

**Relevant acceptance criteria:** AC-02, AC-09, AC-11

**Preconditions:**

- 分别准备仅 Whitelist、仅 Provisioning、两项都选择的三条记录，初始状态为 `CREATED`。

**Steps and expected results:**

1. 在列表或编辑页打开三条记录的 `Workflow Process` 下拉。
   - Expected: 仅 Whitelist 显示 Created/Whitelist Done/All Done；仅 Provisioning 显示 Created/Provisioning Done/All Done；两项服务显示四个状态。
2. 在编辑页选择一个有效的新状态。
   - Expected: 选择后立即单独保存，无需点击内容 `Save`；History 增加状态变化；若离开 `CREATED`，内容编辑退出并恢复只读。
3. 从 `CREATED` 直接跳到 `ALL_DONE`，再从完成状态回退到 `CREATED`。
   - Expected: 两次有效跳转均成功；回退后依据来源与角色重新开放内容编辑。
4. 通过受控接口提交与服务组合不适用的 DONE 状态。
   - Expected: 返回 `400`；页面恢复原下拉值；记录 Workflow、内容和 History 均不变。
5. 制造版本冲突后更新 Workflow。
   - Expected: 返回 `409`；页面撤销错误的乐观状态并显示冲突，不能覆盖另一请求已保存的值。

### TP-015: History 只记录创建和实际 Workflow 变化并按时间倒序展示

**Relevant acceptance criteria:** AC-10

**Preconditions:**

- 准备一条可编辑 `CREATED` 记录。

**Steps and expected results:**

1. 打开详情页 `History`。
   - Expected: 创建事件包含来源、实际操作者和时间。
2. 修改 Company 或 Notes 并保存，不改变 Workflow。
   - Expected: 内容保存成功，但 History 条目数量不增加。
3. 将 Workflow 改为另一个有效状态。
   - Expected: 新增一条含旧状态、新状态、操作者和时间的事件，显示在列表顶部。
4. 重复提交当前相同 Workflow。
   - Expected: 不新增重复 History。
5. 再执行一次不同的有效状态变化。
   - Expected: History 按时间从新到旧展示。

### TP-016: 搜索、状态筛选、精确关联、详情、来源跳转与稳定排序

**Relevant acceptance criteria:** AC-12

**Preconditions:**

- 准备覆盖不同 SO、Company、Barcode、`requestId`、Jira key、Workflow 和创建时间的隔离记录。
- 至少两条记录共享同一 Barcode，用于精确关联查询。

**Steps and expected results:**

1. 在 `Search service records` 分别输入 SO、Company、Barcode、`requestId`、Jira key 的大小写混合片段，并按 Enter。
   - Expected: 每次返回任一字段不区分大小写匹配的记录；真实页面已确认 Enter 会提交当前关键字。
2. 输入另一个关键字并点击 `Search`。
   - Expected: 使用当前输入执行查询并更新列表。
3. 依次点击 `Created`、`Whitelist Done`、`Provisioning Done`、`All Done`、`All`。
   - Expected: 前四个只显示对应 Workflow；`All` 不限制状态；当前按钮具有选中状态。
4. 使用 `preconfigRequestId` 与 `barcode` 精确查询参数调用列表接口。
   - Expected: 只返回包含指定关联的记录；Barcode 查询可返回不同 SO 的多条记录。
5. 从列表点击 SO/View 进入详情，再点击 Barcode/请求号来源链接。
   - Expected: 详情展示字段、每个来源和倒序 History；来源链接打开正确预配置请求详情。
6. 记录当前列表顺序，编辑较旧记录内容、更新其 Workflow，并对其自动补充新 Barcode。
   - Expected: 列表仍按 `created_at` 从新到旧；缺少 `created_at` 时使用 `updated_at`；已有记录不因更新而移动。

### TP-017: 加载、空结果和 400/403/404/409 失败后的状态恢复

**Relevant acceptance criteria:** AC-11, AC-12

**Preconditions:**

- 使用可控制 WisDM Service API 响应的隔离环境或 Playwright 网络拦截。
- 准备一条已知记录的 UI 基线快照和值。

**Steps and expected results:**

1. 延迟列表响应后进入 `WisDM Services`。
   - Expected: 显示明确加载状态；响应完成后只显示一次结果且页面可继续操作。
2. 搜索一个确定无结果的唯一关键字。
   - Expected: 显示明确空结果状态，不残留上一次列表数据。
3. 分别让创建/编辑请求返回 `400`、无权操作返回 `403`、不存在 WDM 详情返回 `404`、重复 SO 或版本冲突返回 `409`。
   - Expected: 页面显示可区分且可理解的错误反馈；`404` 不伪装成空白详情；`409` 提醒冲突而非假装成功。
4. 对列表内 Workflow 更新模拟以上失败。
   - Expected: 下拉恢复服务端原状态，不保留错误的乐观值，不增加 History。
5. 失败后恢复正常响应并重试一次。
   - Expected: 用户可恢复操作；只产生一次有效写入，不因之前失败或重复点击生成重复记录/关联/History。

## Open questions and risks

- 当前后端是否为隔离测试环境尚未得到明确确认。在确认前，禁止执行 TP-002 至 TP-015、TP-017 中的任何业务写入步骤；TP-001 和 TP-016 也只能执行不改变服务端状态的部分。
- 具体测试账号和密码只保存在 Git 忽略的本地凭据文件中，不得写入可提交文件。正式执行前应通过环境变量安全注入登录，并优先轮换任何可能关联生产环境、且曾在聊天等非密钥渠道出现的密码。
- 本次真实页面探索连接到已有数据环境，因此未执行创建、编辑、状态变化、自动同步、并发和清理；TP-002 至 TP-015、TP-017 中的写入断言必须在隔离环境正式执行后关闭“待执行”状态。
- 当前已有数据可见同一 `TESTBARCODE` 映射多个 `requestId` 的历史脏数据。它可用于只读观察，但自动化测试应使用受控的 `BC-HISTORY-DUP` 种子，不能依赖共享环境中的既有记录。
- 真实页面已观察到列表中全部记录的 Workflow 都是 `Created`，但服务勾选组合不同；三种下拉选项集合已验证存在，实际前进/跳转/回退尚未写入验证。
- 新建表单的 Jira 动态控件已验证；配置页 `System Configuration` 内 WisDM 开关的精确可访问名称未在无写入探索中展开确认。生成自动化测试前应在隔离环境重新快照并优先使用 role/label 定位，不应猜测 CSS 或生成 ID。
- 复制新建入口未在当前 Configuration 页面直接观察到。TP-008 的复制步骤需要先确认产品现有的请求详情/列表复制入口；若环境中不存在入口，应保留 API 层 E2E 覆盖并记录 UI 缺口。
- `preconfigRequestId`、`barcode` 精确筛选和 HTTP 状态码属于接口可观察契约，不一定有独立 UI 控件；计划通过浏览器上下文中的真实接口请求验证，不把内部 DynamoDB 结构作为断言。
- 版本冲突需要两个独立认证上下文或可控并发请求，必须以同一隔离记录的已知版本开始，并验证失败请求没有覆盖成功请求。
