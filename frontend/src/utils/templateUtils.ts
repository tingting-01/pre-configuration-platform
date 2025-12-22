/**
 * 模板工具函数
 * 用于模板数据的应用、变量替换和字段映射
 */

// 模板数据结构
export interface TemplateVariable {
  name: string           // 变量名，如 "companyName"
  type: 'text' | 'select' | 'date' | 'number'
  label: string          // 显示标签
  defaultValue?: string  // 默认值
  options?: string[]     // 选项（用于select类型）
  required: boolean      // 是否必填
  description?: string   // 说明
}

export interface Template {
  id: string
  name: string
  description?: string
  category: string
  configData: Record<string, any>  // 配置数据（包含变量占位符 {{variableName}}）
  variables: TemplateVariable[]     // 变量定义
  tags?: string[]
  isPublic: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  version: number
  usageCount: number
}

/**
 * 字段映射表：configData 结构到 formData 字段的映射
 * 这是核心映射关系，确保模板数据能准确填充到表单
 */
const CONFIG_TO_FORM_MAPPING: Record<string, string> = {
  // General
  'general.pid': 'pid',
  'general.barcode': 'barcode',
  'general.rakId': 'rakId',
  'general.gatewayModel': 'gatewayModel',
  'general.customerName': 'customerName',
  'general.priority': 'priority',
  'general.orderDescription': 'orderDescription',
  'general.password': 'generalPassword',
  
  // Network WAN
  'network.wan.priority': 'wanPriority',
  'network.wan.ethernet.enabled': 'wanEthernet',
  'network.wan.ethernet.trackingMethod': 'ethernetTrackingMethod',
  'network.wan.ethernet.trackingAddresses': 'ethernetTrackingAddresses',
  'network.wan.wifi.enabled': 'wanWifi',
  'network.wan.wifi.ssid': 'wifiSsid',
  'network.wan.wifi.encryption': 'wifiEncryption',
  'network.wan.wifi.password': 'wifiPassword',
  'network.wan.wifi.trackingMethod': 'wifiTrackingMethod',
  'network.wan.wifi.trackingAddresses': 'wifiTrackingAddresses',
  'network.wan.cellular.enabled': 'wanCellular',
  'network.wan.cellular.apn': 'cellularApn',
  'network.wan.cellular.trackingMethod': 'cellularTrackingMethod',
  'network.wan.cellular.trackingAddresses': 'cellularTrackingAddresses',
  
  // Network LAN
  'network.lan.ethernet': 'lanEthernet',
  'network.lan.wifiAp.enabled': 'wifiApEnabled',
  'network.lan.wifiAp.ssid': 'wifiApSsid',
  'network.lan.wifiAp.encryption': 'wifiApEncryption',
  'network.lan.wifiAp.password': 'wifiApPassword',
  
  // LoRa
  'lora.country': 'loraCountry',
  'lora.region': 'loraRegion',
  'lora.mode': 'loraMode',
  'lora.whitelist.enabled': 'loraWhitelistMode',
  'lora.whitelist.ouiList': 'whitelistOuiList',
  'lora.whitelist.networkIdList': 'whitelistNetworkIdList',
  
  // Basic Station
  'lora.basicStation.serverType': 'basicStationServerType',
  'lora.basicStation.serverUrl': 'basicStationServerUrl',
  'lora.basicStation.serverPort': 'basicStationServerPort',
  'lora.basicStation.authMode': 'basicStationAuthMode',
  'lora.basicStation.ztp': 'basicStationZtp',
  'lora.basicStation.batchTtn': 'basicStationBatchTtn',
  'lora.basicStation.batchAwsIot': 'basicStationBatchAwsIot',
  'lora.basicStation.trustCaCertificate.name': 'trustCaCertificateName',
  'lora.basicStation.trustCaCertificate.id': 'trustCaCertificateId',
  'lora.basicStation.trustCaCertificate.size': 'trustCaCertificateSize',
  'lora.basicStation.clientCertificate.name': 'clientCertificateName',
  'lora.basicStation.clientCertificate.id': 'clientCertificateId',
  'lora.basicStation.clientCertificate.size': 'clientCertificateSize',
  'lora.basicStation.clientKey.name': 'clientKeyName',
  'lora.basicStation.clientKey.id': 'clientKeyId',
  'lora.basicStation.clientKey.size': 'clientKeySize',
  'lora.basicStation.batchTtnFile.name': 'batchTtnFileName',
  'lora.basicStation.batchTtnFile.id': 'batchTtnFileId',
  'lora.basicStation.batchTtnFile.size': 'batchTtnFileSize',
  'lora.basicStation.batchAwsFile.name': 'batchAwsFileName',
  'lora.basicStation.batchAwsFile.id': 'batchAwsFileId',
  'lora.basicStation.batchAwsFile.size': 'batchAwsFileSize',
  
  // TTN Config
  'lora.basicStation.ttnConfig.adminToken': 'ttnAdminToken',
  'lora.basicStation.ttnConfig.frequencyPlan': 'ttnFrequencyPlan',
  'lora.basicStation.ttnConfig.gatewayId': 'ttnGatewayId',
  'lora.basicStation.ttnConfig.gatewayName': 'ttnGatewayName',
  
  // AWS Config
  'lora.basicStation.awsConfig.accessKeyId': 'awsAccessKeyId',
  'lora.basicStation.awsConfig.secretAccessKey': 'awsSecretAccessKey',
  'lora.basicStation.awsConfig.defaultRegion': 'awsDefaultRegion',
  'lora.basicStation.awsConfig.gatewayNameRule': 'awsGatewayNameRule',
  'lora.basicStation.awsConfig.gatewayDescriptionRule': 'awsGatewayDescriptionRule',
  'lora.basicStation.awsConfig.useClassBMode': 'awsUseClassBMode',
  
  // Packet Forwarder UDP GWMP
  'lora.packetForwarder.submode': 'loraSubmode',
  'lora.packetForwarder.udpGwmp.statisticInterval': 'udpStatisticInterval',
  'lora.packetForwarder.udpGwmp.serverAddress': 'udpServerAddress',
  'lora.packetForwarder.udpGwmp.portUp': 'udpPortUp',
  'lora.packetForwarder.udpGwmp.portDown': 'udpPortDown',
  'lora.packetForwarder.udpGwmp.pushTimeout': 'udpPushTimeout',
  'lora.packetForwarder.udpGwmp.keepalive': 'udpKeepalive',
  'lora.packetForwarder.udpGwmp.mtu': 'udpMtu',
  'lora.packetForwarder.udpGwmp.restartThreshold': 'udpRestartThreshold',
  'lora.packetForwarder.udpGwmp.autoDataRecovery': 'udpAutoDataRecovery',
  
  // Packet Forwarder MQTT Bridge
  'lora.packetForwarder.mqttBridge.statisticInterval': 'mqttStatisticInterval',
  'lora.packetForwarder.mqttBridge.protocol': 'mqttProtocol',
  'lora.packetForwarder.mqttBridge.brokerAddress': 'mqttBrokerAddress',
  'lora.packetForwarder.mqttBridge.brokerPort': 'mqttBrokerPort',
  'lora.packetForwarder.mqttBridge.version': 'mqttVersion',
  'lora.packetForwarder.mqttBridge.sslMode': 'mqttSslMode',
  'lora.packetForwarder.mqttBridge.tlsVersion': 'mqttTlsVersion',
  'lora.packetForwarder.mqttBridge.username': 'mqttUsername',
  'lora.packetForwarder.mqttBridge.password': 'mqttPassword',
  'lora.packetForwarder.mqttBridge.caCertificate.name': 'mqttCaCertificateName',
  'lora.packetForwarder.mqttBridge.caCertificate.id': 'mqttCaCertificateId',
  'lora.packetForwarder.mqttBridge.caCertificate.size': 'mqttCaCertificateSize',
  'lora.packetForwarder.mqttBridge.clientCertificate.name': 'mqttClientCertificateName',
  'lora.packetForwarder.mqttBridge.clientCertificate.id': 'mqttClientCertificateId',
  'lora.packetForwarder.mqttBridge.clientCertificate.size': 'mqttClientCertificateSize',
  'lora.packetForwarder.mqttBridge.clientKey.name': 'mqttClientKeyName',
  'lora.packetForwarder.mqttBridge.clientKey.id': 'mqttClientKeyId',
  'lora.packetForwarder.mqttBridge.clientKey.size': 'mqttClientKeySize',
  
  // System
  'system.wisdmEnabled': 'wisdmEnabled',
  'system.wisdmConnect': 'wisdmConnect',
  'system.wisdmOrgName': 'wisdmOrgName',
  'system.wisdmUrl': 'wisdmUrl',
  'system.logExpiration': 'logExpiration',
  'system.shareLog': 'shareLog',
  'system.logRetrievalCycle': 'logRetrievalCycle',
  'system.fileRotationCycle': 'fileRotationCycle',
  'system.systemTime': 'systemTime',
  'system.ntpEnabled': 'ntpEnabled',
  'system.ntpServers': 'ntpServers',
  'system.gatewayName': 'gatewayName',
  'system.sshDisable': 'sshDisable',
  'system.sshDescription': 'sshDescription',
  
  // Extensions
  'extensions.rakBreathingLight': 'rakBreathingLight',
  'extensions.rakCountrySettings': 'rakCountrySettings',
  'extensions.rakCustomLogo': 'rakCustomLogo',
  'extensions.failoverReboot': 'failoverReboot',
  'extensions.fieldTestDataProcessor': 'fieldTestDataProcessor',
  'extensions.rakOpenClosePort': 'rakOpenClosePort',
  'extensions.rakOpenvpnClient': 'rakOpenvpnClient',
  'extensions.operationAndMaintenance': 'operationAndMaintenance',
  'extensions.rakSolarBattery': 'rakSolarBattery',
  'extensions.rfSpectrumScanner': 'rfSpectrumScanner',
  'extensions.wifiReboot': 'wifiReboot',
  'extensions.rakWireguard': 'rakWireguard',
  'extensions.loraPacketLogger': 'loraPacketLogger',
  'extensions.configDescription': 'configDescription',
  'extensions.extensionFiles': 'extensionFiles',
  
  // Other
  'other.requirements': 'requirements',
  'other.configFiles': 'configFiles',
  'other.configFileNames': 'configFileNames',
  'other.configFileSizes': 'configFileSizes'
}

