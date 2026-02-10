import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { useAuthStore } from '../stores/authStore'
import { useDashboardStore } from '../stores/dashboardStore'
import { useNavigate, useLocation } from 'react-router-dom'
import { requestAPI } from '../services/api'
import AssignmentNotification from '../components/AssignmentNotification'
import AdvancedSearch, { AdvancedSearchConfig } from '../components/AdvancedSearch'
import { matchesSearchConfig } from '../utils/searchUtils'
import { exportMultipleRequestsToExcel } from '../utils/exportUtils'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/ToastContainer'

const DashboardOriginal = () => {
  const queryClient = useQueryClient()
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set())
  const [filterMode, setFilterMode] = useState<'all' | 'new'>('all')
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [savedSearches, setSavedSearches] = useState<Array<{ name: string; config: AdvancedSearchConfig }>>([])
  // 分页和搜索状态 - 使用 Zustand store
  const { currentPage, itemsPerPage, searchQuery, advancedSearchConfig, setCurrentPage, setItemsPerPage, setSearchQuery, setAdvancedSearchConfig, resetPagination } = useDashboardStore()
  
  // 调试：打印分页和搜索状态变化
  useEffect(() => {
    console.log('📊 Dashboard: Current page =', currentPage, ', Items per page =', itemsPerPage, ', Search query =', searchQuery, ', Advanced search =', advancedSearchConfig)
  }, [currentPage, itemsPerPage, searchQuery, advancedSearchConfig])
  
  // 分配功能状态
  const [assigningRequest, setAssigningRequest] = useState<string | null>(null)
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState<string | null>(null)
  // WisDM确认对话框状态
  const [showWisDMConfirm, setShowWisDMConfirm] = useState(false)
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{ requestId: string; newStatus: string; oldStatus?: string } | null>(null)
  // 标签筛选状态
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { toasts, showError, removeToast } = useToast()
  // 表格容器的引用，用于滚动到表格顶部
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // 使用 React Query 获取用户列表，启用缓存（用户列表变化频率低，可以缓存较长时间）
  const { data: users = [] } = useQuery(
    ['users', user?.email],
    () => requestAPI.getUsers(),
    {
      enabled: !!user?.email?.toLowerCase().endsWith('@rakwireless.com'), // 仅RAK Wireless用户需要加载
      staleTime: 10 * 60 * 1000, // 数据在10分钟内被认为是新鲜的（用户列表变化频率低）
      cacheTime: 30 * 60 * 1000, // 缓存保留30分钟
      refetchOnWindowFocus: false, // 窗口获得焦点时不自动刷新
      refetchOnMount: false, // 组件挂载时如果缓存数据存在且未过期，不重新请求
      retry: 1,
    }
  )

  // 使用 React Query 获取请求列表，启用缓存
  const { data: requests = [], isLoading: loading, refetch } = useQuery(
    'requests',
    () => requestAPI.getRequests(),
    {
      staleTime: 5 * 60 * 1000, // 数据在5分钟内被认为是新鲜的，不会重新请求
      cacheTime: 10 * 60 * 1000, // 缓存保留10分钟
      refetchOnWindowFocus: false, // 窗口获得焦点时不自动刷新
      refetchOnMount: true, // 组件挂载时如果缓存数据已失效，会重新请求
      retry: 1,
      onError: (error) => {
        console.error('Dashboard: Failed to load requests:', error)
        setLoadingMessage('Failed to load requests')
      }
    }
  )

  // 当从其他页面返回时，直接刷新数据
  const prevPathnameRef = useRef(location.pathname)
  useEffect(() => {
    // 当路由变化到 dashboard 时（从其他页面返回），直接刷新数据
    if (location.pathname === '/dashboard' && prevPathnameRef.current !== '/dashboard') {
      console.log('🔄 Dashboard: Route changed to dashboard, refetching requests...')
      refetch()
    }
    prevPathnameRef.current = location.pathname
  }, [location.pathname, refetch])

  // 切换筛选模式、搜索或标签筛选时，重置到第一页
  const prevFilterRef = useRef({ 
    filterMode, 
    searchQuery, 
    selectedTagsSize: selectedTags.size, 
    advancedSearchConfig 
  })
  useEffect(() => {
    const prev = prevFilterRef.current
    // 只有在筛选条件真正改变时才重置（不是初始化）
    const hasChanged = 
      prev.filterMode !== filterMode ||
      prev.searchQuery !== searchQuery ||
      prev.selectedTagsSize !== selectedTags.size ||
      prev.advancedSearchConfig !== advancedSearchConfig
    
    if (hasChanged) {
      console.log('🔄 Filter changed, resetting pagination')
      resetPagination()
    }
    prevFilterRef.current = { 
      filterMode, 
      searchQuery, 
      selectedTagsSize: selectedTags.size, 
      advancedSearchConfig 
    }
  }, [filterMode, searchQuery, selectedTags, advancedSearchConfig, resetPagination])

  // 加载保存的搜索条件
  useEffect(() => {
    const saved = localStorage.getItem('savedSearches')
    if (saved) {
      try {
        setSavedSearches(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load saved searches:', e)
      }
    }
  }, [])

  // 标签统计函数 - 按类型分组
  const getTagStatisticsByType = () => {
    const tagCountsByType: Record<string, Array<{ key: string; count: number; label: string; value: string }>> = {}
    
    console.log('=== Tag Statistics Debug ===')
    console.log('Total requests:', requests.length)
    
    requests.forEach((request: any) => {
      if (request.tags && Array.isArray(request.tags) && request.tags.length > 0) {
        console.log(`Request ${request.id} tags:`, request.tags)
        request.tags.forEach((tag: any) => {
          // 确保 tag 对象存在且有效
          if (!tag || typeof tag !== 'object') {
            console.warn(`Invalid tag object in request ${request.id}:`, tag)
            return
          }
          
          const tagType = tag.type || 'custom'
          // 确保 value 和 label 是完整的字符串
          const tagValue = tag.value != null ? String(tag.value) : ''
          const tagLabel = tag.label != null ? String(tag.label) : (tagValue || 'Unknown')
          const tagKey = `${tagType}:${tagValue}`
          
          console.log(`Processing tag: type=${tagType}, value="${tagValue}" (length=${tagValue.length}), label="${tagLabel}" (length=${tagLabel.length}), key="${tagKey}"`)
          
          if (!tagCountsByType[tagType]) {
            tagCountsByType[tagType] = []
          }
          
          const existingTag = tagCountsByType[tagType].find(t => t.key === tagKey)
          if (existingTag) {
            existingTag.count++
            console.log(`  -> Incremented count for existing tag: ${tagKey} (now ${existingTag.count})`)
          } else {
            const newTag = {
              key: tagKey,
              count: 1,
              label: tagLabel,
              value: tagValue
            }
            tagCountsByType[tagType].push(newTag)
            console.log(`  -> Added new tag:`, newTag)
          }
        })
      } else {
        console.log(`Request ${request.id} has no tags or tags is not an array`)
      }
    })
    
    // 对每个类型的标签按数量排序
    Object.keys(tagCountsByType).forEach(type => {
      tagCountsByType[type].sort((a, b) => b.count - a.count)
    })
    
    console.log('Tag counts by type:', tagCountsByType)
    console.log('Tag types found:', Object.keys(tagCountsByType))
    
    return tagCountsByType
  }

  // 获取标签类型的显示名称
  const getTagTypeDisplayName = (type: string) => {
    const typeMap: Record<string, string> = {
      'company': 'Company',
      'priority': 'Priority',
      'region': 'Region',
      'primary-wan': 'Primary WAN',
      'work-mode': 'Work Mode',
      'custom': 'Custom Tags'
    }
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')
  }

  // 获取标签类型的颜色
  const getTagTypeColor = (type: string, tagValue?: string) => {
    switch (type) {
      case 'company': return { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD', lightBg: '#EFF6FF' }
      case 'priority': 
        // 根据优先级值返回不同颜色
        // High: 红色, Medium: 黄色, Low: 绿色
        if (tagValue === 'high') {
          return { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', lightBg: '#FEF2F2' } // 红色
        } else if (tagValue === 'medium') {
          return { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', lightBg: '#FFFBEB' } // 黄色
        } else if (tagValue === 'low') {
          return { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7', lightBg: '#ECFDF5' } // 绿色
        }
        return { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB', lightBg: '#F9FAFB' } // 默认灰色
      case 'region': return { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7', lightBg: '#ECFDF5' }
      case 'primary-wan': return { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', lightBg: '#FEF2F2' }
      case 'work-mode': return { bg: '#E9D5FF', text: '#6B21A8', border: '#C084FC', lightBg: '#F5F3FF' }
      default: return { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB', lightBg: '#F9FAFB' }
    }
  }

  // 计算标签云字体大小（基于数量）
  const getTagCloudFontSize = (count: number, maxCount: number, minCount: number) => {
    if (maxCount === minCount) return 14
    const minSize = 11
    const maxSize = 15
    const ratio = (count - minCount) / (maxCount - minCount)
    return Math.round(minSize + (maxSize - minSize) * ratio)
  }

  // 搜索和筛选后的请求列表
  const filteredRequests = requests.filter((r: any) => {
    // 首先应用筛选模式
    const statusLower = r.status?.toLowerCase() || ''
    const matchesFilter = filterMode === 'new' 
      ? (statusLower === 'open' || statusLower === 'pending') // 兼容旧数据中的"pending"状态
      : true
    
    // 应用高级搜索或简单搜索
    let matchesSearch = true
    if (advancedSearchConfig) {
      // 使用高级搜索
      matchesSearch = matchesSearchConfig(r, advancedSearchConfig)
    } else if (searchQuery) {
      // 使用简单搜索
      matchesSearch = 
        r.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.rakId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.status?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.creatorEmail?.toLowerCase().includes(searchQuery.toLowerCase())
    }
    
    // 应用标签筛选
    const matchesTags = selectedTags.size === 0 || (() => {
      if (!r.tags || !Array.isArray(r.tags)) return false
      return r.tags.some((tag: any) => {
        const tagKey = `${tag.type}:${tag.value}`
        return selectedTags.has(tagKey)
      })
    })()
    
    return matchesFilter && matchesSearch && matchesTags
  })

  // 分页计算
  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedRequests = filteredRequests.slice(startIndex, endIndex)

  // 分页处理函数
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // 滚动到表格顶部（Request List标题位置）
    if (tableContainerRef.current) {
      const elementTop = tableContainerRef.current.getBoundingClientRect().top + window.pageYOffset
      const offset = 80 // 预留顶部导航栏等固定元素的空间
      window.scrollTo({ top: elementTop - offset, behavior: 'smooth' })
    }
  }

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      handlePageChange(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      handlePageChange(currentPage + 1)
    }
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    resetPagination()
    // 滚动到表格顶部（Request List标题位置）
    if (tableContainerRef.current) {
      const elementTop = tableContainerRef.current.getBoundingClientRect().top + window.pageYOffset
      const offset = 80 // 预留顶部导航栏等固定元素的空间
      window.scrollTo({ top: elementTop - offset, behavior: 'smooth' })
    }
  }

  // 统计数据
  const getStatistics = () => {
    const total = filteredRequests.length
    const open = filteredRequests.filter((r: any) => {
      const statusLower = r.status?.toLowerCase() || ''
      return statusLower === 'open' || statusLower === 'pending' // 兼容旧数据
    }).length
    // In Progress统计：非Open且非Done的所有状态
    const inProgress = filteredRequests.filter((r: any) => {
      const statusLower = r.status?.toLowerCase() || ''
      return statusLower !== 'open' && statusLower !== 'pending' && statusLower !== 'done'
    }).length
    const done = filteredRequests.filter((r: any) => r.status?.toLowerCase() === 'done').length
    
    return { total, open, inProgress, done }
  }

  const statistics = getStatistics()

  useEffect(() => {
    // 非RAK Wireless用户，确保筛选模式始终为'all'
    if (!user?.email?.toLowerCase().endsWith('@rakwireless.com')) {
      setFilterMode('all')
    }
  }, [user])

  // 点击外部关闭分配下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (assigneeDropdownOpen && !(event.target as Element).closest('[data-assign-dropdown]')) {
        setAssigneeDropdownOpen(null)
      }
    }
    
    if (assigneeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [assigneeDropdownOpen])

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogout = () => {
    setShowLogoutConfirm(true)
  }

  const confirmLogout = () => {
    logout()
    navigate('/login')
    setShowLogoutConfirm(false)
  }

  const handleViewDetails = (requestId: string) => {
    navigate(`/request-details/${requestId}`)
  }

  const handleNewRequest = () => {
    navigate('/configuration')
  }

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // 选择当前页的所有请求
      setSelectedRequests(new Set(paginatedRequests.map((request: any) => request.id)))
    } else {
      // 取消选择当前页的所有项
      const currentPageIds = paginatedRequests.map((request: any) => request.id)
      setSelectedRequests((prev) => {
        const newSet = new Set(prev)
        currentPageIds.forEach(id => newSet.delete(id))
        return newSet
      })
    }
  }

  const handleSelectRequest = (requestId: string, checked: boolean) => {
    const newSelected = new Set(selectedRequests)
    if (checked) {
      newSelected.add(requestId)
    } else {
      newSelected.delete(requestId)
    }
    setSelectedRequests(newSelected)
  }

  const handleDeleteSelected = () => {
    setShowDeleteConfirm(true)
  }

  // 批量导出选中的 requests
  const handleBatchExport = async () => {
    if (selectedRequests.size === 0) {
      showError('Please select at least one request to export.')
      return
    }
    
    setIsExporting(true)
    setLoadingMessage(`Exporting ${selectedRequests.size} request(s)...`)
    
    try {
      const requestIds = Array.from(selectedRequests)
      
      // 使用工具函数批量导出为 Excel
      const excelBlob = await exportMultipleRequestsToExcel(
        requestIds,
        async (id: string) => {
          return await requestAPI.getRequest(id)
        }
      )
      
      // 生成 Excel 文件
      const excelUrl = window.URL.createObjectURL(excelBlob)
      const excelLink = document.createElement('a')
      excelLink.href = excelUrl
      excelLink.download = `batch_export_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(excelLink)
      excelLink.click()
      window.URL.revokeObjectURL(excelUrl)
      document.body.removeChild(excelLink)
      
      setLoadingMessage(`Successfully exported ${requestIds.length} request(s)!`)
      setTimeout(() => {
        setLoadingMessage('')
      }, 3000)
    } catch (error: any) {
      console.error('Failed to export requests:', error)
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to export requests'
      setLoadingMessage(`Error: ${errorMessage}`)
      setTimeout(() => {
        setLoadingMessage('')
      }, 5000)
    } finally {
      setIsExporting(false)
    }
  }

  const confirmDelete = async () => {
    if (selectedRequests.size === 0) return
    
    setDeleting(true)
    setLoadingMessage(`Deleting ${selectedRequests.size} request(s)...`)
    try {
      const requestIds = Array.from(selectedRequests)
      console.log('Deleting requests:', requestIds)
      
      // 调用批量删除API
      const result = await requestAPI.deleteRequests(requestIds)
      console.log('Delete result:', result)
      
      // 检查删除结果
      const failedDeletes = result.results?.filter((r: any) => !r.success) || []
      const successCount = requestIds.length - failedDeletes.length
      
      if (failedDeletes.length > 0) {
        console.warn('Some deletions failed:', failedDeletes)
        
        // 检查是否有403权限错误
        const permissionErrors = failedDeletes.filter((f: any) => 
          f.error?.includes('403') || 
          f.error?.includes('permission') || 
          f.error?.includes('Permission denied') ||
          f.error?.includes('You can only delete your own requests')
        )
        
        if (permissionErrors.length > 0) {
          // 显示权限错误提示
          const errorMessage = permissionErrors.length === failedDeletes.length
            ? `You don't have permission to delete ${failedDeletes.length} request(s). You can only delete your own requests.`
            : `You don't have permission to delete ${permissionErrors.length} request(s). ${successCount > 0 ? `Successfully deleted ${successCount} request(s).` : ''}`
          showError(errorMessage)
        } else {
          // 其他错误
          const errorMessages = failedDeletes.map((f: any) => f.error || 'Unknown error').join(', ')
          showError(`Failed to delete ${failedDeletes.length} request(s): ${errorMessages}`)
        }
        
        // 只从列表中移除成功删除的请求
        const successIds = result.results
          ?.filter((r: any) => r.success)
          ?.map((r: any) => r.id) || []
        
        if (successIds.length > 0) {
          queryClient.setQueryData('requests', (oldData: any[] = []) => 
            oldData.filter((r: any) => !successIds.includes(r.id))
          )
          queryClient.invalidateQueries('requests')
        }
        
        // 更新选中状态，移除成功删除的项
        const failedIds = failedDeletes.map((f: any) => f.id)
        setSelectedRequests(new Set(failedIds))
      } else {
        // 全部成功
        setLoadingMessage(`Successfully deleted ${requestIds.length} request(s)!`)
        
        // 立即从列表中移除已删除的请求（乐观更新，优化用户体验）
        queryClient.setQueryData('requests', (oldData: any[] = []) => 
          oldData.filter((r: any) => !requestIds.includes(r.id))
        )
        
        // 清除选中状态
        setSelectedRequests(new Set())
        setShowDeleteConfirm(false)
        
        // 使缓存失效，触发后台重新获取数据以确保同步
        queryClient.invalidateQueries('requests')
        
        // 3秒后清除成功消息
        setTimeout(() => {
          setLoadingMessage('')
        }, 3000)
      }
    } catch (error: any) {
      console.error('Failed to delete requests:', error)
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to delete requests'
      
      // 检查是否是403权限错误
      const isPermissionError = error.response?.status === 403 || 
                                errorMessage.includes('403') ||
                                errorMessage.includes('permission') ||
                                errorMessage.includes('Permission denied') ||
                                errorMessage.includes('You can only delete your own requests')
      
      if (isPermissionError) {
        showError('You don\'t have permission to delete these requests. You can only delete your own requests.')
      } else {
        showError(`Failed to delete requests: ${errorMessage}`)
      }
      
      setLoadingMessage('')
    } finally {
      setDeleting(false)
    }
  }

  const cancelDelete = () => {
    setShowDeleteConfirm(false)
  }

  // Assign handler
  const handleAssign = async (requestId: string, assigneeEmail: string) => {
    setAssigningRequest(requestId)
    setLoadingMessage(`Assigning request to ${assigneeEmail}...`)
    
    try {
      await requestAPI.updateRequest(requestId, { assignee: assigneeEmail })
      
      // 使缓存失效，触发重新获取数据
      queryClient.invalidateQueries('requests')
      
      setLoadingMessage('Request assigned successfully!')
      setAssigneeDropdownOpen(null)
      
      // 2秒后清除成功消息
      setTimeout(() => {
        setLoadingMessage('')
      }, 2000)
    } catch (error: any) {
      console.error(`Failed to assign request ${requestId}:`, error)
      setLoadingMessage(`Failed to assign request: ${error.message || 'Unknown error'}`)
      
      // 3秒后清除错误消息
      setTimeout(() => {
        setLoadingMessage('')
      }, 3000)
    } finally {
      setAssigningRequest(null)
    }
  }

  // 检查请求是否启用了WisDM Provisioning
  const isWisDMEnabledForRequest = (request: any): boolean => {
    return request?.configData?.system?.wisdmConnect === true
  }

  // Status update handlers
  const handleStatusChange = async (requestId: string, newStatus: string) => {
    // 如果切换到 "WisDM Provisioning"，需要先确认
    if (newStatus === 'WisDM Provisioning') {
      // 保存当前状态和待更新的状态
      const currentRequest = requests.find(r => r.id === requestId)
      if (currentRequest) {
        // 检查是否启用了WisDM，如果未启用，不允许切换
        if (!isWisDMEnabledForRequest(currentRequest)) {
          // 恢复select的值到原来的状态（更新缓存）
          queryClient.setQueryData('requests', (oldData: any[] = []) => 
            oldData.map((request: any) => 
              request.id === requestId 
                ? { ...request, status: currentRequest.status }
                : request
            )
          )
          setStatusUpdateError('Cannot switch to WisDM Provisioning: WisDM Provisioning is not enabled for this request.')
          setTimeout(() => {
            setStatusUpdateError(null)
          }, 3000)
          return
        }
        
        // 先恢复select的值到原来的状态（因为select已经改变了）
        queryClient.setQueryData('requests', (oldData: any[] = []) => 
          oldData.map((request: any) => 
            request.id === requestId 
              ? { ...request, status: currentRequest.status }
              : request
          )
        )
        
        setPendingStatusUpdate({ 
          requestId, 
          newStatus,
          oldStatus: currentRequest.status // 保存旧状态以便取消时恢复
        })
        setShowWisDMConfirm(true)
      }
      return
    }
    
    // 其他状态直接更新
    await performStatusUpdate(requestId, newStatus)
  }

  // 执行实际的状态更新
  const performStatusUpdate = async (requestId: string, newStatus: string) => {
    setUpdatingStatus(prev => new Set(prev).add(requestId))
    setStatusUpdateError(null)
    setLoadingMessage(`Updating status to ${newStatus}...`)
    
    try {
      console.log(`Updating status for request ${requestId} to ${newStatus}`)
      await requestAPI.updateRequest(requestId, { status: newStatus })
      
      // 乐观更新缓存（立即更新UI）
      queryClient.setQueryData('requests', (oldData: any[] = []) => 
        oldData.map((request: any) => 
          request.id === requestId 
            ? { ...request, status: newStatus }
            : request
        )
      )
      
      // 使缓存失效，触发后台重新获取数据以确保同步
      queryClient.invalidateQueries('requests')
      
      console.log(`Status updated successfully for request ${requestId}`)
      setLoadingMessage('Status updated successfully!')
      
      // 2秒后清除成功消息
      setTimeout(() => {
        setLoadingMessage('')
      }, 2000)
    } catch (error: any) {
      console.error(`Failed to update status for request ${requestId}:`, error)
      setStatusUpdateError(`Failed to update status: ${error.message || 'Unknown error'}`)
      setLoadingMessage('')
      
      // 3秒后清除错误信息
      setTimeout(() => {
        setStatusUpdateError(null)
      }, 3000)
    } finally {
      setUpdatingStatus(prev => {
        const newSet = new Set(prev)
        newSet.delete(requestId)
        return newSet
      })
    }
  }

  // 确认WisDM Provisioning
  const confirmWisDM = async () => {
    if (pendingStatusUpdate) {
      setShowWisDMConfirm(false)
      await performStatusUpdate(pendingStatusUpdate.requestId, pendingStatusUpdate.newStatus)
      setPendingStatusUpdate(null)
    }
  }

  // 取消WisDM确认
  const cancelWisDM = () => {
    if (pendingStatusUpdate && pendingStatusUpdate.oldStatus) {
      // 恢复请求的原始状态（更新缓存）
      queryClient.setQueryData('requests', (oldData: any[] = []) => 
        oldData.map((request: any) => 
          request.id === pendingStatusUpdate.requestId 
            ? { ...request, status: pendingStatusUpdate.oldStatus }
            : request
        )
      )
    }
    setShowWisDMConfirm(false)
    setPendingStatusUpdate(null)
  }

  const getStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase() || ''
    switch (statusLower) {
      case 'open':
      case 'pending': // 兼容旧数据中的"pending"状态
        return { background: '#fef3c7', color: '#92400e' }
      case 'pre-configuration file creating':
        return { background: '#dbeafe', color: '#1e40af' }
      case 'pre-configuration file testing':
        return { background: '#e0e7ff', color: '#4338ca' }
      case 'wisdm provisioning':
      case 'add-gateways-to-organization': // 兼容旧数据
        return { background: '#ddd6fe', color: '#5b21b6' }
      case 'done':
        return { background: '#d1fae5', color: '#065f46' }
      default:
        return { background: '#f3f4f6', color: '#6b7280' }
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9fafb',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#1f2937',
      lineHeight: 1.6
    }}>
      <style>
        {`
          @keyframes spin {
            0% { transform: translateY(-50%) rotate(0deg); }
            100% { transform: translateY(-50%) rotate(360deg); }
          }
        `}
      </style>
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
            onClick={handleNewRequest}
            style={{
              padding: '8px 16px',
              background: '#4c1d95',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'Inter, sans-serif'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0,0,0,0.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            New Request
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
              {(user?.name && user.name.trim()) 
                ? user.name.charAt(0).toUpperCase() 
                : (user?.email ? user.email.charAt(0).toUpperCase() : 'U')}
            </div>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {(user?.name && user.name.trim()) 
                ? user.name 
                : (user?.email ? user.email.split('@')[0] : 'User')}
            </span>
            {/* Assignment Notification */}
            <AssignmentNotification
              assignedCount={requests.filter((r: any) => 
                r.assignee === user?.email && r.status?.toLowerCase() !== 'done'
              ).length}
              assignedRequests={requests
                .filter((r: any) => 
                  r.assignee === user?.email && r.status?.toLowerCase() !== 'done'
                )
                .map((r: any) => ({
                  id: r.id,
                  companyName: r.companyName || 'Unnamed',
                  status: r.status
                }))}
              onRequestClick={(requestId) => navigate(`/request-details/${requestId}`)}
            />
            <button
              onClick={handleLogout}
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

      {/* Main Content */}
      <div style={{ padding: '24px', marginTop: '80px' }}>
        {/* Loading Progress Indicator */}
        {(loading || loadingMessage) && (
          <div style={{
            background: loadingMessage.includes('Failed') || loadingMessage.includes('failed') 
              ? '#fef2f2' 
              : loadingMessage.includes('Successfully') || loadingMessage.includes('successfully')
              ? '#f0fdf4'
              : '#f8fafc',
            border: loadingMessage.includes('Failed') || loadingMessage.includes('failed')
              ? '1px solid #fecaca'
              : loadingMessage.includes('Successfully') || loadingMessage.includes('successfully')
              ? '1px solid #bbf7d0'
              : '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            padding: '16px 20px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
          }}>
            {loading && !loadingMessage.includes('Failed') && !loadingMessage.includes('failed') && (
              <div style={{
                width: '20px',
                height: '20px',
                border: '2px solid #7c3aed',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            {loadingMessage.includes('Successfully') || loadingMessage.includes('successfully') ? (
              <svg width="20" height="20" fill="#10b981" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            ) : loadingMessage.includes('Failed') || loadingMessage.includes('failed') ? (
              <svg width="20" height="20" fill="#ef4444" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            ) : (
              <svg width="20" height="20" fill="#7c3aed" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            )}
            <div style={{
              fontSize: '14px',
              fontWeight: '500',
              color: loadingMessage.includes('Failed') || loadingMessage.includes('failed')
                ? '#dc2626'
                : loadingMessage.includes('Successfully') || loadingMessage.includes('successfully')
                ? '#059669'
                : '#7c3aed'
            }}>
              {loadingMessage || 'Loading...'}
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #4c1d95 0%, #6b21a8 100%)',
            borderRadius: '0.5rem',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            border: '1px solid #4c1d95'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#e0e7ff', margin: '0 0 4px 0' }}>Total Requests</p>
                <p style={{ fontSize: '24px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                  {statistics.total}
                </p>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" fill="#ffffff" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
            </div>
          </div>
          
          <div style={{
            background: 'linear-gradient(135deg, #6b21a8 0%, #7c3aed 100%)',
            borderRadius: '0.5rem',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            border: '1px solid #6b21a8'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#e0e7ff', margin: '0 0 4px 0' }}>Open</p>
                <p style={{ fontSize: '24px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                  {statistics.open}
                </p>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" fill="#ffffff" viewBox="0 0 24 24">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
            </div>
          </div>
          
          <div style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
            borderRadius: '0.5rem',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            border: '1px solid #7c3aed'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#e0e7ff', margin: '0 0 4px 0' }}>In Progress</p>
                <p style={{ fontSize: '24px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                  {statistics.inProgress}
                </p>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" fill="#ffffff" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
            </div>
          </div>
          
          <div style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
            borderRadius: '0.5rem',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            border: '1px solid #8b5cf6'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '14px', color: '#e0e7ff', margin: '0 0 4px 0' }}>Done</p>
                <p style={{ fontSize: '24px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                  {statistics.done}
                </p>
              </div>
              <div style={{
                width: '40px',
                height: '40px',
                background: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="20" height="20" fill="#ffffff" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tag Cloud/Grid - Grouped by Type */}
        <div style={{ marginBottom: '24px' }}>
          {(() => {
            const tagStatsByType = getTagStatisticsByType()
            // 定义标签类型的显示顺序
            const tagTypeOrder = ['company', 'priority', 'region', 'primary-wan', 'work-mode', 'custom']
            const tagTypes = Object.keys(tagStatsByType).sort((a, b) => {
              const indexA = tagTypeOrder.indexOf(a)
              const indexB = tagTypeOrder.indexOf(b)
              // 如果类型在预定义顺序中，按顺序排序；否则按字母顺序
              if (indexA !== -1 && indexB !== -1) return indexA - indexB
              if (indexA !== -1) return -1
              if (indexB !== -1) return 1
              return a.localeCompare(b)
            })
            
            if (tagTypes.length === 0) {
              return (
                <div style={{ 
                  padding: '16px',
                  background: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <h2 style={{ 
                    fontSize: '18px', 
                    fontWeight: '600', 
                    color: '#1f2937',
                    margin: '0 0 8px 0'
                  }}>
                    Tag Statistics
                  </h2>
                  <p style={{ 
                    fontSize: '14px', 
                    color: '#6b7280',
                    margin: 0,
                    textAlign: 'center'
                  }}>
                    No tags available. Tags will appear here after requests are created with tags.
                  </p>
                </div>
              )
            }
          
            return (
              <>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: '16px'
                }}>
                  <h2 style={{ 
                    fontSize: '18px', 
                    fontWeight: '600', 
                    color: '#1f2937',
                    margin: 0
                  }}>
                    Tag Statistics
                  </h2>
                  {selectedTags.size > 0 && (
                      <button
                        onClick={() => setSelectedTags(new Set())}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          color: '#6b7280',
                          background: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#e5e7eb'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#f3f4f6'
                        }}
                      >
                        Clear Filters ({selectedTags.size})
                      </button>
                    )}
                </div>
                
                {/* Tag Cloud View */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '20px',
                  minHeight: '200px'
                }}>
                  {tagTypes.map((type) => {
                    const tags = tagStatsByType[type]
                    // 对于 priority 类型，使用默认颜色作为类型标题颜色
                    const defaultColors = getTagTypeColor(type)
                    const maxCount = Math.max(...tags.map(t => t.count), 1)
                    const minCount = Math.min(...tags.map(t => t.count), 1)
                    
                    return (
                      <div key={type} style={{ marginBottom: '12px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '6px',
                          paddingBottom: '4px',
                          borderBottom: `2px solid ${defaultColors.border}`
                        }}>
                          <span style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: defaultColors.text
                          }}>
                            {getTagTypeDisplayName(type)}
                          </span>
                          <span style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            background: defaultColors.lightBg,
                            padding: '2px 6px',
                            borderRadius: '10px'
                          }}>
                            {tags.length} tags
                          </span>
                        </div>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                          alignItems: 'center',
                          lineHeight: '1.2'
                        }}>
                          {tags.map((tag) => {
                            const isSelected = selectedTags.has(tag.key)
                            const fontSize = getTagCloudFontSize(tag.count, maxCount, minCount)
                            // 对于 priority 类型，根据 tag.value 获取特定颜色
                            const tagColors = type === 'priority' ? getTagTypeColor(type, tag.value) : defaultColors
                            
                            return (
                              <span
                                key={tag.key}
                                onClick={() => {
                                  const newSelected = new Set(selectedTags)
                                  if (isSelected) {
                                    newSelected.delete(tag.key)
                                  } else {
                                    newSelected.add(tag.key)
                                  }
                                  setSelectedTags(newSelected)
                                }}
                                style={{
                                  fontSize: `${fontSize}px`,
                                  fontWeight: isSelected ? '700' : '500',
                                  color: isSelected ? tagColors.text : (type === 'priority' ? tagColors.text : '#6b7280'),
                                  background: isSelected ? tagColors.bg : (type === 'priority' ? tagColors.lightBg : '#f9fafb'),
                                  border: `1px solid ${isSelected ? tagColors.border : (type === 'priority' ? tagColors.border : '#e5e7eb')}`,
                                  borderRadius: '0.375rem',
                                  padding: '6px 12px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  boxShadow: isSelected ? `0 2px 4px -1px rgba(0,0,0,0.1)` : 'none'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.borderColor = tagColors.border
                                    e.currentTarget.style.background = tagColors.lightBg
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.borderColor = type === 'priority' ? tagColors.border : '#e5e7eb'
                                    e.currentTarget.style.background = type === 'priority' ? tagColors.lightBg : '#f9fafb'
                                  }
                                }}
                              >
                                <span style={{ whiteSpace: 'nowrap' }}>{tag.label}</span>
                                <span style={{
                                  fontSize: `${Math.max(10, fontSize - 4)}px`,
                                  color: tagColors.text,
                                  opacity: 0.7
                                }}>
                                  ({tag.count})
                                </span>
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>

        {/* Error Message */}
        {statusUpdateError && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#dc2626',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            {statusUpdateError}
          </div>
        )}

        {/* Filter and Request List */}
        <div style={{
          background: '#ffffff',
          borderRadius: '0.5rem',
          width: '100%',
          maxWidth: '100%',
          overflow: 'visible',
          padding: '16px',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06)',
          border: '1px solid #e5e7eb'
        }}>
          <div 
            ref={tableContainerRef}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              position: 'relative'
            }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '600',
              color: '#1f2937',
              margin: 0
            }}>
              Request List
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', flex: 1, justifyContent: 'flex-end' }}>
              {/* Search Component - Positioned in the red box area */}
              <div style={{ position: 'relative', marginRight: 'auto', marginLeft: '24px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                {!isSearchExpanded ? (
                  /* Pill-shaped Search Button */
                  <button
                    onClick={() => setIsSearchExpanded(true)}
                    style={{
                      padding: '8px 16px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '9999px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      height: '36px',
                      minWidth: '36px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db'
                      e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0,0,0,0.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <svg width="18" height="18" fill="none" stroke="#1f2937" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                ) : (
                  /* Expanded Search Input - Expands in place */
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0',
                    width: '280px'
                  }}>
                    <div style={{
                      position: 'relative',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRight: 'none',
                      borderRadius: '0.375rem 0 0 0.375rem',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      height: '36px',
                      boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06)'
                    }}>
                      <div style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#9ca3af',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value)
                          setAdvancedSearchConfig(null) // 清除高级搜索
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          height: '100%',
                          padding: '0 40px 0 40px',
                          border: 'none',
                          borderRadius: '0.375rem 0 0 0.375rem',
                          fontSize: '14px',
                          outline: 'none',
                          background: 'transparent',
                          color: '#1f2937'
                        }}
                        onFocus={(e) => {
                          e.currentTarget.parentElement!.style.borderColor = '#7c3aed'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.parentElement!.style.borderColor = '#e5e7eb'
                        }}
                      />
                    </div>
                    {/* Clear/Close Button */}
                    <button
                      onClick={() => {
                        if (searchQuery || advancedSearchConfig) {
                          setSearchQuery('')
                          setAdvancedSearchConfig(null)
                        } else {
                          setIsSearchExpanded(false)
                        }
                      }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderLeft: 'none',
                        borderRadius: '0 0.375rem 0.375rem 0',
                        padding: '0 12px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        color: '#9ca3af',
                        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f9fafb'
                        e.currentTarget.style.borderColor = '#d1d5db'
                        e.currentTarget.style.color = '#6b7280'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#ffffff'
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.color = '#9ca3af'
                      }}
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                {/* Advanced Search Button */}
                <button
                  onClick={() => setShowAdvancedSearch(true)}
                  style={{
                    padding: '8px 12px',
                    background: advancedSearchConfig ? '#7c3aed' : '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    color: advancedSearchConfig ? '#ffffff' : '#6b7280',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    height: '36px',
                    whiteSpace: 'nowrap'
                  }}
                  title="Advanced Search"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  Advanced
                  {advancedSearchConfig && (
                    <span style={{
                      background: 'rgba(255,255,255,0.3)',
                      borderRadius: '9999px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      marginLeft: '4px'
                    }}>
                      {advancedSearchConfig.conditions.length}
                    </span>
                  )}
                </button>
              </div>
              
              {/* Filter Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setFilterMode('all')}
                  style={{
                    padding: '8px 16px',
                    background: filterMode === 'all' ? '#4c1d95' : '#f3f4f6',
                    color: filterMode === 'all' ? '#ffffff' : '#6b7280',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  All Requests ({requests.length})
                </button>
                {user?.email?.toLowerCase().endsWith('@rakwireless.com') && (
                  <button
                    onClick={() => setFilterMode('new')}
                    style={{
                      padding: '8px 16px',
                      background: filterMode === 'new' ? '#4c1d95' : '#f3f4f6',
                      color: filterMode === 'new' ? '#ffffff' : '#6b7280',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    New Requests ({requests.filter((r: any) => {
                      const statusLower = r.status?.toLowerCase() || ''
                      return statusLower === 'open' || statusLower === 'pending' // 兼容旧数据
                    }).length})
                  </button>
                )}
              </div>
              
              {selectedRequests.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#6b7280' }}>
                    {selectedRequests.size} selected
                  </span>
                  <button
                    onClick={handleBatchExport}
                    disabled={isExporting}
                    style={{
                      padding: '6px 12px',
                      background: isExporting ? '#9ca3af' : '#3b82f6',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: isExporting ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      opacity: isExporting ? 0.6 : 1
                    }}
                  >
                    {isExporting ? 'Exporting...' : 'Export Selected'}
                  </button>
                  <button
                    onClick={handleDeleteSelected}
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
                    Delete Selected
                  </button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px',
              color: '#6b7280'
            }}>
              Loading...
            </div>
          ) : requests.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px',
              color: '#6b7280'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                background: '#f3f4f6',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <svg width="24" height="24" fill="#9ca3af" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '500', margin: '0 0 8px 0' }}>
                No requests found
              </h3>
              <p style={{ fontSize: '14px', margin: '0 0 16px 0' }}>
                Create your first request to get started
              </p>
              <button
                onClick={handleNewRequest}
                style={{
                  padding: '8px 16px',
                  background: '#4c1d95',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                New Request
              </button>
            </div>
          ) : (
            <div 
              style={{ 
                overflowX: 'auto',
                overflowY: 'visible',
                width: '100%',
                maxWidth: '100%',
                WebkitOverflowScrolling: 'touch' // 移动端平滑滚动
              }}>
              <table style={{
                width: '100%',
                minWidth: '1150px', // 最小宽度，确保所有列都有足够空间显示
                borderCollapse: 'collapse',
                fontSize: '11px', // 减小字体
                tableLayout: 'auto', // 自动布局，大屏幕时会扩展以充分利用空间
                lineHeight: '1.3' // 减小行高
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: 'auto',
                      minWidth: '40px',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      <input
                        type="checkbox"
                        checked={
                          paginatedRequests.length > 0 && 
                          paginatedRequests.every((request: any) => 
                            selectedRequests.has(request.id)
                          )
                        }
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        style={{
                          width: '16px',
                          height: '16px',
                          accentColor: '#4c1d95'
                        }}
                      />
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: 'auto',
                      minWidth: '80px',
                      whiteSpace: 'nowrap',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Request ID
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: '150px',
                      maxWidth: '150px',
                      whiteSpace: 'nowrap',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Company
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: '120px',
                      maxWidth: '120px',
                      whiteSpace: 'nowrap',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      PID
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: '120px',
                      maxWidth: '120px',
                      whiteSpace: 'nowrap',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Barcode
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: '120px',
                      maxWidth: '120px',
                      whiteSpace: 'nowrap',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Creator
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: 'auto',
                      minWidth: '80px',
                      whiteSpace: 'nowrap',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Priority
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: '150px',
                      maxWidth: '150px',
                      whiteSpace: 'nowrap',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Submit Time
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: 'auto',
                      minWidth: '180px',
                      whiteSpace: 'nowrap',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Workflow Process
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: 'auto',
                      minWidth: '100px',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Assignee
                    </th>
                    <th style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: '500',
                      color: '#374151',
                      background: '#f9fafb',
                      width: 'auto',
                      minWidth: '120px',
                      fontSize: '12px',
                      lineHeight: '1.3'
                    }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRequests.map((request: any) => (
                    <tr key={request.id} style={{ borderBottom: '1px solid #e5e7eb', lineHeight: '3' }}>
                      <td style={{ padding: '4px 10px' }}>
                        <input
                          type="checkbox"
                          checked={selectedRequests.has(request.id)}
                          onChange={(e) => handleSelectRequest(request.id, e.target.checked)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: '#4c1d95'
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 10px', color: '#1f2937', fontSize: '11px' }}>
                        {request.id}
                      </td>
                      <td 
                        style={{ 
                          padding: '4px 10px', 
                          color: '#1f2937', 
                          fontSize: '11px',
                          maxWidth: '150px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={request.companyName || 'Unnamed'}
                      >
                        {request.companyName || 'Unnamed'}
                      </td>
                      <td 
                        style={{ 
                          padding: '4px 10px', 
                          color: '#1f2937', 
                          fontSize: '11px',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={request.configData?.general?.pid || '-'}
                      >
                        {request.configData?.general?.pid || '-'}
                      </td>
                      <td 
                        style={{ 
                          padding: '4px 10px', 
                          color: '#1f2937', 
                          fontSize: '11px',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={request.configData?.general?.barcode || '-'}
                      >
                        {request.configData?.general?.barcode || '-'}
                      </td>
                      <td 
                        style={{ 
                          padding: '4px 10px', 
                          color: '#1f2937', 
                          fontSize: '11px',
                          maxWidth: '120px',
                          overflow: 'hidden'
                        }}
                        title={request.creatorEmail === user?.email ? 'You' : request.creatorEmail || 'Unknown'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: request.creatorEmail === user?.email ? '#10b981' : '#6b7280',
                            flexShrink: 0
                          }}></div>
                          <span style={{
                            fontSize: '12px',
                            color: request.creatorEmail === user?.email ? '#10b981' : '#6b7280',
                            background: request.creatorEmail === user?.email ? '#ecfdf5' : '#f3f4f6',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontWeight: request.creatorEmail === user?.email ? '500' : '400',
                            lineHeight: '1.3',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0
                          }}>
                            {request.creatorEmail === user?.email ? 'You' : request.creatorEmail || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '4px 10px', fontSize: '11px' }}>
                        {(() => {
                          // 从 configData 或 tags 中获取优先级
                          let priority = ''
                          if (request.configData?.general?.priority) {
                            priority = request.configData.general.priority
                          } else if (request.tags && Array.isArray(request.tags)) {
                            const priorityTag = request.tags.find((tag: any) => tag.type === 'priority')
                            if (priorityTag) {
                              priority = priorityTag.value
                            }
                          }
                          
                          if (!priority) {
                            return <span style={{ color: '#9ca3af', fontSize: '12px' }}>-</span>
                          }
                          
                          const priorityMap: Record<string, { label: string; bg: string; text: string; border: string }> = {
                            'high': { label: 'High', bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' }, // 红色
                            'medium': { label: 'Medium', bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' }, // 黄色
                            'low': { label: 'Low', bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' } // 绿色
                          }
                          
                          const priorityInfo = priorityMap[priority.toLowerCase()] || { label: priority, bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' }
                          
                          return (
                            <span style={{
                              fontSize: '12px',
                              fontWeight: '500',
                              color: priorityInfo.text,
                              background: priorityInfo.bg,
                              border: `1px solid ${priorityInfo.border}`,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              lineHeight: '1.3',
                              display: 'inline-block'
                            }}>
                              {priorityInfo.label}
                            </span>
                          )
                        })()}
                      </td>
                      <td 
                        style={{ 
                          padding: '4px 10px', 
                          color: '#1f2937', 
                          fontSize: '11px',
                          maxWidth: '150px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={new Date(request.submitTime).toLocaleString('en-US', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                        }).replace(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/, '$3/$1/$2 $4:$5:$6')}
                      >
                        {new Date(request.submitTime).toLocaleString('en-US', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                        }).replace(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/, '$3/$1/$2 $4:$5:$6')}
                      </td>
                      <td style={{ padding: '4px 10px' }}>
                        {user?.email?.toLowerCase().endsWith('@rakwireless.com') ? (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <select
                              value={request.status}
                              onChange={(e) => {
                                const newStatus = e.target.value
                                handleStatusChange(request.id, newStatus)
                              }}
                              disabled={updatingStatus.has(request.id) || (showWisDMConfirm && pendingStatusUpdate?.requestId === request.id)}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '0.375rem',
                                fontSize: '12px',
                                fontWeight: '500',
                                border: '1px solid #d1d5db',
                                background: getStatusColor(request.status).background,
                                color: getStatusColor(request.status).color,
                                cursor: updatingStatus.has(request.id) ? 'not-allowed' : 'pointer',
                                opacity: updatingStatus.has(request.id) ? 0.6 : 1,
                                outline: 'none',
                                width: '100%',
                                maxWidth: '200px',
                                lineHeight: '1.3'
                              }}
                            >
                              <option value="Open">Open</option>
                              <option value="Pre-configuration file creating">Pre-configuration file creating</option>
                              <option value="Pre-configuration file testing">Pre-configuration file testing</option>
                              {/* 只有当WisDM启用时才显示WisDM Provisioning选项，但如果当前状态已经是这个状态，则始终显示 */}
                              {(isWisDMEnabledForRequest(request) || request.status === 'WisDM Provisioning' || request.status === 'add-gateways-to-organization') && (
                                <option value="WisDM Provisioning">WisDM Provisioning</option>
                              )}
                              <option value="Done">Done</option>
                            </select>
                            {updatingStatus.has(request.id) && (
                              <div style={{
                                position: 'absolute',
                                top: '50%',
                                right: '8px',
                                transform: 'translateY(-50%)',
                                width: '12px',
                                height: '12px',
                                border: '2px solid #4c1d95',
                                borderTop: '2px solid transparent',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                              }} />
                            )}
                          </div>
                        ) : (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '0.375rem',
                            fontSize: '10px',
                            fontWeight: '500',
                            display: 'inline-block',
                            background: getStatusColor(request.status).background,
                            color: getStatusColor(request.status).color,
                            lineHeight: '1.3'
                          }}>
                            {request.status}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '4px 10px' }}>
                        <div style={{ position: 'relative', display: 'inline-block' }} data-assign-dropdown>
                          {user?.email?.toLowerCase().endsWith('@rakwireless.com') ? (
                            <>
                              <button
                                onClick={() => setAssigneeDropdownOpen(
                                  assigneeDropdownOpen === request.id ? null : request.id
                                )}
                                disabled={assigningRequest === request.id}
                                style={{
                                  padding: '2px 8px',
                                  background: request.assignee ? '#e0e7ff' : '#f3f4f6',
                                  color: request.assignee ? '#4338ca' : '#6b7280',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '0.375rem',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  cursor: assigningRequest === request.id ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s ease',
                                  minWidth: '90px',
                                  textAlign: 'left',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  opacity: assigningRequest === request.id ? 0.6 : 1,
                                  lineHeight: '1.3'
                                }}
                              >
                                <span>
                                  {request.assignee 
                                    ? users.find(u => u.email === request.assignee)?.name || request.assignee
                                    : 'Assign'}
                                </span>
                                <svg 
                                  width="12" 
                                  height="12" 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                  style={{
                                    transform: assigneeDropdownOpen === request.id ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s'
                                  }}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              
                              {assigneeDropdownOpen === request.id && (
                                <div 
                                  data-assign-dropdown
                                  style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '4px',
                                    background: '#ffffff',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.375rem',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                                    zIndex: 1000,
                                    minWidth: '200px',
                                    maxHeight: '300px',
                                    overflowY: 'auto'
                                  }}
                                >
                                  <div
                                    onClick={() => handleAssign(request.id, '')}
                                    style={{
                                      padding: '6px 10px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      color: '#6b7280',
                                      borderBottom: '1px solid #e5e7eb',
                                      lineHeight: '1.3'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                                  >
                                    Unassign
                                  </div>
                                  {users.length > 0 ? (
                                    users.map((userOption) => (
                                      <div
                                        key={userOption.id}
                                        onClick={() => handleAssign(request.id, userOption.email)}
                                        style={{
                                          padding: '6px 10px',
                                          cursor: 'pointer',
                                          fontSize: '12px',
                                          color: request.assignee === userOption.email ? '#4338ca' : '#1f2937',
                                          background: request.assignee === userOption.email ? '#eef2ff' : '#ffffff',
                                          fontWeight: request.assignee === userOption.email ? '500' : '400',
                                          lineHeight: '1.3'
                                        }}
                                        onMouseEnter={(e) => {
                                          if (request.assignee !== userOption.email) {
                                            e.currentTarget.style.background = '#f9fafb'
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (request.assignee !== userOption.email) {
                                            e.currentTarget.style.background = '#ffffff'
                                          }
                                        }}
                                      >
                                        {userOption.name || userOption.email}
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{
                                      padding: '6px 10px',
                                      fontSize: '12px',
                                      color: '#9ca3af',
                                      fontStyle: 'italic'
                                    }}>
                                      Loading users...
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <span style={{
                              fontSize: '10px',
                              color: request.assignee ? '#1f2937' : '#9ca3af',
                              lineHeight: '1.3'
                            }}>
                              {request.assignee 
                                ? (users.length > 0 
                                    ? (users.find(u => u.email === request.assignee)?.name || request.assignee)
                                    : request.assignee) // 如果没有users列表，直接显示email
                                : 'Unassigned'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '4px 10px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => handleViewDetails(request.id)}
                            style={{
                              padding: '2px 8px',
                              background: '#4c1d95',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '0.375rem',
                              fontSize: '10px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              lineHeight: '1.3',
                              minWidth: '45px',
                              height: '24px'
                            }}
                          >
                            View
                          </button>
                          {(request.creatorEmail === user?.email || 
                            user?.role === 'admin') ? (
                            <button
                              onClick={() => navigate(`/configuration?edit=${request.id}`)}
                              style={{
                                padding: '2px 8px',
                                background: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontSize: '12px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                lineHeight: '1.3',
                                minWidth: '40px',
                                height: '24px'
                              }}
                            >
                              Edit
                            </button>
                          ) : (
                            <button
                              disabled
                              style={{
                                padding: '2px 8px',
                                background: '#f3f4f6',
                                color: '#9ca3af',
                                border: 'none',
                                borderRadius: '0.375rem',
                                fontSize: '12px',
                                fontWeight: '500',
                                cursor: 'not-allowed',
                                lineHeight: '1.3',
                                minWidth: '40px',
                                height: '24px'
                              }}
                              title="You can only edit your own requests"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* 分页组件 - 始终显示（只要有数据） */}
              {filteredRequests.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '20px 16px',
                  borderTop: '1px solid #e5e7eb',
                  marginTop: '16px'
                }}>
                  {/* 左侧：显示当前页信息 + 每页条数切换 */}
                  <div style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <div>
                      Showing <span style={{ fontWeight: '600', color: '#1f2937' }}>
                        {startIndex + 1}
                      </span> - <span style={{ fontWeight: '600', color: '#1f2937' }}>
                        {Math.min(endIndex, filteredRequests.length)}
                      </span> of <span style={{ fontWeight: '600', color: '#1f2937' }}>
                        {filteredRequests.length}
                      </span> records
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ whiteSpace: 'nowrap' }}>Rows per page</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                        style={{
                          padding: '6px 10px',
                          background: '#ffffff',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          outline: 'none'
                        }}
                      >
                        {[10, 20, 50, 100].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 右侧：分页控件 - 只在多页时显示 */}
                  {totalPages > 1 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {/* 上一页按钮 */}
                      <button
                        onClick={handlePreviousPage}
                        disabled={currentPage === 1}
                        style={{
                          padding: '6px 12px',
                          background: currentPage === 1 ? '#f3f4f6' : '#ffffff',
                          color: currentPage === 1 ? '#9ca3af' : '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                          opacity: currentPage === 1 ? 0.6 : 1
                        }}
                      >
                        Previous
                      </button>

                      {/* 页码显示 */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                          // 只显示当前页附近的页码
                          const showPage = 
                            page === 1 || 
                            page === totalPages || 
                            (page >= currentPage - 1 && page <= currentPage + 1) ||
                            (currentPage <= 3 && page <= 5) ||
                            (currentPage >= totalPages - 2 && page >= totalPages - 4)

                          if (!showPage) {
                            // 显示省略号
                            if (page === currentPage - 2 || page === currentPage + 2) {
                              return (
                                <span key={page} style={{
                                  padding: '0 4px',
                                  color: '#9ca3af'
                                }}>
                                  ...
                                </span>
                              )
                            }
                            return null
                          }

                          return (
                            <button
                              key={page}
                              onClick={() => handlePageChange(page)}
                              style={{
                                minWidth: '36px',
                                height: '36px',
                                padding: '0 8px',
                                background: page === currentPage ? '#4c1d95' : '#ffffff',
                                color: page === currentPage ? '#ffffff' : '#374151',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.375rem',
                                fontSize: '14px',
                                fontWeight: page === currentPage ? '600' : '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {page}
                            </button>
                          )
                        })}
                      </div>

                      {/* 下一页按钮 */}
                      <button
                        onClick={handleNextPage}
                        disabled={currentPage === totalPages}
                        style={{
                          padding: '6px 12px',
                          background: currentPage === totalPages ? '#f3f4f6' : '#ffffff',
                          color: currentPage === totalPages ? '#9ca3af' : '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                          opacity: currentPage === totalPages ? 0.6 : 1
                        }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* WisDM Provisioning Confirmation Modal */}
      {showWisDMConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '16px'
            }}>
              Confirm WisDM Provisioning
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#4b5563',
              marginBottom: '24px',
              lineHeight: '1.5'
            }}>
              Please confirm that WisDM Provisioning is a pre-configuration requirement.
            </p>
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={cancelWisDM}
                style={{
                  padding: '8px 16px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#e5e7eb'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#f3f4f6'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmWisDM}
                style={{
                  padding: '8px 16px',
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = '#059669'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = '#10b981'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
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
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#1f2937',
              margin: '0 0 16px 0'
            }}>
              Confirm Delete
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '0 0 24px 0',
              lineHeight: 1.5
            }}>
              Are you sure you want to delete {selectedRequests.size} selected request{selectedRequests.size > 1 ? 's' : ''}? This action cannot be undone.
              <br />
              <span style={{ color: '#ef4444', fontWeight: '500' }}>
                Note: You can only delete your own requests.
              </span>
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={cancelDelete}
                disabled={deleting}
                style={{
                  padding: '8px 16px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.5 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  padding: '8px 16px',
                  background: deleting ? '#9ca3af' : '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Search Modal */}
      <AdvancedSearch
        isOpen={showAdvancedSearch}
        onClose={() => setShowAdvancedSearch(false)}
        onSearch={(config) => {
          setAdvancedSearchConfig(config)
          setSearchQuery('') // 清除简单搜索
          setShowAdvancedSearch(false)
        }}
        onClear={() => {
          setAdvancedSearchConfig(null)
          setSearchQuery('')
        }}
        savedSearches={savedSearches}
        onSaveSearch={(name, config) => {
          const newSavedSearches = [...savedSearches, { name, config }]
          setSavedSearches(newSavedSearches)
          localStorage.setItem('savedSearches', JSON.stringify(newSavedSearches))
        }}
      />

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

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
                onClick={confirmLogout}
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
  )
}

export default DashboardOriginal
