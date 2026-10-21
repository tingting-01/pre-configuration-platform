## 1. 人工基础设施前置条件

- [x] 1.1 由用户在现有 `preconfig-*` 表所在的 AWS 账号和 Region 手工创建 `preconfig-wisdm-service-records`：Partition key 为 String 类型 `pk`、无 Sort key、On-demand、无二级索引，并在 DynamoDB 控制台确认状态为 `ACTIVE`
- [x] 1.2 由用户手工创建 `preconfig-wisdm-service-history`：Partition key 为 String 类型 `record_id`、Sort key 为 String 类型 `event_key`、On-demand、无二级索引，并在 DynamoDB 控制台确认状态为 `ACTIVE`
- [x] 1.3 由用户为应用 IAM 角色授予两张表的 `DescribeTable`、`GetItem`、`PutItem`、`UpdateItem`、`Scan`、`Query`、`TransactWriteItems` 权限，并通过 AWS 权限检查确认无显式拒绝
- [x] 1.4 使用应用运行身份分别对 `preconfig-wisdm-service-records` 和 `preconfig-wisdm-service-history` 执行 `DescribeTable`，验证表名、主键结构和访问权限；1.1–1.4 未完成前不开始依赖新表的实现

## 2. 领域规则与数据层

- [x] 2.1 实现 SO、Barcode、Jira key 规范化、服务组合可用状态及自动补充合并纯函数，并用单元测试覆盖大小写、空白、重复输入、新 Barcode、单服务变双服务、Workflow 保持及无变化场景
- [x] 2.2 将 `preconfig-wisdm-service-records` 和 `preconfig-wisdm-service-history` 作为固定表名加入现有 DynamoDB 客户端 `TABLES` 映射，复用已有凭证、Region、序列化和低层事务客户端；实现原子计数器生成唯一递增的 `WDM` 编号、`RECORD#<recordId>` 主记录和 `SO#<normalizedSo>` 唯一占位，并用并发测试验证重复 SO 只能成功一次、WDM 编号不重复且允许空洞
- [x] 2.3 为服务记录实现按 WDM ID 与 SO 读取、仅扫描主记录、版本条件更新及 History 倒序查询，并用数据层测试验证不返回计数器/占位项、乐观锁冲突和历史排序
- [x] 2.4 实现基于预配置请求 ID 的 Barcode/Company 提取和保存前复核，兼容现有历史字段名；复核时只检查请求存在且 Barcode 未变化，不比较来源请求 SO。用测试验证同 Barcode 多请求、不同 SO 服务记录复用同一 Barcode、重复关联和失效关联
- [x] 2.5 实现服务记录与 History 的 API 序列化，统一输出 `recordId`、来源请求信息、权限提示和下划线状态值，并用序列化测试验证列表与详情响应结构

## 3. 后端接口与自动同步

- [x] 3.1 增加统一的 RAK 内部账号接口守卫和内容/Workflow 权限判断，并用接口测试验证普通用户被拒绝、手工记录创建者/管理员编辑、自动记录内部编辑及非 `CREATED` 内容只读
- [x] 3.2 移除 `GET /api/wisdm-service-records/barcode-options`。创建与内容更新提交 Barcode 文本，并由服务端仅按 Barcode 匹配唯一预配置请求，不使用或校验来源请求 SO
- [x] 3.3 实现 `GET /api/wisdm-service-records`，支持 `search`、`filter`、`preconfigRequestId`、`barcode`，并用接口测试验证 SO/Company/Barcode/请求号/Jira 搜索、全部状态筛选及关联参数过滤
- [x] 3.4 实现 `POST /api/wisdm-service-records`，由服务端固定 `CREATED` 并生成 WDM 记录号；缺少字段、服务或 Barcode 找不到唯一预配置请求返回 `400`、SO 已存在返回 `409`，并用接口测试逐项验证错误、失败不产生部分数据和 Company 回填
- [x] 3.5 实现 `GET /api/wisdm-service-records/{recordId}` 及内容更新，强制 SO 与 WDM 记录号不可改、仅 `CREATED` 可改内容、至少保留一个 Barcode 和一项服务、取消 Whitelist 清空 Jira；用接口测试验证 `403`、`404`、版本冲突 `409`、失败不覆盖并发数据及完整业务规则
- [x] 3.6 实现 Workflow 即时更新，按服务组合校验允许状态并支持前进、跳转和回退；用接口测试验证三种状态集合、非法 DONE 返回 `400`、相同状态幂等、版本冲突返回 `409`，以及回退 `CREATED` 后内容权限恢复
- [x] 3.7 实现创建与手工 Workflow 变化 History，保存认证操作者快照并按新到旧返回，并用测试确认普通内容更新、重复状态及对已有记录的自动补充不产生 History
- [x] 3.8 将配置工单创建和更新与 WisDM 服务补充纳入事务写入，加入 SO 占位定位、版本冲突重试和幂等判断，并用测试验证首次自动建档为 `CREATED`、已有记录并集、新 Barcode 和新服务均保持原 Workflow、重复保存以及取消来源值不反删
- [x] 3.9 验证自动同步只读取 SO、Barcode、`wisdmWhitelist` 和 `wisdmConnect`，不受 WisDM 主开关影响且服务记录修改不反写配置工单；使用回归测试确认原配置保存、详情和导出行为不变