/**
 * 根据路径获取嵌套对象的值
 * 例如: getNestedValue(obj, 'network.wan.priority') => obj.network.wan.priority
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined
  }, obj)
}

/**
 * 设置嵌套对象的值
 * 例如: setNestedValue(obj, 'network.wan.priority', ['ethernet', 'wifi'])
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  const lastKey = keys.pop()!
  const target = keys.reduce((current, key) => {
    if (!current[key]) {
      current[key] = {}
    }
    return current[key]
  }, obj)
  target[lastKey] = value
}

/**
 * 替换配置数据中的变量占位符
 * 支持 {{variableName}} 格式
 */
export function replaceVariables(
  configData: Record<string, any>,
  variables: Record<string, string>
): Record<string, any> {
  const result = JSON.parse(JSON.stringify(configData)) // 深拷贝
  
  function replaceValue(value: any): any {
    if (typeof value === 'string') {
      // 替换字符串中的变量占位符
      let replaced = value
      Object.keys(variables).forEach(varName => {
        const placeholder = `{{${varName}}}`
        if (replaced.includes(placeholder)) {
          replaced = replaced.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), variables[varName])
        }
      })
      return replaced
    } else if (Array.isArray(value)) {
      return value.map(item => replaceValue(item))
    } else if (value !== null && typeof value === 'object') {
      const newObj: Record<string, any> = {}
      Object.keys(value).forEach(key => {
        newObj[key] = replaceValue(value[key])
      })
      return newObj
    }
    return value
  }
  
  return replaceValue(result)
}

