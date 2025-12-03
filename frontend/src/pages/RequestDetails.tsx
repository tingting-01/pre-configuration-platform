import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from 'react-query'
import { requestAPI, Request } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import Comments from '../components/Comments'
import History from '../components/History'
import { 
  ArrowLeft, 
  Download, 
  CheckCircle,
  Clock,
  AlertCircle,
  Building,
  Settings,
  Wifi,
  Zap,
  Shield,
  Upload,
  MessageCircle,
  Lock,
  Circle,
  User,
  FileDown
} from 'lucide-react'
import { useState, useEffect } from 'react'

const RequestDetails = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState('overview')
  const [users, setUsers] = useState<any[]>([])
  const [isExporting, setIsExporting] = useState(false)

  const { data: request, isLoading, error } = useQuery<Request>(
    ['request', id],
    () => requestAPI.getRequest(id!),
    { 
      enabled: !!id,
      retry: false // 不重试403错误
    }
  )

  // 加载用户列表（用于显示分配人员）
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await requestAPI.getUsers()
        setUsers(data)
      } catch (error) {
        console.error('Failed to load users:', error)
      }
    }
    loadUsers()
  }, [])

  // 获取分配人员显示名称
  const getAssigneeDisplay = () => {
    if (!request?.assignee) {
      return 'Unassigned'
    }
    const assignedUser = users.find(u => u.email === request.assignee)
    return assignedUser?.name || assignedUser?.email || request.assignee
  }

  // 获取创建者显示名称
  const getCreatorDisplay = () => {
    // 优先使用 creatorEmail，如果没有则使用 rakId（创建者的邮箱）
    const creatorEmail = request?.creatorEmail || request?.rakId
    if (!creatorEmail) {
      return 'Unknown'
    }
    const creatorUser = users.find(u => u.email === creatorEmail)
    return creatorUser?.name || creatorUser?.email || creatorEmail
  }

  const getStatusIcon = (status: string) => {
    const statusLower = status?.toLowerCase() || ''
    switch (statusLower) {
      case 'done':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'open':
        return <Clock className="h-5 w-5 text-yellow-500" />
      case 'pre-configuration file creating':
      case 'pre-configuration file testing':
      case 'WisDM Provisioning':
        return <Clock className="h-5 w-5 text-blue-500" />
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase() || ''
    switch (statusLower) {
      case 'done':
        return 'bg-green-100 text-green-800'
      case 'open':
        return 'bg-yellow-100 text-yellow-800'
      case 'pre-configuration file creating':
        return 'bg-blue-100 text-blue-800'
      case 'pre-configuration file testing':
        return 'bg-indigo-100 text-indigo-800'
      case 'WisDM Provisioning':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // 辅助函数：检查是否为默认值
  const isDefaultValue = (value: any, defaultValue: any): boolean => {
    if (defaultValue === undefined) return false
    if (value === null || value === undefined || value === '' || value === false) {
      return defaultValue === null || defaultValue === undefined || defaultValue === '' || defaultValue === false
    }
    if (Array.isArray(value) && Array.isArray(defaultValue)) {
      return JSON.stringify(value) === JSON.stringify(defaultValue)
    }
    return value === defaultValue
  }

  // 辅助函数：显示配置值，处理未设置的情况
  const displayConfigValue = (value: any, type: 'text' | 'option' | 'button' = 'text', defaultValue?: any) => {
    // 调试信息
    if (type === 'option' && (value === 'ICMP' || value === 'ping')) {
      console.log('Tracking Method Debug:', { value, type, defaultValue, isEqual: value === defaultValue })
    }
    
    // 如果值为空（null/undefined/''），视为默认值，返回空字符串
    if (value === null || value === undefined || value === '' || value === false) {
      return ''
    }
    if (Array.isArray(value) && value.length === 0) {
      return ''
    }
    
    // 检查是否为默认值（优先检查参数传递的默认值）
    if (defaultValue !== undefined && isDefaultValue(value, defaultValue)) {
      console.log('Default value match:', { value, defaultValue })
      return ''
    }
    
    // 特殊处理一些已知的默认值（仅在没有传递默认值参数时）
    // 注意：不再将 'basic-station' 视为默认值，因为这是用户选择的模式，应该显示
    if (defaultValue === undefined && type === 'option' && (
      value === 'icmp' || // 默认tracking method (小写)
      value === 'ICMP' || // 默认tracking method (大写)
      value === '0.openwrt.pool.ntp.org' || // NTP默认服务器
      value === '443' || // 默认端口
      value === 'WPA2-PSK' || // 默认加密方式
      value === 'US915' // 默认区域
    )) {
      console.log('Hardcoded default value match:', { value })
      return ''
    }
    
    if (typeof value === 'boolean') {
      return value ? 'Enabled' : 'Disabled'
    }
    return value
  }

  // 辅助函数：显示文本值，如果是默认值或空值则返回空字符串（不显示）
  const displayTextValue = (value: any, defaultValue?: any) => {
    // 如果值为空（null/undefined/''），视为默认值，不显示
    if (value === null || value === undefined || value === '') {
      return ''
    }
    // 如果值是默认值，不显示
    if (defaultValue !== undefined && isDefaultValue(value, defaultValue)) {
      return ''
    }
    // 否则显示实际值
    return value
  }

  // 辅助函数：显示配置值，带样式
  const displayConfigValueWithStyle = (value: any, type: 'text' | 'option' | 'button' = 'text', defaultValue?: any) => {
    const displayValue = displayConfigValue(value, type, defaultValue)
    const isEmpty = displayValue === ''
    
    // 如果为空（默认值或空值），显示为空字符串
    if (isEmpty) {
      return <span className="text-sm text-gray-900"></span>
    }
    
    return (
      <span className="text-sm text-gray-900">
        {displayValue}
      </span>
    )
  }

  // 辅助函数：显示 Tracking Method，只有在有 tracking addresses 时才显示
  const displayTrackingMethod = (trackingMethod: any, trackingAddresses: any[]) => {
    // 检查是否有有效的 tracking addresses
    const hasAddresses = trackingAddresses && 
                        Array.isArray(trackingAddresses) && 
                        trackingAddresses.length > 0 && 
                        trackingAddresses.some((addr: any) => addr && addr.trim())
    
    // 如果没有地址，返回空
    if (!hasAddresses) {
      return <span></span>
    }
    
    // 如果有地址，显示 Tracking Method（转换为大写）
    if (!trackingMethod || trackingMethod === '') {
      return <span></span>
    }
    
    // 将值转换为可读格式
    const methodMap: Record<string, string> = {
      'icmp': 'ICMP',
      'http': 'HTTP',
      'ICMP': 'ICMP',
      'HTTP': 'HTTP'
    }
    
    const displayMethod = methodMap[trackingMethod.toLowerCase()] || trackingMethod.toUpperCase()
    
    return (
      <span className="text-sm text-gray-900">
        {displayMethod}
      </span>
    )
  }

  // 辅助函数：显示region值，转换为大写
  const displayRegionValue = (value: any) => {
    if (!value || value === '' || value === null || value === undefined) {
      return ''
    }
    // 如果是字符串，转换为大写
    if (typeof value === 'string') {
      return value.toUpperCase()
    }
    return value
  }

  // 辅助函数：显示region值，带样式
  const displayRegionValueWithStyle = (value: any) => {
    const displayValue = displayRegionValue(value)
    
    return (
      <span className="text-sm text-gray-900">
        {displayValue}
      </span>
    )
  }

  const sections = [
    { id: 'overview', name: 'Overview', icon: Building },
    { id: 'network', name: 'Network', icon: Wifi },
    { id: 'lora', name: 'LoRa', icon: Zap },
    { id: 'system', name: 'System', icon: Settings },
    { id: 'extensions', name: 'Extensions', icon: Upload },
    { id: 'other', name: 'Other', icon: Shield },
    { id: 'comments', name: 'Comments', icon: MessageCircle },
    { id: 'history', name: 'History', icon: Clock }
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error || !request) {
    // 检查是否是403权限错误
    const isPermissionError = (error as any)?.response?.status === 403 || 
                            (error as any)?.message?.includes('permission') ||
                            (error as any)?.message?.includes('403')
    
    if (isPermissionError) {
      return (
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-6">
            <div className="flex items-start">
              <Lock className="h-6 w-6 text-yellow-600 mr-3 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-medium text-yellow-800 mb-2">
                  Access Denied
                </h3>
                <p className="text-sm text-yellow-700 mb-4">
                  You don't have permission to access this request. Only RAK Wireless employees can view all requests, and you can only view and edit your own requests.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-yellow-800 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }
    
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="rounded-md bg-red-50 border border-red-200 p-6">
          <div className="flex items-start">
            <AlertCircle className="h-6 w-6 text-red-600 mr-3 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-medium text-red-800 mb-2">
                Failed to Load Request
              </h3>
              <p className="text-sm text-red-700 mb-4">
                Failed to load request details. Please try again.
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-800 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 如果 configData 为空（例如老数据仍使用 originalConfig），回退到 originalConfig
  const config = (request.configData && Object.keys(request.configData).length > 0)
    ? request.configData
    : (request.originalConfig || {})
  
  // 调试：检查配置数据
  console.log('=== Request Details Debug ===')
  console.log('Request:', request)
  console.log('Config Data:', config)
  console.log('Config Keys:', Object.keys(config || {}))
  if (config?.network) {
    console.log('Network Config:', config.network)
  }
  if (config?.lora) {
    console.log('LoRa Config:', config.lora)
  }

  // 获取API基础URL
  const getApiBaseUrl = () => {
    const env = (import.meta as any).env
    if (env?.VITE_API_URL) {
      return env.VITE_API_URL
    }
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000'
    }
    return `http://${hostname}:8000`
  }

  // 下载单个文件
  const downloadFile = async (fileId: string, fileName: string): Promise<Blob | null> => {
    try {
      const { token } = useAuthStore.getState()
      if (!token) {
        console.error('No token available for download')
        return null
      }
      
      const response = await fetch(`${getApiBaseUrl()}/api/files/${fileId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        return await response.blob()
      } else {
        console.error(`Failed to download file ${fileName}:`, response.status, response.statusText)
        return null
      }
    } catch (error) {
      console.error(`Error downloading file ${fileName}:`, error)
      return null
    }
  }

  // 收集所有附件信息
  const collectAttachments = () => {
    const attachments: Array<{ id: string; name: string; size: number; path: string }> = []
    
    // Basic Station 证书文件
    if (config?.lora?.basicStation?.trustCaCertificate) {
      attachments.push({
        id: config.lora.basicStation.trustCaCertificate.id,
        name: config.lora.basicStation.trustCaCertificate.name,
        size: config.lora.basicStation.trustCaCertificate.size,
        path: 'lora/basicStation/certificates/trustCaCertificate'
      })
    }
    if (config?.lora?.basicStation?.clientCertificate) {
      attachments.push({
        id: config.lora.basicStation.clientCertificate.id,
        name: config.lora.basicStation.clientCertificate.name,
        size: config.lora.basicStation.clientCertificate.size,
        path: 'lora/basicStation/certificates/clientCertificate'
      })
    }
    if (config?.lora?.basicStation?.clientKey) {
      attachments.push({
        id: config.lora.basicStation.clientKey.id,
        name: config.lora.basicStation.clientKey.name,
        size: config.lora.basicStation.clientKey.size,
        path: 'lora/basicStation/certificates/clientKey'
      })
    }
    if (config?.lora?.basicStation?.batchTtnFile) {
      attachments.push({
        id: config.lora.basicStation.batchTtnFile.id,
        name: config.lora.basicStation.batchTtnFile.name,
        size: config.lora.basicStation.batchTtnFile.size,
        path: 'lora/basicStation/batchFiles/batchTtnFile'
      })
    }
    if (config?.lora?.basicStation?.batchAwsFile) {
      attachments.push({
        id: config.lora.basicStation.batchAwsFile.id,
        name: config.lora.basicStation.batchAwsFile.name,
        size: config.lora.basicStation.batchAwsFile.size,
        path: 'lora/basicStation/batchFiles/batchAwsFile'
      })
    }

    // MQTT Bridge 证书文件
    if (config?.lora?.packetForwarder?.mqttBridge?.caCertificate) {
      attachments.push({
        id: config.lora.packetForwarder.mqttBridge.caCertificate.id,
        name: config.lora.packetForwarder.mqttBridge.caCertificate.name,
        size: config.lora.packetForwarder.mqttBridge.caCertificate.size,
        path: 'lora/packetForwarder/mqttBridge/certificates/caCertificate'
      })
    }
    if (config?.lora?.packetForwarder?.mqttBridge?.clientCertificate) {
      attachments.push({
        id: config.lora.packetForwarder.mqttBridge.clientCertificate.id,
        name: config.lora.packetForwarder.mqttBridge.clientCertificate.name,
        size: config.lora.packetForwarder.mqttBridge.clientCertificate.size,
        path: 'lora/packetForwarder/mqttBridge/certificates/clientCertificate'
      })
    }
    if (config?.lora?.packetForwarder?.mqttBridge?.clientKey) {
      attachments.push({
        id: config.lora.packetForwarder.mqttBridge.clientKey.id,
        name: config.lora.packetForwarder.mqttBridge.clientKey.name,
        size: config.lora.packetForwarder.mqttBridge.clientKey.size,
        path: 'lora/packetForwarder/mqttBridge/certificates/clientKey'
      })
    }

    // Extensions 附件文件
    if (config?.extensions?.extensionFiles && Array.isArray(config.extensions.extensionFiles)) {
      config.extensions.extensionFiles.forEach((file: any) => {
        if (file && file.id) {
          attachments.push({
            id: file.id,
            name: file.name || 'unknown',
            size: file.size || 0,
            path: `extensions/extensionFiles/${file.name || 'unknown'}`
          })
        }
      })
    }

    // Other Configuration 文件
    if (config?.other?.configFiles && Array.isArray(config.other.configFiles)) {
      config.other.configFiles.forEach((fileId: string, index: number) => {
        const fileName = config.other.configFileNames?.[index] || `file_${index}`
        const fileSize = config.other.configFileSizes?.[index] || 0
        attachments.push({
          id: fileId,
          name: fileName,
          size: fileSize,
          path: `other/configFiles/${fileName}`
        })
      })
    }

    return attachments
  }

  // 清理附件信息，只保留 name 字段，移除 id 和 size
  const cleanFileInfo = (fileInfo: any): any => {
    if (!fileInfo) return fileInfo
    if (Array.isArray(fileInfo)) {
      return fileInfo.map(file => {
        if (typeof file === 'string') {
          // 如果是字符串（文件ID），返回 null 或跳过
          return null
        }
        if (file && typeof file === 'object') {
          // 只保留 name 字段
          return { name: file.name || '' }
        }
        return file
      }).filter(item => item !== null)
    }
    if (typeof fileInfo === 'object') {
      // 只保留 name 字段
      return { name: fileInfo.name || '' }
    }
    return fileInfo
  }

  // 清理配置数据中的附件信息
  const cleanConfigAttachments = (configData: any): any => {
    if (!configData) return configData
    
    const cleaned = JSON.parse(JSON.stringify(configData)) // 深拷贝
    
    // 清理 LoRa Basic Station 证书文件
    if (cleaned.lora?.basicStation) {
      if (cleaned.lora.basicStation.trustCaCertificate) {
        cleaned.lora.basicStation.trustCaCertificate = cleanFileInfo(cleaned.lora.basicStation.trustCaCertificate)
      }
      if (cleaned.lora.basicStation.clientCertificate) {
        cleaned.lora.basicStation.clientCertificate = cleanFileInfo(cleaned.lora.basicStation.clientCertificate)
      }
      if (cleaned.lora.basicStation.clientKey) {
        cleaned.lora.basicStation.clientKey = cleanFileInfo(cleaned.lora.basicStation.clientKey)
      }
      if (cleaned.lora.basicStation.batchTtnFile) {
        cleaned.lora.basicStation.batchTtnFile = cleanFileInfo(cleaned.lora.basicStation.batchTtnFile)
      }
      if (cleaned.lora.basicStation.batchAwsFile) {
        cleaned.lora.basicStation.batchAwsFile = cleanFileInfo(cleaned.lora.basicStation.batchAwsFile)
      }
    }
    
    // 清理 LoRa Packet Forwarder MQTT Bridge 证书文件
    if (cleaned.lora?.packetForwarder?.mqttBridge) {
      if (cleaned.lora.packetForwarder.mqttBridge.caCertificate) {
        cleaned.lora.packetForwarder.mqttBridge.caCertificate = cleanFileInfo(cleaned.lora.packetForwarder.mqttBridge.caCertificate)
      }
      if (cleaned.lora.packetForwarder.mqttBridge.clientCertificate) {
        cleaned.lora.packetForwarder.mqttBridge.clientCertificate = cleanFileInfo(cleaned.lora.packetForwarder.mqttBridge.clientCertificate)
      }
      if (cleaned.lora.packetForwarder.mqttBridge.clientKey) {
        cleaned.lora.packetForwarder.mqttBridge.clientKey = cleanFileInfo(cleaned.lora.packetForwarder.mqttBridge.clientKey)
      }
    }
    
    // 清理 Extensions 附件文件
    if (cleaned.extensions?.extensionFiles) {
      cleaned.extensions.extensionFiles = cleanFileInfo(cleaned.extensions.extensionFiles)
    }
    
    // 清理 Other Configuration 文件
    if (cleaned.other) {
      // configFiles 可能是文件ID数组或文件对象数组
      if (cleaned.other.configFiles && Array.isArray(cleaned.other.configFiles)) {
        // 如果 configFileNames 存在，使用它（只包含文件名）
        if (cleaned.other.configFileNames && Array.isArray(cleaned.other.configFileNames)) {
          cleaned.other.configFiles = cleaned.other.configFileNames.filter((name: any) => name && name.trim() !== '')
        } else {
          // 否则尝试从 configFiles 中提取文件名
          cleaned.other.configFiles = cleaned.other.configFiles
            .map((file: any) => {
              if (typeof file === 'string') {
                // 如果是文件ID字符串，返回空（无法获取文件名）
                return null
              }
              if (file && typeof file === 'object' && file.name) {
                // 如果是文件对象，只返回文件名
                return file.name
              }
              return null
            })
            .filter((name: any) => name !== null)
        }
      }
      // 移除 configFileNames 和 configFileSizes（如果存在）
      delete cleaned.other.configFileNames
      delete cleaned.other.configFileSizes
    }
    
    return cleaned
  }

  // 过滤 system 配置，只导出非默认值
  const filterSystemConfig = (systemConfig: any) => {
    if (!systemConfig) return {}
    
    const filtered: any = {}
    
    // 默认值定义
    const defaults = {
      wisdmEnabled: true,
      wisdmConnect: false,
      wisdmOrgName: '',
      wisdmUrl: '',
      logExpiration: '1-month',
      shareLog: false,
      logRetrievalCycle: '',
      fileRotationCycle: '',
      systemTime: '',
      ntpEnabled: true,
      ntpServers: ['0.openwrt.pool.ntp.org'],
      gatewayName: '',
      sshDisable: false,
      sshDescription: ''
    }
    
    // 只导出非默认值
    Object.keys(systemConfig).forEach(key => {
      const value = systemConfig[key]
      const defaultValue = defaults[key as keyof typeof defaults]
      
      // 第二层开关逻辑处理（优先检查）
      // 如果 wisdmConnect 为 false，不导出 wisdmOrgName 和 wisdmUrl
      if (key === 'wisdmOrgName' || key === 'wisdmUrl') {
        if (systemConfig.wisdmConnect === false || systemConfig.wisdmConnect === undefined) {
          return
        }
      }
      
      // 如果 ntpEnabled 为 false，不导出 ntpServers
      if (key === 'ntpServers') {
        if (systemConfig.ntpEnabled === false || systemConfig.ntpEnabled === undefined) {
          return
        }
        // 如果 ntpServers 是默认值或只包含默认服务器，也不导出
        if (Array.isArray(value) && Array.isArray(defaultValue)) {
          const hasCustomServers = value.some((server: any) => 
            server && server.trim() !== '' && server !== '0.openwrt.pool.ntp.org'
          )
          if (!hasCustomServers) {
            return
          }
          // 只导出非默认的服务器
          filtered[key] = value.filter((server: any) => 
            server && server.trim() !== '' && server !== '0.openwrt.pool.ntp.org'
          )
          return
        }
      }
      
      // 如果 sshDisable 为 false，不导出 sshDescription
      if (key === 'sshDescription') {
        if (systemConfig.sshDisable === false || systemConfig.sshDisable === undefined) {
          return
        }
      }
      
      // 如果 shareLog 为 false，不导出 logRetrievalCycle 和 fileRotationCycle
      if (key === 'logRetrievalCycle' || key === 'fileRotationCycle') {
        if (systemConfig.shareLog === false || systemConfig.shareLog === undefined) {
          return
        }
        // 如果 shareLog 为 true，但字段值为空字符串，也不导出（默认值）
        if (!value || value === '') {
          return
        }
        // 如果 shareLog 为 true 且字段有值，直接导出（跳过默认值检查）
        filtered[key] = value
        return
      }
      
      // 跳过默认值（在第二层开关检查之后）
      if (isDefaultValue(value, defaultValue)) {
        return
      }
      
      filtered[key] = value
    })
    
    return filtered
  }

  // 递归收集配置项到 CSV 行（收集所有非空、非默认值的配置）
  const collectConfigToCSVRows = (obj: any, prefix: string = '', section: string = '', result: Array<{ section: string; path: string; value: string }> = []): Array<{ section: string; path: string; value: string }> => {
    if (!obj || typeof obj !== 'object') return result

    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue
      
      const value = obj[key]
      const currentPath = prefix ? `${prefix}.${key}` : key

      // 跳过 null 和 undefined（但保留空字符串、0、false 等有效值）
      if (value === null || value === undefined) {
        continue
      }

      // 如果是对象且不是数组，递归处理
      if (typeof value === 'object' && !Array.isArray(value)) {
        // 检查是否是空对象
        if (Object.keys(value).length === 0) {
          continue
        }
        // 递归处理嵌套对象
        collectConfigToCSVRows(value, currentPath, section, result)
        continue
      }

      // 处理数组
      if (Array.isArray(value)) {
        // 跳过空数组
        if (value.length === 0) {
          continue
        }
        // 对于数组，将每个元素处理并连接
        const arrayItems: string[] = []
        value.forEach((item: any) => {
          if (item === null || item === undefined) {
            return // 跳过数组中的 null/undefined
          }
          if (typeof item === 'object') {
            // 如果是对象，检查是否有 name 字段（用于文件列表）
            if (item.name) {
              arrayItems.push(String(item.name))
            } else {
              // 否则转换为 JSON 字符串
              arrayItems.push(JSON.stringify(item))
            }
          } else if (typeof item === 'boolean') {
            // 布尔值转换为 Enabled/Disabled
            arrayItems.push(item ? 'Enabled' : 'Disabled')
          } else {
            // 其他类型转换为字符串
            arrayItems.push(String(item))
          }
        })
        // 如果数组中有有效项，添加到结果中
        if (arrayItems.length > 0) {
          result.push({ section, path: currentPath, value: arrayItems.join('; ') })
        }
        continue
      }

      // 处理基本类型值
      // 跳过空字符串（但保留其他值，包括 0、false 等）
      if (value === '') {
        continue
      }

      // 将值转换为字符串
      let stringValue = ''
      if (typeof value === 'boolean') {
        stringValue = value ? 'Enabled' : 'Disabled'
      } else if (typeof value === 'number') {
        stringValue = String(value)
      } else {
        stringValue = String(value)
      }

      result.push({ section, path: currentPath, value: stringValue })
    }

    return result
  }

  // 过滤 Network 配置，只导出非默认值
  const filterNetworkConfig = (networkConfig: any) => {
    if (!networkConfig) return {}
    
    const filtered: any = {}
    
    // WAN Priority 默认值
    const defaultWanPriority = ['ethernet', 'wifi', 'cellular']
    
    // 处理 WAN 配置
    if (networkConfig.wan) {
      const wan: any = {}
      
      // WAN Priority
      const wanPriority = networkConfig.wan.priority
      if (wanPriority && Array.isArray(wanPriority) && JSON.stringify(wanPriority) !== JSON.stringify(defaultWanPriority)) {
        wan.priority = wanPriority
      }
      
      // WAN Ethernet 默认值：enabled = true
      if (networkConfig.wan.ethernet) {
        const ethernetEnabled = networkConfig.wan.ethernet.enabled
        const defaultEthernetEnabled = true
        
        // 如果 enabled 不是默认值，或者有 tracking addresses，则导出
        if (ethernetEnabled !== defaultEthernetEnabled || 
            (networkConfig.wan.ethernet.trackingAddresses && 
             Array.isArray(networkConfig.wan.ethernet.trackingAddresses) && 
             networkConfig.wan.ethernet.trackingAddresses.length > 0 &&
             networkConfig.wan.ethernet.trackingAddresses.some((addr: any) => addr && addr.trim()))) {
          wan.ethernet = { ...networkConfig.wan.ethernet }
          // 如果没有 tracking addresses，移除相关字段
          if (!networkConfig.wan.ethernet.trackingAddresses || 
              !Array.isArray(networkConfig.wan.ethernet.trackingAddresses) || 
              networkConfig.wan.ethernet.trackingAddresses.length === 0 ||
              !networkConfig.wan.ethernet.trackingAddresses.some((addr: any) => addr && addr.trim())) {
            delete wan.ethernet.trackingMethod
            delete wan.ethernet.trackingAddresses
          }
        }
      }
      
      // WAN WiFi 默认值：enabled = false
      if (networkConfig.wan.wifi) {
        const wifiEnabled = networkConfig.wan.wifi.enabled
        const defaultWifiEnabled = false
        
        // 如果 enabled 不是默认值，或者有配置（SSID、tracking addresses），则导出
        if (wifiEnabled !== defaultWifiEnabled || 
            (networkConfig.wan.wifi.ssid && networkConfig.wan.wifi.ssid.trim()) ||
            (networkConfig.wan.wifi.trackingAddresses && 
             Array.isArray(networkConfig.wan.wifi.trackingAddresses) && 
             networkConfig.wan.wifi.trackingAddresses.length > 0 &&
             networkConfig.wan.wifi.trackingAddresses.some((addr: any) => addr && addr.trim()))) {
          wan.wifi = { ...networkConfig.wan.wifi }
        }
      }
      
      // WAN Cellular 默认值：enabled = true
      if (networkConfig.wan.cellular) {
        const cellularEnabled = networkConfig.wan.cellular.enabled
        const defaultCellularEnabled = true
        
        // 如果 enabled 不是默认值，或者有配置（APN、tracking addresses），则导出
        if (cellularEnabled !== defaultCellularEnabled || 
            (networkConfig.wan.cellular.apn && networkConfig.wan.cellular.apn.trim()) ||
            (networkConfig.wan.cellular.trackingAddresses && 
             Array.isArray(networkConfig.wan.cellular.trackingAddresses) && 
             networkConfig.wan.cellular.trackingAddresses.length > 0 &&
             networkConfig.wan.cellular.trackingAddresses.some((addr: any) => addr && addr.trim()))) {
          wan.cellular = { ...networkConfig.wan.cellular }
        }
      }
      
      if (Object.keys(wan).length > 0) {
        filtered.wan = wan
      }
    }
    
    // 处理 LAN 配置
    if (networkConfig.lan) {
      const lan: any = {}
      
      // LAN Ethernet 默认值：false
      const lanEthernet = networkConfig.lan.ethernet
      const defaultLanEthernet = false
      if (lanEthernet !== undefined && lanEthernet !== null && lanEthernet !== defaultLanEthernet) {
        lan.ethernet = lanEthernet
      }
      
      // LAN WiFi AP 默认值：enabled = true, ssid = '', encryption = 'none', password = ''
      if (networkConfig.lan.wifiAp) {
        const wifiAp = networkConfig.lan.wifiAp
        const defaultWifiApSsid = ''
        const defaultWifiApEncryption = 'none'
        const defaultWifiApPassword = ''
        
        let hasNonDefaultWifiAp = false
        if (wifiAp.enabled === false) {
          hasNonDefaultWifiAp = true
        } else if (wifiAp.enabled === true) {
          const ssid = (wifiAp.ssid || '').trim()
          const encryption = wifiAp.encryption || ''
          const password = (wifiAp.password || '').trim()
          
          const hasNonDefaultSsid = ssid !== '' && ssid !== defaultWifiApSsid
          const hasNonDefaultEncryption = encryption !== '' && encryption !== defaultWifiApEncryption
          const hasNonDefaultPassword = password !== '' && password !== defaultWifiApPassword
          
          hasNonDefaultWifiAp = hasNonDefaultSsid || hasNonDefaultEncryption || hasNonDefaultPassword
        }
        
        if (hasNonDefaultWifiAp) {
          lan.wifiAp = { ...wifiAp }
        }
      }
      
      if (Object.keys(lan).length > 0) {
        filtered.lan = lan
      }
    }
    
    return filtered
  }

  // 过滤 LoRa 配置，只导出非默认值（递归过滤，移除空值和默认值）
  const filterLoRaConfig = (loraConfig: any): any => {
    if (!loraConfig) return {}
    
    const filtered: any = {}
    
    // 递归过滤对象，移除空值和默认值
    const filterObject = (obj: any, defaults: any = {}): any => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj
      }
      
      const result: any = {}
      for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue
        
        const value = obj[key]
        const defaultValue = defaults[key]
        
        // 跳过 null、undefined、空字符串
        if (value === null || value === undefined || value === '') {
          continue
        }
        
        // 跳过空数组
        if (Array.isArray(value) && value.length === 0) {
          continue
        }
        
        // 如果是对象，递归过滤
        if (typeof value === 'object' && !Array.isArray(value)) {
          const filteredValue = filterObject(value, {})
          if (Object.keys(filteredValue).length > 0) {
            result[key] = filteredValue
          }
          continue
        }
        
        // 检查是否为默认值
        if (defaultValue !== undefined && isDefaultValue(value, defaultValue)) {
          continue
        }
        
        result[key] = value
      }
      return result
    }
    
    // 处理 mode（默认值为空字符串）
    if (loraConfig.mode && loraConfig.mode.trim()) {
      filtered.mode = loraConfig.mode
    }
    
    // 处理 whitelist（默认值：enabled = false）
    if (loraConfig.whitelist) {
      const whitelist = loraConfig.whitelist
      const defaultWhitelistEnabled = false
      
      // 只有当 enabled 为 true，或者有 ouiList/networkIdList 时才导出
      if (whitelist.enabled === true || 
          (whitelist.ouiList && Array.isArray(whitelist.ouiList) && whitelist.ouiList.length > 0) ||
          (whitelist.networkIdList && Array.isArray(whitelist.networkIdList) && whitelist.networkIdList.length > 0)) {
        const filteredWhitelist: any = {}
        
        if (whitelist.enabled !== defaultWhitelistEnabled) {
          filteredWhitelist.enabled = whitelist.enabled
        }
        
        if (whitelist.ouiList && Array.isArray(whitelist.ouiList) && whitelist.ouiList.length > 0) {
          filteredWhitelist.ouiList = whitelist.ouiList
        }
        
        if (whitelist.networkIdList && Array.isArray(whitelist.networkIdList) && whitelist.networkIdList.length > 0) {
          filteredWhitelist.networkIdList = whitelist.networkIdList
        }
        
        if (Object.keys(filteredWhitelist).length > 0) {
          filtered.whitelist = filteredWhitelist
        }
      }
    }

    // 处理 basicStation（过滤 batch 开关默认值）
    if (loraConfig.basicStation) {
      const basicStationFiltered = filterObject(loraConfig.basicStation, {})

      if (basicStationFiltered.batchTtn === false || basicStationFiltered.batchTtn === undefined) {
        delete basicStationFiltered.batchTtn
      }
      if (basicStationFiltered.batchAwsIot === false || basicStationFiltered.batchAwsIot === undefined) {
        delete basicStationFiltered.batchAwsIot
      }

      if (Object.keys(basicStationFiltered).length > 0) {
        filtered.basicStation = basicStationFiltered
      }
    }
    
    // 处理 packetForwarder（需要特殊处理 autoDataRecovery）
    if (loraConfig.packetForwarder) {
      const packetForwarderFiltered = filterObject(loraConfig.packetForwarder, {})
      
      // 特殊处理 autoDataRecovery（默认值：false，只有当值为 true 时才导出）
      if (packetForwarderFiltered.udpGwmp && typeof packetForwarderFiltered.udpGwmp === 'object') {
        const autoDataRecovery = packetForwarderFiltered.udpGwmp.autoDataRecovery
        const defaultAutoDataRecovery = false
        
        // 如果 autoDataRecovery 是默认值 false，移除它
        if (autoDataRecovery === defaultAutoDataRecovery) {
          delete packetForwarderFiltered.udpGwmp.autoDataRecovery
        }
        
        // 如果 udpGwmp 还有其他字段，或者 autoDataRecovery 是 true，保留 udpGwmp
        if (Object.keys(packetForwarderFiltered.udpGwmp).length > 0 || autoDataRecovery === true) {
          if (autoDataRecovery === true) {
            packetForwarderFiltered.udpGwmp.autoDataRecovery = true
          }
        } else {
          // 如果 udpGwmp 为空，移除它
          delete packetForwarderFiltered.udpGwmp
        }
      }
      
      // 如果 packetForwarder 还有其他字段，保留它
      if (Object.keys(packetForwarderFiltered).length > 0) {
        filtered.packetForwarder = packetForwarderFiltered
      }
    }
    
    // 处理其他字段（递归过滤，但排除已处理的字段）
    const otherFields = filterObject(loraConfig, {})
    Object.keys(otherFields).forEach(key => {
      if (key !== 'mode' && key !== 'whitelist' && key !== 'packetForwarder' && key !== 'basicStation') {
        filtered[key] = otherFields[key]
      }
    })
    
    return filtered
  }

  // 过滤配置，只保留被修改的配置项（非默认值、非空值）
  const filterModifiedConfig = (config: any) => {
    const filtered: any = {
      general: {},
      network: filterNetworkConfig(config?.network || {}),
      lora: filterLoRaConfig(config?.lora || {}),
      system: filterSystemConfig(config?.system || {}),
      extensions: {},
      other: {}
    }

    // 处理 General 配置（只保留非空字段）
    if (config?.general) {
      const general = config.general
      // 保留所有非空字段（包括 0、false 等有效值）
      Object.keys(general).forEach(key => {
        const value = general[key]
        if (value !== null && value !== undefined && value !== '') {
          filtered.general[key] = value
        }
      })
    }

    // 处理 Extensions 配置（只保留非空字段）
    if (config?.extensions) {
      if (config.extensions.description && String(config.extensions.description).trim()) {
        filtered.extensions.description = config.extensions.description
      }
      if (config.extensions.extensionFiles && Array.isArray(config.extensions.extensionFiles) && config.extensions.extensionFiles.length > 0) {
        filtered.extensions.extensionFiles = config.extensions.extensionFiles.map((f: any) => ({ name: f.name || f }))
      }
    }

    // 处理 Other 配置（只保留非空字段）
    if (config?.other) {
      // 处理 requirements（描述）
      if (config.other.requirements && String(config.other.requirements).trim()) {
        filtered.other.requirements = config.other.requirements
      }
      // 处理 configFiles（附件）
      if (config.other.configFiles && Array.isArray(config.other.configFiles) && config.other.configFiles.length > 0) {
        filtered.other.configFiles = config.other.configFiles.map((f: any) => ({ name: f.name || f }))
      }
    }

    return filtered
  }

  // 将配置对象转换为 CSV 格式
  const convertToCSV = (config: any, requestInfo: any): string => {
    const rows: Array<{ section: string; path: string; value: string }> = []

    // 添加请求信息
    if (requestInfo.requestId) {
      rows.push({ section: 'Request Information', path: 'Request ID', value: String(requestInfo.requestId) })
    }
    if (requestInfo.companyName) {
      rows.push({ section: 'Request Information', path: 'Company Name', value: String(requestInfo.companyName) })
    }
    if (requestInfo.rakId) {
      rows.push({ section: 'Request Information', path: 'RAK ID', value: String(requestInfo.rakId) })
    }
    if (requestInfo.submitTime) {
      rows.push({ section: 'Request Information', path: 'Submit Time', value: String(requestInfo.submitTime) })
    }
    if (requestInfo.status) {
      rows.push({ section: 'Request Information', path: 'Status', value: String(requestInfo.status) })
    }
    if (requestInfo.assignee) {
      rows.push({ section: 'Request Information', path: 'Assignee', value: String(requestInfo.assignee) })
    }

    // 添加 General 配置
    if (config.general && Object.keys(config.general).length > 0) {
      Object.entries(config.general).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          rows.push({ section: 'General', path: key, value: String(value) })
        }
      })
    }

    // 添加 Network 配置（使用递归收集函数）
    if (config.network && Object.keys(config.network).length > 0) {
      const networkRows = collectConfigToCSVRows(config.network, '', 'Network')
      rows.push(...networkRows)
    }

    // 添加 LoRa 配置（使用递归收集函数）
    if (config.lora && Object.keys(config.lora).length > 0) {
      const loraRows = collectConfigToCSVRows(config.lora, '', 'LoRa')
      rows.push(...loraRows)
    }

    // 添加 System 配置（使用递归收集函数）
    if (config.system && Object.keys(config.system).length > 0) {
      const systemRows = collectConfigToCSVRows(config.system, '', 'System')
      rows.push(...systemRows)
    }

    // 添加 Extensions 配置（使用递归收集函数）
    if (config.extensions && Object.keys(config.extensions).length > 0) {
      const extensionsRows = collectConfigToCSVRows(config.extensions, '', 'Extensions')
      rows.push(...extensionsRows)
    }

    // 添加 Other 配置（使用递归收集函数）
    if (config.other && Object.keys(config.other).length > 0) {
      const otherRows = collectConfigToCSVRows(config.other, '', 'Other')
      rows.push(...otherRows)
    }

    // 生成 CSV 内容
    const csvRows = [
      ['Section', 'Configuration Path', 'Value'], // 表头
      ...rows.map(row => [
        row.section,
        row.path,
        `"${String(row.value).replace(/"/g, '""')}"` // 转义引号
      ])
    ]

    return csvRows.map(row => row.join(',')).join('\n')
  }

  // 导出配置
  const handleExport = async () => {
    setIsExporting(true)
    try {
      // 按板块分类组织配置数据
      const rawConfig = {
        general: config?.general || {},
        network: config?.network || {},
        lora: config?.lora || {},
        system: config?.system || {},
        extensions: config?.extensions || {},
        other: config?.other || {}
      }
      
      // 清理配置数据中的附件信息（移除 id 和 size，只保留 name）
      const cleanedConfig = cleanConfigAttachments(rawConfig)
      
      // 过滤配置，只保留被修改的配置项
      const modifiedConfig = filterModifiedConfig(cleanedConfig)

      // 调试：打印过滤后的配置
      console.log('Modified Config:', JSON.stringify(modifiedConfig, null, 2))

      // 请求信息
      const requestInfo = {
        requestId: request.id,
        companyName: request.companyName,
        rakId: request.rakId,
        submitTime: request.submitTime,
        status: request.status,
        assignee: request.assignee
      }

      // 生成 CSV 文件
      const csvContent = convertToCSV(modifiedConfig, requestInfo)
      
      // 调试：打印 CSV 行数
      const csvLines = csvContent.split('\n')
      console.log(`CSV generated with ${csvLines.length} lines (including header)`)

      const csvBlob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }) // 添加 BOM 以支持 Excel 正确显示中文
      const csvUrl = window.URL.createObjectURL(csvBlob)
      const csvLink = document.createElement('a')
      csvLink.href = csvUrl
      csvLink.download = `request_${request.id}_config.csv`
      document.body.appendChild(csvLink)
      csvLink.click()
      window.URL.revokeObjectURL(csvUrl)
      document.body.removeChild(csvLink)

      // 自动下载所有附件
      const attachments = collectAttachments()
      if (attachments.length > 0) {
        for (const attachment of attachments) {
          const blob = await downloadFile(attachment.id, attachment.name)
          if (blob) {
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = attachment.name
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
            // 添加小延迟，避免浏览器阻止多个下载
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
      }

      alert(`Export completed! Configuration CSV and ${attachments.length} attachment(s) downloaded.`)
    } catch (error) {
      console.error('Error exporting configuration:', error)
      alert('Failed to export configuration. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  // 检查是否启用了WisDM Provisioning
  const isWisDMEnabled = config?.system?.wisdmConnect === true

  // 工作流阶段定义（根据WisDM Provisioning状态动态过滤）
  const baseWorkflowStages = [
    { id: 'new_request', label: 'Open' },
    { id: 'pre_config_creating', label: 'Pre-configuration file creating' },
    { id: 'check_document', label: 'Pre-configuration file testing' },
    { id: 'add_gateways', label: 'WisDM Provisioning' },
    { id: 'done', label: 'Done' }
  ]

  // 如果WisDM未启用，过滤掉add-gateways步骤
  const workflowStages = isWisDMEnabled 
    ? baseWorkflowStages 
    : baseWorkflowStages.filter(stage => stage.id !== 'add_gateways')

  // 根据当前状态确定当前阶段
  const getCurrentStage = (status: string): string => {
    const statusLower = status?.toLowerCase() || ''
    
    // 如果WisDM未启用，且状态是WisDM Provisioning，应该映射到done阶段
    if (!isWisDMEnabled && statusLower === 'wisdm provisioning') {
      return 'done'
    }
    
    switch (statusLower) {
      case 'open':
        return 'new_request'
      case 'pre-configuration file creating':
        return 'pre_config_creating'
      case 'pre-configuration file testing':
        return 'check_document'
      case 'wisdm provisioning':
        return isWisDMEnabled ? 'add_gateways' : 'done'
      case 'done':
        return 'done'
      default:
        return 'new_request'
    }
  }

  const currentStageId = getCurrentStage(request.status)
  // 如果WisDM未启用且状态是WisDM Provisioning，直接映射到done阶段
  const effectiveStageId = (!isWisDMEnabled && request.status?.toLowerCase() === 'wisdm provisioning') 
    ? 'done' 
    : currentStageId
  const currentStageIndex = workflowStages.findIndex(stage => stage.id === effectiveStageId)

  // 判断阶段是否完成
  const isStageCompleted = (stageIndex: number): boolean => {
    // 如果状态是Done，所有阶段都已完成
    if (request.status?.toLowerCase() === 'done') {
      return true
    }
    return stageIndex < currentStageIndex
  }

  // 判断阶段是否为当前阶段
  const isCurrentStage = (stageIndex: number): boolean => {
    // 如果状态是Done，没有当前阶段（所有都已完成）
    if (request.status?.toLowerCase() === 'done') {
      return false
    }
    return stageIndex === currentStageIndex
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => window.history.back()}
              className="mr-4 p-2 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Request #{request.id}
              </h1>
              <p className="mt-2 text-gray-600">
                {request.companyName || 'Unnamed Company'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              <User className="h-4 w-4 mr-1" />
              <span>{getCreatorDisplay()}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Workflow Progress Indicator */}
      <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Workflow Progress</h2>
        <div className="relative">
          {/* Progress Line */}
          <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-200">
            <div 
              className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-300"
              style={{ 
                width: `${
                  request.status?.toLowerCase() === 'done' 
                    ? 100 
                    : currentStageIndex > 0 
                      ? (currentStageIndex / (workflowStages.length - 1)) * 100 
                      : 0
                }%` 
              }}
            />
          </div>

          {/* Stages */}
          <div className="relative flex justify-between">
            {workflowStages.map((stage, index) => {
              const isCompleted = isStageCompleted(index)
              const isCurrent = isCurrentStage(index)

              return (
                <div key={stage.id} className="relative flex flex-col items-center" style={{ flex: 1 }}>
                  {/* Connector Line to next stage (except last item) */}
                  {index < workflowStages.length - 1 && (
                    <div 
                      className={`absolute top-6 left-1/2 h-0.5 ${
                        index < currentStageIndex || request.status?.toLowerCase() === 'done'
                          ? 'bg-green-500' 
                          : 'bg-gray-200'
                      }`}
                      style={{ 
                        width: 'calc(100% - 48px)',
                        transform: 'translateX(24px)',
                        zIndex: 0
                      }}
                    />
                  )}

                  {/* Indicator Circle */}
                  <div className="relative z-10">
                    <div
                      className={`
                        w-12 h-12 rounded-full flex items-center justify-center
                        transition-all duration-300
                        ${isCompleted 
                          ? 'bg-green-500 border-4 border-white shadow-lg' 
                          : isCurrent 
                            ? 'bg-blue-500 border-4 border-white shadow-lg ring-4 ring-blue-100' 
                            : 'bg-red-100 border-4 border-white'
                        }
                      `}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-6 h-6 text-white" />
                      ) : isCurrent ? (
                        <Clock className="w-6 h-6 text-white" />
                      ) : (
                        <Circle className="w-6 h-6 text-red-500" fill="currentColor" />
                      )}
                    </div>
                  </div>

                  {/* Stage Label */}
                  <div className="mt-3 text-center">
                    <p
                      className={`
                        text-xs font-medium
                        ${isCompleted || isCurrent 
                          ? 'text-gray-900' 
                          : 'text-gray-500'
                        }
                      `}
                    >
                      {stage.label}
                    </p>
                    {isCurrent && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded">
                        Current
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`${
                  activeSection === section.id
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                } w-full flex items-center px-3 py-2 text-sm font-medium border-l-4`}
              >
                <section.icon className="h-4 w-4 mr-3" />
                {section.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Overview Section */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Request Information
                  </h3>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Request ID</dt>
                      <dd className="mt-1 text-sm text-gray-900">{request.id}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Company Name</dt>
                      <dd className="mt-1 text-sm text-gray-900">{request.companyName || ''}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">RAK ID</dt>
                      <dd className="mt-1 text-sm text-gray-900">{request.rakId}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Submit Time</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {new Date(request.submitTime).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Assignee</dt>
                      <dd className="mt-1">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          <User className="h-4 w-4 mr-1" />
                          <span>{getAssigneeDisplay()}</span>
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* General Configuration */}
              {config.general && (
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      Order Information
                    </h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">PID</dt>
                        <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.general.pid, '') || ''}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">BarCode</dt>
                        <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.general.barcode, '') || ''}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Gateway Model</dt>
                        <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.general.gatewayModel, '') || ''}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Priority</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {(() => {
                            const priority = config.general.priority
                            if (!priority || priority === '') return <span></span>
                            const priorityMap: Record<string, string> = {
                              'high': 'High',
                              'medium': 'Medium',
                              'low': 'Low'
                            }
                            return <span>{priorityMap[priority] || priority}</span>
                          })()}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500">Order Description</dt>
                        <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.general.orderDescription, '') || ''}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}

              {/* Changes Summary */}
              {Object.keys(request.changes).length > 0 && (
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      Configuration Changes
                    </h3>
                    <div className="space-y-3">
                      {Object.entries(request.changes).map(([field, change]: [string, any]) => (
                        <div key={field} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div>
                            <span className="text-sm font-medium text-gray-900">{change.fieldName || field}</span>
                            <div className="text-sm text-gray-500">
                              {change.original && (
                                <span className="line-through text-red-600">{change.original}</span>
                              )}
                              {change.original && change.current && ' → '}
                              {change.current && (
                                <span className="text-green-600">{change.current}</span>
                              )}
                            </div>
                          </div>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Modified
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Network Configuration */}
          {activeSection === 'network' && config.network && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Network Configuration
                </h3>
                <div className="space-y-6">
                  {/* WAN Priority */}
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-3">WAN Priority</h4>
                    {(() => {
                      const priority = config.network.wan.priority;
                      const defaultPriority = ['ethernet', 'wifi', 'cellular'];
                      const isDefault = priority && Array.isArray(priority) && JSON.stringify(priority) === JSON.stringify(defaultPriority);
                      
                      // 如果是默认值或为空，显示为空
                      if (isDefault || !priority || !Array.isArray(priority) || priority.length === 0) {
                        return <div className="text-sm text-gray-900"></div>;
                      }
                      
                      // 如果有值且不是默认值，显示优先级列表
                      return (
                        <div className="flex flex-wrap gap-2">
                          {priority.map((interfaceType: any, index: number) => (
                            <span key={interfaceType} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                              {index + 1}. {interfaceType.charAt(0).toUpperCase() + interfaceType.slice(1)}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* WAN Interfaces */}
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-3">WAN Interfaces</h4>
                    <div className="space-y-4">
                      {/* Ethernet */}
                      {(() => {
                        const ethernetEnabled = config.network.wan.ethernet?.enabled
                        const defaultEthernetEnabled = true
                        // 如果是默认值（enabled = true），不显示
                        if (ethernetEnabled === defaultEthernetEnabled && 
                            (!config.network.wan.ethernet?.trackingAddresses || 
                             !Array.isArray(config.network.wan.ethernet.trackingAddresses) || 
                             config.network.wan.ethernet.trackingAddresses.length === 0 ||
                             !config.network.wan.ethernet.trackingAddresses.some((addr: any) => addr && addr.trim()))) {
                          return null
                        }
                        return (
                          <div className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center">
                                <div className={`h-3 w-3 rounded-full mr-2 ${ethernetEnabled ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                <span className="text-sm font-medium text-gray-700">Ethernet</span>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded ${ethernetEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                {ethernetEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            {ethernetEnabled && (
                              <div className="ml-5 space-y-2">
                                <div>
                                  <dt className="text-xs text-gray-500">Tracking Method</dt>
                                  <dd>{displayTrackingMethod(config.network.wan.ethernet.trackingMethod, config.network.wan.ethernet.trackingAddresses || [])}</dd>
                                </div>
                                {config.network.wan.ethernet.trackingAddresses && config.network.wan.ethernet.trackingAddresses.length > 0 && (
                                  <div>
                                    <dt className="text-xs text-gray-500">Tracking Addresses</dt>
                                    <dd className="text-sm text-gray-900">
                                      {config.network.wan.ethernet.trackingAddresses.filter((addr: any) => addr.trim()).join(', ') || 'None'}
                                    </dd>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* WiFi */}
                      {(() => {
                        const wifiEnabled = config.network.wan.wifi?.enabled
                        const defaultWifiEnabled = false
                        // 如果是默认值（enabled = false），且没有其他配置，不显示
                        if (wifiEnabled === defaultWifiEnabled && 
                            (!config.network.wan.wifi?.ssid || !config.network.wan.wifi.ssid.trim()) &&
                            (!config.network.wan.wifi?.trackingAddresses || 
                             !Array.isArray(config.network.wan.wifi.trackingAddresses) || 
                             config.network.wan.wifi.trackingAddresses.length === 0 ||
                             !config.network.wan.wifi.trackingAddresses.some((addr: any) => addr && addr.trim()))) {
                          return null
                        }
                        return (
                          <div className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center">
                                <div className={`h-3 w-3 rounded-full mr-2 ${wifiEnabled ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                <span className="text-sm font-medium text-gray-700">WiFi</span>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded ${wifiEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                {wifiEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            {wifiEnabled && (
                              <div className="ml-5 space-y-2">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div>
                                    <dt className="text-xs text-gray-500">SSID</dt>
                                    <dd>{displayConfigValueWithStyle(config.network.wan.wifi.ssid, 'text')}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-gray-500">Encryption</dt>
                                    <dd>{displayConfigValueWithStyle(config.network.wan.wifi.encryption, 'option')}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-gray-500">Password</dt>
                                    <dd>{displayConfigValueWithStyle(config.network.wan.wifi.password, 'text')}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-gray-500">Tracking Method</dt>
                                    <dd>{displayTrackingMethod(config.network.wan.wifi.trackingMethod, config.network.wan.wifi.trackingAddresses || [])}</dd>
                                  </div>
                                </div>
                                {config.network.wan.wifi.trackingAddresses && config.network.wan.wifi.trackingAddresses.length > 0 && (
                                  <div>
                                    <dt className="text-xs text-gray-500">Tracking Addresses</dt>
                                    <dd className="text-sm text-gray-900">
                                      {config.network.wan.wifi.trackingAddresses.filter((addr: any) => addr.trim()).join(', ') || 'None'}
                                    </dd>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Cellular */}
                      {(() => {
                        const cellularEnabled = config.network.wan.cellular?.enabled
                        const defaultCellularEnabled = true
                        // 如果是默认值（enabled = true），且没有其他配置，不显示
                        if (cellularEnabled === defaultCellularEnabled && 
                            (!config.network.wan.cellular?.apn || !config.network.wan.cellular.apn.trim()) &&
                            (!config.network.wan.cellular?.trackingAddresses || 
                             !Array.isArray(config.network.wan.cellular.trackingAddresses) || 
                             config.network.wan.cellular.trackingAddresses.length === 0 ||
                             !config.network.wan.cellular.trackingAddresses.some((addr: any) => addr && addr.trim()))) {
                          return null
                        }
                        return (
                          <div className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center">
                                <div className={`h-3 w-3 rounded-full mr-2 ${cellularEnabled ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                <span className="text-sm font-medium text-gray-700">Cellular</span>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded ${cellularEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                {cellularEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            {cellularEnabled && (
                              <div className="ml-5 space-y-2">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div>
                                    <dt className="text-xs text-gray-500">APN</dt>
                                    <dd>{displayConfigValueWithStyle(config.network.wan.cellular.apn, 'text')}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-gray-500">Tracking Method</dt>
                                    <dd>{displayTrackingMethod(config.network.wan.cellular.trackingMethod, config.network.wan.cellular.trackingAddresses || [])}</dd>
                                  </div>
                                </div>
                                {config.network.wan.cellular.trackingAddresses && config.network.wan.cellular.trackingAddresses.length > 0 && (
                                  <div>
                                    <dt className="text-xs text-gray-500">Tracking Addresses</dt>
                                    <dd className="text-sm text-gray-900">
                                      {config.network.wan.cellular.trackingAddresses.filter((addr: any) => addr.trim()).join(', ') || 'None'}
                                    </dd>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {/* LAN Configuration */}
                  {config.network.lan && (
                    <div>
                      <h4 className="text-md font-medium text-gray-900 mb-3">LAN Configuration</h4>
                      {(() => {
                        const lanEthernet = config.network.lan.ethernet
                        const wifiAp = config.network.lan.wifiAp
                        
                        // 检查是否有非默认的配置
                        // LAN Ethernet: 默认值是 false，只有当值为 true 时才显示
                        const hasNonDefaultLanEthernet = lanEthernet === true
                        
                        // WiFi AP: 检查是否被修改
                        // 默认值：enabled = true, ssid = '', encryption = 'none', password = ''
                        let hasNonDefaultWifiAp = false
                        if (wifiAp) {
                          // 如果 enabled 不是默认值 true（即 false），则显示
                          if (wifiAp.enabled === false) {
                            hasNonDefaultWifiAp = true
                          } 
                          // 如果 enabled 是 true（默认值），检查其他字段是否有非默认值
                          else if (wifiAp.enabled === true) {
                            const ssid = (wifiAp.ssid || '').trim()
                            const encryption = wifiAp.encryption || ''
                            const password = (wifiAp.password || '').trim()
                            
                            const hasNonDefaultSsid = ssid !== ''
                            const hasNonDefaultEncryption = encryption !== '' && encryption !== 'none'
                            const hasNonDefaultPassword = password !== ''
                            
                            hasNonDefaultWifiAp = hasNonDefaultSsid || hasNonDefaultEncryption || hasNonDefaultPassword
                          }
                        }
                        
                        // 如果所有配置都是默认值，不显示内容
                        if (!hasNonDefaultLanEthernet && !hasNonDefaultWifiAp) {
                          return null
                        }
                        
                        return (
                          <div className="space-y-4">
                            {/* LAN Ethernet */}
                            {hasNonDefaultLanEthernet && (
                              <div className="p-4 border rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center">
                                    <div className={`h-3 w-3 rounded-full mr-2 ${lanEthernet ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                    <span className="text-sm font-medium text-gray-700">LAN Ethernet</span>
                                  </div>
                                  <span className={`text-xs px-2 py-1 rounded ${lanEthernet ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {lanEthernet ? 'Enabled' : 'Disabled'}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* WiFi AP */}
                            {hasNonDefaultWifiAp && wifiAp && (
                              <div className="p-4 border rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center">
                                    <div className={`h-3 w-3 rounded-full mr-2 ${wifiAp.enabled ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                    <span className="text-sm font-medium text-gray-700">WiFi AP</span>
                                  </div>
                                  <span className={`text-xs px-2 py-1 rounded ${wifiAp.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {wifiAp.enabled ? 'Enabled' : 'Disabled'}
                                  </span>
                                </div>
                                {wifiAp.enabled && (
                                  <div className="ml-5 space-y-2">
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      <div>
                                        <dt className="text-xs text-gray-500">SSID</dt>
                                        <dd>{displayConfigValueWithStyle(wifiAp.ssid, 'text')}</dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-gray-500">Encryption</dt>
                                        <dd>{displayConfigValueWithStyle(wifiAp.encryption, 'option')}</dd>
                                      </div>
                                      <div>
                                        <dt className="text-xs text-gray-500">Password</dt>
                                        <dd>{displayConfigValueWithStyle(wifiAp.password, 'text')}</dd>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LoRa Configuration */}
          {activeSection === 'lora' && config.lora && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  LoRa Configuration
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Country</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {config.lora.country && config.lora.country !== '' ? config.lora.country : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Region</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {displayRegionValue(config.lora.region) || ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Work Model</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {(() => {
                          const mode = config.lora?.mode
                          if (!mode || mode === '') return ''
                          const modeMap: Record<string, string> = {
                            'basic-station': 'Basic Station',
                            'packet-forwarder': 'Packet Forwarder'
                          }
                          return modeMap[mode] || mode
                        })()}
                      </dd>
                    </div>
                  </div>

                  {/* Whitelist Configuration */}
                  {config.lora.whitelist && (config.lora.whitelist.enabled || (config.lora.whitelist.ouiList && config.lora.whitelist.ouiList.length > 0) || (config.lora.whitelist.networkIdList && config.lora.whitelist.networkIdList.length > 0)) && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-md">
                      <h4 className="text-md font-medium text-gray-900 mb-3">Whitelist Configuration</h4>
                      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Whitelist Mode</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {config.lora.whitelist.enabled ? 'Enabled' : 'Disabled'}
                          </dd>
                        </div>
                        {config.lora.whitelist.ouiList && config.lora.whitelist.ouiList.length > 0 && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">OUI List</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              <ul className="list-disc list-inside space-y-1">
                                {config.lora.whitelist.ouiList.map((oui: string, index: number) => (
                                  <li key={index}>{oui}</li>
                                ))}
                              </ul>
                            </dd>
                          </div>
                        )}
                        {config.lora.whitelist.networkIdList && config.lora.whitelist.networkIdList.length > 0 && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Network ID List</dt>
                            <dd className="mt-1 text-sm text-gray-900">
                              <ul className="list-disc list-inside space-y-1">
                                {config.lora.whitelist.networkIdList.map((networkId: string, index: number) => (
                                  <li key={index}>{networkId}</li>
                                ))}
                              </ul>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Packet Forwarder Configuration */}
                  {config.lora.packetForwarder && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-md">
                      <h4 className="text-md font-medium text-gray-900 mb-3">Packet Forwarder Configuration</h4>
                      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Sub-mode</dt>
                          <dd className="mt-1">{displayConfigValueWithStyle(config.lora.packetForwarder.submode, 'option')}</dd>
                        </div>
                      </dl>

                      {/* UDP GWMP Configuration */}
                      {config.lora.packetForwarder.udpGwmp && (
                        <div className="mt-4 p-4 bg-white rounded-md border">
                          <h5 className="text-sm font-medium text-gray-900 mb-3">UDP GWMP Configuration</h5>
                          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <dt className="text-xs text-gray-500">Statistic Interval</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.udpGwmp.statisticInterval, 30) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Server Address</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.udpGwmp.serverAddress, 'eu1.cloud.thethings.network') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Port Up</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.udpGwmp.portUp, 1700) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Port Down</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.udpGwmp.portDown, 1700) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Push Timeout</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.udpGwmp.pushTimeout, 200) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Keepalive</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.udpGwmp.keepalive, 5) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">MTU</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.udpGwmp.mtu, 1400) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Restart Threshold</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.udpGwmp.restartThreshold, 30) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Auto Data Recovery</dt>
                              <dd className="text-sm text-gray-900">
                                {config.lora.packetForwarder.udpGwmp.autoDataRecovery === true ? 'Enabled' : ''}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      )}

                      {/* MQTT Bridge Configuration */}
                      {config.lora.packetForwarder.mqttBridge && (
                        <div className="mt-4 p-4 bg-white rounded-md border">
                          <h5 className="text-sm font-medium text-gray-900 mb-3">MQTT Bridge Configuration</h5>
                          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <dt className="text-xs text-gray-500">Statistic Interval</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.statisticInterval, 30) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Protocol</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.protocol, 'chirpstack-v3-json') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Broker Address</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.brokerAddress, '127.0.0.1') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Broker Port</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.brokerPort, 1883) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">MQTT Version</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.version, '3.1.1') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">SSL Mode</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.sslMode, 'none') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">TLS Version</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.tlsVersion, '1.2') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Username</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.username, '') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500">Password</dt>
                              <dd className="text-sm text-gray-900">{displayTextValue(config.lora.packetForwarder.mqttBridge.password, '') || ''}</dd>
                            </div>
                            {/* 证书文件信息 */}
                            {config.lora.packetForwarder.mqttBridge.caCertificate && (
                              <div>
                                <dt className="text-xs text-gray-500">CA Certificate</dt>
                                <dd className="text-sm text-gray-900 flex items-center justify-between">
                                  <span>
                                    {config.lora.packetForwarder.mqttBridge.caCertificate.name} 
                                    ({Math.round(config.lora.packetForwarder.mqttBridge.caCertificate.size / 1024)}KB)
                                  </span>
                                  <a
                                    href={`http://localhost:8000/api/files/${config.lora.packetForwarder.mqttBridge.caCertificate.id}`}
                                    download
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </a>
                                </dd>
                              </div>
                            )}
                            {config.lora.packetForwarder.mqttBridge.clientCertificate && (
                              <div>
                                <dt className="text-xs text-gray-500">Client Certificate</dt>
                                <dd className="text-sm text-gray-900 flex items-center justify-between">
                                  <span>
                                    {config.lora.packetForwarder.mqttBridge.clientCertificate.name} 
                                    ({Math.round(config.lora.packetForwarder.mqttBridge.clientCertificate.size / 1024)}KB)
                                  </span>
                                  <a
                                    href={`http://localhost:8000/api/files/${config.lora.packetForwarder.mqttBridge.clientCertificate.id}`}
                                    download
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </a>
                                </dd>
                              </div>
                            )}
                            {config.lora.packetForwarder.mqttBridge.clientKey && (
                              <div>
                                <dt className="text-xs text-gray-500">Client Key</dt>
                                <dd className="text-sm text-gray-900 flex items-center justify-between">
                                  <span>
                                    {config.lora.packetForwarder.mqttBridge.clientKey.name} 
                                    ({Math.round(config.lora.packetForwarder.mqttBridge.clientKey.size / 1024)}KB)
                                  </span>
                                  <a
                                    href={`http://localhost:8000/api/files/${config.lora.packetForwarder.mqttBridge.clientKey.id}`}
                                    download
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </a>
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Basic Station Configuration */}
                  {config.lora.basicStation && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-md">
                      <h4 className="text-md font-medium text-gray-900 mb-3">Basic Station Configuration</h4>
                      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Server Type</dt>
                          <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.lora.basicStation.serverType, '') || ''}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Server URL</dt>
                          <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.lora.basicStation.serverUrl, '') || ''}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Server Port</dt>
                          <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.lora.basicStation.serverPort, '') || ''}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Authentication Mode</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {(() => {
                              const authMode = config.lora.basicStation.authMode
                              if (!authMode || authMode === 'none') return <span></span>
                              const authModeMap: Record<string, string> = {
                                'tls-server': 'TLS Server Authentication',
                                'tls-server-client': 'TLS Server & Client Authentication',
                                'tls-server-client-token': 'TLS Server & Client Token Authentication'
                              }
                              return <span>{authModeMap[authMode] || authMode}</span>
                            })()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">ZTP</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {config.lora.basicStation.ztp === true ? 'Enabled' : ''}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Batch TTN</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {config.lora.basicStation.batchTtn === true ? 'Enabled' : ''}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Batch AWS IoT</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {config.lora.basicStation.batchAwsIot === true ? 'Enabled' : ''}
                          </dd>
                        </div>
                      </dl>

                      {/* Certificate Files */}
                      {(config.lora.basicStation.trustCaCertificate || config.lora.basicStation.clientCertificate || config.lora.basicStation.clientKey) && (
                        <div className="mt-4 p-4 bg-white rounded-md border">
                          <h5 className="text-sm font-medium text-gray-900 mb-3">Certificate Files</h5>
                          <dl className="grid grid-cols-1 gap-2">
                            {config.lora.basicStation.trustCaCertificate && (
                              <div>
                                <dt className="text-xs text-gray-500">Trust CA Certificate</dt>
                                <dd className="text-sm text-gray-900 flex items-center justify-between">
                                  <span>
                                    {config.lora.basicStation.trustCaCertificate.name} 
                                    ({Math.round(config.lora.basicStation.trustCaCertificate.size / 1024)}KB)
                                  </span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const { token } = useAuthStore.getState()
                                        if (!token) {
                                          console.error('No token available for download')
                                          return
                                        }
                                        
                                        const response = await fetch(`http://localhost:8000/api/files/${config.lora.basicStation.trustCaCertificate.id}`, {
                                          method: 'GET',
                                          headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                          }
                                        });
                                        
                                        if (response.ok) {
                                          const blob = await response.blob();
                                          const url = window.URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = config.lora.basicStation.trustCaCertificate.name;
                                          document.body.appendChild(a);
                                          a.click();
                                          window.URL.revokeObjectURL(url);
                                          document.body.removeChild(a);
                                        } else {
                                          console.error('Failed to download file:', response.status, response.statusText);
                                        }
                                      } catch (error) {
                                        console.error('Error downloading file:', error);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center cursor-pointer"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </button>
                                </dd>
                              </div>
                            )}
                            {config.lora.basicStation.clientCertificate && (
                              <div>
                                <dt className="text-xs text-gray-500">Client Certificate</dt>
                                <dd className="text-sm text-gray-900 flex items-center justify-between">
                                  <span>
                                    {config.lora.basicStation.clientCertificate.name} 
                                    ({Math.round(config.lora.basicStation.clientCertificate.size / 1024)}KB)
                                  </span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const { token } = useAuthStore.getState()
                                        if (!token) {
                                          console.error('No token available for download')
                                          return
                                        }
                                        
                                        const response = await fetch(`http://localhost:8000/api/files/${config.lora.basicStation.clientCertificate.id}`, {
                                          method: 'GET',
                                          headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                          }
                                        });
                                        
                                        if (response.ok) {
                                          const blob = await response.blob();
                                          const url = window.URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = config.lora.basicStation.clientCertificate.name;
                                          document.body.appendChild(a);
                                          a.click();
                                          window.URL.revokeObjectURL(url);
                                          document.body.removeChild(a);
                                        } else {
                                          console.error('Failed to download file:', response.status, response.statusText);
                                        }
                                      } catch (error) {
                                        console.error('Error downloading file:', error);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center cursor-pointer"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </button>
                                </dd>
                              </div>
                            )}
                            {config.lora.basicStation.clientKey && (
                              <div>
                                <dt className="text-xs text-gray-500">Client Key</dt>
                                <dd className="text-sm text-gray-900 flex items-center justify-between">
                                  <span>
                                    {config.lora.basicStation.clientKey.name} 
                                    ({Math.round(config.lora.basicStation.clientKey.size / 1024)}KB)
                                  </span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const { token } = useAuthStore.getState()
                                        if (!token) {
                                          console.error('No token available for download')
                                          return
                                        }
                                        
                                        const response = await fetch(`http://localhost:8000/api/files/${config.lora.basicStation.clientKey.id}`, {
                                          method: 'GET',
                                          headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                          }
                                        });
                                        
                                        if (response.ok) {
                                          const blob = await response.blob();
                                          const url = window.URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = config.lora.basicStation.clientKey.name;
                                          document.body.appendChild(a);
                                          a.click();
                                          window.URL.revokeObjectURL(url);
                                          document.body.removeChild(a);
                                        } else {
                                          console.error('Failed to download file:', response.status, response.statusText);
                                        }
                                      } catch (error) {
                                        console.error('Error downloading file:', error);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center cursor-pointer"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </button>
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      )}

                      {/* Batch Files */}
                      {(config.lora.basicStation.batchTtnFile || config.lora.basicStation.batchAwsFile) && (
                        <div className="mt-4 p-4 bg-white rounded-md border">
                          <h5 className="text-sm font-medium text-gray-900 mb-3">Batch Files</h5>
                          <dl className="grid grid-cols-1 gap-2">
                            {config.lora.basicStation.batchTtnFile && (
                              <div>
                                <dt className="text-xs text-gray-500">Batch TTN File</dt>
                                <dd className="text-sm text-gray-900 flex items-center justify-between">
                                  <span>
                                    {config.lora.basicStation.batchTtnFile.name} 
                                    ({Math.round(config.lora.basicStation.batchTtnFile.size / 1024)}KB)
                                  </span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const { token } = useAuthStore.getState()
                                        if (!token) {
                                          console.error('No token available for download')
                                          return
                                        }
                                        
                                        const response = await fetch(`http://localhost:8000/api/files/${config.lora.basicStation.batchTtnFile.id}`, {
                                          method: 'GET',
                                          headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                          }
                                        });
                                        
                                        if (response.ok) {
                                          const blob = await response.blob();
                                          const url = window.URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = config.lora.basicStation.batchTtnFile.name;
                                          document.body.appendChild(a);
                                          a.click();
                                          window.URL.revokeObjectURL(url);
                                          document.body.removeChild(a);
                                        } else {
                                          console.error('Failed to download file:', response.status, response.statusText);
                                        }
                                      } catch (error) {
                                        console.error('Error downloading file:', error);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center cursor-pointer"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </button>
                                </dd>
                              </div>
                            )}
                            {config.lora.basicStation.batchAwsFile && (
                              <div>
                                <dt className="text-xs text-gray-500">Batch AWS File</dt>
                                <dd className="text-sm text-gray-900 flex items-center justify-between">
                                  <span>
                                    {config.lora.basicStation.batchAwsFile.name} 
                                    ({Math.round(config.lora.basicStation.batchAwsFile.size / 1024)}KB)
                                  </span>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const { token } = useAuthStore.getState()
                                        if (!token) {
                                          console.error('No token available for download')
                                          return
                                        }
                                        
                                        const response = await fetch(`http://localhost:8000/api/files/${config.lora.basicStation.batchAwsFile.id}`, {
                                          method: 'GET',
                                          headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                          }
                                        });
                                        
                                        if (response.ok) {
                                          const blob = await response.blob();
                                          const url = window.URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = config.lora.basicStation.batchAwsFile.name;
                                          document.body.appendChild(a);
                                          a.click();
                                          window.URL.revokeObjectURL(url);
                                          document.body.removeChild(a);
                                        } else {
                                          console.error('Failed to download file:', response.status, response.statusText);
                                        }
                                      } catch (error) {
                                        console.error('Error downloading file:', error);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center cursor-pointer"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </button>
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      )}

                      {/* TTN Configuration */}
                      {config.lora.basicStation.ttnConfig && (
                        <div className="mt-4 p-4 bg-white rounded-md border">
                          <h5 className="text-sm font-medium text-gray-900 mb-3">TTN Configuration</h5>
                          <dl className="grid grid-cols-1 gap-4">
                            <div className="col-span-1">
                              <dt className="text-xs text-gray-500 mb-1">Admin Token</dt>
                              <dd className="text-sm text-gray-900 break-words whitespace-pre-wrap">{displayTextValue(config.lora.basicStation.ttnConfig.adminToken, '') || ''}</dd>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div>
                                <dt className="text-xs text-gray-500 mb-1">Frequency Plan</dt>
                                <dd className="text-sm text-gray-900 break-words">{displayTextValue(config.lora.basicStation.ttnConfig.frequencyPlan, '') || ''}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-gray-500 mb-1">Gateway ID</dt>
                                <dd className="text-sm text-gray-900 break-words">{displayTextValue(config.lora.basicStation.ttnConfig.gatewayId, '') || ''}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-gray-500 mb-1">Gateway Name</dt>
                                <dd className="text-sm text-gray-900 break-words">{displayTextValue(config.lora.basicStation.ttnConfig.gatewayName, '') || ''}</dd>
                              </div>
                            </div>
                          </dl>
                        </div>
                      )}

                      {/* AWS Configuration */}
                      {config.lora.basicStation.awsConfig && (
                        <div className="mt-4 p-4 bg-white rounded-md border">
                          <h5 className="text-sm font-medium text-gray-900 mb-3">AWS Configuration</h5>
                          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <dt className="text-xs text-gray-500 mb-1">Access Key ID</dt>
                              <dd className="text-sm text-gray-900 break-words">{displayTextValue(config.lora.basicStation.awsConfig.accessKeyId, '') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500 mb-1">Secret Access Key</dt>
                              <dd className="text-sm text-gray-900 break-words">{displayTextValue(config.lora.basicStation.awsConfig.secretAccessKey, '') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500 mb-1">Default Region</dt>
                              <dd className="text-sm text-gray-900 break-words">{displayRegionValue(config.lora.basicStation.awsConfig.defaultRegion) || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500 mb-1">Gateway Name Rule</dt>
                              <dd className="text-sm text-gray-900 break-words">{displayTextValue(config.lora.basicStation.awsConfig.gatewayNameRule, '') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500 mb-1">Gateway Description Rule</dt>
                              <dd className="text-sm text-gray-900 break-words">{displayTextValue(config.lora.basicStation.awsConfig.gatewayDescriptionRule, '') || ''}</dd>
                            </div>
                            <div>
                              <dt className="text-xs text-gray-500 mb-1">Use Class B Mode</dt>
                              <dd className="text-sm text-gray-900">
                                {config.lora.basicStation.awsConfig.useClassBMode === true ? 'Enabled' : ''}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* System Configuration */}
          {activeSection === 'system' && config.system && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  System Configuration
                </h3>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(() => {
                    const wisdmConnect = config.system.wisdmConnect;
                    // 默认值是false，如果是false则不显示
                    if (wisdmConnect === false) return null;
                    return (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">WisDM Provisioning</dt>
                        <dd className="mt-1 text-sm text-gray-900">Enabled</dd>
                      </div>
                    );
                  })()}
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Gateway Password</dt>
                    <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.general?.password, '') || ''}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">WisDM Organization</dt>
                    <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.system.wisdmOrgName, '') || ''}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">WisDM URL</dt>
                    <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.system.wisdmUrl, '') || ''}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Log Expiration</dt>
                    <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.system?.logExpiration, '1-month') || ''}</dd>
                  </div>
                  {(() => {
                    const shareLog = config.system.shareLog;
                    // 默认值是false，如果是false则不显示
                    if (shareLog === false) return null;
                    return (
                      <>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Share Log</dt>
                          <dd className="mt-1 text-sm text-gray-900">Enabled</dd>
                        </div>
                        {config.system.logRetrievalCycle && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">WisDM Log Retrieval Cycle</dt>
                            <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.system.logRetrievalCycle, '') || ''}</dd>
                          </div>
                        )}
                        {config.system.fileRotationCycle && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">WisDM File Rotation Cycle</dt>
                            <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.system.fileRotationCycle, '') || ''}</dd>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div>
                    <dt className="text-sm font-medium text-gray-500">System Time</dt>
                    <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.system.systemTime, '') || ''}</dd>
                  </div>
                  {(() => {
                    const ntpEnabled = config.system.ntpEnabled;
                    // 默认值是true，如果是true则不显示
                    if (ntpEnabled === true) return null;
                    return (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">NTP Enabled</dt>
                        <dd className="mt-1 text-sm text-gray-900">Disabled</dd>
                      </div>
                    );
                  })()}
                  {config.system.ntpEnabled && config.system.ntpServers && config.system.ntpServers.length > 0 && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">NTP Server Candidates</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        <ul className="list-disc list-inside space-y-1">
                          {config.system.ntpServers
                            .filter((server: any) => server && server.trim() !== '' && server !== '0.openwrt.pool.ntp.org')
                            .map((server: any, index: number) => (
                              <li key={index}>{server}</li>
                            ))}
                          {config.system.ntpServers.filter((server: any) => server && server.trim() !== '' && server !== '0.openwrt.pool.ntp.org').length === 0 && (
                            <li className="text-gray-500">No custom NTP servers configured</li>
                          )}
                        </ul>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Gateway Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.system.gatewayName, '') || ''}</dd>
                  </div>
                  {(() => {
                    const sshDisable = config.system.sshDisable;
                    // 默认值是false，如果是false则不显示
                    if (sshDisable === false) return null;
                    return (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">SSH Disabled</dt>
                        <dd className="mt-1 text-sm text-gray-900">Yes</dd>
                      </div>
                    );
                  })()}
                  <div>
                    <dt className="text-sm font-medium text-gray-500">SSH Description</dt>
                    <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.system.sshDescription, '') || ''}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {/* Extensions Configuration */}
          {activeSection === 'extensions' && config.extensions && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Pre-installed Extensions
                </h3>
                <div className="space-y-3">
                  {Object.entries(config.extensions)
                    .filter(([key, value]) => key !== 'configDescription' && value === true)
                    .map(([extension, _]) => (
                      <div key={extension} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {extension.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Enabled
                        </span>
                      </div>
                    ))}
                  {Object.entries(config.extensions).filter(([key, value]) => key !== 'configDescription' && value === true).length === 0 && (
                    <p className="text-sm text-gray-500">No extensions enabled</p>
                  )}
                </div>
                {config.extensions.configDescription && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Configuration Description</h4>
                    <p className="text-sm text-gray-700">{config.extensions.configDescription}</p>
                  </div>
                )}
                
                {/* Extension Files */}
                {config.extensions.extensionFiles && Array.isArray(config.extensions.extensionFiles) && config.extensions.extensionFiles.length > 0 && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Uploaded Files</h4>
                    <div className="space-y-2">
                      {config.extensions.extensionFiles.map((file: any, index: number) => (
                        <div key={file.id || index} className="flex items-center justify-between p-3 bg-white rounded-md border border-gray-200">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-lg">📄</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                              <p className="text-xs text-gray-500">{file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}</p>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                const token = useAuthStore.getState().token;
                                const apiBaseUrl = getApiBaseUrl();
                                const response = await fetch(`${apiBaseUrl}/api/files/${file.id}`, {
                                  method: 'GET',
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                  }
                                });
                                
                                if (response.ok) {
                                  const blob = await response.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = file.name;
                                  document.body.appendChild(a);
                                  a.click();
                                  window.URL.revokeObjectURL(url);
                                  document.body.removeChild(a);
                                } else {
                                  console.error('Failed to download file:', response.status, response.statusText);
                                  alert('Failed to download file');
                                }
                              } catch (error) {
                                console.error('Error downloading file:', error);
                                alert('Error downloading file');
                              }
                            }}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Other Configuration */}
          {activeSection === 'other' && config.other && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Other Configurations
                </h3>
                <dl className="space-y-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Requirements</dt>
                    <dd className="mt-1 text-sm text-gray-900">{displayTextValue(config.other.requirements, '') || ''}</dd>
                  </div>
                  {config.other.configFiles && config.other.configFiles.length > 0 && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Uploaded Files</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        <ul className="space-y-2">
                          {config.other.configFiles.map((file: any, index: number) => {
                            const fileName = config.other.configFileNames && config.other.configFileNames[index] 
                              ? config.other.configFileNames[index] 
                              : `File ${index + 1}`;
                            const fileSize = config.other.configFileSizes && config.other.configFileSizes[index] 
                              ? ` (${Math.round(config.other.configFileSizes[index] / 1024)}KB)` 
                              : '';
                            
                            return (
                              <li key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                                <div className="flex items-center space-x-2">
                                  <span className="text-gray-700">
                                    {fileName}{fileSize}
                                  </span>
                                </div>
                                {file && file.id && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        // 获取认证token
                                        const { token } = useAuthStore.getState()
                                        console.log('Download token:', token ? token.substring(0, 20) + '...' : 'None')
                                        
                                        if (!token) {
                                          console.error('No token available for download')
                                          return
                                        }
                                        
                                        // 使用API服务下载文件
                                        const response = await fetch(`http://localhost:8000/api/files/${file.id}`, {
                                          method: 'GET',
                                          headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                          }
                                        });
                                        
                                        if (response.ok) {
                                          const blob = await response.blob();
                                          const url = window.URL.createObjectURL(blob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.download = fileName;
                                          document.body.appendChild(a);
                                          a.click();
                                          window.URL.revokeObjectURL(url);
                                          document.body.removeChild(a);
                                        } else {
                                          console.error('Failed to download file:', response.status, response.statusText);
                                        }
                                      } catch (error) {
                                        console.error('Error downloading file:', error);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center space-x-1 cursor-pointer"
                                  >
                                    <Download className="h-3 w-3" />
                                    <span>Download</span>
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </dd>
                    </div>
                  )}
                  {config.other.uploadedFile && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Uploaded File</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        <a 
                          href={`http://localhost:8000/api/files/${config.other.uploadedFile.id}`}
                          download={config.other.uploadedFile.name}
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          {config.other.uploadedFile.name} ({config.other.uploadedFile.size})
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}

          {/* Comments Section */}
          {activeSection === 'comments' && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <Comments requestId={request.id} />
              </div>
            </div>
          )}

          {/* History Section */}
          {activeSection === 'history' && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <History requestId={request.id} />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default RequestDetails
