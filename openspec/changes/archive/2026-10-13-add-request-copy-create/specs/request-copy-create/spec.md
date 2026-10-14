## Purpose

允许用户从一条可访问的现有 Request 快速创建内容相近但身份独立的新 Request，减少重复填写配置和借助一次性模板中转的操作成本。

## ADDED Requirements

### Requirement: Request 列表提供复制新建入口
系统 SHALL 在 Request List 的每条可访问记录的 Actions 区域提供“Duplicate”操作，并将所选 Request 作为新建表单的数据来源。

#### Scenario: 从列表发起复制新建
- **WHEN** 用户点击某条 Request 的“Duplicate”按钮
- **THEN** 系统进入 Configuration 页面，并标识当前页面处于该 Request 的复制新建模式

### Requirement: 复制模式回填源 Request 的表单信息
系统 SHALL 获取源 Request 的完整详情，并使用与编辑场景一致的字段映射将其受支持的配置和标签回填到 Configuration 表单，使用户能够在保存前修改内容。

#### Scenario: 成功加载源 Request
- **WHEN** 用户进入复制新建模式且源 Request 可访问
- **THEN** 系统将源 Request 中受支持的配置字段和标签显示在可编辑表单中

#### Scenario: 源 Request 无法加载
- **WHEN** 源 Request 不存在、不可访问或详情请求失败
- **THEN** 系统显示加载失败信息，并且不得以未完整加载的源数据创建副本

### Requirement: 复制保存创建独立的新 Request
系统 SHALL 在复制模式保存时调用现有的新建 Request 能力，生成新的 Request，而不是更新源 Request。

#### Scenario: 成功保存复制内容
- **WHEN** 用户在复制模式修改表单并成功提交
- **THEN** 系统创建具有新 Request ID 的 Request，并保持源 Request 的数据不变

#### Scenario: 复制创建失败
- **WHEN** 新建 Request 接口返回失败
- **THEN** 系统显示创建失败信息、保留当前表单内容，并保持源 Request 的数据不变

### Requirement: 新建参数使用白名单重新构造
系统 MUST 从当前表单状态显式构造新建接口允许的参数，不得通过复制源 Request 对象后删除部分属性的方式构造请求。源 Request 的 Request ID、Config ID、工作流状态、负责人、创建与提交时间、创建人、评论、历史记录及外部同步状态不得进入新建请求参数。

#### Scenario: 提交复制新建请求
- **WHEN** 用户在复制模式提交表单
- **THEN** 请求参数仅包含新建接口定义的字段以及由当前表单重新构造的配置数据

### Requirement: 复制新建与现有模式相互独立
系统 SHALL 保持普通新建、编辑 Request、从模板新建和复制新建之间的保存语义独立，复制新建不得更新模板使用次数或改变编辑模式的行为。

#### Scenario: 复制模式不会更新源对象
- **WHEN** 用户从源 Request 进入复制模式并保存
- **THEN** 系统只执行新建操作，不执行源 Request 更新或模板应用操作