/**
 * 将模板的 configData 转换为 formData
 * 这是核心函数，负责将模板数据映射到表单字段
 */
export function templateConfigToFormData(
  templateConfig: Record<string, any>
): Record<string, any> {
  const formData: Record<string, any> = {}
  
  // 遍历映射表，从 configData 提取值并设置到 formData
  Object.keys(CONFIG_TO_FORM_MAPPING).forEach(configPath => {
    const formField = CONFIG_TO_FORM_MAPPING[configPath]
    const value = getNestedValue(templateConfig, configPath)
    
    if (value !== undefined && value !== null) {
      // 处理特殊字段
      if (formField === 'wanPriority' && Array.isArray(value)) {
        formData[formField] = value
      } else if (formField.endsWith('Addresses') && Array.isArray(value)) {
        formData[formField] = value
      } else if (formField === 'ntpServers' && Array.isArray(value)) {
        formData[formField] = value
      } else if (formField === 'extensionFiles' && Array.isArray(value)) {
        // 处理 extensionFiles：同时设置 extensionFiles, extensionFileNames, extensionFileSizes
        formData[formField] = value
        formData['extensionFileNames'] = value.map((f: any) => f.name || '')
        formData['extensionFileSizes'] = value.map((f: any) => f.size || 0)
      } else if (formField === 'configFiles' && Array.isArray(value)) {
        // 处理 configFiles：同时设置 configFiles, configFileNames, configFileSizes
        formData[formField] = value
        formData['configFileNames'] = value.map((f: any) => f.name || '')
        formData['configFileSizes'] = value.map((f: any) => f.size || 0)
      } else if (formField.endsWith('Files') && Array.isArray(value)) {
        formData[formField] = value
      } else if (formField === 'configFileNames' && Array.isArray(value)) {
        formData[formField] = value
      } else if (formField === 'configFileSizes' && Array.isArray(value)) {
        formData[formField] = value
      } else if (formField === 'whitelistOuiList' && Array.isArray(value)) {
        formData[formField] = value
      } else if (formField === 'whitelistNetworkIdList' && Array.isArray(value)) {
        formData[formField] = value
      } else {
        formData[formField] = value
      }
    }
  })
  
  // 处理文件字段的特殊情况
  // 文件字段需要同时设置 name, id, size
  const fileFields = [
    'trustCaCertificate', 'clientCertificate', 'clientKey',
    'batchTtnFile', 'batchAwsFile',
    'mqttCaCertificate', 'mqttClientCertificate', 'mqttClientKey'
  ]
  
  fileFields.forEach(fileField => {
    const nameField = `${fileField}Name`
    const idField = `${fileField}Id`
    const sizeField = `${fileField}Size`
    
    // 如果模板中有文件信息，需要从 configData 中提取
    const filePath = fileField === 'trustCaCertificate' ? 'lora.basicStation.trustCaCertificate' :
                     fileField === 'clientCertificate' ? 'lora.basicStation.clientCertificate' :
                     fileField === 'clientKey' ? 'lora.basicStation.clientKey' :
                     fileField === 'batchTtnFile' ? 'lora.basicStation.batchTtnFile' :
                     fileField === 'batchAwsFile' ? 'lora.basicStation.batchAwsFile' :
                     fileField === 'mqttCaCertificate' ? 'lora.packetForwarder.mqttBridge.caCertificate' :
                     fileField === 'mqttClientCertificate' ? 'lora.packetForwarder.mqttBridge.clientCertificate' :
                     'lora.packetForwarder.mqttBridge.clientKey'
    
    const fileInfo = getNestedValue(templateConfig, filePath)
    if (fileInfo && typeof fileInfo === 'object') {
      formData[nameField] = fileInfo.name || ''
      formData[idField] = fileInfo.id || ''
      formData[sizeField] = fileInfo.size || 0
    }
  })
  
  return formData
}

