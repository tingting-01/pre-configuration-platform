## Why

用户在同一客户新增相似订单时，需要复用已有 Request 的预配置并仅调整少量表单内容。当前必须先保存并应用模板，流程过重且会产生一次性模板，因此需要提供直接从现有 Request 复制新建的能力。

## What Changes

- 在 Request List 每行的 Actions 区域增加“Duplicate”入口。
- 复制入口打开 Configuration 页面并读取源 Request 的完整表单信息，复用现有编辑场景的表单回填能力。
- 复制模式保存时调用现有的新建 Request 接口，生成独立的新 Request，不更新源 Request。
- 新建请求参数从当前表单状态按新建接口白名单重新构造，禁止复制源 Request 对象后通过删除字段的方式生成参数。
- 本次基础功能不定义 PID、Barcode、订单号、文件引用等具体业务字段的清空策略；这些表单字段按现有回填和新建构造逻辑处理。

## Capabilities

### New Capabilities

- `request-copy-create`: 从 Request 列表选择单条现有 Request，将其配置回填到新建表单，并保存为独立的新 Request。

### Modified Capabilities

- 无。

## Impact

- 前端 Request 列表的 Actions 区域和路由跳转参数。
- 前端 Configuration 页面的模式识别、Request 查询、表单回填和新建参数构造。
- 复用现有 `GET /api/requests/{request_id}` 和 `POST /api/requests`，基础版本不新增或修改后端接口。
- 不改变模板功能、编辑功能和现有 Request 数据。
