# Gateway Name 功能添加说明

## 🎯 功能描述

在Configuration页面的Basic Station部分，当选择"TLS Server & Client Token Authentication"并勾选ZTP时，新增了一个Gateway Name文本框，让客户填写Gateway Name或Gateway Name Rule。

## 🔧 实现细节

### 1. 表单数据添加
```typescript
// 在formData中添加新字段
ttnGatewayName: '',

// 在重置配置时也添加
ttnGatewayName: '',
```

### 2. 数据提交配置
```typescript
// 在提交数据时包含Gateway Name
ttnConfig: {
  adminToken: formData.ttnAdminToken,
  frequencyPlan: formData.ttnFrequencyPlan,
  gatewayId: formData.ttnGatewayId,
  gatewayName: formData.ttnGatewayName  // 新增字段
}
```

### 3. UI界面添加
```typescript
// 在TTN Configuration部分添加Gateway Name输入框
<div>
  <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
    Gateway Name
  </label>
  <input
    type="text"
    value={formData.ttnGatewayName}
    onChange={(e) => handleInputChange('ttnGatewayName', e.target.value)}
    placeholder="Enter Gateway Name or Gateway Name Rule"
    style={{
      width: '100%',
      height: '36px',
      border: '1px solid #10b981',
      borderRadius: '6px',
      padding: '0 10px',
      background: '#fff',
      color: '#1f2937',
      outline: 'none',
      fontSize: '14px'
    }}
  />
</div>
```

## 📋 功能条件

### 显示条件
- **LoRa Mode**: 选择 "Basic Station"
- **Authentication Mode**: 选择 "TLS Server & Client Token Authentication"
- **ZTP**: 勾选 "ZTP"

### 字段位置
Gateway Name输入框位于TTN Configuration部分，在Gateway ID输入框之后。

## 🎨 界面布局

### 网格布局
TTN Configuration部分使用2列网格布局：
- **第一行**: Admin Token, Frequency Plan
- **第二行**: Gateway ID, Gateway Name

### 样式设计
- **标签**: 12px字体，灰色文字
- **输入框**: 36px高度，绿色边框，圆角设计
- **占位符**: "Enter Gateway Name or Gateway Name Rule"

## 🔄 数据流程

### 1. 用户输入
用户在Gateway Name输入框中输入内容

### 2. 状态更新
通过`handleInputChange`函数更新`formData.ttnGatewayName`

### 3. 数据提交
在表单提交时，Gateway Name包含在`ttnConfig`对象中

### 4. 后端处理
后端接收`ttnConfig.gatewayName`字段

## 📊 数据结构

### 前端表单数据
```typescript
formData: {
  // ... 其他字段
  ttnGatewayName: string,  // 新增字段
  // ... 其他字段
}
```

### 提交数据格式
```typescript
{
  configData: {
    lora: {
      basicStation: {
        ttnConfig: {
          adminToken: string,
          frequencyPlan: string,
          gatewayId: string,
          gatewayName: string  // 新增字段
        }
      }
    }
  }
}
```

## ✅ 功能验证

### 1. 界面显示
- [x] 在正确的条件下显示Gateway Name输入框
- [x] 输入框样式与其他字段一致
- [x] 占位符文本正确显示

### 2. 数据绑定
- [x] 输入值正确绑定到formData.ttnGatewayName
- [x] 输入变化时正确更新状态
- [x] 表单提交时包含Gateway Name数据

### 3. 条件显示
- [x] 只在Basic Station模式下显示
- [x] 只在TLS Server & Client Token Authentication模式下显示
- [x] 只在勾选ZTP时显示

## 🚀 使用方法

### 1. 配置步骤
1. 选择LoRa Mode为"Basic Station"
2. 选择Authentication Mode为"TLS Server & Client Token Authentication"
3. 勾选"ZTP"选项
4. 在TTN Configuration部分找到"Gateway Name"输入框
5. 输入Gateway Name或Gateway Name Rule

### 2. 输入示例
- **Gateway Name**: "My-Gateway-001"
- **Gateway Name Rule**: "gateway-{serial}"
- **自定义规则**: "ttn-gateway-{location}"

## 💡 注意事项

### 1. 字段验证
- 目前没有添加字段验证
- 可以根据需要添加长度限制或格式验证

### 2. 数据持久化
- 数据会保存到后端数据库
- 在编辑模式下需要加载已保存的数据

### 3. 兼容性
- 与现有的TTN配置完全兼容
- 不影响其他功能的使用

## 🔧 后续优化

### 1. 字段验证
```typescript
// 可以添加验证规则
const validateGatewayName = (name: string) => {
  if (name.length < 3) return "Gateway name must be at least 3 characters";
  if (!/^[a-zA-Z0-9-_]+$/.test(name)) return "Gateway name can only contain letters, numbers, hyphens, and underscores";
  return null;
};
```

### 2. 编辑模式支持
```typescript
// 在编辑模式下加载数据
const loadEditData = async (requestId: string) => {
  const request = await requestAPI.getRequest(requestId);
  if (request.configData?.lora?.basicStation?.ttnConfig?.gatewayName) {
    setFormData(prev => ({
      ...prev,
      ttnGatewayName: request.configData.lora.basicStation.ttnConfig.gatewayName
    }));
  }
};
```

### 3. 帮助文本
```typescript
// 可以添加帮助文本
<div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
  Enter a gateway name or use a rule like "gateway-{serial}" for automatic naming
</div>
```

**Gateway Name功能已成功添加！现在用户可以在TTN Configuration中填写Gateway Name或Gateway Name Rule了！** ✅

