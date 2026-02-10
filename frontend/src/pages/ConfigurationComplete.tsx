import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { requestAPI, templateAPI, getApiBaseUrl } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useQuery } from 'react-query'
import { X, Edit2, Plus } from 'lucide-react'
import TemplateSelector from '../components/TemplateSelector'
import ToastContainer, { ToastItem } from '../components/ToastContainer'
import { applyTemplateToForm, createTemplateFromConfig } from '../utils/templateUtils'

const ConfigurationComplete = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editRequestId = searchParams.get('edit')
  const templateId = searchParams.get('template')
  const editTemplateId = searchParams.get('editTemplate')
  
  // 响应式设计状态（保留以备将来使用）
  // const [isMobile, setIsMobile] = useState(false)
  
  // 标签状态
  const [tags, setTags] = useState<Array<{ type: string; value: string; label: string }>>([])
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null)
  const [editingTagValue, setEditingTagValue] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTagType, setNewTagType] = useState('custom')
  const [newTagValue, setNewTagValue] = useState('')
  
  // 模板相关状态
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  
  // 检查认证状态
  const { isAuthenticated, token, user } = useAuthStore()
  
  // 如果是编辑模式，加载已有的request数据
  const { data: existingRequest } = useQuery(
    ['request', editRequestId],
    () => requestAPI.getRequest(editRequestId!),
    { 
      enabled: !!editRequestId,
      retry: false
    }
  )

  // 如果是从模板创建，加载模板数据
  const { data: templateData } = useQuery(
    ['template', templateId],
    () => templateAPI.getTemplate(templateId!),
    {
      enabled: !!templateId,
      retry: false
    }
  )

  // 如果是编辑模板模式，加载模板数据
  const { data: editTemplateData } = useQuery(
    ['template', editTemplateId],
    () => templateAPI.getTemplate(editTemplateId!),
    {
      enabled: !!editTemplateId,
      retry: false
    }
  )
  
  // 如果未认证，重定向到登录页
  React.useEffect(() => {
    console.log('=== Authentication Check ===')
    console.log('isAuthenticated:', isAuthenticated)
    console.log('token:', token)
    console.log('localStorage auth-storage:', localStorage.getItem('auth-storage'))
    
    if (!isAuthenticated || !token) {
      console.log('User not authenticated, redirecting to login')
      navigate('/login')
    }
  }, [isAuthenticated, token, navigate])
  
  // 检测屏幕尺寸（保留以备将来使用）
  // React.useEffect(() => {
  //   const checkScreenSize = () => {
  //     setIsMobile(window.innerWidth <= 480)
  //   }
  //   
  //   checkScreenSize()
  //   window.addEventListener('resize', checkScreenSize)
  //   
  //   return () => window.removeEventListener('resize', checkScreenSize)
  // }, [])

  const [formData, setFormData] = useState({
    // Order Information
    pid: '',
    barcode: '',
    rakId: '', // 初始为空，将在useEffect中设置
    gatewayModel: '',
    customerName: '',
    priority: '', // High, Medium, Low
    orderDescription: '',
    generalPassword: '',
    
    // Network Configuration
    wanEthernet: true,
    wanWifi: false,
    wanCellular: true,
    wanPriority: ['ethernet', 'wifi', 'cellular'],
    wifiSsid: '',
    wifiEncryption: 'none',
    wifiPassword: '',
    cellularApn: '',
    lanEthernet: false,
    wifiApEnabled: true,
    wifiApSsid: '',
    wifiApEncryption: 'none',
    wifiApPassword: '',
    
    // Connection Monitoring
    ethernetTrackingMethod: 'icmp',
    ethernetTrackingAddresses: [] as string[],
    wifiTrackingMethod: 'icmp',
    wifiTrackingAddresses: [] as string[],
    cellularTrackingMethod: 'icmp',
    cellularTrackingAddresses: [] as string[],
    
    // Network Interface Panel States
    ethernetPanelExpanded: false,
    wifiPanelExpanded: false,
    cellularPanelExpanded: false,
    
    // LoRa Configuration
    loraCountry: '',
    loraRegion: '',
    loraChannel: '',
    loraMode: '', // 默认不选择任何模式
    loraSubmode: 'udp-gwmp',
    
    // Packet Forwarder UDP GWMP
    udpStatisticInterval: '',
    udpServerAddress: '',
    udpPortUp: '',
    udpPortDown: '',
    udpPushTimeout: '',
    udpKeepalive: '',
    udpMtu: '',
    udpRestartThreshold: '',
    udpAutoDataRecovery: false,
    
    // Packet Forwarder MQTT Bridge
    mqttStatisticInterval: '',
    mqttProtocol: 'chirpstack-v3-json',
    mqttBrokerAddress: '',
    mqttBrokerPort: '',
    mqttVersion: '3.1.1',
    mqttSslMode: 'none',
    mqttTlsVersion: '1.2',
    mqttUsername: '',
    mqttPassword: '',
    
    // Basic Station
    basicStationServerType: '',
    basicStationServerUrl: '',
    basicStationServerPort: '',
    basicStationAuthMode: 'none',
    basicStationZtp: false,
    basicStationBatchTtn: false,
    basicStationBatchAwsIot: false,
    
    // AWS Config
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsDefaultRegion: '',
    awsGatewayNameRule: '',
    awsGatewayDescriptionRule: '',
    awsUseClassBMode: false,
    
    // TTN Config
    ttnAdminToken: '',
    ttnFrequencyPlan: '',
    ttnGatewayId: '',
    ttnGatewayName: '',
    
    // Whitelist Configuration
    loraWhitelistMode: false,
    whitelistOui: '',
    whitelistNetworkId: '',
    whitelistOuiList: [] as string[],
    whitelistNetworkIdList: [] as string[],
    
    // Certificate Upload
    trustCaCertificate: null as File | null,
    trustCaCertificateName: '',
    trustCaCertificateSize: 0,
    trustCaCertificateId: '',
    clientCertificate: null as File | null,
    clientCertificateName: '',
    clientCertificateSize: 0,
    clientCertificateId: '',
    clientKey: null as File | null,
    clientKeyName: '',
    clientKeySize: 0,
    clientKeyId: '',
    clientToken: '',
    batchTtnFile: null as File | null,
    batchTtnFileName: '',
    batchTtnFileSize: 0,
    batchTtnFileId: '',
    batchAwsFile: null as File | null,
    batchAwsFileName: '',
    batchAwsFileSize: 0,
    batchAwsFileId: '',
    
    // MQTT Bridge Certificate Upload
    mqttCaCertificate: null as File | null,
    mqttCaCertificateName: '',
    mqttCaCertificateSize: 0,
    mqttCaCertificateId: '',
    mqttClientCertificate: null as File | null,
    mqttClientCertificateName: '',
    mqttClientCertificateSize: 0,
    mqttClientCertificateId: '',
    mqttClientKey: null as File | null,
    mqttClientKeyName: '',
    mqttClientKeySize: 0,
    mqttClientKeyId: '',
    
    // System Configuration
    wisdmEnabled: true,
    wisdmConnect: false,
    wisdmOrgName: '',
    wisdmUrl: '',
    logExpiration: '',
    shareLog: false,
    logRetrievalCycle: '',
    fileRotationCycle: '',
    systemTime: '',
    ntpEnabled: true,
    ntpServers: [''],
    gatewayName: '',
    sshDisable: false,
    sshDescription: '',
    
    // Extensions
    rakBreathingLight: false,
    rakCountrySettings: false,
    rakCustomLogo: false,
    failoverReboot: false,
    fieldTestDataProcessor: false,
    rakOpenClosePort: false,
    rakOpenvpnClient: false,
    operationAndMaintenance: false,
    rakSolarBattery: false,
    rfSpectrumScanner: false,
    wifiReboot: false,
    rakWireguard: false,
    loraPacketLogger: false,
    configDescription: '',
    extensionFiles: [],
    extensionFileNames: [],
    extensionFileSizes: [],
    
    // Other
    requirements: '',
    configFiles: [],
    configFileNames: [],
    configFileSizes: []
  })
  
  // 标记用户是否手动编辑过 RAK ID 字段
  const rakIdManuallyEdited = React.useRef(false)
  
  // 当用户信息可用时，自动填充RAK ID字段（仅在初始加载时，如果用户未手动编辑过）
  React.useEffect(() => {
    if (user?.email && !formData.rakId && !rakIdManuallyEdited.current) {
      setFormData(prev => ({
        ...prev,
        rakId: user.email
      }))
    }
  }, [user?.email])

  // 生成标签的函数
  const generateTags = () => {
    const generatedTags: Array<{ type: string; value: string; label: string }> = []
    
    // Company Name
    if (formData.customerName && formData.customerName.trim()) {
      generatedTags.push({ 
        type: 'company', 
        value: formData.customerName.trim(), 
        label: formData.customerName.trim() 
      })
    }
    
    // Priority
    if (formData.priority && formData.priority.trim()) {
      const priorityMap: Record<string, string> = {
        'high': 'High',
        'medium': 'Medium',
        'low': 'Low'
      }
      const priorityValue = formData.priority.trim().toLowerCase()
      generatedTags.push({ 
        type: 'priority', 
        value: priorityValue, 
        label: priorityMap[priorityValue] || priorityValue.charAt(0).toUpperCase() + priorityValue.slice(1) 
      })
    }
    
    // Region
    if (formData.loraRegion && formData.loraRegion.trim()) {
      const regionMap: Record<string, string> = {
        'eu868': 'EU868',
        'us915': 'US915',
        'au915': 'AU915',
        'as923': 'AS923',
        'as923-1': 'AS923-1',
        'as923-2': 'AS923-2',
        'as923-3': 'AS923-3',
        'as923-4': 'AS923-4',
        'kr920': 'KR920',
        'in865': 'IN865',
        'ru864': 'RU864'
      }
      const regionValue = formData.loraRegion.trim()
      generatedTags.push({ 
        type: 'region', 
        value: regionValue, 
        label: regionMap[regionValue.toLowerCase()] || regionValue.toUpperCase() 
      })
    }
    
    // Primary WAN - Always generate based on current wanPriority
    if (formData.wanPriority && Array.isArray(formData.wanPriority) && formData.wanPriority.length > 0) {
      const wanMap: Record<string, string> = {
        'ethernet': 'Ethernet',
        'wifi': 'WiFi',
        'cellular': 'Cellular'
      }
      const primaryWan = formData.wanPriority[0]
      console.log('=== Primary WAN Tag Generation ===')
      console.log('wanPriority:', formData.wanPriority)
      console.log('primaryWan:', primaryWan)
      generatedTags.push({ 
        type: 'primary-wan', 
        value: primaryWan, 
        label: wanMap[primaryWan] || primaryWan.charAt(0).toUpperCase() + primaryWan.slice(1) 
      })
    }
    
    // Work Mode
    if (formData.loraMode && formData.loraMode.trim()) {
      const modeMap: Record<string, string> = {
        'basic-station': 'Basic Station',
        'packet-forwarder': 'Packet Forwarder'
      }
      const modeValue = formData.loraMode.trim()
      generatedTags.push({ 
        type: 'work-mode', 
        value: modeValue, 
        label: modeMap[modeValue] || modeValue 
      })
    }
    
    return generatedTags
  }

  // 当formData相关字段变化时，自动更新标签（但保留用户手动添加的标签）
  useEffect(() => {
    // 只在相关字段变化时更新，避免编辑标签时触发
    if (editingTagIndex !== null || showAddTag) {
      return // 如果正在编辑或添加标签，不自动更新
    }
    
    console.log('=== useEffect Triggered ===')
    console.log('wanPriority:', formData.wanPriority)
    console.log('primaryWAN:', formData.wanPriority?.[0])
    
    // 使用函数式更新，确保使用最新的 formData 和 tags 状态
    setTags(prevTags => {
      // 重新生成标签，使用最新的 formData
      const autoTags = generateTags()
      console.log('=== Auto Tags Update ===')
      console.log('wanPriority:', formData.wanPriority)
      console.log('primaryWAN from wanPriority[0]:', formData.wanPriority?.[0])
      console.log('autoTags:', autoTags)
      console.log('prevTags:', prevTags)
      
      // 保留用户手动添加的自定义标签和已编辑的标签
      const customTags = prevTags.filter(tag => tag.type === 'custom')
      const editedTags = prevTags.filter(tag => {
        // 对于 primary-wan、priority 和 company 标签，总是使用自动生成的标签，不保留旧的标签
        // 因为这些标签是基于表单数据自动生成的，应该始终反映最新的值
        if (tag.type === 'primary-wan' || tag.type === 'priority' || tag.type === 'company') {
          console.log(`${tag.type} tag: always use auto-generated, skipping old tag:`, tag)
          return false // 不保留旧的标签
        }
        
        // 对于其他类型的标签，检查是否被用户编辑过
        const autoTag = autoTags.find(at => at.type === tag.type)
        if (!autoTag) {
          // 如果自动标签中没有这个类型，说明数据源中没有这个值，保留原标签（可能是用户添加的）
          return tag.type === 'custom'
        }
        
        // 只有当标签确实与自动生成的标签不同时，才认为是已编辑的
        const isEdited = tag.label !== autoTag.label || tag.value !== autoTag.value
        
        return isEdited
      })
      
      // 合并自动标签、已编辑标签和自定义标签，去重（基于type）
      const allTags: Array<{ type: string; value: string; label: string }> = []
      const seenTypes = new Set<string>()
      
      // 先添加已编辑的标签（保留用户修改）
      editedTags.forEach(tag => {
        allTags.push(tag)
        seenTypes.add(tag.type)
      })
      
      // 再添加自动标签（未编辑的）
      autoTags.forEach(tag => {
        if (!seenTypes.has(tag.type)) {
          allTags.push(tag)
          seenTypes.add(tag.type)
        }
      })
      
      // 最后添加自定义标签
      customTags.forEach(tag => {
        if (!seenTypes.has(tag.type)) {
          allTags.push(tag)
          seenTypes.add(tag.type)
        }
      })
      
      console.log('Final tags:', allTags)
      return allTags
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.customerName, formData.priority, formData.loraRegion, formData.wanPriority?.join(','), formData.loraMode, editingTagIndex, showAddTag])

  // 如果是从模板创建，加载模板数据到表单
  useEffect(() => {
    if (templateData && !editRequestId && !editTemplateId) {
      // 应用模板（使用默认变量值或空值）
      const variableValues: Record<string, string> = {}
      templateData.variables.forEach(variable => {
        variableValues[variable.name] = variable.defaultValue || ''
      })
      
      // 调用后端API记录使用次数
      templateAPI.applyTemplate(templateData.id, variableValues).catch((err: any) => {
        // 静默失败，不影响模板加载
        console.warn('Failed to record template usage:', err)
      })
      
      const templateFormData = applyTemplateToForm(templateData, variableValues)
      setFormData(prev => ({
        ...prev,
        ...templateFormData
      }))
      
      // 如果有变量，显示提示
      if (templateData.variables.length > 0) {
        showSuccess(`Template "${templateData.name}" loaded. Please review and fill in the variables.`)
      } else {
        showSuccess(`Template "${templateData.name}" loaded successfully!`)
      }
    }
  }, [templateData, editRequestId, editTemplateId])

  // 如果是编辑模板模式，加载模板数据到表单
  useEffect(() => {
    if (editTemplateData && !editRequestId) {
      // 应用模板（使用默认变量值或空值）
      const variableValues: Record<string, string> = {}
      editTemplateData.variables.forEach(variable => {
        variableValues[variable.name] = variable.defaultValue || ''
      })
      
      const templateFormData = applyTemplateToForm(editTemplateData, variableValues)
      setFormData(prev => ({
        ...prev,
        ...templateFormData
      }))
      
      // 设置模板名称和描述
      setTemplateName(editTemplateData.name)
      setTemplateDescription(editTemplateData.description || '')
      
      showSuccess(`Template "${editTemplateData.name}" loaded for editing. Click "Save as Template" to update.`)
    }
  }, [editTemplateData, editRequestId])

  // 如果是编辑模式，加载已有配置数据到表单
  useEffect(() => {
    if (existingRequest && existingRequest.configData) {
      const config = existingRequest.configData
      console.log('=== Loading Existing Config ===')
      console.log('Config:', config)
      
      setFormData(prev => {
        const newData: any = { ...prev }
        
        // General Information
        if (config.general) {
          newData.pid = config.general.pid || ''
          newData.barcode = config.general.barcode || ''
          newData.rakId = config.general.rakId || ''
          newData.gatewayModel = config.general.gatewayModel || ''
          newData.customerName = config.general.customerName || ''
          newData.priority = config.general.priority || ''
          newData.orderDescription = config.general.orderDescription || ''
          newData.generalPassword = config.general.password || ''
        }
        
        // Network Configuration
        if (config.network) {
          if (config.network.wan) {
            newData.wanPriority = config.network.wan.priority || ['ethernet', 'wifi', 'cellular']
            if (config.network.wan.ethernet) {
              newData.wanEthernet = config.network.wan.ethernet.enabled ?? true
              newData.ethernetTrackingMethod = config.network.wan.ethernet.trackingMethod || 'icmp'
              newData.ethernetTrackingAddresses = config.network.wan.ethernet.trackingAddresses || []
            }
            if (config.network.wan.wifi) {
              newData.wanWifi = config.network.wan.wifi.enabled ?? false
              newData.wifiSsid = config.network.wan.wifi.ssid || ''
              newData.wifiEncryption = config.network.wan.wifi.encryption || 'none'
              newData.wifiPassword = config.network.wan.wifi.password || ''
              newData.wifiTrackingMethod = config.network.wan.wifi.trackingMethod || 'icmp'
              newData.wifiTrackingAddresses = config.network.wan.wifi.trackingAddresses || []
            }
            if (config.network.wan.cellular) {
              newData.wanCellular = config.network.wan.cellular.enabled ?? true
              newData.cellularApn = config.network.wan.cellular.apn || ''
              newData.cellularTrackingMethod = config.network.wan.cellular.trackingMethod || 'icmp'
              newData.cellularTrackingAddresses = config.network.wan.cellular.trackingAddresses || []
            }
          }
          if (config.network.lan) {
            newData.lanEthernet = config.network.lan.ethernet ?? false
            if (config.network.lan.wifiAp) {
              newData.wifiApEnabled = config.network.lan.wifiAp.enabled ?? true
              newData.wifiApSsid = config.network.lan.wifiAp.ssid || ''
              newData.wifiApEncryption = config.network.lan.wifiAp.encryption || 'none'
              newData.wifiApPassword = config.network.lan.wifiAp.password || ''
            }
          }
        }
        
        // LoRa Configuration
        if (config.lora) {
          newData.loraCountry = config.lora.country || ''
          newData.loraRegion = config.lora.region || ''
          newData.loraMode = config.lora.mode || ''
          
          // Whitelist
          if (config.lora.whitelist) {
            newData.loraWhitelistMode = config.lora.whitelist.enabled ?? false
            newData.whitelistOuiList = config.lora.whitelist.ouiList || []
            newData.whitelistNetworkIdList = config.lora.whitelist.networkIdList || []
          }
          
          // Basic Station
          if (config.lora.basicStation) {
            newData.basicStationServerType = config.lora.basicStation.serverType || ''
            newData.basicStationServerUrl = config.lora.basicStation.serverUrl || ''
            newData.basicStationServerPort = config.lora.basicStation.serverPort || ''
            newData.basicStationAuthMode = config.lora.basicStation.authMode || 'none'
            newData.basicStationZtp = config.lora.basicStation.ztp ?? false
            newData.basicStationBatchTtn = config.lora.basicStation.batchTtn ?? false
            newData.basicStationBatchAwsIot = config.lora.basicStation.batchAwsIot ?? false
            
            // Certificate files
            if (config.lora.basicStation.trustCaCertificate) {
              newData.trustCaCertificateName = config.lora.basicStation.trustCaCertificate.name || ''
              newData.trustCaCertificateSize = config.lora.basicStation.trustCaCertificate.size || 0
              newData.trustCaCertificateId = config.lora.basicStation.trustCaCertificate.id || ''
            }
            if (config.lora.basicStation.clientCertificate) {
              newData.clientCertificateName = config.lora.basicStation.clientCertificate.name || ''
              newData.clientCertificateSize = config.lora.basicStation.clientCertificate.size || 0
              newData.clientCertificateId = config.lora.basicStation.clientCertificate.id || ''
            }
            if (config.lora.basicStation.clientKey) {
              newData.clientKeyName = config.lora.basicStation.clientKey.name || ''
              newData.clientKeySize = config.lora.basicStation.clientKey.size || 0
              newData.clientKeyId = config.lora.basicStation.clientKey.id || ''
            }
            
            // Batch files
            if (config.lora.basicStation.batchTtnFile) {
              newData.batchTtnFileName = config.lora.basicStation.batchTtnFile.name || ''
              newData.batchTtnFileSize = config.lora.basicStation.batchTtnFile.size || 0
              newData.batchTtnFileId = config.lora.basicStation.batchTtnFile.id || ''
            }
            if (config.lora.basicStation.batchAwsFile) {
              newData.batchAwsFileName = config.lora.basicStation.batchAwsFile.name || ''
              newData.batchAwsFileSize = config.lora.basicStation.batchAwsFile.size || 0
              newData.batchAwsFileId = config.lora.basicStation.batchAwsFile.id || ''
            }
            
            // AWS Config
            if (config.lora.basicStation.awsConfig) {
              newData.awsAccessKeyId = config.lora.basicStation.awsConfig.accessKeyId || ''
              newData.awsSecretAccessKey = config.lora.basicStation.awsConfig.secretAccessKey || ''
              newData.awsDefaultRegion = config.lora.basicStation.awsConfig.defaultRegion || ''
              newData.awsGatewayNameRule = config.lora.basicStation.awsConfig.gatewayNameRule || ''
              newData.awsGatewayDescriptionRule = config.lora.basicStation.awsConfig.gatewayDescriptionRule || ''
              newData.awsUseClassBMode = config.lora.basicStation.awsConfig.useClassBMode ?? false
            }
            
            // TTN Config
            if (config.lora.basicStation.ttnConfig) {
              newData.ttnAdminToken = config.lora.basicStation.ttnConfig.adminToken || ''
              newData.ttnFrequencyPlan = config.lora.basicStation.ttnConfig.frequencyPlan || ''
              newData.ttnGatewayId = config.lora.basicStation.ttnConfig.gatewayId || ''
              newData.ttnGatewayName = config.lora.basicStation.ttnConfig.gatewayName || ''
            }
          }
          
          // Packet Forwarder
          if (config.lora.packetForwarder) {
            newData.loraSubmode = config.lora.packetForwarder.submode || 'udp-gwmp'
            
            // UDP GWMP
            if (config.lora.packetForwarder.udpGwmp) {
              newData.udpStatisticInterval = config.lora.packetForwarder.udpGwmp.statisticInterval ?? ''
              newData.udpServerAddress = config.lora.packetForwarder.udpGwmp.serverAddress ?? ''
              newData.udpPortUp = config.lora.packetForwarder.udpGwmp.portUp ?? ''
              newData.udpPortDown = config.lora.packetForwarder.udpGwmp.portDown ?? ''
              newData.udpPushTimeout = config.lora.packetForwarder.udpGwmp.pushTimeout ?? ''
              newData.udpKeepalive = config.lora.packetForwarder.udpGwmp.keepalive ?? ''
              newData.udpMtu = config.lora.packetForwarder.udpGwmp.mtu ?? ''
              newData.udpRestartThreshold = config.lora.packetForwarder.udpGwmp.restartThreshold ?? ''
              newData.udpAutoDataRecovery = config.lora.packetForwarder.udpGwmp.autoDataRecovery ?? false
            }
            
            // MQTT Bridge
            if (config.lora.packetForwarder.mqttBridge) {
              newData.mqttStatisticInterval = config.lora.packetForwarder.mqttBridge.statisticInterval ?? ''
              newData.mqttProtocol = config.lora.packetForwarder.mqttBridge.protocol || 'chirpstack-v3-json'
              newData.mqttBrokerAddress = config.lora.packetForwarder.mqttBridge.brokerAddress ?? ''
              newData.mqttBrokerPort = config.lora.packetForwarder.mqttBridge.brokerPort ?? ''
              newData.mqttVersion = config.lora.packetForwarder.mqttBridge.version || '3.1.1'
              newData.mqttSslMode = config.lora.packetForwarder.mqttBridge.sslMode || 'none'
              newData.mqttTlsVersion = config.lora.packetForwarder.mqttBridge.tlsVersion || '1.2'
              newData.mqttUsername = config.lora.packetForwarder.mqttBridge.username || ''
              newData.mqttPassword = config.lora.packetForwarder.mqttBridge.password || ''
              
              // MQTT Certificate files
              if (config.lora.packetForwarder.mqttBridge.caCertificate) {
                newData.mqttCaCertificateName = config.lora.packetForwarder.mqttBridge.caCertificate.name || ''
                newData.mqttCaCertificateSize = config.lora.packetForwarder.mqttBridge.caCertificate.size || 0
                newData.mqttCaCertificateId = config.lora.packetForwarder.mqttBridge.caCertificate.id || ''
              }
              if (config.lora.packetForwarder.mqttBridge.clientCertificate) {
                newData.mqttClientCertificateName = config.lora.packetForwarder.mqttBridge.clientCertificate.name || ''
                newData.mqttClientCertificateSize = config.lora.packetForwarder.mqttBridge.clientCertificate.size || 0
                newData.mqttClientCertificateId = config.lora.packetForwarder.mqttBridge.clientCertificate.id || ''
              }
              if (config.lora.packetForwarder.mqttBridge.clientKey) {
                newData.mqttClientKeyName = config.lora.packetForwarder.mqttBridge.clientKey.name || ''
                newData.mqttClientKeySize = config.lora.packetForwarder.mqttBridge.clientKey.size || 0
                newData.mqttClientKeyId = config.lora.packetForwarder.mqttBridge.clientKey.id || ''
              }
            }
          }
        }
        
        // System Configuration
        if (config.system) {
          newData.wisdmEnabled = config.system.wisdmEnabled ?? true
          newData.wisdmConnect = config.system.wisdmConnect ?? false
          newData.wisdmOrgName = config.system.wisdmOrgName || ''
          newData.wisdmUrl = config.system.wisdmUrl || ''
          newData.logExpiration = config.system.logExpiration || ''
          newData.shareLog = config.system.shareLog ?? false
          newData.logRetrievalCycle = config.system.logRetrievalCycle || ''
          newData.fileRotationCycle = config.system.fileRotationCycle || ''
          newData.systemTime = config.system.systemTime || ''
          newData.ntpEnabled = config.system.ntpEnabled ?? true
          newData.ntpServers = (config.system.ntpServers && config.system.ntpServers.length > 0)
            ? config.system.ntpServers
            : ['']
          newData.gatewayName = config.system.gatewayName || ''
          newData.sshDisable = config.system.sshDisable ?? false
          newData.sshDescription = config.system.sshDescription || ''
        }
        
        // Extensions
        if (config.extensions) {
          newData.rakBreathingLight = config.extensions.rakBreathingLight ?? false
          newData.rakCountrySettings = config.extensions.rakCountrySettings ?? false
          newData.rakCustomLogo = config.extensions.rakCustomLogo ?? false
          newData.failoverReboot = config.extensions.failoverReboot ?? false
          newData.fieldTestDataProcessor = config.extensions.fieldTestDataProcessor ?? false
          newData.rakOpenClosePort = config.extensions.rakOpenClosePort ?? false
          newData.rakOpenvpnClient = config.extensions.rakOpenvpnClient ?? false
          newData.operationAndMaintenance = config.extensions.operationAndMaintenance ?? false
          newData.rakSolarBattery = config.extensions.rakSolarBattery ?? false
          newData.rfSpectrumScanner = config.extensions.rfSpectrumScanner ?? false
          newData.wifiReboot = config.extensions.wifiReboot ?? false
          newData.rakWireguard = config.extensions.rakWireguard ?? false
          newData.loraPacketLogger = config.extensions.loraPacketLogger ?? false
          newData.configDescription = config.extensions.configDescription || ''
          newData.extensionFiles = config.extensions.extensionFiles || []
          newData.extensionFileNames = (config.extensions.extensionFiles || []).map((f: any) => f.name || '')
          newData.extensionFileSizes = (config.extensions.extensionFiles || []).map((f: any) => f.size || 0)
        }
        
        // Other Configuration
        if (config.other) {
          newData.requirements = config.other.requirements || ''
          newData.configFiles = config.other.configFiles || []
          newData.configFileNames = (config.other.configFiles || []).map((f: any) => f.name || '')
          newData.configFileSizes = (config.other.configFiles || []).map((f: any) => f.size || 0)
        }
        
        return newData
      })
      
      // 加载标签（如果存在）- 在加载配置后设置，避免被自动生成覆盖
      if (existingRequest.tags && Array.isArray(existingRequest.tags) && existingRequest.tags.length > 0) {
        // 延迟设置标签，确保formData已更新
        setTimeout(() => {
          setTags(existingRequest.tags || [])
        }, 100)
      }
    }
  }, [existingRequest])

  const [panelStates, setPanelStates] = useState({
    network: false,
    lora: false,
    system: false,
    extension: false,
    other: false
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [submitProgress, setSubmitProgress] = useState('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [progressToastId, setProgressToastId] = useState<string | null>(null)

  // Toast 工具函数
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'loading' | 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const newToast: ToastItem = { id, message, type, duration }
    setToasts((prev) => [...prev, newToast])
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
    setProgressToastId((prevId) => (prevId === id ? null : prevId))
  }, [])

  // 更新进度Toast
  const updateProgressToast = useCallback((message: string, type: 'success' | 'error' | 'loading' | 'info') => {
    setProgressToastId((prevId) => {
      if (prevId) {
        // 更新现有的Toast
        setToasts((prev) =>
          prev.map((toast) =>
            toast.id === prevId
              ? { ...toast, message, type, duration: type === 'loading' ? 0 : type === 'error' ? 5000 : 3000 }
              : toast
          )
        )
        return prevId
      } else {
        // 创建新的Toast
        const id = `toast-${Date.now()}-${Math.random()}`
        const newToast: ToastItem = {
          id,
          message,
          type,
          duration: type === 'loading' ? 0 : type === 'error' ? 5000 : 3000
        }
        setToasts((prev) => [...prev, newToast])
        return id
      }
    })
  }, [])

  // 监听 submitProgress 变化，显示 Toast
  useEffect(() => {
    if (submitProgress) {
      if (submitProgress.includes('successfully')) {
        updateProgressToast(submitProgress, 'success')
        setProgressToastId(null) // 成功后清除进度Toast ID
      } else if (submitProgress.includes('Failed') || submitProgress.includes('failed')) {
        updateProgressToast(submitProgress, 'error')
        setProgressToastId(null) // 失败后清除进度Toast ID
      } else if (isLoading) {
        updateProgressToast(submitProgress || 'Processing...', 'loading')
      }
    } else if (!isLoading && progressToastId) {
      // 如果没有进度且不在加载中，清除进度Toast
      removeToast(progressToastId)
    }
  }, [submitProgress, isLoading, progressToastId, updateProgressToast, removeToast])

  // Toast 显示函数
  const showError = (message: string) => {
    showToast(message, 'error', 5000) // 5秒后自动消失
  }

  const showSuccess = (message: string) => {
    showToast(message, 'success', 3000) // 3秒后自动消失
  }

  // 验证必填字段
  const validateRequiredFields = () => {
    const errors: Record<string, string> = {}
    
    // Order Information 必填字段验证（仅 RAK ID 和 Name of the company）
    const rakIdValue = (formData.rakId && typeof formData.rakId === 'string') ? formData.rakId.trim() : ''
    const customerNameValue = (formData.customerName && typeof formData.customerName === 'string') ? formData.customerName.trim() : ''
    
    if (!rakIdValue || rakIdValue.length === 0) {
      errors.rakId = 'RAK ID is required'
    }
    if (!customerNameValue || customerNameValue.length === 0) {
      errors.customerName = 'Company Name is required'
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      
      // 当切换LoRa模式时，重置彼此的配置
      if (field === 'loraMode') {
        if (value === 'basic-station') {
          // 切换到Basic Station，重置Packet Forwarder配置
          return {
            ...newData,
            // 重置Packet Forwarder UDP GWMP配置
            udpStatisticInterval: '',
            udpServerAddress: '',
            udpPortUp: '',
            udpPortDown: '',
            udpPushTimeout: '',
            udpKeepalive: '',
            udpMtu: '',
            udpRestartThreshold: '',
            udpAutoDataRecovery: false,
            // 重置Packet Forwarder MQTT Bridge配置
            mqttStatisticInterval: '',
            mqttBrokerAddress: '',
            mqttBrokerPort: '',
            mqttUsername: '',
            mqttPassword: '',
            // 重置证书文件
            trustCaCertificate: null,
            trustCaCertificateName: '',
            trustCaCertificateSize: 0,
            clientCertificate: null,
            clientCertificateName: '',
            clientCertificateSize: 0,
            clientKey: null,
            clientKeyName: '',
            clientKeySize: 0,
            // 重置白名单配置
            loraWhitelistMode: false,
            whitelistOui: '',
            whitelistNetworkId: '',
            whitelistOuiList: [],
            whitelistNetworkIdList: []
          };
        } else if (value === 'packet-forwarder') {
          // 切换到Packet Forwarder，重置Basic Station配置
          return {
            ...newData,
            // 重置Basic Station配置
            basicStationServerType: '',
            basicStationServerUrl: '',
            basicStationServerPort: '',
            basicStationAuthMode: 'none',
            basicStationZtp: false,
            basicStationBatchTtn: false,
            basicStationBatchAwsIot: false,
            // 重置AWS配置
            awsAccessKeyId: '',
            awsSecretAccessKey: '',
            awsDefaultRegion: '',
            awsGatewayNameRule: '',
            awsGatewayDescriptionRule: '',
            awsUseClassBMode: false,
            // 重置TTN配置
            ttnAdminToken: '',
            ttnFrequencyPlan: '',
            ttnGatewayId: '',
            ttnGatewayName: '',
            // 重置证书文件
            trustCaCertificate: null,
            trustCaCertificateName: '',
            trustCaCertificateSize: 0,
            clientCertificate: null,
            clientCertificateName: '',
            clientCertificateSize: 0,
            clientKey: null,
            clientKeyName: '',
            clientKeySize: 0,
            clientToken: '',
            // 重置批量文件
            batchTtnFile: null,
            batchTtnFileName: '',
            batchTtnFileSize: 0,
            batchAwsFile: null,
            batchAwsFileName: '',
            batchAwsFileSize: 0
          };
        }
      }
      
      return newData;
    });
  }

  // File upload handlers
  const handleTrustCaCertificateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // 上传文件到后端
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          setFormData(prev => ({
            ...prev,
            trustCaCertificate: file,
            trustCaCertificateName: file.name,
            trustCaCertificateSize: file.size,
            trustCaCertificateId: result.fileId
          }));
        } else {
          console.error('Failed to upload Trust CA certificate');
        }
      } catch (error) {
        console.error('Error uploading Trust CA certificate:', error);
      }
    }
  };

  const removeTrustCaCertificate = () => {
    setFormData(prev => ({
      ...prev,
      trustCaCertificate: null,
      trustCaCertificateName: '',
      trustCaCertificateSize: 0,
      trustCaCertificateId: ''
    }));
  };

  const handleClientCertificateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // 上传文件到后端
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          setFormData(prev => ({
            ...prev,
            clientCertificate: file,
            clientCertificateName: file.name,
            clientCertificateSize: file.size,
            clientCertificateId: result.fileId
          }));
        } else {
          console.error('Failed to upload Client certificate');
        }
      } catch (error) {
        console.error('Error uploading Client certificate:', error);
      }
    }
  };

  const removeClientCertificate = () => {
    setFormData(prev => ({
      ...prev,
      clientCertificate: null,
      clientCertificateName: '',
      clientCertificateSize: 0,
      clientCertificateId: ''
    }));
  };

  const handleClientKeyUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // 上传文件到后端
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          setFormData(prev => ({
            ...prev,
            clientKey: file,
            clientKeyName: file.name,
            clientKeySize: file.size,
            clientKeyId: result.fileId
          }));
        } else {
          console.error('Failed to upload Client key');
        }
      } catch (error) {
        console.error('Error uploading Client key:', error);
      }
    }
  };

  const removeClientKey = () => {
    setFormData(prev => ({
      ...prev,
      clientKey: null,
      clientKeyName: '',
      clientKeySize: 0,
      clientKeyId: ''
    }));
  };

  const handleBatchTtnFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // 上传文件到后端
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          setFormData(prev => ({
            ...prev,
            batchTtnFile: file,
            batchTtnFileName: file.name,
            batchTtnFileSize: file.size,
            batchTtnFileId: result.fileId
          }));
        } else {
          console.error('Failed to upload Batch TTN file');
        }
      } catch (error) {
        console.error('Error uploading Batch TTN file:', error);
      }
    }
  };

  const removeBatchTtnFile = () => {
    setFormData(prev => ({
      ...prev,
      batchTtnFile: null,
      batchTtnFileName: '',
      batchTtnFileSize: 0,
      batchTtnFileId: ''
    }));
  };

  const handleBatchAwsFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // 上传文件到后端
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          setFormData(prev => ({
            ...prev,
            batchAwsFile: file,
            batchAwsFileName: file.name,
            batchAwsFileSize: file.size,
            batchAwsFileId: result.fileId
          }));
        } else {
          console.error('Failed to upload Batch AWS file');
        }
      } catch (error) {
        console.error('Error uploading Batch AWS file:', error);
      }
    }
  };

  const removeBatchAwsFile = () => {
    setFormData(prev => ({
      ...prev,
      batchAwsFile: null,
      batchAwsFileName: '',
      batchAwsFileSize: 0,
      batchAwsFileId: ''
    }));
  };

  // MQTT Bridge Certificate Upload Handlers
  const handleMqttCaCertificateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // 上传文件到后端
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          setFormData(prev => ({
            ...prev,
            mqttCaCertificate: file,
            mqttCaCertificateName: file.name,
            mqttCaCertificateSize: file.size,
            mqttCaCertificateId: result.fileId
          }));
        } else {
          console.error('Failed to upload CA certificate');
        }
      } catch (error) {
        console.error('Error uploading CA certificate:', error);
      }
    }
  };

  const removeMqttCaCertificate = () => {
    setFormData(prev => ({
      ...prev,
      mqttCaCertificate: null,
      mqttCaCertificateName: '',
      mqttCaCertificateSize: 0,
      mqttCaCertificateId: ''
    }));
  };

  const handleMqttClientCertificateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // 上传文件到后端
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          setFormData(prev => ({
            ...prev,
            mqttClientCertificate: file,
            mqttClientCertificateName: file.name,
            mqttClientCertificateSize: file.size,
            mqttClientCertificateId: result.fileId
          }));
        } else {
          console.error('Failed to upload client certificate');
        }
      } catch (error) {
        console.error('Error uploading client certificate:', error);
      }
    }
  };

  const removeMqttClientCertificate = () => {
    setFormData(prev => ({
      ...prev,
      mqttClientCertificate: null,
      mqttClientCertificateName: '',
      mqttClientCertificateSize: 0,
      mqttClientCertificateId: ''
    }));
  };

  const handleMqttClientKeyUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // 上传文件到后端
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          },
          body: formData
        });
        
        if (response.ok) {
          const result = await response.json();
          setFormData(prev => ({
            ...prev,
            mqttClientKey: file,
            mqttClientKeyName: file.name,
            mqttClientKeySize: file.size,
            mqttClientKeyId: result.fileId
          }));
        } else {
          console.error('Failed to upload client key');
        }
      } catch (error) {
        console.error('Error uploading client key:', error);
      }
    }
  };

  const removeMqttClientKey = () => {
    setFormData(prev => ({
      ...prev,
      mqttClientKey: null,
      mqttClientKeyName: '',
      mqttClientKeySize: 0,
      mqttClientKeyId: ''
    }));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Generic file upload component
  const FileUploadComponent = ({ 
    label, 
    fileId, 
    fileName, 
    fileSize, 
    onFileChange, 
    onRemove, 
    accept = ".crt,.pem,.cer,.der,.key",
    disabled = false
  }: {
    label: string;
    fileId: string;
    fileName: string;
    fileSize: number;
    onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: () => void;
    accept?: string;
    disabled?: boolean;
  }) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="file"
          id={fileId}
          onChange={onFileChange}
          accept={accept}
          disabled={disabled}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => !disabled && document.getElementById(fileId)?.click()}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: disabled ? '#d1d5db' : '#7c3aed',
            color: disabled ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = '#6d28d9')}
          onMouseLeave={(e) => !disabled && (e.currentTarget.style.background = '#7c3aed')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7,10 12,15 17,10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Select Files
        </button>
      </div>
      
      {/* File Info Display */}
      {fileName && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 12px',
          background: '#f0fdf4',
          border: '1px solid #10b981',
          borderRadius: '6px',
          marginTop: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14,2 14,8 20,8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10,9 9,9 8,9"></polyline>
            </svg>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                {fileName}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {formatFileSize(fileSize)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={disabled ? undefined : onRemove}
            disabled={disabled}
            style={{
              width: '24px',
              height: '24px',
              border: disabled ? '1px solid #d1d5db' : '1px solid #dc2626',
              background: disabled ? '#f9fafb' : '#fff',
              borderRadius: '4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: disabled ? '#9ca3af' : '#dc2626',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = '#dc2626';
                e.currentTarget.style.color = '#fff';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.color = '#dc2626';
              }
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );

  const togglePanel = (panelName: keyof typeof panelStates) => {
    setPanelStates(prev => ({
      ...prev,
      [panelName]: !prev[panelName]
    }))
  }

  const toggleNetworkPanel = (interfaceType: 'ethernet' | 'wifi' | 'cellular') => {
    handleInputChange(`${interfaceType}PanelExpanded` as keyof typeof formData, !formData[`${interfaceType}PanelExpanded` as keyof typeof formData] as boolean);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 验证必填字段（在设置 loading 之前）
    if (!validateRequiredFields()) {
      const missingFields: string[] = []
      const rakIdValue = (formData.rakId && typeof formData.rakId === 'string') ? formData.rakId.trim() : ''
      const customerNameValue = (formData.customerName && typeof formData.customerName === 'string') ? formData.customerName.trim() : ''
      
      if (!rakIdValue || rakIdValue.length === 0) {
        missingFields.push('RAK ID')
      }
      if (!customerNameValue || customerNameValue.length === 0) {
        missingFields.push('Name of the company')
      }
      
      showError(`Please fill in the following required fields: ${missingFields.join(', ')}`)
      
      // 滚动到第一个错误字段
      setTimeout(() => {
        const firstErrorField = document.querySelector('[data-field="rakId"], [data-field="customerName"]')
        if (firstErrorField) {
          firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const input = firstErrorField.querySelector('input')
          if (input) {
            input.focus()
          }
        }
      }, 100)
      
      return
    }
    
    setIsLoading(true)
    setSubmitProgress('Validating form data...')

    // 调试：检查认证状态
    const { token, isAuthenticated } = useAuthStore.getState()
    console.log('=== Configuration Submit Debug ===')
    console.log('Token:', token)
    console.log('Is Authenticated:', isAuthenticated)
    console.log('Auth Storage:', localStorage.getItem('auth-storage'))

    try {
      setSubmitProgress('Building configuration data...')
      // 构建配置数据
      const configData = {
        general: {
          pid: formData.pid,
          barcode: formData.barcode,
          rakId: formData.rakId,
          gatewayModel: formData.gatewayModel,
          customerName: formData.customerName,
          priority: formData.priority,
          orderDescription: formData.orderDescription,
          password: formData.generalPassword
        },
        network: {
          wan: {
            priority: formData.wanPriority,
            ethernet: { 
              enabled: formData.wanEthernet,
              trackingMethod: formData.ethernetTrackingMethod,
              trackingAddresses: formData.ethernetTrackingAddresses
            },
            wifi: { 
              enabled: formData.wanWifi,
              ssid: formData.wifiSsid,
              encryption: formData.wifiEncryption,
              password: formData.wifiPassword,
              trackingMethod: formData.wifiTrackingMethod,
              trackingAddresses: formData.wifiTrackingAddresses
            },
            cellular: { 
              enabled: formData.wanCellular,
              apn: formData.cellularApn,
              trackingMethod: formData.cellularTrackingMethod,
              trackingAddresses: formData.cellularTrackingAddresses
            }
          },
          lan: {
            ethernet: formData.lanEthernet,
            wifiAp: { 
              enabled: formData.wifiApEnabled,
              ssid: formData.wifiApSsid,
              encryption: formData.wifiApEncryption,
              password: formData.wifiApPassword
            }
          }
        },
        lora: {
          country: formData.loraCountry,
          region: formData.loraRegion,
          mode: formData.loraMode,
          whitelist: {
            enabled: formData.loraWhitelistMode,
            ouiList: formData.whitelistOuiList,
            networkIdList: formData.whitelistNetworkIdList
          },
          ...(formData.loraMode === 'basic-station' && {
            basicStation: {
              serverType: formData.basicStationServerType,
              serverUrl: formData.basicStationServerUrl,
              serverPort: formData.basicStationServerPort,
              authMode: formData.basicStationAuthMode,
              ztp: formData.basicStationZtp,
              batchTtn: formData.basicStationBatchTtn,
              batchAwsIot: formData.basicStationBatchAwsIot,
              // Certificate files
              trustCaCertificate: formData.trustCaCertificateName ? {
                name: formData.trustCaCertificateName,
                size: formData.trustCaCertificateSize,
                id: formData.trustCaCertificateId
              } : null,
              clientCertificate: formData.clientCertificateName ? {
                name: formData.clientCertificateName,
                size: formData.clientCertificateSize,
                id: formData.clientCertificateId
              } : null,
              clientKey: formData.clientKeyName ? {
                name: formData.clientKeyName,
                size: formData.clientKeySize,
                id: formData.clientKeyId
              } : null,
              // Batch files
              batchTtnFile: formData.batchTtnFileName ? {
                name: formData.batchTtnFileName,
                size: formData.batchTtnFileSize,
                id: formData.batchTtnFileId
              } : null,
              batchAwsFile: formData.batchAwsFileName ? {
                name: formData.batchAwsFileName,
                size: formData.batchAwsFileSize,
                id: formData.batchAwsFileId
              } : null,
              ...(formData.basicStationAuthMode === 'tls-server-client' && formData.basicStationZtp && {
                awsConfig: {
                  accessKeyId: formData.awsAccessKeyId,
                  secretAccessKey: formData.awsSecretAccessKey,
                  defaultRegion: formData.awsDefaultRegion,
                  gatewayNameRule: formData.awsGatewayNameRule,
                  gatewayDescriptionRule: formData.awsGatewayDescriptionRule,
                  useClassBMode: formData.awsUseClassBMode
                }
              }),
              ...(formData.basicStationAuthMode === 'tls-server-client-token' && formData.basicStationZtp && {
                ttnConfig: {
                  adminToken: formData.ttnAdminToken,
                  frequencyPlan: formData.ttnFrequencyPlan,
                  gatewayId: formData.ttnGatewayId,
                  gatewayName: formData.ttnGatewayName
                }
              })
            }
          }),
          ...(formData.loraMode === 'packet-forwarder' && {
            packetForwarder: {
              submode: formData.loraSubmode,
              ...(formData.loraSubmode === 'udp-gwmp' && {
                udpGwmp: {
                  statisticInterval: formData.udpStatisticInterval,
                  serverAddress: formData.udpServerAddress,
                  portUp: formData.udpPortUp,
                  portDown: formData.udpPortDown,
                  pushTimeout: formData.udpPushTimeout,
                  keepalive: formData.udpKeepalive,
                  mtu: formData.udpMtu,
                  restartThreshold: formData.udpRestartThreshold,
                  autoDataRecovery: formData.udpAutoDataRecovery
                }
              }),
              ...(formData.loraSubmode === 'mqtt-bridge' && {
                mqttBridge: {
                  statisticInterval: formData.mqttStatisticInterval,
                  protocol: formData.mqttProtocol,
                  brokerAddress: formData.mqttBrokerAddress,
                  brokerPort: formData.mqttBrokerPort,
                  version: formData.mqttVersion,
                  sslMode: formData.mqttSslMode,
                  tlsVersion: formData.mqttTlsVersion,
                  username: formData.mqttUsername,
                  password: formData.mqttPassword,
                  // 证书文件信息
                  caCertificate: formData.mqttCaCertificateName ? {
                    name: formData.mqttCaCertificateName,
                    size: formData.mqttCaCertificateSize,
                    id: formData.mqttCaCertificateId
                  } : null,
                  clientCertificate: formData.mqttClientCertificateName ? {
                    name: formData.mqttClientCertificateName,
                    size: formData.mqttClientCertificateSize,
                    id: formData.mqttClientCertificateId
                  } : null,
                  clientKey: formData.mqttClientKeyName ? {
                    name: formData.mqttClientKeyName,
                    size: formData.mqttClientKeySize,
                    id: formData.mqttClientKeyId
                  } : null
                }
              })
            }
          })
        },
        system: {
          wisdmEnabled: formData.wisdmEnabled,
          wisdmConnect: formData.wisdmConnect,
          wisdmOrgName: formData.wisdmOrgName,
          wisdmUrl: formData.wisdmUrl,
          logExpiration: formData.logExpiration,
          shareLog: formData.shareLog,
          logRetrievalCycle: formData.logRetrievalCycle,
          fileRotationCycle: formData.fileRotationCycle,
          systemTime: formData.systemTime,
          ntpEnabled: formData.ntpEnabled,
          ntpServers: formData.ntpServers,
          gatewayName: formData.gatewayName,
          sshDisable: formData.sshDisable,
          sshDescription: formData.sshDescription
        },
        extensions: {
          rakBreathingLight: formData.rakBreathingLight,
          rakCountrySettings: formData.rakCountrySettings,
          rakCustomLogo: formData.rakCustomLogo,
          failoverReboot: formData.failoverReboot,
          fieldTestDataProcessor: formData.fieldTestDataProcessor,
          rakOpenClosePort: formData.rakOpenClosePort,
          rakOpenvpnClient: formData.rakOpenvpnClient,
          operationAndMaintenance: formData.operationAndMaintenance,
          rakSolarBattery: formData.rakSolarBattery,
          rfSpectrumScanner: formData.rfSpectrumScanner,
          wifiReboot: formData.wifiReboot,
          rakWireguard: formData.rakWireguard,
          loraPacketLogger: formData.loraPacketLogger,
          configDescription: formData.configDescription,
          extensionFiles: formData.extensionFiles
        },
        other: {
          requirements: formData.requirements,
          configFiles: formData.configFiles,
          configFileNames: formData.configFileNames,
          configFileSizes: formData.configFileSizes
        }
      }

      // 调试：检查发送的数据
      console.log('=== Configuration Submit Debug ===')
      console.log('Form Data:', formData)
      console.log('Config Data:', configData)
      console.log('Config Data Keys:', Object.keys(configData))
      console.log('Tags to submit:', tags)
      console.log('Tags detail:', tags.map(tag => ({
        type: tag.type,
        value: tag.value,
        valueLength: tag.value?.length,
        label: tag.label,
        labelLength: tag.label?.length
      })))
      
      setSubmitProgress('Submitting configuration to server...')
      
      // 如果是编辑模式，更新现有请求；否则创建新请求
      if (editRequestId) {
        await requestAPI.updateRequest(editRequestId, {
          companyName: formData.customerName || 'Unnamed',
          rakId: formData.rakId,
          configData: configData,
          tags: tags
        })
        setSubmitProgress('')
        showSuccess('Configuration updated successfully!')
        setTimeout(() => {
          navigate('/dashboard')
        }, 2000)
      } else {
        await requestAPI.createRequest({
          companyName: formData.customerName || 'Unnamed',
          rakId: formData.rakId,
          configData: configData,
          changes: {},
          originalConfig: {},
          tags: tags
        })
        setSubmitProgress('')
        showSuccess('Configuration submitted successfully!')
        setTimeout(() => {
          navigate('/dashboard')
        }, 2000)
      }
    } catch (err: any) {
      // 改进错误信息显示，显示详细的错误内容
      let errorMessage = 'Failed to save configuration'
      
      if (err.response) {
        // 服务器返回的错误
        const status = err.response.status
        const detail = err.response.data?.detail || err.response.data?.message || err.response.data
        
        if (typeof detail === 'string') {
          errorMessage = `Request failed with status code ${status}: ${detail}`
        } else if (detail) {
          errorMessage = `Request failed with status code ${status}: ${JSON.stringify(detail)}`
        } else {
          errorMessage = `Request failed with status code ${status}`
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      
      console.error('Configuration submit error:', err)
      showError(errorMessage)
      setSubmitProgress('')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#1f2937',
      lineHeight: 1.6,
      margin: 0,
      padding: 0
    }}>
      {/* Header */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: '#4c1d95',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
            }}>
              <svg width="20" height="20" fill="#ffffff" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#4c1d95',
              fontFamily: 'Inter, sans-serif'
            }}>
              RAK
            </div>
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#1f2937',
            fontFamily: 'Inter, sans-serif'
          }}>
            WisGateOS2 Pre-configuration Database
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setShowTemplateSelector(true)}
            style={{
              padding: '8px 16px',
              background: '#7c3aed',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'Inter, sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#6d28d9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#7c3aed'
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            From Template
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'Inter, sans-serif'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e5e7eb'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f3f4f6'
            }}
          >
            Back to Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: '#4c1d95',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              {(() => {
                const currentUser = useAuthStore.getState().user
                return (currentUser?.name && currentUser.name.trim()) 
                  ? currentUser.name.charAt(0).toUpperCase() 
                  : (currentUser?.email ? currentUser.email.charAt(0).toUpperCase() : 'U')
              })()}
            </div>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {(() => {
                const currentUser = useAuthStore.getState().user
                return (currentUser?.name && currentUser.name.trim()) 
                  ? currentUser.name 
                  : (currentUser?.email ? currentUser.email.split('@')[0] : 'User')
              })()}
            </span>
            <button
              onClick={() => {
                setShowLogoutConfirm(true)
              }}
              style={{
                padding: '6px 12px',
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Tags Section - 在Header下方 */}
      <div style={{
        marginTop: '64px', // Header高度
        background: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        padding: '16px 24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280', marginRight: '8px' }}>
            Tags:
          </span>
          {tags.map((tag, index) => (
            <div
              key={index}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: '500',
                backgroundColor: tag.type === 'company' ? '#DBEAFE' : 
                                tag.type === 'region' ? '#D1FAE5' :
                                tag.type === 'primary-wan' ? '#FEE2E2' :
                                tag.type === 'work-mode' ? '#E9D5FF' :
                                tag.type === 'priority' ? (tag.value === 'high' ? '#FEF3C7' : tag.value === 'medium' ? '#FDE68A' : '#FCD34D') : '#F3F4F6',
                color: tag.type === 'company' ? '#1E40AF' :
                       tag.type === 'region' ? '#065F46' :
                       tag.type === 'primary-wan' ? '#991B1B' :
                       tag.type === 'work-mode' ? '#6B21A8' :
                       tag.type === 'priority' ? (tag.value === 'high' ? '#92400E' : tag.value === 'medium' ? '#78350F' : '#451A03') : '#374151',
                border: '1px solid',
                borderColor: tag.type === 'company' ? '#93C5FD' :
                            tag.type === 'region' ? '#6EE7B7' :
                            tag.type === 'primary-wan' ? '#FCA5A5' :
                            tag.type === 'work-mode' ? '#C084FC' :
                            tag.type === 'priority' ? (tag.value === 'high' ? '#FCD34D' : tag.value === 'medium' ? '#FDE68A' : '#FEF3C7') : '#D1D5DB'
              }}
            >
              {editingTagIndex === index ? (
                <input
                  type="text"
                  value={editingTagValue}
                  onChange={(e) => setEditingTagValue(e.target.value)}
                  onBlur={() => {
                    if (editingTagValue.trim()) {
                      const updatedTags = [...tags]
                      updatedTags[index] = { ...updatedTags[index], label: editingTagValue.trim(), value: editingTagValue.trim() }
                      setTags(updatedTags)
                    }
                    setEditingTagIndex(null)
                    setEditingTagValue('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    } else if (e.key === 'Escape') {
                      setEditingTagIndex(null)
                      setEditingTagValue('')
                    }
                  }}
                  autoFocus
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: '12px',
                    fontWeight: '500',
                    color: 'inherit',
                    minWidth: '100px',
                    width: 'auto',
                    maxWidth: '300px',
                    padding: '0'
                  }}
                />
              ) : (
                <>
                  <span>{tag.label}</span>
                  <button
                    onClick={() => {
                      setEditingTagIndex(index)
                      setEditingTagValue(tag.label)
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'inherit',
                      opacity: 0.7
                    }}
                    title="Edit tag"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => {
                      const updatedTags = tags.filter((_, i) => i !== index)
                      setTags(updatedTags)
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'inherit',
                      opacity: 0.7
                    }}
                    title="Remove tag"
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
          {showAddTag ? (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '16px',
              fontSize: '12px',
              backgroundColor: '#ffffff',
              border: '1px solid #D1D5DB'
            }}>
              <select
                value={newTagType}
                onChange={(e) => setNewTagType(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '12px',
                  padding: '0 4px',
                  marginRight: '4px'
                }}
              >
                <option value="custom">Custom</option>
                <option value="company">Company</option>
                <option value="priority">Priority</option>
                <option value="region">Region</option>
                <option value="primary-wan">Primary WAN</option>
                <option value="work-mode">Work Mode</option>
              </select>
              <input
                type="text"
                value={newTagValue}
                onChange={(e) => setNewTagValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTagValue.trim()) {
                    const newTag = {
                      type: newTagType,
                      value: newTagValue.trim(),
                      label: newTagValue.trim()
                    }
                    setTags([...tags, newTag])
                    setNewTagValue('')
                    setNewTagType('custom')
                    setShowAddTag(false)
                  } else if (e.key === 'Escape') {
                    setShowAddTag(false)
                    setNewTagValue('')
                    setNewTagType('custom')
                  }
                }}
                onBlur={() => {
                  if (newTagValue.trim()) {
                    const newTag = {
                      type: newTagType,
                      value: newTagValue.trim(),
                      label: newTagValue.trim()
                    }
                    setTags([...tags, newTag])
                    setNewTagValue('')
                    setNewTagType('custom')
                  }
                  setShowAddTag(false)
                }}
                placeholder="Tag value"
                autoFocus
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '12px',
                  width: '100px',
                  padding: '0 4px'
                }}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowAddTag(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: '500',
                backgroundColor: '#ffffff',
                border: '1px dashed #D1D5DB',
                color: '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6'
                e.currentTarget.style.borderColor = '#9ca3af'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff'
                e.currentTarget.style.borderColor = '#D1D5DB'
              }}
            >
              <Plus size={14} />
              <span>Add Tag</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        padding: '32px', 
        marginTop: '120px' // 增加marginTop以容纳Header和Tags区域
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          background: '#ffffff',
          borderRadius: '0.5rem',
          padding: '32px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
          border: '1px solid #e5e7eb'
        }}>
          <h1 style={{
            margin: '0 0 32px',
            fontSize: '28px',
            textAlign: 'center',
            color: '#1f2937',
            fontFamily: 'Inter, sans-serif',
            fontWeight: '600'
          }}>
            Pre-configuration Request Form
          </h1>

          {/* Order Information */}
          <section style={{ marginBottom: '32px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0,
                fontFamily: 'Inter, sans-serif'
              }}>
                Order Information
              </h2>
            </div>
            
            <div style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '20px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                  PID
                </div>
                <div>
                  <input
                    type="text"
                    value={formData.pid}
                    onChange={(e) => handleInputChange('pid', e.target.value)}
                    placeholder="Enter PID"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                  />
                </div>
                
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                  BarCode
                </div>
                <div>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => handleInputChange('barcode', e.target.value)}
                    placeholder="Enter BarCode"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                  />
                </div>
                
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                  RAK ID <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
                </div>
                <div data-field="rakId">
                  <input
                    type="email"
                    value={formData.rakId}
                    onChange={(e) => {
                      rakIdManuallyEdited.current = true
                      handleInputChange('rakId', e.target.value)
                      // 清除该字段的错误提示
                      if (validationErrors.rakId) {
                        setValidationErrors(prev => {
                          const newErrors = { ...prev }
                          delete newErrors.rakId
                          return newErrors
                        })
                      }
                    }}
                    placeholder="Enter RAK ID"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: validationErrors.rakId ? '1px solid #dc2626' : '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                  />
                  {validationErrors.rakId && (
                    <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                      {validationErrors.rakId}
                    </div>
                  )}
                </div>
                
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                  Gateway Model
                </div>
                <div>
                  <input
                    type="text"
                    value={formData.gatewayModel}
                    onChange={(e) => handleInputChange('gatewayModel', e.target.value)}
                    list="gateway-model-options"
                    placeholder="Enter or select gateway model"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <datalist id="gateway-model-options">
                    <option value="RAK7268V2">RAK7268V2</option>
                    <option value="RAK7268CV2">RAK7268CV2</option>
                    <option value="RAK7289V2">RAK7289V2</option>
                    <option value="RAK7289CV2">RAK7289CV2</option>
                    <option value="RAK7240V2">RAK7240V2</option>
                    <option value="RAK7240CV2">RAK7240CV2</option>
                    <option value="RAK7285">RAK7285</option>
                    <option value="RAK7285C">RAK7285C</option>
                    <option value="RAK7267">RAK7267</option>
                    <option value="RAK7266">RAK7266</option>
                  </datalist>
                </div>
                
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                  Name of the company <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
                </div>
                <div data-field="customerName">
                  <input
                    type="text"
                    value={formData.customerName}
                    onChange={(e) => {
                      handleInputChange('customerName', e.target.value)
                      // 清除该字段的错误提示
                      if (validationErrors.customerName) {
                        setValidationErrors(prev => {
                          const newErrors = { ...prev }
                          delete newErrors.customerName
                          return newErrors
                        })
                      }
                    }}
                    placeholder="Enter company name"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: validationErrors.customerName ? '1px solid #dc2626' : '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                  />
                  {validationErrors.customerName && (
                    <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                      {validationErrors.customerName}
                    </div>
                  )}
                </div>
                
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                  Priority
                </div>
                <div>
                  <input
                    type="text"
                    value={formData.priority}
                    onChange={(e) => handleInputChange('priority', e.target.value)}
                    list="priority-options"
                    placeholder="Please select priority"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <datalist id="priority-options">
                    <option value="high" />
                    <option value="medium" />
                    <option value="low" />
                  </datalist>
                </div>
                
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                  Order Description
                </div>
                <div>
                  <textarea
                    value={formData.orderDescription}
                    onChange={(e) => handleInputChange('orderDescription', e.target.value)}
                    placeholder="Enter order description"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Network Configuration */}
          <section style={{ marginBottom: '32px' }}>
            <div 
              style={{ 
                marginBottom: '20px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background-color 0.2s',
                padding: '8px',
                borderRadius: '4px'
              }}
              onClick={() => togglePanel('network')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0,
                fontFamily: 'Inter, sans-serif'
              }}>
                Network Configuration
              </h2>
              <div style={{
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '8px solid #000000',
                transition: 'all 0.3s ease',
                transform: panelStates.network ? 'rotate(180deg)' : 'rotate(0deg)'
              }} />
            </div>
            
            {panelStates.network && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '20px'
              }}>
                {/* WAN Port Configuration */}
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    margin: '0 0 16px 0',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    WAN Port Configuration
                  </h3>
                  
                  {/* Network Priority */}
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      margin: '0 0 12px 0'
                    }}>
                      Network Priority
                    </h4>
                    <div style={{
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '16px'
                    }}>
                      {formData.wanPriority.map((interfaceType, index) => (
                        <div key={interfaceType} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: index < formData.wanPriority.length - 1 ? '1px solid #e5e7eb' : 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{
                              fontSize: '14px',
                              fontWeight: '500',
                              color: '#374151',
                              minWidth: '20px'
                            }}>
                              {index + 1}
                            </span>
                            <span style={{
                              fontSize: '14px',
                              fontWeight: '500',
                              color: '#1f2937',
                              textTransform: 'capitalize'
                            }}>
                              {interfaceType}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (index > 0) {
                                  const newPriority = [...formData.wanPriority];
                                  [newPriority[index], newPriority[index - 1]] = [newPriority[index - 1], newPriority[index]];
                                  console.log('=== WAN Priority Up Click ===')
                                  console.log('Old priority:', formData.wanPriority)
                                  console.log('New priority:', newPriority)
                                  handleInputChange('wanPriority', newPriority);
                                }
                              }}
                              disabled={index === 0}
                              style={{
                                width: '24px',
                                height: '24px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                background: index === 0 ? '#f3f4f6' : '#ffffff',
                                cursor: index === 0 ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                if (index > 0) {
                                  e.currentTarget.style.background = '#f3f4f6';
                                  e.currentTarget.style.borderColor = '#9ca3af';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (index > 0) {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.borderColor = '#d1d5db';
                                }
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (index < formData.wanPriority.length - 1) {
                                  const newPriority = [...formData.wanPriority];
                                  [newPriority[index], newPriority[index + 1]] = [newPriority[index + 1], newPriority[index]];
                                  console.log('=== WAN Priority Down Click ===')
                                  console.log('Old priority:', formData.wanPriority)
                                  console.log('New priority:', newPriority)
                                  handleInputChange('wanPriority', newPriority);
                                }
                              }}
                              disabled={index === formData.wanPriority.length - 1}
                              style={{
                                width: '24px',
                                height: '24px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                background: index === formData.wanPriority.length - 1 ? '#f3f4f6' : '#ffffff',
                                cursor: index === formData.wanPriority.length - 1 ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                if (index < formData.wanPriority.length - 1) {
                                  e.currentTarget.style.background = '#f3f4f6';
                                  e.currentTarget.style.borderColor = '#9ca3af';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (index < formData.wanPriority.length - 1) {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.borderColor = '#d1d5db';
                                }
                              }}
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>


                  {/* Ethernet Interface */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    overflow: 'hidden'
                  }}>
                    <div 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        cursor: 'pointer',
                        background: '#f9fafb',
                        borderBottom: formData.ethernetPanelExpanded ? '1px solid #e5e7eb' : 'none'
                      }}
                      onClick={() => toggleNetworkPanel('ethernet')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{
                          display: 'inline-block',
                          position: 'relative',
                          width: '48px',
                          height: '24px',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={formData.wanEthernet}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleInputChange('wanEthernet', e.target.checked);
                            }}
                            style={{ display: 'none' }}
                          />
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: formData.wanEthernet ? '#4c1d95' : '#d1d5db',
                            borderRadius: '24px',
                            transition: 'background-color 0.3s'
                          }}>
                            <div style={{
                              position: 'absolute',
                              top: '2px',
                              left: formData.wanEthernet ? '26px' : '2px',
                              width: '20px',
                              height: '20px',
                              background: '#ffffff',
                              borderRadius: '50%',
                              transition: 'left 0.3s'
                            }} />
                          </div>
                        </label>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '500',
                          color: formData.wanEthernet ? '#1f2937' : '#9ca3af'
                        }}>
                          Ethernet
                        </span>
                      </div>
                      <div style={{
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: formData.ethernetPanelExpanded ? '8px solid #6b7280' : '8px solid #9ca3af',
                        transition: 'all 0.3s ease',
                        transform: formData.ethernetPanelExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                      }} />
                    </div>
                    
                    {formData.ethernetPanelExpanded && formData.wanEthernet && (
                      <div style={{ padding: '16px' }}>
                        {/* Connection Monitoring */}
                        <div style={{
                          background: '#f9fafb',
                          border: '2px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '12px'
                        }}>
                          <h5 style={{
                            fontSize: '12px',
                            fontWeight: '500',
                            color: '#000000',
                            margin: '0 0 8px 0'
                          }}>
                            Connection Monitoring
                          </h5>
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="ethernet-tracking"
                                value="icmp"
                                checked={formData.ethernetTrackingMethod === 'icmp'}
                                onChange={(e) => handleInputChange('ethernetTrackingMethod', e.target.value)}
                                style={{ accentColor: '#7c3aed' }}
                              />
                              <span style={{ fontSize: '12px', color: '#374151' }}>ICMP</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="ethernet-tracking"
                                value="http"
                                checked={formData.ethernetTrackingMethod === 'http'}
                                onChange={(e) => handleInputChange('ethernetTrackingMethod', e.target.value)}
                                style={{ accentColor: '#7c3aed' }}
                              />
                              <span style={{ fontSize: '12px', color: '#374151' }}>HTTP</span>
                            </label>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                              Tracking Addresses (Max 5)
                            </label>
                            {formData.ethernetTrackingAddresses.map((address, addressIndex) => (
                              <div key={addressIndex} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input
                                  type="text"
                                  value={address}
                                  onChange={(e) => {
                                    const newAddresses = [...formData.ethernetTrackingAddresses];
                                    newAddresses[addressIndex] = e.target.value;
                                    handleInputChange('ethernetTrackingAddresses', newAddresses);
                                  }}
                                  placeholder="8.8.8.8"
                                  style={{
                                    flex: 1,
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    outline: 'none'
                                  }}
                                />
                                {addressIndex === formData.ethernetTrackingAddresses.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (formData.ethernetTrackingAddresses.length < 5) {
                                        const newAddresses = [...formData.ethernetTrackingAddresses, ''];
                                        handleInputChange('ethernetTrackingAddresses', newAddresses);
                                      }
                                    }}
                                    disabled={formData.ethernetTrackingAddresses.length >= 5}
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      background: formData.ethernetTrackingAddresses.length >= 5 ? '#f3f4f6' : '#fbbf24',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: formData.ethernetTrackingAddresses.length >= 5 ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#ffffff',
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (formData.ethernetTrackingAddresses.length < 5) {
                                        e.currentTarget.style.background = '#f59e0b';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (formData.ethernetTrackingAddresses.length < 5) {
                                        e.currentTarget.style.background = '#fbbf24';
                                      }
                                    }}
                                  >
                                    +
                                  </button>
                                )}
                                {formData.ethernetTrackingAddresses.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newAddresses = formData.ethernetTrackingAddresses.filter((_, idx) => idx !== addressIndex);
                                      handleInputChange('ethernetTrackingAddresses', newAddresses);
                                    }}
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      background: '#ef4444',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#ffffff',
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = '#dc2626';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = '#ef4444';
                                    }}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            {formData.ethernetTrackingAddresses.length === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newAddresses = [...formData.ethernetTrackingAddresses, ''];
                                  handleInputChange('ethernetTrackingAddresses', newAddresses);
                                }}
                                style={{
                                  width: '100%',
                                  height: '32px',
                                  background: '#7c3aed',
                                  border: '1px solid #6d28d9',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#6d28d9';
                                  e.currentTarget.style.borderColor = '#5b21b6';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#7c3aed';
                                  e.currentTarget.style.borderColor = '#6d28d9';
                                }}
                              >
                                + Add Tracking Address
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* WiFi Interface */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    overflow: 'hidden'
                  }}>
                    <div 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        cursor: 'pointer',
                        background: '#f9fafb',
                        borderBottom: formData.wifiPanelExpanded ? '1px solid #e5e7eb' : 'none'
                      }}
                      onClick={() => toggleNetworkPanel('wifi')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{
                          display: 'inline-block',
                          position: 'relative',
                          width: '48px',
                          height: '24px',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={formData.wanWifi}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleInputChange('wanWifi', e.target.checked);
                            }}
                            style={{ display: 'none' }}
                          />
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: formData.wanWifi ? '#4c1d95' : '#d1d5db',
                            borderRadius: '24px',
                            transition: 'background-color 0.3s'
                          }}>
                            <div style={{
                              position: 'absolute',
                              top: '2px',
                              left: formData.wanWifi ? '26px' : '2px',
                              width: '20px',
                              height: '20px',
                              background: '#ffffff',
                              borderRadius: '50%',
                              transition: 'left 0.3s'
                            }} />
                          </div>
                        </label>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '500',
                          color: formData.wanWifi ? '#1f2937' : '#9ca3af'
                        }}>
                          WiFi
                        </span>
                      </div>
                      <div style={{
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: formData.wifiPanelExpanded ? '8px solid #6b7280' : '8px solid #9ca3af',
                        transition: 'all 0.3s ease',
                        transform: formData.wifiPanelExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                      }} />
                    </div>
                    
                    {formData.wifiPanelExpanded && formData.wanWifi && (
                      <div style={{ padding: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                              SSID
                            </label>
                            <input
                              type="text"
                              value={formData.wifiSsid}
                              onChange={(e) => handleInputChange('wifiSsid', e.target.value)}
                              placeholder="Enter WiFi SSID"
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '12px',
                                outline: 'none'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                              Encryption
                            </label>
                            <select
                              value={formData.wifiEncryption}
                              onChange={(e) => handleInputChange('wifiEncryption', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '12px',
                                outline: 'none',
                                background: '#fff'
                              }}
                            >
                              <option value="none">No Encryption</option>
                              <option value="wpa-psk">WPA-PSK</option>
                              <option value="wpa2-psk">WPA2-PSK</option>
                              <option value="wpa-psk-wpa2-psk-mixed">WPA-PSK/WPA2-PSK Mixed Mode</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                              Password
                            </label>
                            <input
                              type="text"
                              value={formData.wifiPassword}
                              onChange={(e) => handleInputChange('wifiPassword', e.target.value)}
                              placeholder="Enter WiFi Password"
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '12px',
                                outline: 'none'
                              }}
                            />
                          </div>
                        </div>
                        
                        {/* Connection Monitoring */}
                        <div style={{
                          background: '#f9fafb',
                          border: '2px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '12px'
                        }}>
                          <h5 style={{
                            fontSize: '12px',
                            fontWeight: '500',
                            color: '#000000',
                            margin: '0 0 8px 0'
                          }}>
                            Connection Monitoring
                          </h5>
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="wifi-tracking"
                                value="icmp"
                                checked={formData.wifiTrackingMethod === 'icmp'}
                                onChange={(e) => handleInputChange('wifiTrackingMethod', e.target.value)}
                                style={{ accentColor: '#7c3aed' }}
                              />
                              <span style={{ fontSize: '12px', color: '#374151' }}>ICMP</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="wifi-tracking"
                                value="http"
                                checked={formData.wifiTrackingMethod === 'http'}
                                onChange={(e) => handleInputChange('wifiTrackingMethod', e.target.value)}
                                style={{ accentColor: '#7c3aed' }}
                              />
                              <span style={{ fontSize: '12px', color: '#374151' }}>HTTP</span>
                            </label>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                              Tracking Addresses (Max 5)
                            </label>
                            {formData.wifiTrackingAddresses.map((address, addressIndex) => (
                              <div key={addressIndex} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input
                                  type="text"
                                  value={address}
                                  onChange={(e) => {
                                    const newAddresses = [...formData.wifiTrackingAddresses];
                                    newAddresses[addressIndex] = e.target.value;
                                    handleInputChange('wifiTrackingAddresses', newAddresses);
                                  }}
                                  placeholder="8.8.8.8"
                                  style={{
                                    flex: 1,
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    outline: 'none'
                                  }}
                                />
                                {addressIndex === formData.wifiTrackingAddresses.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (formData.wifiTrackingAddresses.length < 5) {
                                        const newAddresses = [...formData.wifiTrackingAddresses, ''];
                                        handleInputChange('wifiTrackingAddresses', newAddresses);
                                      }
                                    }}
                                    disabled={formData.wifiTrackingAddresses.length >= 5}
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      background: formData.wifiTrackingAddresses.length >= 5 ? '#f3f4f6' : '#fbbf24',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: formData.wifiTrackingAddresses.length >= 5 ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#ffffff',
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (formData.wifiTrackingAddresses.length < 5) {
                                        e.currentTarget.style.background = '#f59e0b';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (formData.wifiTrackingAddresses.length < 5) {
                                        e.currentTarget.style.background = '#fbbf24';
                                      }
                                    }}
                                  >
                                    +
                                  </button>
                                )}
                                {formData.wifiTrackingAddresses.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newAddresses = formData.wifiTrackingAddresses.filter((_, idx) => idx !== addressIndex);
                                      handleInputChange('wifiTrackingAddresses', newAddresses);
                                    }}
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      background: '#ef4444',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#ffffff',
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = '#dc2626';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = '#ef4444';
                                    }}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            {formData.wifiTrackingAddresses.length === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newAddresses = [...formData.wifiTrackingAddresses, ''];
                                  handleInputChange('wifiTrackingAddresses', newAddresses);
                                }}
                                style={{
                                  width: '100%',
                                  height: '32px',
                                  background: '#7c3aed',
                                  border: '1px solid #6d28d9',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#6d28d9';
                                  e.currentTarget.style.borderColor = '#5b21b6';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#7c3aed';
                                  e.currentTarget.style.borderColor = '#6d28d9';
                                }}
                              >
                                + Add Tracking Address
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cellular Interface */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    overflow: 'hidden'
                  }}>
                    <div 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        cursor: 'pointer',
                        background: '#f9fafb',
                        borderBottom: formData.cellularPanelExpanded ? '1px solid #e5e7eb' : 'none'
                      }}
                      onClick={() => toggleNetworkPanel('cellular')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{
                          display: 'inline-block',
                          position: 'relative',
                          width: '48px',
                          height: '24px',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={formData.wanCellular}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleInputChange('wanCellular', e.target.checked);
                            }}
                            style={{ display: 'none' }}
                          />
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: formData.wanCellular ? '#4c1d95' : '#d1d5db',
                            borderRadius: '24px',
                            transition: 'background-color 0.3s'
                          }}>
                            <div style={{
                              position: 'absolute',
                              top: '2px',
                              left: formData.wanCellular ? '26px' : '2px',
                              width: '20px',
                              height: '20px',
                              background: '#ffffff',
                              borderRadius: '50%',
                              transition: 'left 0.3s'
                            }} />
                          </div>
                        </label>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '500',
                          color: formData.wanCellular ? '#1f2937' : '#9ca3af'
                        }}>
                          Cellular
                        </span>
                      </div>
                      <div style={{
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: formData.cellularPanelExpanded ? '8px solid #6b7280' : '8px solid #9ca3af',
                        transition: 'all 0.3s ease',
                        transform: formData.cellularPanelExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                      }} />
                    </div>
                    
                    {formData.cellularPanelExpanded && formData.wanCellular && (
                      <div style={{ padding: '16px' }}>
                        {/* APN Settings */}
                        <div style={{
                          background: '#f9fafb',
                          border: '2px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '12px',
                          marginBottom: '12px'
                        }}>
                          <h5 style={{
                            fontSize: '12px',
                            fontWeight: '500',
                            color: '#000000',
                            margin: '0 0 8px 0'
                          }}>
                            APN Settings
                          </h5>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                              APN
                            </label>
                            <input
                              type="text"
                              value={formData.cellularApn}
                              onChange={(e) => handleInputChange('cellularApn', e.target.value)}
                              placeholder="Enter APN"
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '12px',
                                outline: 'none'
                              }}
                            />
                          </div>
                        </div>
                        
                        {/* Connection Monitoring */}
                        <div style={{
                          background: '#f9fafb',
                          border: '2px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '12px'
                        }}>
                          <h5 style={{
                            fontSize: '12px',
                            fontWeight: '500',
                            color: '#000000',
                            margin: '0 0 8px 0'
                          }}>
                            Connection Monitoring
                          </h5>
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="cellular-tracking"
                                value="icmp"
                                checked={formData.cellularTrackingMethod === 'icmp'}
                                onChange={(e) => handleInputChange('cellularTrackingMethod', e.target.value)}
                                style={{ accentColor: '#7c3aed' }}
                              />
                              <span style={{ fontSize: '12px', color: '#374151' }}>ICMP</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="cellular-tracking"
                                value="http"
                                checked={formData.cellularTrackingMethod === 'http'}
                                onChange={(e) => handleInputChange('cellularTrackingMethod', e.target.value)}
                                style={{ accentColor: '#7c3aed' }}
                              />
                              <span style={{ fontSize: '12px', color: '#374151' }}>HTTP</span>
                            </label>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px', color: '#374151' }}>
                              Tracking Addresses (Max 5)
                            </label>
                            {formData.cellularTrackingAddresses.map((address, addressIndex) => (
                              <div key={addressIndex} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input
                                  type="text"
                                  value={address}
                                  onChange={(e) => {
                                    const newAddresses = [...formData.cellularTrackingAddresses];
                                    newAddresses[addressIndex] = e.target.value;
                                    handleInputChange('cellularTrackingAddresses', newAddresses);
                                  }}
                                  placeholder="8.8.8.8"
                                  style={{
                                    flex: 1,
                                    padding: '8px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    outline: 'none'
                                  }}
                                />
                                {addressIndex === formData.cellularTrackingAddresses.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (formData.cellularTrackingAddresses.length < 5) {
                                        const newAddresses = [...formData.cellularTrackingAddresses, ''];
                                        handleInputChange('cellularTrackingAddresses', newAddresses);
                                      }
                                    }}
                                    disabled={formData.cellularTrackingAddresses.length >= 5}
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      background: formData.cellularTrackingAddresses.length >= 5 ? '#f3f4f6' : '#fbbf24',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: formData.cellularTrackingAddresses.length >= 5 ? 'not-allowed' : 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#ffffff',
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (formData.cellularTrackingAddresses.length < 5) {
                                        e.currentTarget.style.background = '#f59e0b';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (formData.cellularTrackingAddresses.length < 5) {
                                        e.currentTarget.style.background = '#fbbf24';
                                      }
                                    }}
                                  >
                                    +
                                  </button>
                                )}
                                {formData.cellularTrackingAddresses.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newAddresses = formData.cellularTrackingAddresses.filter((_, idx) => idx !== addressIndex);
                                      handleInputChange('cellularTrackingAddresses', newAddresses);
                                    }}
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      background: '#ef4444',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#ffffff',
                                      fontSize: '14px',
                                      fontWeight: 'bold',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = '#dc2626';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = '#ef4444';
                                    }}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            {formData.cellularTrackingAddresses.length === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newAddresses = [...formData.cellularTrackingAddresses, ''];
                                  handleInputChange('cellularTrackingAddresses', newAddresses);
                                }}
                                style={{
                                  width: '100%',
                                  height: '32px',
                                  background: '#7c3aed',
                                  border: '1px solid #6d28d9',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#6d28d9';
                                  e.currentTarget.style.borderColor = '#5b21b6';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#7c3aed';
                                  e.currentTarget.style.borderColor = '#6d28d9';
                                }}
                              >
                                + Add Tracking Address
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* LAN Port Configuration */}
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#4c1d95',
                    margin: '0 0 20px 0',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    LAN Port Configuration
                  </h3>
                  
                  {/* LAN Settings */}
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      margin: '0 0 12px 0'
                    }}>
                      LAN Settings
                    </h4>
                    
                    {/* LAN Ethernet Interface */}
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      overflow: 'hidden'
                    }}>
                      <div 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px',
                          cursor: 'pointer',
                          background: '#f9fafb'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <label style={{
                            display: 'inline-block',
                            position: 'relative',
                            width: '48px',
                            height: '24px',
                            cursor: 'pointer'
                          }}>
                            <input
                              type="checkbox"
                              checked={formData.lanEthernet}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleInputChange('lanEthernet', e.target.checked);
                              }}
                              style={{ display: 'none' }}
                            />
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              background: formData.lanEthernet ? '#4c1d95' : '#d1d5db',
                              borderRadius: '24px',
                              transition: 'background-color 0.3s'
                            }}>
                              <div style={{
                                position: 'absolute',
                                top: '2px',
                                left: formData.lanEthernet ? '26px' : '2px',
                                width: '20px',
                                height: '20px',
                                background: '#ffffff',
                                borderRadius: '50%',
                                transition: 'left 0.3s'
                              }} />
                            </div>
                          </label>
                          <span style={{
                            fontSize: '16px',
                            fontWeight: '500',
                            color: formData.lanEthernet ? '#1f2937' : '#9ca3af'
                          }}>
                            LAN Ethernet
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* WiFi AP Interface */}
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}>
                      <div 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px',
                          cursor: 'pointer',
                          background: '#f9fafb',
                          borderBottom: formData.wifiApEnabled ? '1px solid #e5e7eb' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <label style={{
                            display: 'inline-block',
                            position: 'relative',
                            width: '48px',
                            height: '24px',
                            cursor: 'pointer'
                          }}>
                            <input
                              type="checkbox"
                              checked={formData.wifiApEnabled}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleInputChange('wifiApEnabled', e.target.checked);
                              }}
                              style={{ display: 'none' }}
                            />
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              background: formData.wifiApEnabled ? '#4c1d95' : '#d1d5db',
                              borderRadius: '24px',
                              transition: 'background-color 0.3s'
                            }}>
                              <div style={{
                                position: 'absolute',
                                top: '2px',
                                left: formData.wifiApEnabled ? '26px' : '2px',
                                width: '20px',
                                height: '20px',
                                background: '#ffffff',
                                borderRadius: '50%',
                                transition: 'left 0.3s'
                              }} />
                            </div>
                          </label>
                          <span style={{
                            fontSize: '16px',
                            fontWeight: '500',
                            color: formData.wifiApEnabled ? '#1f2937' : '#9ca3af'
                          }}>
                            WiFi AP
                          </span>
                        </div>
                      </div>
                      
                      {/* WiFi AP Configuration */}
                      {formData.wifiApEnabled && (
                        <div style={{ padding: '16px' }}>
                          <h5 style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#374151',
                            margin: '0 0 16px 0'
                          }}>
                            WiFi AP Configuration
                          </h5>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                Network Name (SSID)
                              </label>
                              <input
                                type="text"
                                value={formData.wifiApSsid}
                                onChange={(e) => handleInputChange('wifiApSsid', e.target.value)}
                                placeholder="MyWiFiNetwork"
                                style={{
                                  width: '100%',
                                  padding: '10px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  outline: 'none',
                                  background: '#ffffff'
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                Encryption
                              </label>
                              <select
                                value={formData.wifiApEncryption}
                                onChange={(e) => handleInputChange('wifiApEncryption', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '10px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  outline: 'none',
                                  background: '#ffffff',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="none">No Encryption</option>
                                <option value="wpa-psk">WPA-PSK</option>
                                <option value="wpa2-psk">WPA2-PSK</option>
                                <option value="wpa-mixed">WPA-PSK/WPA2-PSK Mixed Mode</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                Password
                              </label>
                              <input
                                type="text"
                                value={formData.wifiApPassword}
                                onChange={(e) => handleInputChange('wifiApPassword', e.target.value)}
                                placeholder="Enter WiFi password"
                                style={{
                                  width: '100%',
                                  padding: '10px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  outline: 'none',
                                  background: '#ffffff'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </section>

          {/* LoRa Configuration */}
          <section style={{ marginBottom: '32px' }}>
            <div 
              style={{ 
                marginBottom: '20px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background-color 0.2s',
                padding: '8px',
                borderRadius: '4px'
              }}
              onClick={() => togglePanel('lora')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0,
                fontFamily: 'Inter, sans-serif'
              }}>
                LoRa Configuration
              </h2>
              <div style={{
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '8px solid #000000',
                transition: 'all 0.3s ease',
                transform: panelStates.lora ? 'rotate(180deg)' : 'rotate(0deg)'
              }} />
            </div>
            
            {panelStates.lora && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '16px',
                marginTop: '12px'
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginBottom: '12px'
                  }}>
                    LoRa Mode Configuration
                  </h3>
                  
                  {/* Country Configuration */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                      Country
                    </label>
                    <input
                      type="text"
                      value={formData.loraCountry}
                      onChange={(e) => handleInputChange('loraCountry', e.target.value)}
                      placeholder="Enter country name"
                      style={{
                        width: '100%',
                        height: '36px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        padding: '0 10px',
                        background: '#fff',
                        color: '#1f2937',
                        outline: 'none',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  {/* Main Mode Selection */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="lora-mode"
                        value="packet-forwarder"
                        checked={formData.loraMode === 'packet-forwarder'}
                        onChange={(e) => handleInputChange('loraMode', e.target.value)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                        Packet Forwarder
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="radio"
                        name="lora-mode"
                        value="basic-station"
                        checked={formData.loraMode === 'basic-station'}
                        onChange={(e) => handleInputChange('loraMode', e.target.value)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                        Basic Station
                      </label>
                    </div>
                  </div>

                  {/* Region Selection */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                      Region
                    </label>
                    <select
                      value={formData.loraRegion}
                      onChange={(e) => handleInputChange('loraRegion', e.target.value)}
                      style={{
                        width: '100%',
                        height: '36px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        padding: '0 10px',
                        background: '#fff',
                        color: '#1f2937',
                        outline: 'none',
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Please select region</option>
                      <option value="eu868">EU868</option>
                      <option value="in865">IN865</option>
                      <option value="ru864">RU864</option>
                      <option value="us915">US915</option>
                      <option value="au915">AU915</option>
                      <option value="as923-1">AS923-1</option>
                      <option value="as923-2">AS923-2</option>
                      <option value="as923-3">AS923-3</option>
                      <option value="as923-4">AS923-4</option>
                      <option value="kr920">KR920</option>
                    </select>
                  </div>


                  {/* Packet Forwarder Sub-mode Selection */}
                  {formData.loraMode === 'packet-forwarder' && (
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          name="lora-submode"
                          value="udp-gwmp"
                          checked={formData.loraSubmode === 'udp-gwmp'}
                          onChange={(e) => handleInputChange('loraSubmode', e.target.value)}
                          style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                        />
                        <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                          Semtech UDP GWMP Protocol
                        </label>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          name="lora-submode"
                          value="mqtt-bridge"
                          checked={formData.loraSubmode === 'mqtt-bridge'}
                          onChange={(e) => handleInputChange('loraSubmode', e.target.value)}
                          style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                        />
                        <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                          LoRa® Gateway MQTT Bridge
                        </label>
                      </div>
                    </div>
                  )}

                  {/* UDP GWMP Configuration */}
                  {formData.loraMode === 'packet-forwarder' && formData.loraSubmode === 'udp-gwmp' && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      marginBottom: '16px'
                    }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Statistic Interval (s)
                        </label>
                        <input
                          type="number"
                          value={formData.udpStatisticInterval ?? ''}
                          placeholder="30"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('udpStatisticInterval', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="1"
                          max="3600"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Server Address
                        </label>
                        <input
                          type="text"
                          value={formData.udpServerAddress ?? ''}
                          onChange={(e) => handleInputChange('udpServerAddress', e.target.value)}
                          placeholder="eu1.cloud.thethings.network"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Server Port Up
                        </label>
                        <input
                          type="number"
                          value={formData.udpPortUp ?? ''}
                          placeholder="1700"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('udpPortUp', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="1"
                          max="65535"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Server Port Down
                        </label>
                        <input
                          type="number"
                          value={formData.udpPortDown ?? ''}
                          placeholder="1700"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('udpPortDown', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="1"
                          max="65535"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Push Timeout (ms)
                        </label>
                        <input
                          type="number"
                          value={formData.udpPushTimeout ?? ''}
                          placeholder="200"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('udpPushTimeout', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="1"
                          max="10000"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Keepalive Interval (s)
                        </label>
                        <input
                          type="number"
                          value={formData.udpKeepalive ?? ''}
                          placeholder="5"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('udpKeepalive', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="1"
                          max="3600"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          DGRAM MTU
                        </label>
                        <input
                          type="number"
                          value={formData.udpMtu ?? ''}
                          placeholder="1400"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('udpMtu', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="100"
                          max="2000"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Auto-restart Threshold
                        </label>
                        <input
                          type="number"
                          value={formData.udpRestartThreshold ?? ''}
                          placeholder="30"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('udpRestartThreshold', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="1"
                          max="100"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Auto Data Recovery
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <label style={{
                            display: 'inline-block',
                            position: 'relative',
                            width: '48px',
                            height: '24px',
                            cursor: 'pointer'
                          }}>
                            <input
                              type="checkbox"
                              checked={formData.udpAutoDataRecovery}
                              onChange={(e) => handleInputChange('udpAutoDataRecovery', e.target.checked)}
                              style={{ display: 'none' }}
                            />
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              background: formData.udpAutoDataRecovery ? '#7c3aed' : '#d1d5db',
                              borderRadius: '24px',
                              transition: 'background-color 0.3s'
                            }}>
                              <div style={{
                                position: 'absolute',
                                top: '2px',
                                left: formData.udpAutoDataRecovery ? '26px' : '2px',
                                width: '20px',
                                height: '20px',
                                background: '#ffffff',
                                borderRadius: '50%',
                                transition: 'left 0.3s'
                              }} />
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MQTT Bridge Configuration */}
                  {formData.loraMode === 'packet-forwarder' && formData.loraSubmode === 'mqtt-bridge' && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      marginBottom: '16px'
                    }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Statistic Interval (s)
                        </label>
                        <input
                          type="number"
                          value={formData.mqttStatisticInterval ?? ''}
                          placeholder="30"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('mqttStatisticInterval', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="1"
                          max="3600"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          MQTT Protocol
                        </label>
                        <select
                          value={formData.mqttProtocol}
                          onChange={(e) => handleInputChange('mqttProtocol', e.target.value)}
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="chirpstack-v3-json">chirpstack V3-JSON</option>
                          <option value="chirpstack-v3-protopuf">chirpstack V3-protopuf</option>
                          <option value="chirpstack-v4">chirpstackV4</option>
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          MQTT Broker Address
                        </label>
                        <input
                          type="text"
                          value={formData.mqttBrokerAddress ?? ''}
                          onChange={(e) => handleInputChange('mqttBrokerAddress', e.target.value)}
                          placeholder="127.0.0.1"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          MQTT Broker Port
                        </label>
                        <input
                          type="number"
                          value={formData.mqttBrokerPort ?? ''}
                          placeholder="1883"
                          onChange={(e) => {
                            const val = e.target.value
                            handleInputChange('mqttBrokerPort', val === '' ? '' : parseInt(val, 10))
                          }}
                          min="1"
                          max="65535"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          MQTT Version
                        </label>
                        <select
                          value={formData.mqttVersion}
                          onChange={(e) => handleInputChange('mqttVersion', e.target.value)}
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="3.1">MQTT 3.1</option>
                          <option value="3.1.1">MQTT 3.1.1</option>
                          <option value="5.0">MQTT 5.0</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          SSL/TLS Mode
                        </label>
                        <select
                          value={formData.mqttSslMode}
                          onChange={(e) => handleInputChange('mqttSslMode', e.target.value)}
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="none">None</option>
                          <option value="ca-signed">CA signed server certification</option>
                          <option value="self-signed-server">Self-signed server certification</option>
                          <option value="self-signed-both">Self-signed server & client certification</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          TLS Version
                        </label>
                        <select
                          value={formData.mqttTlsVersion}
                          onChange={(e) => handleInputChange('mqttTlsVersion', e.target.value)}
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="1.0">TLS v1.0</option>
                          <option value="1.1">TLS v1.1</option>
                          <option value="1.2">TLS v1.2</option>
                          <option value="1.3">TLS v1.3</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* MQTT Bridge Certificate Upload Area - Only show when certificates are needed */}
                  {formData.loraMode === 'packet-forwarder' && 
                   formData.loraSubmode === 'mqtt-bridge' && 
                   (formData.mqttSslMode === 'self-signed-server' || formData.mqttSslMode === 'self-signed-both') && (
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '16px',
                      marginBottom: '16px'
                    }}>
                      <h5 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                        Certificate Upload
                      </h5>
                      
                      {/* Self-signed server certification - 1 certificate */}
                      {formData.mqttSslMode === 'self-signed-server' && (
                        <FileUploadComponent
                          label="CA certificate"
                          fileId="mqtt-ca-certificate"
                          fileName={formData.mqttCaCertificateName}
                          fileSize={formData.mqttCaCertificateSize}
                          onFileChange={handleMqttCaCertificateUpload}
                          onRemove={removeMqttCaCertificate}
                          accept=".crt,.pem,.cer,.der"
                        />
                      )}

                      {/* Self-signed server & client certification - 3 certificates */}
                      {formData.mqttSslMode === 'self-signed-both' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <FileUploadComponent
                            label="CA certificate"
                            fileId="mqtt-ca-certificate"
                            fileName={formData.mqttCaCertificateName}
                            fileSize={formData.mqttCaCertificateSize}
                            onFileChange={handleMqttCaCertificateUpload}
                            onRemove={removeMqttCaCertificate}
                            accept=".crt,.pem,.cer,.der"
                          />
                          <FileUploadComponent
                            label="Client certificate"
                            fileId="mqtt-client-certificate"
                            fileName={formData.mqttClientCertificateName}
                            fileSize={formData.mqttClientCertificateSize}
                            onFileChange={handleMqttClientCertificateUpload}
                            onRemove={removeMqttClientCertificate}
                            accept=".crt,.pem,.cer,.der"
                          />
                          <FileUploadComponent
                            label="Client key"
                            fileId="mqtt-client-key"
                            fileName={formData.mqttClientKeyName}
                            fileSize={formData.mqttClientKeySize}
                            onFileChange={handleMqttClientKeyUpload}
                            onRemove={removeMqttClientKey}
                            accept=".key,.pem"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Basic Station Configuration */}
                  {formData.loraMode === 'basic-station' && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      marginBottom: '16px'
                    }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Basic Station Server Type
                        </label>
                        <select
                          value={formData.basicStationServerType}
                          onChange={(e) => handleInputChange('basicStationServerType', e.target.value)}
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="" disabled>
                            Select server type
                          </option>
                          <option value="cups-boot">CUPS-BOOT Server</option>
                          <option value="cups">CUPS Server</option>
                          <option value="lns">LNS Server</option>
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Server URL
                        </label>
                        <input
                          type="text"
                          value={formData.basicStationServerUrl}
                          onChange={(e) => handleInputChange('basicStationServerUrl', e.target.value)}
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Server Port
                        </label>
                        <input
                          type="number"
                          value={formData.basicStationServerPort}
                          onChange={(e) => handleInputChange('basicStationServerPort', e.target.value ? parseInt(e.target.value) : '')}
                          min="1"
                          max="65535"
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Authentication Mode
                        </label>
                        <select
                          value={formData.basicStationAuthMode}
                          onChange={(e) => handleInputChange('basicStationAuthMode', e.target.value)}
                          style={{
                            width: '100%',
                            height: '36px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            padding: '0 10px',
                            background: '#fff',
                            color: '#1f2937',
                            outline: 'none',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="none">None</option>
                          <option value="tls-server">TLS Server Authentication</option>
                          <option value="tls-server-client">TLS Server & Client Authentication</option>
                          <option value="tls-server-client-token">TLS Server & Client Token Authentication</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Certificate Upload Area - shown for TLS Server Authentication */}
                  {formData.loraMode === 'basic-station' && formData.basicStationAuthMode === 'tls-server' && (
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '16px',
                      marginBottom: '16px'
                    }}>
                      <h5 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                        Authentication Configuration
                      </h5>
                      <FileUploadComponent
                        label="Trust (CA Certificate)"
                        fileId="trust-ca-certificate"
                        fileName={formData.trustCaCertificateName}
                        fileSize={formData.trustCaCertificateSize}
                        onFileChange={handleTrustCaCertificateUpload}
                        onRemove={removeTrustCaCertificate}
                        accept=".crt,.pem,.cer,.der"
                        disabled={formData.basicStationBatchTtn}
                      />
                      {formData.basicStationBatchTtn && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
                          File upload is disabled when batch add to TTN is enabled
                        </div>
                      )}
                    </div>
                  )}

                  {/* Certificate Upload Area - shown for TLS Server & Client Authentication */}
                  {formData.loraMode === 'basic-station' && formData.basicStationAuthMode === 'tls-server-client' && (
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '16px',
                      marginBottom: '16px'
                    }}>
                      <h5 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                        Authentication Configuration
                      </h5>
                      <FileUploadComponent
                        label="Trust (CA Certificate)"
                        fileId="trust-ca-certificate-client"
                        fileName={formData.trustCaCertificateName}
                        fileSize={formData.trustCaCertificateSize}
                        onFileChange={handleTrustCaCertificateUpload}
                        onRemove={removeTrustCaCertificate}
                        accept=".crt,.pem,.cer,.der"
                        disabled={formData.basicStationBatchAwsIot || formData.basicStationBatchTtn}
                      />
                      <FileUploadComponent
                        label="Client certificate"
                        fileId="client-certificate"
                        fileName={formData.clientCertificateName}
                        fileSize={formData.clientCertificateSize}
                        onFileChange={handleClientCertificateUpload}
                        onRemove={removeClientCertificate}
                        accept=".crt,.pem,.cer,.der"
                        disabled={formData.basicStationZtp || formData.basicStationBatchAwsIot}
                      />
                      <FileUploadComponent
                        label="Client key"
                        fileId="client-key"
                        fileName={formData.clientKeyName}
                        fileSize={formData.clientKeySize}
                        onFileChange={handleClientKeyUpload}
                        onRemove={removeClientKey}
                        accept=".key,.pem,.der"
                        disabled={formData.basicStationZtp || formData.basicStationBatchAwsIot}
                      />
                      {formData.basicStationZtp && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
                          Client certificate and key uploads are disabled when ZTP is enabled
                        </div>
                      )}
                      {formData.basicStationBatchAwsIot && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
                          File uploads are disabled when batch add to AWS is enabled
                        </div>
                      )}
                      {formData.basicStationBatchTtn && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
                          File uploads are disabled when batch add to TTN is enabled
                        </div>
                      )}
                    </div>
                  )}

                  {/* Certificate Upload and Client Token - shown for TLS Server & Client Token Authentication */}
                  {formData.loraMode === 'basic-station' && formData.basicStationAuthMode === 'tls-server-client-token' && (
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '16px',
                      marginBottom: '16px'
                    }}>
                      <h5 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                        Authentication Configuration
                      </h5>
                      <FileUploadComponent
                        label="Trust (CA Certificate)"
                        fileId="trust-ca-certificate-token"
                        fileName={formData.trustCaCertificateName}
                        fileSize={formData.trustCaCertificateSize}
                        onFileChange={handleTrustCaCertificateUpload}
                        onRemove={removeTrustCaCertificate}
                        accept=".crt,.pem,.cer,.der"
                        disabled={formData.basicStationBatchTtn}
                      />
                      {formData.basicStationBatchTtn && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
                          File upload is disabled when batch add to TTN is enabled
                        </div>
                      )}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                          Client Token
                        </label>
                        <input
                          type="text"
                          value={formData.clientToken}
                            onChange={(e) => handleInputChange('clientToken', e.target.value)}
                            placeholder="Authorization: Bearer"
                            disabled={formData.basicStationBatchTtn || formData.basicStationZtp}
                            style={{
                              width: '100%',
                              height: '36px',
                              border: (formData.basicStationBatchTtn || formData.basicStationZtp) ? '1px solid #d1d5db' : '1px solid #e5e7eb',
                              borderRadius: '6px',
                              padding: '0 10px',
                              background: (formData.basicStationBatchTtn || formData.basicStationZtp) ? '#f9fafb' : '#fff',
                              color: (formData.basicStationBatchTtn || formData.basicStationZtp) ? '#9ca3af' : '#1f2937',
                              outline: 'none',
                              fontSize: '14px',
                              cursor: (formData.basicStationBatchTtn || formData.basicStationZtp) ? 'not-allowed' : 'text'
                            }}
                          />
                          {formData.basicStationBatchTtn && (
                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                              Client Token is disabled when Batch add to TTN is selected
                          </div>
                        )}
                        {formData.basicStationZtp && !formData.basicStationBatchTtn && (
                          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                            Client Token is disabled when ZTP is enabled
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ZTP Configuration Area */}
                  {(formData.basicStationAuthMode === 'tls-server-client' || formData.basicStationAuthMode === 'tls-server-client-token') && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={formData.basicStationZtp}
                            onChange={(e) => {
                              handleInputChange('basicStationZtp', e.target.checked);
                              if (e.target.checked) {
                                handleInputChange('basicStationBatchTtn', false);
                                handleInputChange('basicStationBatchAwsIot', false);
                              }
                            }}
                            style={{ width: '16px', height: '16px', accentColor: '#6b7280' }}
                          />
                          <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                            ZTP
                          </label>
                        </div>
                        {formData.basicStationAuthMode === 'tls-server-client' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              checked={formData.basicStationBatchAwsIot}
                              onChange={(e) => {
                                handleInputChange('basicStationBatchAwsIot', e.target.checked);
                                if (e.target.checked) {
                                  handleInputChange('basicStationZtp', false);
                                }
                              }}
                              style={{ width: '16px', height: '16px', accentColor: '#6b7280' }}
                            />
                            <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                              Batch add to AWS IoT Core
                            </label>
                          </div>
                        )}
                        {formData.basicStationAuthMode === 'tls-server-client-token' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              checked={formData.basicStationBatchTtn}
                              onChange={(e) => {
                                handleInputChange('basicStationBatchTtn', e.target.checked);
                                if (e.target.checked) {
                                  handleInputChange('basicStationZtp', false);
                                }
                              }}
                              style={{ width: '16px', height: '16px', accentColor: '#6b7280' }}
                            />
                            <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                              Batch add to TTN
                            </label>
                          </div>
                        )}
                      </div>

                      {/* AWS Configuration (for TLS Server & Client Authentication with ZTP) */}
                      {formData.basicStationAuthMode === 'tls-server-client' && formData.basicStationZtp && (
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '16px',
                          marginBottom: '16px'
                        }}>
                          <h5 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                            AWS IoT Core Configuration
                          </h5>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                                AWS Access Key ID
                              </label>
                              <input
                                type="text"
                                value={formData.awsAccessKeyId}
                                onChange={(e) => handleInputChange('awsAccessKeyId', e.target.value)}
                                placeholder="Enter AWS Access Key ID"
                                style={{
                                  width: '100%',
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                                AWS Secret Access Key
                              </label>
                              <input
                                type="text"
                                value={formData.awsSecretAccessKey}
                                onChange={(e) => handleInputChange('awsSecretAccessKey', e.target.value)}
                                placeholder="Enter AWS Secret Access Key"
                                style={{
                                  width: '100%',
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                                Default Region Name
                              </label>
                              <input
                                type="text"
                                value={formData.awsDefaultRegion}
                                onChange={(e) => handleInputChange('awsDefaultRegion', e.target.value)}
                                placeholder="Enter Default Region Name"
                                style={{
                                  width: '100%',
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                                Gateway Name Rule
                              </label>
                              <input
                                type="text"
                                value={formData.awsGatewayNameRule}
                                onChange={(e) => handleInputChange('awsGatewayNameRule', e.target.value)}
                                placeholder="Enter Gateway Name Rule"
                                style={{
                                  width: '100%',
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                                Gateway Description Rule
                              </label>
                              <input
                                type="text"
                                value={formData.awsGatewayDescriptionRule}
                                onChange={(e) => handleInputChange('awsGatewayDescriptionRule', e.target.value)}
                                placeholder="Enter Gateway Description Rule"
                                style={{
                                  width: '100%',
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={formData.awsUseClassBMode}
                                  onChange={(e) => handleInputChange('awsUseClassBMode', e.target.checked)}
                                  style={{ width: '16px', height: '16px', accentColor: '#6b7280' }}
                                />
                                <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                                  Use Class B mode?
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Batch AWS File Upload Area (for TLS Server & Client Authentication without ZTP) */}
                      {formData.basicStationAuthMode === 'tls-server-client' && formData.basicStationBatchAwsIot && !formData.basicStationZtp && (
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '16px',
                          marginBottom: '16px'
                        }}>
                          <h5 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                            Batch add to AWS File
                          </h5>
                          <FileUploadComponent
                            label="Batch add to AWS File"
                            fileId="batch-aws-file"
                            fileName={formData.batchAwsFileName}
                            fileSize={formData.batchAwsFileSize}
                            onFileChange={handleBatchAwsFileUpload}
                            onRemove={removeBatchAwsFile}
                            accept=".json,.csv,.txt"
                          />
                        </div>
                      )}

                      {/* TTN Configuration (for TLS Server & Client Token Authentication with ZTP) */}
                      {formData.basicStationAuthMode === 'tls-server-client-token' && formData.basicStationZtp && (
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '16px',
                          marginBottom: '16px'
                        }}>
                          <h5 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                            TTN Configuration
                          </h5>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                                Admin Token
                              </label>
                              <input
                                type="text"
                                value={formData.ttnAdminToken}
                                onChange={(e) => handleInputChange('ttnAdminToken', e.target.value)}
                                placeholder="Enter Admin Token"
                                style={{
                                  width: '100%',
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                                Frequency Plan
                              </label>
                              <select
                                value={formData.ttnFrequencyPlan}
                                onChange={(e) => handleInputChange('ttnFrequencyPlan', e.target.value)}
                                style={{
                                  width: '100%',
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="">Please select frequency plan</option>
                                
                                {/* European frequency plans */}
                                <optgroup label="Europe">
                                  <option value="EU_863_870_SF12">Europe 863-870 MHz (SF12 for RX2)</option>
                                  <option value="EU_863_870_SF9">Europe 863-870 MHz (SF9 for RX2 - recommended)</option>
                                  <option value="EU_863_870_ROAMING">Europe 863-870 MHz, 6 channels for roaming (Draft)</option>
                                  <option value="EU_868_1">Europe 868.1 MHz</option>
                                  <option value="EU_433">Europe 433 MHz (ITU region 1)</option>
                                </optgroup>
                                
                                {/* US frequency plans */}
                                <optgroup label="United States">
                                  <option value="US_902_928_FSB1">United States 902-928 MHz, FSB 1</option>
                                  <option value="US_902_928_FSB2">United States 902-928 MHz, FSB 2 (used by TTN)</option>
                                  <option value="US_902_928_FSB3">United States 902-928 MHz, FSB 3</option>
                                  <option value="US_902_928_FSB4">United States 902-928 MHz, FSB 4</option>
                                  <option value="US_902_928_FSB5">United States 902-928 MHz, FSB 5</option>
                                  <option value="US_902_928_FSB6">United States 902-928 MHz, FSB 6</option>
                                  <option value="US_902_928_FSB7">United States 902-928 MHz, FSB 7</option>
                                  <option value="US_902_928_FSB8">United States 902-928 MHz, FSB 8</option>
                                  <option value="US_903_0">United States 903.0 MHz</option>
                                </optgroup>
                                
                                {/* Australian frequency plans */}
                                <optgroup label="Australia">
                                  <option value="AU_915_928_FSB1">Australia 915-928 MHz, FSB 1</option>
                                  <option value="AU_915_928_FSB2">Australia 915-928 MHz, FSB 2 (used by TTN)</option>
                                  <option value="AU_915_928_FSB3">Australia 915-928 MHz, FSB 3</option>
                                  <option value="AU_915_928_FSB4">Australia 915-928 MHz, FSB 4</option>
                                  <option value="AU_915_928_FSB5">Australia 915-928 MHz, FSB 5</option>
                                  <option value="AU_915_928_FSB6">Australia 915-928 MHz, FSB 6</option>
                                  <option value="AU_915_928_FSB7">Australia 915-928 MHz, FSB 7</option>
                                  <option value="AU_915_928_FSB8">Australia 915-928 MHz, FSB 8</option>
                                </optgroup>
                                
                                {/* Chinese frequency plans */}
                                <optgroup label="China">
                                  <option value="CN_470_510_FSB1">China 470-510 MHz, FSB 1</option>
                                  <option value="CN_470_510_FSB11">China 470-510 MHz, FSB 11 (used by TTN)</option>
                                </optgroup>
                                
                                {/* Asian frequency plans */}
                                <optgroup label="Asia">
                                  <option value="AS_920_923">Asia 920-923 MHz</option>
                                  <option value="AS_920_923_LBT">Asia 920-923 MHz with LBT</option>
                                  <option value="AS_920_923_LBT_CH31_38">Asia 920-923 MHz with LBT (channels 31-38)</option>
                                  <option value="AS_920_923_LBT_CH31_38_EIRP27">Asia 920-923 MHz with LBT (channels 31-38), Max EIRP 27 dBm</option>
                                  <option value="AS_920_923_LBT_CH24_27_35_38">Asia 920-923 MHz with LBT (channels 24-27 and 35-38)</option>
                                  <option value="AS_920_923_LBT_CH24_31">Asia 920-923 MHz with LBT (channels 24-31)</option>
                                  <option value="AS_920_923_LBT_CH24_31_EIRP27">Asia 920-923 MHz with LBT (channels 24-31), Max EIRP 27 dBm</option>
                                  
                                  {/* AS923 Group 1 */}
                                  <option value="AS_915_928_AS923_G1">Asia 915-928 MHz (AS923 Group 1) with only default channels</option>
                                  <option value="AS_915_928_AS923_G1_DWELL_DISABLED">Asia 915-928 MHz (AS923 Group 1) with only default channels and dwell time disabled</option>
                                  <option value="AS_915_928_AS923_G1_DWELL_ENABLED">Asia 915-928 MHz (AS923 Group 1) with only default channels and dwell time enabled</option>
                                  
                                  {/* AS923 Group 2 */}
                                  <option value="AS_920_923_AS923_G2">Asia 920-923 MHz (AS923 Group 2) with only default channels</option>
                                  <option value="AS_920_923_AS923_G2_DWELL_DISABLED">Asia 920-923 MHz (AS923 Group 2) with only default channels and dwell time disabled</option>
                                  <option value="AS_920_923_AS923_G2_DWELL_ENABLED">Asia 920-923 MHz (AS923 Group 2) with only default channels and dwell time enabled</option>
                                  
                                  {/* AS923 Group 3 */}
                                  <option value="AS_915_921_AS923_G3">Asia 915-921 MHz (AS923 Group 3) with only default channels</option>
                                  <option value="AS_920_923_AS923_G3_DWELL_DISABLED">Asia 920-923 MHz (AS923 Group 3) with only default channels and dwell time disabled</option>
                                  <option value="AS_920_923_AS923_G3_DWELL_ENABLED">Asia 920-923 MHz (AS923 Group 3) with only default channels and dwell time enabled</option>
                                  
                                  {/* AS923 Group 4 */}
                                  <option value="AS_917_920_AS923_G4">Asia 917-920 MHz (AS923 Group 4) with only default channels</option>
                                  <option value="AS_920_923_AS923_G4_DWELL_DISABLED">Asia 920-923 MHz (AS923 Group 4) with only default channels and dwell time disabled</option>
                                  <option value="AS_920_923_AS923_G4_DWELL_ENABLED">Asia 920-923 MHz (AS923 Group 4) with only default channels and dwell time enabled</option>
                                  
                                  {/* Other Asian configurations */}
                                  <option value="AS_923_925">Asia 923-925 MHz</option>
                                  <option value="AS_923_925_LBT">Asia 923-925 MHz with LBT</option>
                                  <option value="AS_920_923_TTN_AU">Asia 920-923 MHz (used by TTN Australia)</option>
                                  <option value="AS_923_925_TTN_AU_SECONDARY">Asia 923-925 MHz (used by TTN Australia - secondary channels)</option>
                                </optgroup>
                                
                                {/* Other countries frequency plans */}
                                <optgroup label="Other Countries">
                                  <option value="KR_920_923">South Korea 920-923 MHz</option>
                                  <option value="MA_869_870">Morocco 869-870 MHz</option>
                                  <option value="IN_865_867">India 865-867 MHz</option>
                                  <option value="RU_864_870">Russia 864-870 MHz</option>
                                  <option value="LORA_2_4GHZ">LoRa 2.4 GHz with 3 channels (Draft 2)</option>
                                  <option value="IL_917_920_CH1_4_11_14">Israel 917-920 MHz with channels 1-4 and 11-14</option>
                                  <option value="IL_917_920_CH1_7_9">Israel 917-920 MHz with channels 1-7 and 9</option>
                                  <option value="SG_920_923">Singapore 920-923 MHz</option>
                                  <option value="UZ_915_928">Uzbekistan 915-928 MHz with only default channels</option>
                                </optgroup>
                                
                                {/* General options */}
                                <optgroup label="General">
                                  <option value="NO_FREQUENCY_PLAN">Do not set a frequency plan</option>
                                </optgroup>
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', fontWeight: '500', marginBottom: '6px' }}>
                                Gateway ID
                              </label>
                              <input
                                type="text"
                                value={formData.ttnGatewayId}
                                onChange={(e) => handleInputChange('ttnGatewayId', e.target.value)}
                                placeholder="Enter Gateway ID or Rule"
                                style={{
                                  width: '100%',
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                            </div>
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
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Batch TTN File Upload - shown when Batch add to TTN is checked */}
                  {formData.loraMode === 'basic-station' && formData.basicStationAuthMode === 'tls-server-client-token' && formData.basicStationBatchTtn && (
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '16px',
                      marginBottom: '16px'
                    }}>
                      <h5 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                        Batch TTN Configuration
                      </h5>
                      <FileUploadComponent
                        label="Batch add to TTN File"
                        fileId="batch-ttn-file"
                        fileName={formData.batchTtnFileName}
                        fileSize={formData.batchTtnFileSize}
                        onFileChange={handleBatchTtnFileUpload}
                        onRemove={removeBatchTtnFile}
                        accept=".json,.csv,.txt"
                      />
                    </div>
                  )}

                  {/* White List Mode Configuration */}
                  <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '16px',
                    marginTop: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
                      <label style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>
                        White List Mode
                      </label>
                      <label style={{
                        display: 'inline-block',
                        position: 'relative',
                        width: '48px',
                        height: '24px',
                        cursor: 'pointer'
                      }}>
                        <input
                          type="checkbox"
                          checked={formData.loraWhitelistMode}
                          onChange={(e) => handleInputChange('loraWhitelistMode', e.target.checked)}
                          style={{ display: 'none' }}
                        />
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: formData.loraWhitelistMode ? '#7c3aed' : '#d1d5db',
                          borderRadius: '24px',
                          transition: 'background-color 0.3s'
                        }}>
                          <div style={{
                            position: 'absolute',
                            top: '2px',
                            left: formData.loraWhitelistMode ? '26px' : '2px',
                            width: '20px',
                            height: '20px',
                            background: '#ffffff',
                            borderRadius: '50%',
                            transition: 'left 0.3s'
                          }} />
                        </div>
                      </label>
                    </div>
                    
                    {formData.loraWhitelistMode && (
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '14px', color: '#1f2937', fontWeight: '500', marginBottom: '8px' }}>
                              OUI
                            </label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={formData.whitelistOui}
                                onChange={(e) => handleInputChange('whitelistOui', e.target.value)}
                                placeholder="Enter OUI"
                                style={{
                                  flex: 1,
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (formData.whitelistOui.trim()) {
                                    handleInputChange('whitelistOuiList', [...formData.whitelistOuiList, formData.whitelistOui.trim()]);
                                    handleInputChange('whitelistOui', '');
                                  }
                                }}
                                style={{
                                  height: '36px',
                                  padding: '0 16px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  background: '#fff',
                                  color: '#6b7280',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: '500',
                                  transition: 'all 0.2s'
                                }}
                              >
                                Add
                              </button>
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '14px', color: '#1f2937', fontWeight: '500', marginBottom: '8px' }}>
                              Network ID
                            </label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={formData.whitelistNetworkId}
                                onChange={(e) => handleInputChange('whitelistNetworkId', e.target.value)}
                                placeholder="Enter Network ID"
                                style={{
                                  flex: 1,
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (formData.whitelistNetworkId.trim()) {
                                    handleInputChange('whitelistNetworkIdList', [...formData.whitelistNetworkIdList, formData.whitelistNetworkId.trim()]);
                                    handleInputChange('whitelistNetworkId', '');
                                  }
                                }}
                                style={{
                                  height: '36px',
                                  padding: '0 16px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  background: '#fff',
                                  color: '#6b7280',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: '500',
                                  transition: 'all 0.2s'
                                }}
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                          <div>
                            <h4 style={{ fontSize: '14px', color: '#1f2937', fontWeight: '600', margin: '0 0 8px 0', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>
                              OUI List
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '40px' }}>
                              {formData.whitelistOuiList.map((oui, index) => (
                                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                                  <span style={{ fontSize: '13px', color: '#1f2937', fontFamily: 'monospace' }}>{oui}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newList = formData.whitelistOuiList.filter((_, i) => i !== index);
                                      handleInputChange('whitelistOuiList', newList);
                                    }}
                                    style={{
                                      width: '20px',
                                      height: '20px',
                                      border: '1px solid #e5e7eb',
                                      background: '#fff',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '12px',
                                      color: '#dc2626',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 style={{ fontSize: '14px', color: '#1f2937', fontWeight: '600', margin: '0 0 8px 0', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>
                              Network ID List
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '40px' }}>
                              {formData.whitelistNetworkIdList.map((networkId, index) => (
                                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                                  <span style={{ fontSize: '13px', color: '#1f2937', fontFamily: 'monospace' }}>{networkId}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newList = formData.whitelistNetworkIdList.filter((_, i) => i !== index);
                                      handleInputChange('whitelistNetworkIdList', newList);
                                    }}
                                    style={{
                                      width: '20px',
                                      height: '20px',
                                      border: '1px solid #e5e7eb',
                                      background: '#fff',
                                      borderRadius: '3px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '12px',
                                      color: '#dc2626',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* System Configuration */}
          <section style={{ marginBottom: '32px' }}>
            <div 
              style={{ 
                marginBottom: '20px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background-color 0.2s',
                padding: '8px',
                borderRadius: '4px'
              }}
              onClick={() => togglePanel('system')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0,
                fontFamily: 'Inter, sans-serif'
              }}>
                System Configuration
              </h2>
              <div style={{
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '8px solid #000000',
                transition: 'all 0.3s ease',
                transform: panelStates.system ? 'rotate(180deg)' : 'rotate(0deg)'
              }} />
            </div>
            
            {panelStates.system && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '20px'
              }}>


                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    margin: '0 0 16px 0',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    System Settings
                  </h3>
                  
                {/* Gateway Login Configuration */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '16px',
                  marginTop: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                    Gateway Login Configuration
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                      Gateway login password
                    </label>
                    <input
                      type="text"
                      value={formData.generalPassword}
                      onChange={(e) => handleInputChange('generalPassword', e.target.value)}
                      placeholder="Enter login password or rules"
                      style={{
                        width: '100%',
                        height: '36px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        padding: '0 10px',
                        background: '#fff',
                        color: '#1f2937',
                        outline: 'none',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>

                {/* WisDM Configuration */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '16px',
                  marginTop: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                    WisDM Configuration
                  </div>
                  
                  {/* WisDM Toggle Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <label style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>
                      WisDM
                    </label>
                    <div
                      style={{
                        position: 'relative',
                        width: '44px',
                        height: '24px',
                        background: formData.wisdmEnabled ? '#7c3aed' : '#d1d5db',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        border: 'none',
                        outline: 'none'
                      }}
                      onClick={() => handleInputChange('wisdmEnabled', !formData.wisdmEnabled)}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: formData.wisdmEnabled ? '22px' : '2px',
                          width: '20px',
                          height: '20px',
                          background: '#fff',
                          borderRadius: '50%',
                          transition: 'all 0.3s ease',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}
                      />
                    </div>
                  </div>
                  
                  {formData.wisdmEnabled && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={formData.wisdmConnect}
                          onChange={(e) => handleInputChange('wisdmConnect', e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                        />
                        <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                          WisDM Provisioning
                        </label>
                      </div>
                      
                      {formData.wisdmConnect && (
                    <div style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                            WisDM Org Name
                          </label>
                          <input
                            type="text"
                            value={formData.wisdmOrgName}
                            onChange={(e) => handleInputChange('wisdmOrgName', e.target.value)}
                            placeholder="Enter WisDM organization name"
                            style={{
                              width: '100%',
                              height: '36px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              padding: '0 10px',
                              background: '#fff',
                              color: '#1f2937',
                              outline: 'none',
                              fontSize: '14px'
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                            Subdomain
                          </label>
                          <input
                            type="text"
                            value={formData.wisdmUrl}
                            onChange={(e) => handleInputChange('wisdmUrl', e.target.value)}
                            placeholder="Enter subdomain address"
                            style={{
                              width: '100%',
                              height: '36px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              padding: '0 10px',
                              background: '#fff',
                              color: '#1f2937',
                              outline: 'none',
                              fontSize: '14px'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                      )}
                    </>
                  )}
                </div>

                {/* Log Settings */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '16px',
                  marginTop: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                    Log Settings
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                        Local Log Expiration
                      </label>
                      <select
                        value={formData.logExpiration}
                        onChange={(e) => handleInputChange('logExpiration', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '0 10px',
                          background: '#fff',
                          color: '#1f2937',
                          outline: 'none',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="" disabled>
                          Select log expiration
                        </option>
                        <option value="14-days">14 days</option>
                        <option value="1-month">1 month</option>
                        <option value="3-month">3 month</option>
                        <option value="6-month">6 month</option>
                        <option value="12-month">12 month</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={formData.shareLog}
                          onChange={(e) => handleInputChange('shareLog', e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                        />
                        <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                          Share log with WisDM
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  {formData.shareLog && (
                    <div style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                            WisDM Log Retrieval Cycle
                          </label>
                          <select
                            value={formData.logRetrievalCycle}
                            onChange={(e) => handleInputChange('logRetrievalCycle', e.target.value)}
                            style={{
                              width: '100%',
                              height: '36px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              padding: '0 10px',
                              background: '#fff',
                              color: '#1f2937',
                              outline: 'none',
                              fontSize: '14px',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="" disabled>
                              Select retrieval cycle
                            </option>
                            <option value="1-hour">1 hour</option>
                            <option value="2-hours">2 hours</option>
                            <option value="4-hours">4 hours</option>
                            <option value="8-hours">8 hours</option>
                            <option value="12-hours">12 hours</option>
                            <option value="24-hours">24 hours</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                            WisDM File Rotation Cycle
                          </label>
                          <select
                            value={formData.fileRotationCycle}
                            onChange={(e) => handleInputChange('fileRotationCycle', e.target.value)}
                            style={{
                              width: '100%',
                              height: '36px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              padding: '0 10px',
                              background: '#fff',
                              color: '#1f2937',
                              outline: 'none',
                              fontSize: '14px',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="" disabled>
                              Select rotation cycle
                            </option>
                            <option value="1-day">1 day</option>
                            <option value="7-days">7 days</option>
                            <option value="14-days">14 days</option>
                            <option value="30-days">30 days</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* System Time Configuration */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '16px',
                  marginTop: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                    System Time Configuration
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    {/* Timezone Field - Full Width */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                        Timezone
                      </label>
                      <input
                        type="text"
                        value={formData.systemTime}
                        onChange={(e) => handleInputChange('systemTime', e.target.value)}
                        placeholder="Enter your timezone"
                        style={{
                          width: '100%',
                          height: '36px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '0 10px',
                          background: '#fff',
                          color: '#1f2937',
                          outline: 'none',
                          fontSize: '14px'
                        }}
                      />
                    </div>
                    
                    {/* NTP Settings */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                        NTP Settings
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '14px', color: '#1f2937' }}>NTP Client</span>
                        <div
                          style={{
                            position: 'relative',
                            width: '44px',
                            height: '24px',
                            background: formData.ntpEnabled ? '#7c3aed' : '#d1d5db',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onClick={() => handleInputChange('ntpEnabled', !formData.ntpEnabled)}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: formData.ntpEnabled ? '22px' : '2px',
                              width: '20px',
                              height: '20px',
                              background: '#fff',
                              borderRadius: '50%',
                              transition: 'left 0.2s',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* NTP Servers Section - Full Width */}
                    {formData.ntpEnabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                          NTP Server Candidates (Max 5)
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {formData.ntpServers.map((server, index) => (
                            <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={server ?? ''}
                                onChange={(e) => {
                                  const newServers = [...formData.ntpServers];
                                  newServers[index] = e.target.value;
                                  handleInputChange('ntpServers', newServers);
                                }}
                                placeholder="0.openwrt.pool.ntp.org"
                                style={{
                                  flex: 1,
                                  height: '36px',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  padding: '0 10px',
                                  background: '#fff',
                                  color: '#1f2937',
                                  outline: 'none',
                                  fontSize: '14px'
                                }}
                              />
                              {formData.ntpServers.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newServers = formData.ntpServers.filter((_, i) => i !== index);
                                    handleInputChange('ntpServers', newServers);
                                  }}
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    background: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                          {formData.ntpServers.length < 5 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newServers = [...formData.ntpServers, ''];
                                handleInputChange('ntpServers', newServers);
                              }}
                              style={{
                                width: '32px',
                                height: '32px',
                                background: '#7c3aed',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                alignSelf: 'flex-start'
                              }}
                            >
                              +
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Gateway Configuration */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '16px',
                  marginTop: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                    Gateway Configuration
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                      Gateway Name
                    </label>
                    <input
                      type="text"
                      value={formData.gatewayName}
                      onChange={(e) => handleInputChange('gatewayName', e.target.value)}
                      placeholder="Enter Gateway Name or rules"
                      style={{
                        width: '100%',
                        height: '36px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        padding: '0 10px',
                        background: '#fff',
                        color: '#1f2937',
                        outline: 'none',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>

                {/* SSH Configuration */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '16px',
                  marginTop: '12px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                    SSH Configuration
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={formData.sshDisable}
                        onChange={(e) => handleInputChange('sshDisable', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <label style={{ fontSize: '14px', color: '#1f2937', cursor: 'pointer' }}>
                        Disable SSH
                      </label>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '500' }}>
                        Description
                      </label>
                      <textarea
                        value={formData.sshDescription}
                        onChange={(e) => handleInputChange('sshDescription', e.target.value)}
                        placeholder="Enter SSH configuration description"
                        rows={3}
                        style={{
                          width: '100%',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '10px',
                          background: '#fff',
                          color: '#1f2937',
                          outline: 'none',
                          fontSize: '14px',
                          resize: 'vertical',
                          minHeight: '80px'
                        }}
                      />
                    </div>
                  </div>
                </div>
                </div>
              </div>
            )}
          </section>

          {/* Pre-installed Extension */}
          <section style={{ marginBottom: '32px' }}>
            <div 
              style={{ 
                marginBottom: '20px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background-color 0.2s',
                padding: '8px',
                borderRadius: '4px'
              }}
              onClick={() => togglePanel('extension')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0,
                fontFamily: 'Inter, sans-serif'
              }}>
                Pre-installed Extension
              </h2>
              <div style={{
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '8px solid #000000',
                transition: 'all 0.3s ease',
                transform: panelStates.extension ? 'rotate(180deg)' : 'rotate(0deg)'
              }} />
            </div>
            
            {panelStates.extension && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '20px'
              }}>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    margin: '0 0 16px 0',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Extension Options
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.rakBreathingLight}
                        onChange={(e) => handleInputChange('rakBreathingLight', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>RAK Breathing Light</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.rakCountrySettings}
                        onChange={(e) => handleInputChange('rakCountrySettings', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>RAK Country Settings</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.rakCustomLogo}
                        onChange={(e) => handleInputChange('rakCustomLogo', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>RAK Custom Logo</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.failoverReboot}
                        onChange={(e) => handleInputChange('failoverReboot', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>Failover Reboot</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.fieldTestDataProcessor}
                        onChange={(e) => handleInputChange('fieldTestDataProcessor', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>Field Test Data Processor</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.rakOpenClosePort}
                        onChange={(e) => handleInputChange('rakOpenClosePort', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>RAK Open/Close Port</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.rakOpenvpnClient}
                        onChange={(e) => handleInputChange('rakOpenvpnClient', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>RAK OpenVPN Client</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.operationAndMaintenance}
                        onChange={(e) => handleInputChange('operationAndMaintenance', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>Operation & Maintenance</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.rakSolarBattery}
                        onChange={(e) => handleInputChange('rakSolarBattery', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>RAK Solar Battery</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.rfSpectrumScanner}
                        onChange={(e) => handleInputChange('rfSpectrumScanner', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>RF Spectrum Scanner</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.wifiReboot}
                        onChange={(e) => handleInputChange('wifiReboot', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>WiFi Reboot</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.rakWireguard}
                        onChange={(e) => handleInputChange('rakWireguard', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>RAK Wireguard</span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.loraPacketLogger}
                        onChange={(e) => handleInputChange('loraPacketLogger', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#7c3aed' }}
                      />
                      <span style={{ fontSize: '14px' }}>LoRa Packet Logger</span>
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    margin: '0 0 16px 0',
                    fontFamily: 'Inter, sans-serif'
                  }}>
                    Configuration Description
                  </h3>
                  
                  <div>
                    <textarea
                      value={formData.configDescription}
                      onChange={(e) => handleInputChange('configDescription', e.target.value)}
                      placeholder="Enter configuration description..."
                      rows={4}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        outline: 'none',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>

                {/* File Upload Section */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    File Upload
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        type="button"
                        onClick={() => document.getElementById('extension-file-upload')?.click()}
                        style={{
                          padding: '8px 16px',
                          background: '#7c3aed',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#6d28d9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#7c3aed'}
                      >
                        + Select Files
                      </button>
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>
                        Supports various file formats, unlimited quantity. Max file size: 10MB
                      </span>
                    </div>
                    
                    <input
                      id="extension-file-upload"
                      type="file"
                      accept="*/*"
                      multiple
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          try {
                            // 上传文件到服务器
                            const uploadedFiles = [];
                            const uploadedFileNames = [];
                            const uploadedFileSizes = [];
                            const failedFiles = [];
                            
                            for (const file of files) {
                              const formDataObj = new FormData();
                              formDataObj.append('file', file);
                              
                              const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${useAuthStore.getState().token}`
                                },
                                body: formDataObj
                              });
                              
                              if (response.ok) {
                                const result = await response.json();
                                uploadedFiles.push({
                                  id: result.fileId,
                                  name: file.name,
                                  size: file.size
                                });
                                uploadedFileNames.push(file.name);
                                uploadedFileSizes.push(file.size);
                              } else {
                                const errorText = await response.text();
                                let errorMessage = 'Unknown error';
                                try {
                                  const errorData = JSON.parse(errorText);
                                  errorMessage = errorData.detail || errorData.message || errorMessage;
                                } catch {
                                  errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
                                }
                                failedFiles.push({ name: file.name, error: errorMessage });
                                console.error('Failed to upload file:', file.name, errorMessage);
                              }
                            }
                            
                            // 显示错误提示
                            if (failedFiles.length > 0) {
                              const errorMessages = failedFiles.map(f => `${f.name}: ${f.error}`).join('\n');
                              showError(`Failed to upload ${failedFiles.length} file(s):\n${errorMessages}`);
                            }
                            
                            // 只将成功上传的文件添加到状态中
                            if (uploadedFiles.length > 0) {
                              const currentFiles = formData.extensionFiles || [];
                              const currentNames = formData.extensionFileNames || [];
                              const currentSizes = formData.extensionFileSizes || [];
                              
                              handleInputChange('extensionFiles', [...currentFiles, ...uploadedFiles]);
                              handleInputChange('extensionFileNames', [...currentNames, ...uploadedFileNames]);
                              handleInputChange('extensionFileSizes', [...currentSizes, ...uploadedFileSizes]);
                              
                              if (uploadedFiles.length === files.length) {
                                showSuccess(`Successfully uploaded ${uploadedFiles.length} file(s)`);
                              }
                            }
                            
                            // 清空input以便可以再次选择相同文件
                            e.target.value = '';
                          } catch (error) {
                            console.error('Error uploading files:', error);
                            showError(`Error uploading files: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            // 清空input以便可以再次选择相同文件
                            e.target.value = '';
                          }
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                    
                    {formData.extensionFileNames && formData.extensionFileNames.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        {formData.extensionFileNames.map((fileName, index) => (
                          <div key={index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            background: '#f3f4f6',
                            borderRadius: '6px',
                            marginBottom: '8px',
                            fontSize: '14px',
                            color: '#374151'
                          }}>
                            <span>📄</span>
                            <span style={{ flex: 1 }}>{fileName}</span>
                            <span style={{ color: '#6b7280', fontSize: '12px' }}>
                              ({(formData.extensionFileSizes[index] / 1024).toFixed(1)} KB)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newFileNames = formData.extensionFileNames.filter((_, i) => i !== index);
                                const newFileSizes = formData.extensionFileSizes.filter((_, i) => i !== index);
                                const newFiles = formData.extensionFiles.filter((_, i) => i !== index);
                                handleInputChange('extensionFileNames', newFileNames);
                                handleInputChange('extensionFileSizes', newFileSizes);
                                handleInputChange('extensionFiles', newFiles);
                              }}
                              style={{
                                width: '24px',
                                height: '24px',
                                border: '1px solid #dc2626',
                                background: '#fff',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                color: '#dc2626',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#dc2626';
                                e.currentTarget.style.color = '#fff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#fff';
                                e.currentTarget.style.color = '#dc2626';
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Other Configurations */}
          <section style={{ marginBottom: '32px' }}>
            <div 
              style={{ 
                marginBottom: '20px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'background-color 0.2s',
                padding: '8px',
                borderRadius: '4px'
              }}
              onClick={() => togglePanel('other')}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0,
                fontFamily: 'Inter, sans-serif'
              }}>
                Other Configurations
              </h2>
              <div style={{
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '8px solid #000000',
                transition: 'all 0.3s ease',
                transform: panelStates.other ? 'rotate(180deg)' : 'rotate(0deg)'
              }} />
            </div>
            
            {panelStates.other && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '20px',
                width: '100%',
                boxSizing: 'border-box'
              }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '140px minmax(0, 1fr)', 
                  gap: '16px',
                  width: '100%',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                    Requirements Description
                  </div>
                  <div style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
                    <textarea
                      value={formData.requirements}
                      onChange={(e) => handleInputChange('requirements', e.target.value)}
                      placeholder="Enter other configuration requirements description"
                      rows={4}
                      style={{
                        width: '100%',
                        maxWidth: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        outline: 'none',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center' }}>
                    File Upload
                  </div>
                  <div style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => document.getElementById('config-file-upload')?.click()}
                        style={{
                          padding: '8px 16px',
                          background: '#7c3aed',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'background-color 0.2s',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#6d28d9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#7c3aed'}
                      >
                        + Select Files
                      </button>
                      <span style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.5' }}>
                        Supports various file formats, unlimited quantity. Max file size: 10MB
                      </span>
                    </div>
                    
                    <input
                      id="config-file-upload"
                      type="file"
                      accept=".json,.txt,.csv,.xml,.pdf,.doc,.docx"
                      multiple
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          try {
                            // 上传文件到服务器
                            const uploadedFiles = [];
                            const uploadedFileNames = [];
                            const uploadedFileSizes = [];
                            const failedFiles = [];
                            
                            for (const file of files) {
                              const formData = new FormData();
                              formData.append('file', file);
                              
                              const response = await fetch(`${getApiBaseUrl()}/api/files/upload`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${useAuthStore.getState().token}`
                                },
                                body: formData
                              });
                              
                              if (response.ok) {
                                const result = await response.json();
                                uploadedFiles.push({
                                  id: result.fileId,
                                  name: file.name,
                                  size: file.size
                                });
                                uploadedFileNames.push(file.name);
                                uploadedFileSizes.push(file.size);
                              } else {
                                // 解析错误信息
                                let errorMessage = `Failed to upload ${file.name}`;
                                try {
                                  const errorData = await response.json();
                                  errorMessage = errorData.detail || errorMessage;
                                } catch {
                                  errorMessage = `Failed to upload ${file.name}: ${response.status} ${response.statusText}`;
                                }
                                failedFiles.push({ name: file.name, error: errorMessage });
                                console.error('Failed to upload file:', file.name, errorMessage);
                              }
                            }
                            
                            // 显示错误提示
                            if (failedFiles.length > 0) {
                              const errorMessages = failedFiles.map(f => `${f.name}: ${f.error}`).join('\n');
                              showError(`Failed to upload ${failedFiles.length} file(s):\n${errorMessages}`);
                            }
                            
                            // 只将成功上传的文件添加到状态中
                            if (uploadedFiles.length > 0) {
                              const currentFiles = formData.configFiles || [];
                              const currentNames = formData.configFileNames || [];
                              const currentSizes = formData.configFileSizes || [];
                              
                              handleInputChange('configFiles', [...currentFiles, ...uploadedFiles]);
                              handleInputChange('configFileNames', [...currentNames, ...uploadedFileNames]);
                              handleInputChange('configFileSizes', [...currentSizes, ...uploadedFileSizes]);
                              
                              if (uploadedFiles.length === files.length) {
                                showSuccess(`Successfully uploaded ${uploadedFiles.length} file(s)`);
                              }
                            }
                            
                            // 重置文件输入
                            e.target.value = '';
                          } catch (error) {
                            console.error('Error uploading files:', error);
                            showError(`Error uploading files: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            // 重置文件输入
                            e.target.value = '';
                          }
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                    
                    {formData.configFileNames && formData.configFileNames.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        {formData.configFileNames.map((fileName, index) => (
                          <div key={index} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            background: '#f3f4f6',
                            borderRadius: '6px',
                            marginBottom: '8px',
                            fontSize: '14px',
                            color: '#374151'
                          }}>
                            <span>📄</span>
                            <span style={{ flex: 1 }}>{fileName}</span>
                            <span style={{ color: '#6b7280', fontSize: '12px' }}>
                              ({(formData.configFileSizes[index] / 1024).toFixed(1)} KB)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newFileNames = formData.configFileNames.filter((_, i) => i !== index);
                                const newFileSizes = formData.configFileSizes.filter((_, i) => i !== index);
                                const newFiles = formData.configFiles.filter((_, i) => i !== index);
                                handleInputChange('configFileNames', newFileNames);
                                handleInputChange('configFileSizes', newFileSizes);
                                handleInputChange('configFiles', newFiles);
                              }}
                              style={{
                                width: '24px',
                                height: '24px',
                                border: '1px solid #dc2626',
                                background: '#fff',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                color: '#dc2626',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#dc2626';
                                e.currentTarget.style.color = '#fff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#fff';
                                e.currentTarget.style.color = '#dc2626';
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Submit Button */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '25px',
            marginTop: '32px'
          }}>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                background: isLoading ? '#9ca3af' : '#4c1d95',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: '500',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {isLoading ? 'Saving Configuration...' : 'Save Configuration'}
            </button>
            <button
              type="button"
              onClick={() => {
                // 在打开对话框前先验证必填字段
                if (!validateRequiredFields()) {
                  const missingFields: string[] = []
                  const rakIdValue = (formData.rakId && typeof formData.rakId === 'string') ? formData.rakId.trim() : ''
                  const customerNameValue = (formData.customerName && typeof formData.customerName === 'string') ? formData.customerName.trim() : ''
                  
                  if (!rakIdValue || rakIdValue.length === 0) {
                    missingFields.push('RAK ID')
                  }
                  if (!customerNameValue || customerNameValue.length === 0) {
                    missingFields.push('Name of the company')
                  }
                  
                  showError(`Please fill in the following required fields: ${missingFields.join(', ')}`)
                  
                  // 滚动到第一个错误字段
                  setTimeout(() => {
                    const firstErrorField = document.querySelector('[data-field="rakId"], [data-field="customerName"]')
                    if (firstErrorField) {
                      firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      const input = firstErrorField.querySelector('input')
                      if (input) {
                        input.focus()
                      }
                    }
                  }, 100)
                  return
                }
                setShowSaveTemplateDialog(true)
              }}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                background: isLoading ? '#9ca3af' : '#ffffff',
                color: isLoading ? '#ffffff' : '#7c3aed',
                border: '1px solid #7c3aed',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: '500',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Save as Template
            </button>
          </div>
        </div>

        {/* Template Selector */}
        <TemplateSelector
          isOpen={showTemplateSelector}
          onClose={() => setShowTemplateSelector(false)}
          onSelect={(templateFormData) => {
            // 应用模板数据到表单
            setFormData(prev => ({
              ...prev,
              ...templateFormData
            }))
            setShowTemplateSelector(false)
            showSuccess('Template applied successfully!')
            
            // 注意：使用次数已在 TemplateSelector 的 handleApply 中记录
          }}
        />

        {/* Save Template Dialog */}
        {showSaveTemplateDialog && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '0.5rem',
              padding: '24px',
              width: '90%',
              maxWidth: '500px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                {editTemplateId ? 'Edit Template' : 'Save as Template'}
              </h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Enter template name"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Description
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Enter template description"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>


              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowSaveTemplateDialog(false)
                    if (!editTemplateId) {
                      setTemplateName('')
                      setTemplateDescription('')
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    color: '#374151'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    // 验证模板名称
                    if (!templateName.trim()) {
                      showError('Template name is required')
                      return
                    }

                    // 验证必填字段
                    if (!validateRequiredFields()) {
                      const missingFields: string[] = []
                      const rakIdValue = (formData.rakId && typeof formData.rakId === 'string') ? formData.rakId.trim() : ''
                      const customerNameValue = (formData.customerName && typeof formData.customerName === 'string') ? formData.customerName.trim() : ''
                      
                      if (!rakIdValue || rakIdValue.length === 0) {
                        missingFields.push('RAK ID')
                      }
                      if (!customerNameValue || customerNameValue.length === 0) {
                        missingFields.push('Name of the company')
                      }
                      
                      showError(`Please fill in the following required fields: ${missingFields.join(', ')}`)
                      return
                    }

                    try {
                      // 构建configData（与handleSubmit中相同）
                      const configData = {
                        general: {
                          pid: formData.pid,
                          barcode: formData.barcode,
                          rakId: formData.rakId,
                          gatewayModel: formData.gatewayModel,
                          customerName: formData.customerName,
                          priority: formData.priority,
                          orderDescription: formData.orderDescription,
                          password: formData.generalPassword
                        },
                        network: {
                          wan: {
                            priority: formData.wanPriority,
                            ethernet: { 
                              enabled: formData.wanEthernet,
                              trackingMethod: formData.ethernetTrackingMethod,
                              trackingAddresses: formData.ethernetTrackingAddresses
                            },
                            wifi: { 
                              enabled: formData.wanWifi,
                              ssid: formData.wifiSsid,
                              encryption: formData.wifiEncryption,
                              password: formData.wifiPassword,
                              trackingMethod: formData.wifiTrackingMethod,
                              trackingAddresses: formData.wifiTrackingAddresses
                            },
                            cellular: { 
                              enabled: formData.wanCellular,
                              apn: formData.cellularApn,
                              trackingMethod: formData.cellularTrackingMethod,
                              trackingAddresses: formData.cellularTrackingAddresses
                            }
                          },
                          lan: {
                            ethernet: formData.lanEthernet,
                            wifiAp: { 
                              enabled: formData.wifiApEnabled,
                              ssid: formData.wifiApSsid,
                              encryption: formData.wifiApEncryption,
                              password: formData.wifiApPassword
                            }
                          }
                        },
                        lora: {
                          country: formData.loraCountry,
                          region: formData.loraRegion,
                          mode: formData.loraMode,
                          whitelist: {
                            enabled: formData.loraWhitelistMode,
                            ouiList: formData.whitelistOuiList,
                            networkIdList: formData.whitelistNetworkIdList
                          },
                          ...(formData.loraMode === 'basic-station' && {
                            basicStation: {
                              serverType: formData.basicStationServerType,
                              serverUrl: formData.basicStationServerUrl,
                              serverPort: formData.basicStationServerPort,
                              authMode: formData.basicStationAuthMode,
                              ztp: formData.basicStationZtp,
                              batchTtn: formData.basicStationBatchTtn,
                              batchAwsIot: formData.basicStationBatchAwsIot,
                              trustCaCertificate: formData.trustCaCertificateName ? {
                                name: formData.trustCaCertificateName,
                                size: formData.trustCaCertificateSize,
                                id: formData.trustCaCertificateId
                              } : null,
                              clientCertificate: formData.clientCertificateName ? {
                                name: formData.clientCertificateName,
                                size: formData.clientCertificateSize,
                                id: formData.clientCertificateId
                              } : null,
                              clientKey: formData.clientKeyName ? {
                                name: formData.clientKeyName,
                                size: formData.clientKeySize,
                                id: formData.clientKeyId
                              } : null,
                              batchTtnFile: formData.batchTtnFileName ? {
                                name: formData.batchTtnFileName,
                                size: formData.batchTtnFileSize,
                                id: formData.batchTtnFileId
                              } : null,
                              batchAwsFile: formData.batchAwsFileName ? {
                                name: formData.batchAwsFileName,
                                size: formData.batchAwsFileSize,
                                id: formData.batchAwsFileId
                              } : null,
                              ...(formData.basicStationAuthMode === 'tls-server-client' && formData.basicStationZtp && {
                                awsConfig: {
                                  accessKeyId: formData.awsAccessKeyId,
                                  secretAccessKey: formData.awsSecretAccessKey,
                                  defaultRegion: formData.awsDefaultRegion,
                                  gatewayNameRule: formData.awsGatewayNameRule,
                                  gatewayDescriptionRule: formData.awsGatewayDescriptionRule,
                                  useClassBMode: formData.awsUseClassBMode
                                }
                              }),
                              ...(formData.basicStationAuthMode === 'tls-server-client-token' && formData.basicStationZtp && {
                                ttnConfig: {
                                  adminToken: formData.ttnAdminToken,
                                  frequencyPlan: formData.ttnFrequencyPlan,
                                  gatewayId: formData.ttnGatewayId,
                                  gatewayName: formData.ttnGatewayName
                                }
                              })
                            }
                          }),
                          ...(formData.loraMode === 'packet-forwarder' && {
                            packetForwarder: {
                              submode: formData.loraSubmode,
                              ...(formData.loraSubmode === 'udp-gwmp' && {
                                udpGwmp: {
                                  statisticInterval: formData.udpStatisticInterval,
                                  serverAddress: formData.udpServerAddress,
                                  portUp: formData.udpPortUp,
                                  portDown: formData.udpPortDown,
                                  pushTimeout: formData.udpPushTimeout,
                                  keepalive: formData.udpKeepalive,
                                  mtu: formData.udpMtu,
                                  restartThreshold: formData.udpRestartThreshold,
                                  autoDataRecovery: formData.udpAutoDataRecovery
                                }
                              }),
                              ...(formData.loraSubmode === 'mqtt-bridge' && {
                                mqttBridge: {
                                  statisticInterval: formData.mqttStatisticInterval,
                                  protocol: formData.mqttProtocol,
                                  brokerAddress: formData.mqttBrokerAddress,
                                  brokerPort: formData.mqttBrokerPort,
                                  version: formData.mqttVersion,
                                  sslMode: formData.mqttSslMode,
                                  tlsVersion: formData.mqttTlsVersion,
                                  username: formData.mqttUsername,
                                  password: formData.mqttPassword,
                                  caCertificate: formData.mqttCaCertificateName ? {
                                    name: formData.mqttCaCertificateName,
                                    size: formData.mqttCaCertificateSize,
                                    id: formData.mqttCaCertificateId
                                  } : null,
                                  clientCertificate: formData.mqttClientCertificateName ? {
                                    name: formData.mqttClientCertificateName,
                                    size: formData.mqttClientCertificateSize,
                                    id: formData.mqttClientCertificateId
                                  } : null,
                                  clientKey: formData.mqttClientKeyName ? {
                                    name: formData.mqttClientKeyName,
                                    size: formData.mqttClientKeySize,
                                    id: formData.mqttClientKeyId
                                  } : null
                                }
                              })
                            }
                          })
                        },
                        system: {
                          wisdmEnabled: formData.wisdmEnabled,
                          wisdmConnect: formData.wisdmConnect,
                          wisdmOrgName: formData.wisdmOrgName,
                          wisdmUrl: formData.wisdmUrl,
                          logExpiration: formData.logExpiration,
                          shareLog: formData.shareLog,
                          logRetrievalCycle: formData.logRetrievalCycle,
                          fileRotationCycle: formData.fileRotationCycle,
                          systemTime: formData.systemTime,
                          ntpEnabled: formData.ntpEnabled,
                          ntpServers: formData.ntpServers,
                          gatewayName: formData.gatewayName,
                          sshDisable: formData.sshDisable,
                          sshDescription: formData.sshDescription
                        },
                        extensions: {
                          rakBreathingLight: formData.rakBreathingLight,
                          rakCountrySettings: formData.rakCountrySettings,
                          rakCustomLogo: formData.rakCustomLogo,
                          failoverReboot: formData.failoverReboot,
                          fieldTestDataProcessor: formData.fieldTestDataProcessor,
                          rakOpenClosePort: formData.rakOpenClosePort,
                          rakOpenvpnClient: formData.rakOpenvpnClient,
                          operationAndMaintenance: formData.operationAndMaintenance,
                          rakSolarBattery: formData.rakSolarBattery,
                          rfSpectrumScanner: formData.rfSpectrumScanner,
                          wifiReboot: formData.wifiReboot,
                          rakWireguard: formData.rakWireguard,
                          loraPacketLogger: formData.loraPacketLogger,
                          configDescription: formData.configDescription,
                          extensionFiles: formData.extensionFiles
                        },
                        other: {
                          requirements: formData.requirements,
                          configFiles: formData.configFiles,
                          configFileNames: formData.configFileNames,
                          configFileSizes: formData.configFileSizes
                        }
                      }

                      // 提取变量
                      const { configData: templateConfigData, variables } = createTemplateFromConfig(configData)

                      if (editTemplateId) {
                        // 更新模板
                        await templateAPI.updateTemplate(editTemplateId, {
                          name: templateName,
                          description: templateDescription || undefined,
                          configData: templateConfigData,
                          variables: variables
                        })
                        showSuccess('Template updated successfully!')
                        setShowSaveTemplateDialog(false)
                        // 导航回模板页面
                        navigate('/templates')
                      } else {
                        // 创建模板（固定使用Custom分类）
                        await templateAPI.createTemplate({
                          name: templateName,
                          description: templateDescription || undefined,
                          category: 'Custom',
                          configData: templateConfigData,
                          variables: variables
                        })
                        showSuccess('Template saved successfully!')
                        setShowSaveTemplateDialog(false)
                        setTemplateName('')
                        setTemplateDescription('')
                        // 导航到模板页面
                        navigate('/templates')
                      }
                    } catch (err: any) {
                      showError(err.message || 'Failed to save template')
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#7c3aed',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    color: '#ffffff'
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Logout Confirmation Dialog */}
        {showLogoutConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '0.5rem',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                Confirm Logout
              </h3>
              <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
                Are you sure you want to logout?
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  style={{
                    padding: '10px 20px',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    useAuthStore.getState().logout()
                    navigate('/login')
                    setShowLogoutConfirm(false)
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Container - 悬浮通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export default ConfigurationComplete