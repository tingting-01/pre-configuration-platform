# 模板应用机制详解

## 概述

模板功能通过**字段映射表**和**变量替换机制**，将模板中的配置数据准确应用到配置页面的表单中。

---

## 核心机制

### 1. 数据结构映射

模板使用与提交时相同的 `configData` 结构，通过映射表转换为 `formData`：

```
configData (模板存储格式)
    ↓ [字段映射表]
formData (表单状态格式)
    ↓ [用户编辑]
configData (提交格式)
```

### 2. 字段映射表 (CONFIG_TO_FORM_MAPPING)

这是核心映射关系，定义了 `configData` 的嵌套路径到 `formData` 字段的一一对应：

```typescript
// 示例映射
'general.customerName' → 'customerName'
'network.wan.priority' → 'wanPriority'
'lora.basicStation.serverUrl' → 'basicStationServerUrl'
```

**映射规则：**
- 使用点号路径表示嵌套结构：`'network.wan.priority'`
- 每个 `configData` 路径对应一个 `formData` 字段名
- 支持数组字段：`trackingAddresses`, `ntpServers` 等
- 支持文件字段：自动处理 `name`, `id`, `size` 三个属性

### 3. 变量替换机制

模板中可以使用变量占位符 `{{variableName}}`，应用时会被实际值替换：

```json
{
  "general": {
    "customerName": "{{companyName}}",
    "rakId": "{{rakId}}"
  }
}
```

应用时：
```json
{
  "general": {
    "customerName": "RAKwireless Inc.",
    "rakId": "user@example.com"
  }
}
```

---

## 应用流程

### 步骤1：用户选择模板

```typescript
// 用户点击"应用模板"
const template = {
  configData: {
    general: {
      customerName: "{{companyName}}",
      rakId: "{{rakId}}"
    },
    network: {
      wan: {
        priority: ["ethernet", "wifi", "cellular"]
      }
    }
  },
  variables: [
    { name: "companyName", type: "text", required: true },
    { name: "rakId", type: "text", required: true }
  ]
}
```

### 步骤2：用户填写变量值

```typescript
const variableValues = {
  companyName: "RAKwireless Inc.",
  rakId: "user@example.com"
}
```

### 步骤3：变量替换

```typescript
const configDataWithValues = replaceVariables(
  template.configData,
  variableValues
)

// 结果：
{
  general: {
    customerName: "RAKwireless Inc.",  // {{companyName}} 被替换
    rakId: "user@example.com"          // {{rakId}} 被替换
  },
  network: {
    wan: {
      priority: ["ethernet", "wifi", "cellular"]  // 无变量，保持不变
    }
  }
}
```

### 步骤4：转换为 formData

```typescript
const formData = templateConfigToFormData(configDataWithValues)

// 映射过程：
// configData.general.customerName → formData.customerName
// configData.network.wan.priority → formData.wanPriority

// 结果：
{
  customerName: "RAKwireless Inc.",
  rakId: "user@example.com",
  wanPriority: ["ethernet", "wifi", "cellular"],
  // ... 其他字段
}
```

### 步骤5：更新表单状态

```typescript
setFormData(prev => ({
  ...prev,
  ...formData  // 合并到现有表单状态
}))
```

---

## 详细映射示例

### 示例1：简单字段映射

**模板 configData:**
```json
{
  "general": {
    "customerName": "{{companyName}}",
    "gatewayModel": "RAK7249"
  }
}
```

**映射过程:**
```
configData.general.customerName → formData.customerName
configData.general.gatewayModel → formData.gatewayModel
```

**结果 formData:**
```typescript
{
  customerName: "RAKwireless Inc.",  // 变量已替换
  gatewayModel: "RAK7249"            // 固定值
}
```

### 示例2：嵌套对象映射

**模板 configData:**
```json
{
  "network": {
    "wan": {
      "priority": ["ethernet", "wifi", "cellular"],
      "wifi": {
        "ssid": "{{wifiSsid}}",
        "password": "{{wifiPassword}}"
      }
    }
  }
}
```

**映射过程:**
```
configData.network.wan.priority → formData.wanPriority
configData.network.wan.wifi.ssid → formData.wifiSsid
configData.network.wan.wifi.password → formData.wifiPassword
```

**结果 formData:**
```typescript
{
  wanPriority: ["ethernet", "wifi", "cellular"],
  wifiSsid: "MyWiFi",      // 变量已替换
  wifiPassword: "password123"  // 变量已替换
}
```

