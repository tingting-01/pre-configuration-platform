import React, { useState, useEffect } from 'react'
import { Clock, User, ArrowRight, CheckCircle, UserPlus, UserMinus, MessageCircle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

interface HistoryItem {
  id: number
  activityType: string
  description: string
  createdAt: string
  authorName: string
  authorEmail: string
}

interface HistoryProps {
  requestId: string
}

const History: React.FC<HistoryProps> = ({ requestId }) => {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const { token } = useAuthStore()

  // 获取API基础URL的辅助函数
  const getApiBaseUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL
    }
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000'
    }
    return `http://${hostname}:8000`
  }

  useEffect(() => {
    if (token) {
      loadHistory()
    }
  }, [requestId, token])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/requests/${requestId}/activities`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setHistory(data)
      } else {
        console.error('Failed to load history')
      }
    } catch (error) {
      console.error('Error loading history:', error)
    } finally {
      setLoading(false)
    }
  }

  const getActivityIcon = (activityType: string) => {
    switch (activityType?.toLowerCase()) {
      case 'created':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'status_changed':
      case 'status_change':
        return <ArrowRight className="h-4 w-4 text-blue-500" />
      case 'assigned':
        return <UserPlus className="h-4 w-4 text-purple-500" />
      case 'unassigned':
        return <UserMinus className="h-4 w-4 text-orange-500" />
      case 'comment':
        return <MessageCircle className="h-4 w-4 text-gray-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getActivityColor = (activityType: string) => {
    switch (activityType?.toLowerCase()) {
      case 'created':
        return 'bg-green-50 border-green-200'
      case 'status_changed':
      case 'status_change':
        return 'bg-blue-50 border-blue-200'
      case 'assigned':
        return 'bg-purple-50 border-purple-200'
      case 'unassigned':
        return 'bg-orange-50 border-orange-200'
      case 'comment':
        return 'bg-gray-50 border-gray-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '20px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '12px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <Clock size={20} style={{ marginRight: '8px', color: '#6b7280' }} />
        <h3 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#1f2937',
          margin: 0
        }}>
          History ({history.length})
        </h3>
      </div>

      {/* History List */}
      <div style={{ marginBottom: '20px' }}>
        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: '#6b7280'
          }}>
            Loading history...
          </div>
        ) : history.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: '#6b7280',
            fontStyle: 'italic'
          }}>
            No history records yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.map((item, index) => (
              <div
                key={item.id}
                style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '12px',
                  position: 'relative',
                  paddingLeft: '40px'
                }}
              >
                {/* Icon */}
                <div style={{
                  position: 'absolute',
                  left: '12px',
                  top: '12px'
                }}>
                  {getActivityIcon(item.activityType)}
                </div>

                {/* Content */}
                <div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#1f2937',
                    marginBottom: '4px'
                  }}>
                    {item.description}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#6b7280'
                  }}>
                    <User size={12} />
                    <span>{item.authorName || item.authorEmail}</span>
                    <span>•</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default History

