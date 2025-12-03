// 导出工具函数，用于从 RequestDetails 和 Dashboard 共享导出逻辑

// 检查是否为默认值
export const isDefaultValue = (value: any, defaultValue: any): boolean => {
  if (defaultValue === undefined) return false
  if (value === null || value === undefined || value === '' || value === false) {
    return defaultValue === null || defaultValue === undefined || defaultValue === '' || defaultValue === false
  }
  if (Array.isArray(value) && Array.isArray(defaultValue)) {
    return JSON.stringify(value) === JSON.stringify(defaultValue)
  }
  return value === defaultValue
}

// 递归收集配置项到 CSV 行
export const collectConfigToCSVRows = (obj: any, prefix: string = '', section: string = '', result: Array<{ section: string; path: string; value: string }> = []): Array<{ section: string; path: string; value: string }> => {
  if (!obj || typeof obj !== 'object') return result

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue
    
    const value = obj[key]
    const currentPath = prefix ? `${prefix}.${key}` : key

    // 跳过 null 和 undefined
    if (value === null || value === undefined) {
      continue
    }

    // 如果是对象且不是数组，递归处理
    if (typeof value === 'object' && !Array.isArray(value)) {
      if (Object.keys(value).length === 0) {
        continue
      }
      collectConfigToCSVRows(value, currentPath, section, result)
      continue
    }

    // 处理数组
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue
      }
      const arrayItems: string[] = []
      value.forEach((item: any) => {
        if (item === null || item === undefined) {
          return
        }
        if (typeof item === 'object') {
          if (item.name) {
            arrayItems.push(String(item.name))
          } else {
            arrayItems.push(JSON.stringify(item))
          }
        } else if (typeof item === 'boolean') {
          arrayItems.push(item ? 'Enabled' : 'Disabled')
        } else {
          arrayItems.push(String(item))
        }
      })
      if (arrayItems.length > 0) {
        result.push({ section, path: currentPath, value: arrayItems.join('; ') })
      }
      continue
    }

    // 处理基本类型值
    if (value === '') {
      continue
    }

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

// 清理配置附件信息（移除 id 和 size，只保留 name）
export const cleanConfigAttachments = (config: any): any => {
  const cleaned = JSON.parse(JSON.stringify(config))
  
  // 清理 Extensions 文件
  if (cleaned.extensions?.extensionFiles && Array.isArray(cleaned.extensions.extensionFiles)) {
    cleaned.extensions.extensionFiles = cleaned.extensions.extensionFiles.map((f: any) => ({ name: f.name || f }))
  }
  
  // 清理 Other Configuration 文件
  if (cleaned.other?.configFiles && Array.isArray(cleaned.other.configFiles)) {
    if (cleaned.other.configFileNames && Array.isArray(cleaned.other.configFileNames)) {
      cleaned.other.configFiles = cleaned.other.configFileNames.filter((name: any) => name && name.trim() !== '')
    } else {
      cleaned.other.configFiles = cleaned.other.configFiles.filter((f: any) => f && (f.name || f))
    }
    delete cleaned.other.configFileNames
    delete cleaned.other.configFileSizes
  }
  
  return cleaned
}

// 过滤 system 配置
export const filterSystemConfig = (systemConfig: any) => {
  if (!systemConfig) return {}
  
  const filtered: any = {}
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
  
  Object.keys(systemConfig).forEach(key => {
    const value = systemConfig[key]
    const defaultValue = defaults[key as keyof typeof defaults]
    
    if (key === 'wisdmOrgName' || key === 'wisdmUrl') {
      if (systemConfig.wisdmConnect === false || systemConfig.wisdmConnect === undefined) {
        return
      }
    }
    
    if (key === 'ntpServers') {
      if (systemConfig.ntpEnabled === false || systemConfig.ntpEnabled === undefined) {
        return
      }
      if (Array.isArray(value) && Array.isArray(defaultValue)) {
        const hasCustomServers = value.some((server: any) => 
          server && server.trim() !== '' && server !== '0.openwrt.pool.ntp.org'
        )
        if (!hasCustomServers) {
          return
        }
        filtered[key] = value.filter((server: any) => 
          server && server.trim() !== '' && server !== '0.openwrt.pool.ntp.org'
        )
        return
      }
    }
    
    if (key === 'sshDescription') {
      if (systemConfig.sshDisable === false || systemConfig.sshDisable === undefined) {
        return
      }
    }
    
    if (key === 'logRetrievalCycle' || key === 'fileRotationCycle') {
      if (systemConfig.shareLog === false || systemConfig.shareLog === undefined) {
        return
      }
      if (!value || value === '') {
        return
      }
      filtered[key] = value
      return
    }
    
    if (isDefaultValue(value, defaultValue)) {
      return
    }
    
    filtered[key] = value
  })
  
  return filtered
}

