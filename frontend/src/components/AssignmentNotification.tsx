import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from 'react-query'
import { Bell } from 'lucide-react'
import { requestAPI } from '../services/api'
import { useAuthStore } from '../stores/authStore'

interface AssignmentActivity {
  id: number
  requestId: string
  activityType: string
  description: string
  createdAt: string
  authorName: string
  authorEmail: string
}

interface AssignmentNotificationProps {
  assignedCount: number
  assignedRequests: Array<{
    id: string
    companyName: string
    status: string
  }>
  onRequestClick: (requestId: string) => void
  onMarkAsRead?: () => void
}

const AssignmentNotification: React.FC<AssignmentNotificationProps> = ({
  assignedCount,
  assignedRequests,
  onRequestClick,
  onMarkAsRead
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(assignedCount)
  const [hasBeenRead, setHasBeenRead] = useState(false)
  const [lastAssignedCount, setLastAssignedCount] = useState(assignedCount)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { token, user } = useAuthStore()

  // 从localStorage加载已读活动ID
  const loadReadActivityIds = (): Set<number> => {
    if (!user?.email) return new Set()
    try {
      const key = `read_activities_${user.email}`
      const stored = localStorage.getItem(key)
      if (stored) {
        const ids = JSON.parse(stored) as number[]
        return new Set(ids)
      }
    } catch (error) {
      console.error('Failed to load read activity IDs:', error)
    }
    return new Set()
  }

  // 保存已读活动ID到localStorage
  const saveReadActivityIds = (ids: Set<number>) => {
    if (!user?.email) return
    try {
      const key = `read_activities_${user.email}`
      localStorage.setItem(key, JSON.stringify(Array.from(ids)))
    } catch (error) {
      console.error('Failed to save read activity IDs:', error)
    }
  }

  const [readActivityIds, setReadActivityIds] = useState<Set<number>>(loadReadActivityIds())

  const getClearedStorageKey = () => user?.email ? `cleared_activities_${user.email}` : null

  const loadClearedTimestamp = (): number | null => {
    const key = getClearedStorageKey()
    if (!key) return null
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        const parsed = parseInt(stored, 10)
        return isNaN(parsed) ? null : parsed
      }
    } catch (error) {
      console.error('Failed to load cleared timestamp:', error)
    }
    return null
  }

  const saveClearedTimestamp = (timestamp: number | null) => {
    const key = getClearedStorageKey()
    if (!key) return
    try {
      if (timestamp === null) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, String(timestamp))
      }
    } catch (error) {
      console.error('Failed to save cleared timestamp:', error)
    }
  }

  const [clearedTimestamp, setClearedTimestamp] = useState<number | null>(loadClearedTimestamp())

  // 使用 React Query 获取分配活动，启用缓存
  const { data: activitiesData = [] } = useQuery(
    ['assignments', user?.email],
    () => requestAPI.getMyAssignments(),
    {
      enabled: !!token && !!user?.email,
      staleTime: 1 * 60 * 1000, // 数据在1分钟内被认为是新鲜的
      cacheTime: 5 * 60 * 1000, // 缓存保留5分钟
      refetchOnWindowFocus: false, // 窗口获得焦点时不自动刷新
      refetchOnMount: false, // 组件挂载时如果缓存数据存在且未过期，不重新请求
      refetchInterval: 30000, // 每30秒自动刷新一次（后台刷新）
      retry: 1,
    }
  )

  // 根据 clearedTimestamp 过滤活动
  const activities = clearedTimestamp
    ? activitiesData.filter(activity => new Date(activity.createdAt).getTime() > clearedTimestamp)
    : activitiesData

  // 初始化时从localStorage加载已读状态
  useEffect(() => {
    if (user?.email) {
      const loadedIds = loadReadActivityIds()
      setReadActivityIds(loadedIds)
      setClearedTimestamp(loadClearedTimestamp())
    } else {
      setClearedTimestamp(null)
    }
  }, [user?.email])

  // 活动数据已通过 React Query 获取，这里只需要处理日志
  useEffect(() => {
    if (activities.length > 0) {
      console.log('Loaded assignment activities:', activities)
      console.log('Unread activity IDs:', Array.from(readActivityIds))
    }
  }, [activities, readActivityIds])

  // 当assignedCount变化时，更新未读数量（新增的分配会增加未读数）
  useEffect(() => {
    if (hasBeenRead) {
      // 如果已经标记为已读，只有新的分配数量大于之前的分配数量时，才增加未读数（说明有新的分配）
      if (assignedCount > lastAssignedCount) {
        const newUnreadCount = unreadCount + (assignedCount - lastAssignedCount)
        setUnreadCount(newUnreadCount)
      }
      // 如果分配数量减少，减少未读数（但不能小于0）
      else if (assignedCount < lastAssignedCount) {
        const decrease = lastAssignedCount - assignedCount
        setUnreadCount(Math.max(0, unreadCount - decrease))
      }
      setLastAssignedCount(assignedCount)
    } else {
      // 如果还没有标记为已读，同步未读数到分配数
      setUnreadCount(assignedCount)
      setLastAssignedCount(assignedCount)
    }
  }, [assignedCount])

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        // 关闭下拉菜单（不需要再次标记为已读，因为打开时已经标记了）
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // 处理点击铃铛图标
  const handleBellClick = () => {
    if (!isOpen) {
      // 打开下拉菜单时，立即标记所有当前未读活动为已读（清除徽章）
      const currentUnreadIds = activities
        .filter(a => !readActivityIds.has(a.id))
        .map(a => a.id)
      if (currentUnreadIds.length > 0) {
        const newReadIds = new Set([...readActivityIds, ...currentUnreadIds])
        setReadActivityIds(newReadIds)
        saveReadActivityIds(newReadIds) // 持久化到localStorage
      }
      setUnreadCount(0)
      setHasBeenRead(true)
      setLastAssignedCount(assignedCount)
      if (onMarkAsRead) {
        onMarkAsRead()
      }
      // 打开下拉菜单，显示所有通知（包括刚刚标记为已读的）
      setIsOpen(true)
    } else {
      // 关闭下拉菜单
      setIsOpen(false)
    }
  }

  // 处理清除所有通知
  const handleClearAll = () => {
    const now = Date.now()
    setClearedTimestamp(now)
    saveClearedTimestamp(now)
    const resetReadIds = new Set<number>()
    setReadActivityIds(resetReadIds)
    saveReadActivityIds(resetReadIds)
    setActivities([])
    setUnreadCount(0)
    setHasBeenRead(true)
    setLastAssignedCount(assignedCount)
    if (onMarkAsRead) {
      onMarkAsRead()
    }
  }

  // 获取未读的活动记录（用于徽章显示）
  // 去重：同一个request只计算一次，基于最新活动状态
  // 包括assigned、unassigned和status_changed三种类型
  const unreadActivities = (() => {
    const unread = activities.filter(a => !readActivityIds.has(a.id))
    
    // 按request_id和activity_type组合分组，每个组合只保留最新的活动
    // 这样可以区分同一个request的不同类型活动（assigned和status_changed）
    const activityMap = new Map<string, AssignmentActivity>()
    
    unread.forEach(activity => {
      // 使用request_id和activity_type作为key，这样可以同时显示assigned和status_changed
      const key = `${activity.requestId}_${activity.activityType}`
      const existing = activityMap.get(key)
      if (!existing) {
        activityMap.set(key, activity)
      } else {
        // 比较时间，保留最新的
        const existingTime = new Date(existing.createdAt).getTime()
        const currentTime = new Date(activity.createdAt).getTime()
        if (currentTime > existingTime) {
          activityMap.set(key, activity)
        }
      }
    })
    
    // 返回所有类型的活动（assigned、unassigned和status_changed都显示为未读通知）
    return Array.from(activityMap.values())
  })()
  
  // 获取所有活动记录（用于下拉菜单显示），按request_id和activity_type组合去重，保留最新的
  // 这样可以同时显示同一个request的不同类型活动（assigned和status_changed）
  const allActivities = activities
    .reduce((acc: AssignmentActivity[], current) => {
      const key = `${current.requestId}_${current.activityType}`
      const existing = acc.find(a => `${a.requestId}_${a.activityType}` === key)
      if (!existing) {
        acc.push(current)
      } else {
        // 如果已存在，比较时间，保留最新的
        const existingTime = new Date(existing.createdAt).getTime()
        const currentTime = new Date(current.createdAt).getTime()
        if (currentTime > existingTime) {
          const index = acc.indexOf(existing)
          acc[index] = current
        }
      }
      return acc
    }, [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  
  // 调试日志
  useEffect(() => {
    console.log('=== Assignment Notification Debug ===')
    console.log('Total activities loaded:', activities.length)
    console.log('Activities by request:', activities.reduce((acc, a) => {
      acc[a.requestId] = (acc[a.requestId] || 0) + 1
      return acc
    }, {} as Record<string, number>))
    console.log('Unread activity IDs:', Array.from(readActivityIds))
    console.log('Unread activities (before dedup):', activities.filter(a => !readActivityIds.has(a.id)).length)
    console.log('Unread activities (after dedup):', unreadActivities.length)
    console.log('Unread activities details:', unreadActivities.map(a => ({
      id: a.id,
      requestId: a.requestId,
      type: a.activityType,
      description: a.description
    })))
  }, [activities, unreadActivities, readActivityIds])

  // 格式化活动描述
  const formatActivityDescription = (activity: AssignmentActivity): string => {
    // 从description中提取信息，格式为：
    // - assigned: "{operator_name} assigned request {request_id} to {assignee_name}"
    // - unassigned: "{operator_name} unassigned request {request_id} from {unassignee_name}"
    // - status_changed: "{operator_name} updated workflow process of request {request_id} from '{old_status}' to '{new_status}'"
    
    if (activity.activityType === 'assigned') {
      // 根据新的提醒逻辑：
      // 1. 如果是当前用户创建的request被assign，显示"你提交的request被指派给了某人"
      // 2. 如果是非当前用户创建的request，且assignee是当前用户，显示"to you"
      const matchToYou = activity.description.match(/assigned request (\w+) to (.+)/)
      if (matchToYou) {
        const assigneeName = matchToYou[2]
        // 如果assignee是当前用户，显示"to you"（非creator的request被assign给当前用户）
        if (assigneeName.toLowerCase().includes(user?.email?.toLowerCase() || '')) {
          return `${activity.authorName} assigned request ${matchToYou[1]} to you`
        }
        // 否则显示"你提交的request被指派给了某人"（当前用户创建的request被assign给其他人）
        return `Your request ${matchToYou[1]} was assigned to ${assigneeName} by ${activity.authorName}`
      }
      // 如果格式不匹配，使用默认格式
      return `${activity.authorName} assigned request ${activity.requestId} to you`
    } else if (activity.activityType === 'unassigned') {
      // 根据新的提醒逻辑，unassigned只会在非creator的request且assignee是当前用户时提醒
      // 所以这里总是显示"from you"
      const match = activity.description.match(/unassigned request (\w+) from (.+)/)
      if (match) {
        return `${activity.authorName} unassigned request ${match[1]} from you`
      }
      // 如果格式不匹配，使用默认格式
      return `${activity.authorName} unassigned request ${activity.requestId} from you`
    } else if (activity.activityType === 'status_changed') {
      // 根据新的提醒逻辑，status_changed只会在当前用户创建的request时提醒
      // 所以这里总是显示"你的request的workflow被更新"
      const match = activity.description.match(/updated workflow process of request (\w+) from '(.+)' to '(.+)'/)
      if (match) {
        return `Your request ${match[1]} workflow process was updated from '${match[2]}' to '${match[3]}' by ${activity.authorName}`
      }
      // 如果格式不匹配，尝试其他格式
      return `Your request ${activity.requestId} workflow process was updated by ${activity.authorName}`
    }
    return activity.description
  }

  // 铃铛图标始终显示，即使没有通知
  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={handleBellClick}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background-color 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <Bell size={20} color="#374151" />
        {unreadActivities.length > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: '600',
              minWidth: '18px',
              height: '18px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid #ffffff'
            }}
          >
            {unreadActivities.length > 99 ? '99+' : unreadActivities.length}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            background: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            border: '1px solid #e5e7eb',
            minWidth: '320px',
            maxWidth: '400px',
            maxHeight: '400px',
            overflow: 'hidden',
            zIndex: 1000
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e5e7eb',
              background: '#f9fafb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <h3
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0,
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              Assignment Notifications ({allActivities.length})
            </h3>
            {allActivities.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleClearAll()
                }}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: '500',
                  color: '#6b7280',
                  background: 'transparent',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6'
                  e.currentTarget.style.borderColor = '#9ca3af'
                  e.currentTarget.style.color = '#374151'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = '#d1d5db'
                  e.currentTarget.style.color = '#6b7280'
                }}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Activity List */}
          <div
            style={{
              maxHeight: '300px',
              overflowY: 'auto'
            }}
          >
            {allActivities.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: '14px'
                }}
              >
                No notifications
              </div>
            ) : (
              allActivities.map((activity) => {
                const isUnread = !readActivityIds.has(activity.id)
                return (
                <div
                  key={activity.id}
                  onClick={() => {
                    // 点击通知项时，标记该项为已读（如果还未标记）
                    if (!readActivityIds.has(activity.id)) {
                      const newReadIds = new Set([...readActivityIds, activity.id])
                      setReadActivityIds(newReadIds)
                      saveReadActivityIds(newReadIds) // 持久化到localStorage
                    }
                    onRequestClick(activity.requestId)
                    setIsOpen(false)
                  }}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                    background: isUnread ? '#fef3c7' : 'transparent' // 未读通知有黄色背景
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isUnread ? '#fef3c7' : 'transparent'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#1f2937',
                          lineHeight: '1.4',
                          flex: 1
                        }}
                      >
                        {formatActivityDescription(activity)}
                      </div>
                      {isUnread && (
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#ef4444',
                            flexShrink: 0
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span>
                        {new Date(activity.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {activity.activityType === 'assigned' && (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#ecfdf5',
                            color: '#059669',
                            fontSize: '10px',
                            fontWeight: '500'
                          }}
                        >
                          Assigned
                        </span>
                      )}
                      {activity.activityType === 'unassigned' && (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#fef3c7',
                            color: '#d97706',
                            fontSize: '10px',
                            fontWeight: '500'
                          }}
                        >
                          Unassigned
                        </span>
                      )}
                      {activity.activityType === 'status_changed' && (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#dbeafe',
                            color: '#1e40af',
                            fontSize: '10px',
                            fontWeight: '500'
                          }}
                        >
                          Workflow Updated
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AssignmentNotification

