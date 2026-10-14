import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  FileClock,
  MessageCircle,
  User,
  UserMinus,
  UserPlus
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import {
  formatHistoryValue,
  getHistoryAuthor,
  getHistoryFieldLabel,
  groupHistoryChanges,
  previewHistoryValue,
  type HistoryChangeGroup,
  type JsonValue
} from '../utils/historyFormatters'

interface HistoryChange {
  field: string
  from: JsonValue
  to: JsonValue
}

interface HistoryItem {
  id: string | number
  activityType: string
  description: string
  createdAt: string
  authorName?: string
  authorEmail?: string
  changes?: HistoryChange[]
}

interface HistoryProps {
  requestId: string
}

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000'
  }
  return `http://${hostname}:8000`
}

const getActivityIcon = (activityType: string) => {
  switch (activityType?.toLowerCase()) {
    case 'created':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'status_changed':
    case 'status_change':
      return <ArrowRight className="h-4 w-4 text-blue-500" />
    case 'configuration_changed':
      return <FileClock className="h-4 w-4 text-indigo-500" />
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

const HistoryValue: React.FC<{ value: JsonValue | undefined }> = ({ value }) => {
  const [expanded, setExpanded] = useState(false)
  const fullText = formatHistoryValue(value)
  const { text, expandable } = previewHistoryValue(fullText, expanded)

  return (
    <div style={{ minWidth: 0 }}>
      <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{text}</span>
      {expandable && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}
          style={{
            display: 'block',
            marginTop: '4px',
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: '#4f46e5',
            fontSize: '12px',
            lineHeight: '16px',
            cursor: 'pointer',
            fontFamily: 'inherit'
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

const HistoryChangeGroupRow: React.FC<{ group: HistoryChangeGroup<HistoryChange> }> = ({ group }) => {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: '14px',
          color: '#1f2937'
        }}
      >
        {open
          ? <ChevronDown size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
          : <ChevronRight size={16} color="#9ca3af" style={{ flexShrink: 0 }} />}
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
          <span style={{ fontWeight: 500 }}>{group.label}</span>
          <span style={{ color: '#9ca3af', fontWeight: 400 }}>({group.items.length})</span>
        </span>
        {/* <span style={{ marginLeft: 'auto', flexShrink: 0, color: '#6b7280', fontSize: '13px', fontWeight: 400 }}>
          {open ? 'Hide' : 'View changes'}
        </span> */}
      </button>

      {open && (
        <div style={{
          borderTop: '1px solid #e5e7eb',
          padding: '8px 12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {group.items.map((change, changeIndex) => (
            <div
              key={`${change.field}-${changeIndex}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(140px, 0.7fr) minmax(0, 1fr) auto minmax(0, 1fr)',
                alignItems: 'start',
                gap: '8px',
                fontSize: '12px',
                color: '#4b5563'
              }}
            >
              <div
                title={change.field}
                style={{
                  color: '#4f46e5',
                  fontWeight: 600,
                  overflowWrap: 'anywhere'
                }}
              >
                {getHistoryFieldLabel(change.field)}
              </div>
              <HistoryValue value={change.from} />
              <ArrowRight size={13} style={{ marginTop: '2px', color: '#9ca3af' }} />
              <HistoryValue value={change.to} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const HistoryChangeGroups: React.FC<{ changes: HistoryChange[] }> = ({ changes }) => {
  const groups = useMemo(() => groupHistoryChanges(changes), [changes])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      margin: '10px 0'
    }}>
      {groups.map(group => (
        <HistoryChangeGroupRow key={group.key} group={group} />
      ))}
    </div>
  )
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString || '—'
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

const History: React.FC<HistoryProps> = ({ requestId }) => {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const { token } = useAuthStore()

  useEffect(() => {
    if (!token) return
    let cancelled = false

    const loadHistory = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/requests/${requestId}/activities`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
        if (response.ok) {
          const data: HistoryItem[] = await response.json()
          if (!cancelled) setHistory(data)
        } else {
          console.error('Failed to load history')
        }
      } catch (error) {
        console.error('Error loading history:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [requestId, token])

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
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
          History ({history.length})
        </h3>
      </div>

      <div style={{ marginBottom: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
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
            {history.map(item => (
              <div
                key={String(item.id)}
                style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '12px',
                  position: 'relative',
                  paddingLeft: '40px'
                }}
              >
                <div style={{ position: 'absolute', left: '12px', top: '12px' }}>
                  {getActivityIcon(item.activityType)}
                </div>

                <div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#1f2937',
                    marginBottom: '4px',
                    overflowWrap: 'anywhere'
                  }}>
                    {item.description}
                  </div>

                  {item.changes && item.changes.length > 0 && (
                    <HistoryChangeGroups changes={item.changes} />
                  )}

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#6b7280'
                  }}>
                    <User size={12} />
                    <span>{getHistoryAuthor(item)}</span>
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