## 4. 前端页面与交互

- [x] 4.1 在前端 API 层增加服务记录、History、Barcode 选项的类型与调用方法，完整映射四个列表查询参数及 WDM ID 路由，并通过 TypeScript 检查验证请求和响应类型
- [x] 4.2 新增 WisDM Services 列表和 `/wisdm-services/:recordId` 详情/编辑路由，并仅为 `rakwireless`/`admin` 渲染侧栏菜单；通过角色切换和直接路由访问验证前端门禁与后端拒绝一致
- [x] 4.3 按 demo 实现列表列、SO 下方 WDM 编号、All/Created/Whitelist Done/Provisioning Done/All Done 筛选、组合搜索、来源请求跳转和 View/Edit；列表按创建时间从新到旧展示，编辑或改状态后顺序不变；Barcode 关联统一按“`<BARCODE> <requestId>`”顺序展示，通过浏览器验证点击 Search 与按 Enter 都会查询
- [x] 4.4 实现列表内 Workflow 下拉，按当前服务组合只显示有效状态、选择后立即保存、失败时恢复原值，并通过浏览器验证三种选项集合、前进、跳转和回退
- [x] 4.5 按 demo 实现 `New Service Record` 弹窗与复用编辑表单，包括 SO、Company、多 Barcode、Whitelist、多 Jira key、Provisioning、Notes、添加/移除按钮和 Cancel/Create/Save。编辑表单在服务选项与 Notes 之间展示 Workflow Process，按已保存服务组合过滤选项，选择后立即单独保存，离开 `CREATED` 后退出内容编辑。验证新建不展示可编辑 Workflow 且状态固定为 `CREATED`，编辑表单不重复展示 SO Number
- [x] 4.6 新建和编辑的 Barcode 使用普通输入框，可添加和移除多行；保存时由服务端仅按 Barcode 匹配 `requestId`。通过测试验证唯一匹配、不同 SO 服务记录复用同一 Barcode、条码不存在、历史多请求匹配时拒绝并返回请求号、同一条记录内重复条码拒绝保存
- [x] 4.7 实现详情页 WDM 编号、字段、按“`<BARCODE> <requestId>`”展示的来源关联、倒序 History，以及基于来源/角色/状态的 Edit 可用性；通过浏览器验证只有 `CREATED` 可编辑内容、非 `CREATED` 仍可从列表改状态、回退后重新可编辑
- [x] 4.8 为加载、空结果和统一错误码增加明确反馈：`400` 字段/状态/Barcode 关联错误、`403` 无权限、`404` WDM 记录不存在、`409` SO 重复或并发冲突；通过模拟接口错误验证页面不会保留错误的乐观状态或重复提交

## 5. Barcode 一对一约束

- [x] 5.1 在预配置请求创建和更新写库前校验非空 Barcode 全局唯一：去除首尾空格、不区分大小写，更新时排除当前请求，冲突返回 `400` 和已占用的 `requestId`，空 Barcode 跳过。用接口测试覆盖新建占用、编辑自身、编辑改成已占用值、复制沿用原 Barcode、大小写与空白、空 Barcode
- [x] 5.2 WisDM 创建和内容更新在同一条记录内遇到重复 Barcode 时返回 `400`；仅按 Barcode 唯一匹配并带出 `requestId`；全部请求中不存在时拒绝；历史数据匹配到多张请求时仍拒绝并返回这些 `requestId`；不同 SO 的服务记录允许复用同一关联。更新领域与接口测试，配置页不增加提交前查重

## 6. 集成验证与交付

- [x] 6.1 运行后端单元、数据层与接口测试，确认 WDM 编号、SO 唯一、Barcode 校验、权限、事务、History、自动同步保持 Workflow 和不反向同步测试全部通过
- [x] 6.2 运行前端类型检查与生产构建，确认新增路由、页面和 API 类型无错误且构建成功
- [x] 6.3 使用测试 SO 完成手工创建、配置工单自动建档、同 SO 第二 Barcode 补充、同 Barcode 用于不同 SO、服务新增且 Workflow 保持不变、手工状态前进/回退、搜索筛选及来源跳转的端到端验证，并记录结果
- [x] 6.4 使用普通用户、RAK 内部用户、记录创建者和管理员账号验证菜单可见性、读取范围、内容编辑与 Workflow 权限，并确认直接调用接口不能绕过限制
- [x] 6.5 核对两张 DynamoDB 表、IAM、固定表名注册和部署顺序，确认后端可先部署验证、前端菜单后开放；记录通过隐藏菜单和停止同步代码调用进行回滚且保留表数据的步骤
