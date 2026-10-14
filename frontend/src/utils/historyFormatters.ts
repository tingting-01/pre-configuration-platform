export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

interface HistoryAuthor {
  authorName?: string
  authorEmail?: string
}

const UNKNOWN_NAMES = new Set(['unknown', 'unknown user'])
const UNKNOWN_EMAIL = 'unknown@example.com'
export const HISTORY_VALUE_PREVIEW_LENGTH = 100
const HISTORY_FIELD_LABELS: Record<string, string> = {
  'other.configFiles': 'Configuration files',
  'extensions.extensionFiles': 'Extension files'
}

const isRecord = (value: JsonValue): value is { [key: string]: JsonValue } => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const formatBytes = (value: JsonValue | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

const formatFileSummary = (value: { [key: string]: JsonValue }) => {
  if (typeof value.count !== 'number' || !Array.isArray(value.files)) return ''
  const files = value.files
    .filter(isRecord)
    .map(file => {
      const name = typeof file.name === 'string' ? file.name : 'Unnamed file'
      const size = formatBytes(file.size)
      return size ? `${name} (${size})` : name
    })
  const totalSize = formatBytes(value.totalSize)
  const details = files.length > 0 ? `: ${files.join(', ')}` : ''
  const total = totalSize ? `, total ${totalSize}` : ''
  return `${value.count} file${value.count === 1 ? '' : 's'}${details}${total}`
}

export const formatHistoryValue = (value: JsonValue | undefined): string => {
  if (value === null || value === undefined || value === '') return '—'
  if (isRecord(value)) {
    const fileSummary = formatFileSummary(value)
    if (fileSummary) return fileSummary
  }
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return '[Unable to display value]'
  }
}

export const previewHistoryValue = (value: string, expanded: boolean) => {
  const expandable = value.length > HISTORY_VALUE_PREVIEW_LENGTH
  if (!expandable || expanded) return { text: value, expandable }
  return {
    text: `${value.slice(0, HISTORY_VALUE_PREVIEW_LENGTH)}…`,
    expandable
  }
}

const MODULE_LABELS: Record<string, string> = {
  general: 'Order Information',
  network: 'Network Configuration',
  lora: 'LoRa Configuration',
  system: 'System Configuration',
  extensions: 'Pre-installed Extension',
  other: 'Other Configurations'
}

export interface HistoryChangeGroup<T> {
  key: string
  label: string
  items: T[]
}

const moduleKeyOf = (field: string) => {
  const dot = field.indexOf('.')
  return dot > 0 ? field.slice(0, dot) : field || 'other'
}

export const getHistoryModuleLabel = (moduleKey: string) => (
  MODULE_LABELS[moduleKey] || (moduleKey ? moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1) : 'Other')
)

// Drop the first path segment inside a group. Friendly labels stay as-is.
export const getHistoryFieldLabel = (field: string) => {
  const friendly = HISTORY_FIELD_LABELS[field]
  if (friendly) return friendly
  const dot = field.indexOf('.')
  if (dot > 0 && dot < field.length - 1) return field.slice(dot + 1)
  return field || '—'
}

export const groupHistoryChanges = <T extends { field: string }>(
  changes: T[]
): HistoryChangeGroup<T>[] => {
  const groups: HistoryChangeGroup<T>[] = []
  const indexByKey = new Map<string, number>()

  for (const change of changes) {
    const key = moduleKeyOf(change.field)
    const index = indexByKey.get(key)
    if (index === undefined) {
      indexByKey.set(key, groups.length)
      groups.push({ key, label: getHistoryModuleLabel(key), items: [change] })
    } else {
      groups[index].items.push(change)
    }
  }

  return groups
}

export const getHistoryAuthor = (item: HistoryAuthor) => {
  const name = item.authorName?.trim() || ''
  const email = item.authorEmail?.trim() || ''
  if (name && !UNKNOWN_NAMES.has(name.toLowerCase())) return name
  if (email && email.toLowerCase() !== UNKNOWN_EMAIL) return email
  return 'Unknown User'
}