/**
 * 应用模板到表单
 * 这是主要的应用函数
 */
export function applyTemplateToForm(
  template: Template,
  variableValues: Record<string, string>
): Record<string, any> {
  // 1. 替换变量
  const configDataWithValues = replaceVariables(template.configData, variableValues)
  
  // 2. 转换为 formData
  const formData = templateConfigToFormData(configDataWithValues)
  
  // 3. 设置默认值（对于未在模板中定义的字段）
  const defaultFormData = {
    // 设置一些默认值，确保表单完整
    wanEthernet: true,
    wanWifi: false,
    wanCellular: true,
    lanEthernet: false,
    wifiApEnabled: true,
    ethernetTrackingMethod: 'icmp',
    wifiTrackingMethod: 'icmp',
    cellularTrackingMethod: 'icmp',
    ethernetTrackingAddresses: [],
    wifiTrackingAddresses: [],
    cellularTrackingAddresses: [],
    loraSubmode: 'udp-gwmp',
    wifiEncryption: 'none',
    wifiApEncryption: 'none',
    basicStationServerType: 'lns',
    basicStationAuthMode: 'none',
    mqttProtocol: 'chirpstack-v3-json',
    mqttVersion: '3.1.1',
    mqttSslMode: 'none',
    mqttTlsVersion: '1.2',
    ntpEnabled: true,
    ntpServers: ['0.openwrt.pool.ntp.org'],
    logExpiration: '1-month',
    wisdmEnabled: false,
    wisdmConnect: false,
    shareLog: false,
    sshDisable: false,
    // ... 其他默认值
  }
  
  // 合并：模板数据优先，默认值作为后备
  return {
    ...defaultFormData,
    ...formData
  }
}

