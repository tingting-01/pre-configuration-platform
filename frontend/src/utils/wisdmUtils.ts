import axios from 'axios'
import type { WisdmWorkflow } from '../services/api'

export const WISDM_WORKFLOW_LABELS: Record<WisdmWorkflow, string> = {
  CREATED: 'Created',
  WHITELIST_DONE: 'Whitelist Done',
  PROVISIONING_DONE: 'Provisioning Done',
  ALL_DONE: 'All Done',
}

export const WISDM_WORKFLOW_FILTERS: Array<{
  value: 'ALL' | WisdmWorkflow
  label: string
}> = [
  { value: 'ALL', label: 'All' },
  { value: 'CREATED', label: 'Created' },
  { value: 'WHITELIST_DONE', label: 'Whitelist Done' },
  { value: 'PROVISIONING_DONE', label: 'Provisioning Done' },
  { value: 'ALL_DONE', label: 'All Done' },
]

export const isWisdmInternalRole = (role?: string): boolean =>
  role === 'rakwireless' || role === 'admin'

export const normalizeSoNumber = (value: string): string => value.trim().toUpperCase()

export const formatWisdmDate = (value: string | null): string => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export const getWisdmErrorMessage = (error: unknown): string => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Request failed. Please try again.'
  }

  const detail = error.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail

  switch (error.response?.status) {
    case 400:
      return 'Please check the fields and selected workflow.'
    case 403:
      return 'You do not have permission to perform this action.'
    case 404:
      return 'The service record no longer exists.'
    case 409:
      return 'The SO already exists or this record was updated elsewhere. Refresh and try again.'
    default:
      return 'Request failed. Please try again.'
  }
}