### 示例3：数组字段映射

**模板 configData:**
```json
{
  "network": {
    "wan": {
      "ethernet": {
        "trackingAddresses": ["8.8.8.8", "1.1.1.1"]
      }
    }
  }
}
```

**映射过程:**
```
configData.network.wan.ethernet.trackingAddresses 
  → formData.ethernetTrackingAddresses
```

**结果 formData:**
```typescript
{
  ethernetTrackingAddresses: ["8.8.8.8", "1.1.1.1"]
}
```

### 示例4：文件字段映射

**模板 configData:**
```json
{
  "lora": {
    "basicStation": {
      "trustCaCertificate": {
        "name": "ca.crt",
        "id": "file-uuid-123",
        "size": 2048
      }
    }
  }
}
```

**映射过程:**
```
configData.lora.basicStation.trustCaCertificate.name 
  → formData.trustCaCertificateName
configData.lora.basicStation.trustCaCertificate.id 
  → formData.trustCaCertificateId
configData.lora.basicStation.trustCaCertificate.size 
  → formData.trustCaCertificateSize
```

**结果 formData:**
```typescript
{
  trustCaCertificateName: "ca.crt",
  trustCaCertificateId: "file-uuid-123",
  trustCaCertificateSize: 2048
}
```

---

## 条件字段处理

某些字段只在特定条件下存在（如 Basic Station 或 Packet Forwarder），模板应用时需要：

1. **检查模式字段：**
   ```typescript
   if (formData.loraMode === 'basic-station') {
     // 应用 Basic Station 相关字段
   }
   ```

2. **条件应用：**
   ```typescript
   if (templateConfig.lora?.basicStation) {
     // 只应用 Basic Station 配置
     formData.loraMode = 'basic-station'
     // ... 其他 Basic Station 字段
   }
   ```

---

## 默认值处理

模板应用时，对于未定义的字段，使用默认值：

```typescript
const defaultFormData = {
  wanEthernet: true,
  wanWifi: false,
  wanCellular: true,
  ethernetTrackingMethod: 'icmp',
  // ... 其他默认值
}

// 合并：模板数据优先
const finalFormData = {
  ...defaultFormData,
  ...templateFormData
}
```

---

## 变量验证

应用模板前，验证所有必填变量是否已填写：

```typescript
const validation = validateTemplateVariables(template, variableValues)

if (!validation.valid) {
  // 显示错误：缺少变量
  alert(`Missing variables: ${validation.missing.join(', ')}`)
  return
}
```

---

## 完整应用函数

```typescript
function applyTemplate(template: Template, variableValues: Record<string, string>) {
  // 1. 验证变量
  const validation = validateTemplateVariables(template, variableValues)
  if (!validation.valid) {
    throw new Error(`Missing variables: ${validation.missing.join(', ')}`)
  }
  
  // 2. 替换变量
  const configDataWithValues = replaceVariables(
    template.configData,
    variableValues
  )
  
  // 3. 转换为 formData
  const templateFormData = templateConfigToFormData(configDataWithValues)
  
  // 4. 合并默认值
  const finalFormData = {
    ...defaultFormData,
    ...templateFormData
  }
  
  // 5. 更新表单状态
  setFormData(finalFormData)
  
  // 6. 触发标签自动生成（如果需要）
  // ...
}
```

---

## 优势

1. **准确性：** 通过映射表确保每个字段准确对应
2. **灵活性：** 支持变量替换，模板可复用
3. **完整性：** 处理嵌套对象、数组、文件等复杂结构
4. **可维护性：** 映射表集中管理，易于维护和扩展

---

## 注意事项

1. **字段一致性：** 确保映射表中的字段名与 `formData` 定义一致
2. **类型匹配：** 数组字段必须保持数组类型
3. **文件处理：** 文件字段需要特殊处理（name/id/size）
4. **条件字段：** 某些字段只在特定模式下存在，需要条件应用
5. **默认值：** 未定义的字段使用默认值，确保表单完整

---

## 扩展性

如果需要添加新字段：

1. 在 `CONFIG_TO_FORM_MAPPING` 中添加映射
2. 确保 `configData` 结构和 `formData` 结构一致
3. 测试映射是否正确

例如，添加新字段 `newField`：
```typescript
'general.newField': 'newField'
```

