## 1. Request 列表入口

- [x] 1.1 在 `DashboardOriginal.tsx` 的 Actions 区域增加紧凑的“Duplicate”按钮，导航到带源 Request ID 的复制模式地址，并通过页面操作确认每行按钮指向正确记录。
- [x] 1.2 调整 Actions 区域布局并验证 View、Edit、Duplicate 在常用视口下均可见、可点击且不会触发行点击事件。

## 2. 复制模式加载与回填

- [x] 2.1 在 `ConfigurationComplete.tsx` 中解析 `copy` 参数并建立互斥的页面模式判断，验证普通新建、编辑、模板和复制入口分别进入预期模式，且冲突参数下复制模式不会更新源 Request。
- [x] 2.2 让复制模式通过现有详情接口加载源 Request，并与编辑模式共享同一套表单和标签回填逻辑；使用包含 General、Network、LoRa、System、Extensions 和 Other 配置的 Request 对照验证回填结果。
- [x] 2.3 增加复制详情的加载与失败保护，验证加载期间无法提交，且 403、404 或请求失败时显示错误并阻止创建未完整加载的副本。

## 3. 新建参数与提交隔离

- [x] 3.1 将普通新建和复制新建统一为从当前表单显式构造 `CreateRequestRequest` 白名单参数的路径，并通过代码检查确认未展开、透传或删减源 `existingRequest` 对象。
- [x] 3.2 确保只有有效编辑模式调用更新接口，复制模式调用现有创建接口；通过网络请求或接口桩验证复制提交使用 POST、生成新 Request ID 且不发送源 Request 的身份、流程、审计和同步字段。
- [x] 3.3 处理复制创建的成功与失败反馈，验证成功后刷新列表并返回 Dashboard，失败时保留表单内容且源 Request 始终不变。

## 4. 回归验证

- [x] 4.1 分别回归普通新建、编辑 Request、从模板新建和复制新建，验证各模式的加载与保存语义互不影响，复制操作不会记录模板使用次数。
- [x] 4.2 在 `frontend` 目录完成验证：`npm run build` 通过；`npm run type-check` 的失败来自项目既有类型错误，`npm run lint` 因项目尚未配置 ESLint 无法执行，二者作为历史债记录且不阻塞本次变更验收。
