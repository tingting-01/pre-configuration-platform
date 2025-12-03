import { SearchCondition, AdvancedSearchConfig } from '../components/AdvancedSearch'

/**
 * 将通配符模式转换为正则表达式
 * * 匹配任意字符
 * ? 匹配单个字符
 */
const wildcardToRegex = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
    .replace(/\*/g, '.*') // * 替换为 .*
    .replace(/\?/g, '.') // ? 替换为 .
  return new RegExp(`^${escaped}$`, 'i')
}

/**
 * 检查值是否匹配条件
 */
export const matchesCondition = (value: any, condition: SearchCondition): boolean => {
  if (!condition.value && condition.operator !== 'range') {
    return false
  }

  const fieldValue = value?.[condition.field]
  if (fieldValue === undefined || fieldValue === null) {
    return false
  }

  const strValue = String(fieldValue)
  const searchValue = String(condition.value || '')

  switch (condition.operator) {
    case 'contains':
      if (condition.caseSensitive) {
        return strValue.includes(searchValue)
      }
      return strValue.toLowerCase().includes(searchValue.toLowerCase())

    case 'equals':
      if (condition.caseSensitive) {
        return strValue === searchValue
      }
      return strValue.toLowerCase() === searchValue.toLowerCase()

    case 'startsWith':
      if (condition.caseSensitive) {
        return strValue.startsWith(searchValue)
      }
      return strValue.toLowerCase().startsWith(searchValue.toLowerCase())

    case 'endsWith':
      if (condition.caseSensitive) {
        return strValue.endsWith(searchValue)
      }
      return strValue.toLowerCase().endsWith(searchValue.toLowerCase())

    case 'wildcard':
      try {
        const regex = wildcardToRegex(searchValue)
        return regex.test(strValue)
      } catch (e) {
        console.error('Wildcard pattern error:', e)
        return false
      }

    case 'regex':
      try {
        const flags = condition.caseSensitive ? 'g' : 'gi'
        const regex = new RegExp(searchValue, flags)
        return regex.test(strValue)
      } catch (e) {
        console.error('Regex pattern error:', e)
        return false
      }

    case 'range':
      if (typeof condition.value === 'object' && condition.value.from && condition.value.to) {
        // 处理日期范围
        if (condition.field === 'submitTime') {
          const fieldDate = new Date(fieldValue)
          const fromDate = new Date(condition.value.from)
          const toDate = new Date(condition.value.to)
          toDate.setHours(23, 59, 59, 999) // 包含结束日期的整天
          return fieldDate >= fromDate && fieldDate <= toDate
        }
        // 处理数字范围（如果有数字字段）
        const numValue = Number(fieldValue)
        const fromNum = Number(condition.value.from)
        const toNum = Number(condition.value.to)
        if (!isNaN(numValue) && !isNaN(fromNum) && !isNaN(toNum)) {
          return numValue >= fromNum && numValue <= toNum
        }
      }
      return false

    default:
      return false
  }
}

/**
 * 检查请求是否匹配所有搜索条件
 */
export const matchesSearchConfig = (request: any, config: AdvancedSearchConfig): boolean => {
  if (!config.conditions || config.conditions.length === 0) {
    return true
  }

  // 处理优先级字段（从configData或tags中获取）
  if (request.configData?.general?.priority) {
    request.priority = request.configData.general.priority
  } else if (request.tags && Array.isArray(request.tags)) {
    const priorityTag = request.tags.find((tag: any) => tag.type === 'priority')
    if (priorityTag) {
      request.priority = priorityTag.value
    }
  }

  const results = config.conditions.map(condition => matchesCondition(request, condition))

  if (config.logic === 'AND') {
    return results.every(r => r)
  } else {
    return results.some(r => r)
  }
}

/**
 * 验证正则表达式是否有效
 */
export const isValidRegex = (pattern: string): boolean => {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

/**
 * 验证通配符模式
 */
export const isValidWildcard = (pattern: string): boolean => {
  // 通配符模式应该只包含字母、数字、空格和通配符字符
  return /^[a-zA-Z0-9\s*?._-]+$/.test(pattern)
}

