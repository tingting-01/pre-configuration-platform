import React, { useEffect, useState } from 'react'
import { X, CheckCircle2, AlertCircle, Loader2, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'loading' | 'info'

export interface ToastProps {
  message: string
  type: ToastType
  duration?: number // 自动消失时间（毫秒），0表示不自动消失
  onClose?: () => void
}

const Toast: React.FC<ToastProps> = ({ message, type, duration = 3000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (duration > 0 && type !== 'loading') {
      const timer = setTimeout(() => {
        handleClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, type])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      onClose?.()
    }, 300) // 动画时间
  }

  if (!isVisible) return null

  const getToastStyles = () => {
    const baseStyles = {
      position: 'relative' as const,
      minWidth: '300px',
      maxWidth: '500px',
      padding: '16px 20px',
      borderRadius: '8px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 6px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      transform: isExiting ? 'translateX(400px)' : 'translateX(0)',
      opacity: isExiting ? 0 : 1,
      transition: 'all 0.3s ease-in-out',
      pointerEvents: 'auto' as const,
    }

    switch (type) {
      case 'success':
        return {
          ...baseStyles,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#16a34a',
        }
      case 'error':
        return {
          ...baseStyles,
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#dc2626',
        }
      case 'loading':
        return {
          ...baseStyles,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          color: '#7c3aed',
        }
      case 'info':
        return {
          ...baseStyles,
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          color: '#2563eb',
        }
      default:
        return baseStyles
    }
  }

  const getIcon = () => {
    const iconSize = 20
    switch (type) {
      case 'success':
        return <CheckCircle2 size={iconSize} />
      case 'error':
        return <AlertCircle size={iconSize} />
      case 'loading':
        return <Loader2 size={iconSize} className="animate-spin" />
      case 'info':
        return <Info size={iconSize} />
      default:
        return null
    }
  }

  return (
    <div style={getToastStyles()}>
      {getIcon()}
      <div style={{ flex: 1, fontSize: '14px', fontWeight: '500' }}>
        {message}
      </div>
      {type !== 'loading' && (
        <button
          onClick={handleClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'inherit',
            opacity: 0.7,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export default Toast