/**
 * 从现有配置创建模板
 * 识别可变量字段并生成变量定义
 */
export function createTemplateFromConfig(
  configData: Record<string, any>,
  variableCandidates: string[] = [
    'customerName', 'rakId', 'pid', 'gatewayModel',
    'wisdmOrgName', 'wisdmUrl', 'gatewayName'
  ]
): { configData: Record<string, any>, variables: TemplateVariable[] } {
  const variables: TemplateVariable[] = []
  const templateConfig = JSON.parse(JSON.stringify(configData)) // 深拷贝
  
  // 遍历配置，识别变量
  function processValue(path: string, value: any): any {
    if (typeof value === 'string' && value.trim() !== '') {
      // 检查是否应该作为变量
      const fieldName = path.split('.').pop() || ''
      if (variableCandidates.includes(fieldName)) {
        const varName = fieldName
        variables.push({
          name: varName,
          type: 'text',
          label: fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
          required: true,
          defaultValue: value
        })
        return `{{${varName}}}`
      }
      return value
    } else if (Array.isArray(value)) {
      return value.map((item, index) => processValue(`${path}[${index}]`, item))
    } else if (value !== null && typeof value === 'object') {
      const newObj: Record<string, any> = {}
      Object.keys(value).forEach(key => {
        newObj[key] = processValue(`${path}.${key}`, value[key])
      })
      return newObj
    }
    return value
  }
  
  const processedConfig = processValue('', templateConfig)
  
  return {
    configData: processedConfig,
    variables: variables.filter((v, index, self) => 
      index === self.findIndex(t => t.name === v.name) // 去重
    )
  }
}

/**
 * 验证变量值是否完整
 */
export function validateTemplateVariables(
  template: Template,
  variableValues: Record<string, string>
): { valid: boolean, missing: string[] } {
  const missing: string[] = []
  
  template.variables.forEach(variable => {
    if (variable.required && (!variableValues[variable.name] || variableValues[variable.name].trim() === '')) {
      missing.push(variable.label || variable.name)
    }
  })
  
  return {
    valid: missing.length === 0,
    missing
  }
}

