import { useState, useCallback } from 'react'
import { ToastItem } from '../components/ToastContainer'

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'loading' | 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const newToast: ToastItem = {
      id,
      message,
      type,
      duration: duration !== undefined ? duration : (type === 'error' ? 5000 : type === 'loading' ? 0 : 3000)
    }
    setToasts((prev) => [...prev, newToast])
    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showError = useCallback((message: string) => {
    showToast(message, 'error', 5000)
  }, [showToast])

  const showSuccess = useCallback((message: string) => {
    showToast(message, 'success', 3000)
  }, [showToast])

  const showInfo = useCallback((message: string) => {
    showToast(message, 'info', 3000)
  }, [showToast])

  return {
    toasts,
    showToast,
    removeToast,
    showError,
    showSuccess,
    showInfo
  }
}