// 过滤 Network 配置
export const filterNetworkConfig = (networkConfig: any) => {
  if (!networkConfig) return {}
  
  const filtered: any = {}
  const defaultWanPriority = ['ethernet', 'wifi', 'cellular']
  
  if (networkConfig.wan) {
    const wan: any = {}
    
    const wanPriority = networkConfig.wan.priority
    if (wanPriority && Array.isArray(wanPriority) && JSON.stringify(wanPriority) !== JSON.stringify(defaultWanPriority)) {
      wan.priority = wanPriority
    }
    
    if (networkConfig.wan.ethernet) {
      const ethernetEnabled = networkConfig.wan.ethernet.enabled
      const defaultEthernetEnabled = true
      
      if (ethernetEnabled !== defaultEthernetEnabled || 
          (networkConfig.wan.ethernet.trackingAddresses && 
           Array.isArray(networkConfig.wan.ethernet.trackingAddresses) && 
           networkConfig.wan.ethernet.trackingAddresses.length > 0 &&
           networkConfig.wan.ethernet.trackingAddresses.some((addr: any) => addr && addr.trim()))) {
        wan.ethernet = { ...networkConfig.wan.ethernet }
        if (!networkConfig.wan.ethernet.trackingAddresses || 
            !Array.isArray(networkConfig.wan.ethernet.trackingAddresses) || 
            networkConfig.wan.ethernet.trackingAddresses.length === 0 ||
            !networkConfig.wan.ethernet.trackingAddresses.some((addr: any) => addr && addr.trim())) {
          delete wan.ethernet.trackingMethod
          delete wan.ethernet.trackingAddresses
        }
      }
    }
    
    if (networkConfig.wan.wifi) {
      const wifiEnabled = networkConfig.wan.wifi.enabled
      const defaultWifiEnabled = false
      
      if (wifiEnabled !== defaultWifiEnabled || 
          (networkConfig.wan.wifi.ssid && networkConfig.wan.wifi.ssid.trim()) ||
          (networkConfig.wan.wifi.trackingAddresses && 
           Array.isArray(networkConfig.wan.wifi.trackingAddresses) && 
           networkConfig.wan.wifi.trackingAddresses.length > 0 &&
           networkConfig.wan.wifi.trackingAddresses.some((addr: any) => addr && addr.trim()))) {
        wan.wifi = { ...networkConfig.wan.wifi }
      }
    }
    
    if (networkConfig.wan.cellular) {
      const cellularEnabled = networkConfig.wan.cellular.enabled
      const defaultCellularEnabled = true
      
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
  
  if (networkConfig.lan) {
    const lan: any = {}
    
    const lanEthernet = networkConfig.lan.ethernet
    const defaultLanEthernet = false
    if (lanEthernet !== undefined && lanEthernet !== null && lanEthernet !== defaultLanEthernet) {
      lan.ethernet = lanEthernet
    }
    
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

// 过滤 LoRa 配置
export const filterLoRaConfig = (loraConfig: any): any => {
  if (!loraConfig) return {}
  
  const filtered: any = {}
  
  const filterObject = (obj: any, defaults: any = {}): any => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj
    }
    
    const result: any = {}
    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue
      
      const value = obj[key]
      const defaultValue = defaults[key]
      
      if (value === null || value === undefined || value === '') {
        continue
      }
      
      if (Array.isArray(value) && value.length === 0) {
        continue
      }
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        const filteredValue = filterObject(value, {})
        if (Object.keys(filteredValue).length > 0) {
          result[key] = filteredValue
        }
        continue
      }
      
      if (defaultValue !== undefined && isDefaultValue(value, defaultValue)) {
        continue
      }
      
      result[key] = value
    }
    return result
  }
  
  if (loraConfig.mode && loraConfig.mode.trim()) {
    filtered.mode = loraConfig.mode
  }
  
  if (loraConfig.whitelist) {
    const whitelist = loraConfig.whitelist
    const defaultWhitelistEnabled = false
    
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
  
  if (loraConfig.packetForwarder) {
    const packetForwarderFiltered = filterObject(loraConfig.packetForwarder, {})
    
    if (packetForwarderFiltered.udpGwmp && typeof packetForwarderFiltered.udpGwmp === 'object') {
      const autoDataRecovery = packetForwarderFiltered.udpGwmp.autoDataRecovery
      const defaultAutoDataRecovery = false
      
      if (autoDataRecovery === defaultAutoDataRecovery) {
        delete packetForwarderFiltered.udpGwmp.autoDataRecovery
      }
      
      if (Object.keys(packetForwarderFiltered.udpGwmp).length > 0 || autoDataRecovery === true) {
        if (autoDataRecovery === true) {
          packetForwarderFiltered.udpGwmp.autoDataRecovery = true
        }
      } else {
        delete packetForwarderFiltered.udpGwmp
      }
    }
    
    if (Object.keys(packetForwarderFiltered).length > 0) {
      filtered.packetForwarder = packetForwarderFiltered
    }
  }
  
  const otherFields = filterObject(loraConfig, {})
  Object.keys(otherFields).forEach(key => {
    if (key !== 'mode' && key !== 'whitelist' && key !== 'packetForwarder' && key !== 'basicStation') {
      filtered[key] = otherFields[key]
    }
  })
  
  return filtered
}

// 过滤配置，只保留被修改的配置项
export const filterModifiedConfig = (config: any) => {
  const filtered: any = {
    general: {},
    network: filterNetworkConfig(config?.network || {}),
    lora: filterLoRaConfig(config?.lora || {}),
    system: filterSystemConfig(config?.system || {}),
    extensions: {},
    other: {}
  }

  if (config?.general) {
    const general = config.general
    Object.keys(general).forEach(key => {
      const value = general[key]
      if (value !== null && value !== undefined && value !== '') {
        filtered.general[key] = value
      }
    })
  }

  if (config?.extensions) {
    if (config.extensions.description && String(config.extensions.description).trim()) {
      filtered.extensions.description = config.extensions.description
    }
    if (config.extensions.extensionFiles && Array.isArray(config.extensions.extensionFiles) && config.extensions.extensionFiles.length > 0) {
      filtered.extensions.extensionFiles = config.extensions.extensionFiles.map((f: any) => ({ name: f.name || f }))
    }
  }

  if (config?.other) {
    if (config.other.requirements && String(config.other.requirements).trim()) {
      filtered.other.requirements = config.other.requirements
    }
    if (config.other.configFiles && Array.isArray(config.other.configFiles) && config.other.configFiles.length > 0) {
      filtered.other.configFiles = config.other.configFiles.map((f: any) => ({ name: f.name || f }))
    }
  }

  return filtered
}

// 将单个配置对象转换为 CSV 格式
export const convertToCSV = (config: any, requestInfo: any): string => {
  const rows: Array<{ section: string; path: string; value: string }> = []

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

  if (config.general && Object.keys(config.general).length > 0) {
    Object.entries(config.general).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        rows.push({ section: 'General', path: key, value: String(value) })
      }
    })
  }

  if (config.network && Object.keys(config.network).length > 0) {
    const networkRows = collectConfigToCSVRows(config.network, '', 'Network')
    rows.push(...networkRows)
  }

  if (config.lora && Object.keys(config.lora).length > 0) {
    const loraRows = collectConfigToCSVRows(config.lora, '', 'LoRa')
    rows.push(...loraRows)
  }

  if (config.system && Object.keys(config.system).length > 0) {
    const systemRows = collectConfigToCSVRows(config.system, '', 'System')
    rows.push(...systemRows)
  }

  if (config.extensions && Object.keys(config.extensions).length > 0) {
    const extensionsRows = collectConfigToCSVRows(config.extensions, '', 'Extensions')
    rows.push(...extensionsRows)
  }

  if (config.other && Object.keys(config.other).length > 0) {
    const otherRows = collectConfigToCSVRows(config.other, '', 'Other')
    rows.push(...otherRows)
  }

  const csvRows = [
    ['Section', 'Configuration Path', 'Value'],
    ...rows.map(row => [
      row.section,
      row.path,
      `"${String(row.value).replace(/"/g, '""')}"`
    ])
  ]

  return csvRows.map(row => row.join(',')).join('\n')
}

// 批量导出多个 request 到单个 Excel 文件（每个 request 一个 sheet）
export const exportMultipleRequestsToExcel = async (
  requestIds: string[],
  getRequest: (id: string) => Promise<any>
): Promise<Blob> => {
  // 动态导入 xlsx 库
  const XLSX = await import('xlsx')
  
  // 创建工作簿
  const workbook = XLSX.utils.book_new()
  
  for (let i = 0; i < requestIds.length; i++) {
    const requestId = requestIds[i]
    try {
      const request = await getRequest(requestId)
      
      // 组织配置数据
      const rawConfig = {
        general: request.configData?.general || request.originalConfig?.general || {},
        network: request.configData?.network || request.originalConfig?.network || {},
        lora: request.configData?.lora || request.originalConfig?.lora || {},
        system: request.configData?.system || request.originalConfig?.system || {},
        extensions: request.configData?.extensions || request.originalConfig?.extensions || {},
        other: request.configData?.other || request.originalConfig?.other || {}
      }
      
      // 清理配置数据
      const cleanedConfig = cleanConfigAttachments(rawConfig)
      
      // 过滤配置，只保留被修改的配置项
      const modifiedConfig = filterModifiedConfig(cleanedConfig)
      
      // 请求信息
      const requestInfo = {
        requestId: request.id,
        companyName: request.companyName,
        rakId: request.rakId,
        submitTime: request.submitTime,
        status: request.status,
        assignee: request.assignee
      }
      
      // 生成单个 request 的 CSV 数据
      const csvContent = convertToCSV(modifiedConfig, requestInfo)
      
      // 使用 xlsx 库的 CSV 解析功能将 CSV 转换为工作表
      // XLSX.read 可以解析 CSV 字符串
      const workbook_temp = XLSX.read(csvContent, { type: 'string' })
      const worksheet = workbook_temp.Sheets[workbook_temp.SheetNames[0]]
      
      // 设置列宽
      const maxWidths: number[] = []
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
      for (let col = range.s.c; col <= range.e.c; col++) {
        let maxWidth = 10
        for (let row = range.s.r; row <= range.e.r; row++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          const cell = worksheet[cellAddress]
          if (cell && cell.v) {
            const cellValue = String(cell.v)
            maxWidth = Math.max(maxWidth, Math.min(cellValue.length, 50))
          }
        }
        maxWidths.push(maxWidth)
      }
      worksheet['!cols'] = maxWidths.map(width => ({ wch: width }))
      
      // 使用 request ID 作为 sheet 名称（Excel sheet 名称限制为 31 个字符）
      const sheetName = request.id.length > 31 ? request.id.substring(0, 31) : request.id
      
      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    } catch (error) {
      console.error(`Failed to export request ${requestId}:`, error)
      // 即使某个 request 失败，也创建一个包含错误信息的 sheet
      const errorSheet = XLSX.utils.aoa_to_sheet([
        ['Section', 'Configuration Path', 'Value'],
        ['Request Information', 'Error', `Failed to load request: ${error}`]
      ])
      const sheetName = requestId.length > 31 ? requestId.substring(0, 31) : requestId
      XLSX.utils.book_append_sheet(workbook, errorSheet, sheetName)
    }
  }
  
  // 将工作簿转换为二进制数据
  const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

