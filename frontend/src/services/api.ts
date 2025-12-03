import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

// 动态获取API地址，支持局域网访问
const getApiBaseUrl = () => {
  // 如果设置了环境变量，使用环境变量
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // 获取当前主机地址
  const hostname = window.location.hostname
  
  // 如果是localhost或127.0.0.1，使用localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000'
  }
  
  // 否则使用当前主机地址，强制使用HTTP协议
  return `http://${hostname}:8000`
}

const API_BASE_URL = getApiBaseUrl()

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30秒超时，适合局域网访问
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 - 添加认证token
api.interceptors.request.use(
  (config) => {
    const { token } = useAuthStore.getState()
    
    console.log('API Request:', config.url)
    console.log('Token available:', !!token)
    console.log('Token preview:', token ? token.substring(0, 20) + '...' : 'None')
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      console.log('Authorization header set')
    } else {
      console.log('No token available for request')
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理认证错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// API接口定义
export interface User {
  id: number
  email: string
  name?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}

export interface Request {
  id: string
  companyName: string
  rakId: string
  submitTime: string
  status: string
  assignee?: string
  configData: Record<string, any>
  changes: Record<string, any>
  originalConfig: Record<string, any>
  creatorEmail?: string
  user: string
  tags?: Array<{ type: string; value: string; label: string }>
}

export interface CreateRequestRequest {
  companyName: string
  rakId: string
  configData: Record<string, any>
  changes: Record<string, any>
  originalConfig: Record<string, any>
  tags?: Array<{ type: string; value: string; label: string }>
}

// 认证API
export const authAPI = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    console.log('API: Making login request to:', `${API_BASE_URL}/api/auth/login`)
    console.log('API: Request data:', data)
    try {
      const response = await api.post('/api/auth/login', data)
      console.log('API: Login response:', response.data)
      return response.data
    } catch (error) {
      console.error('API: Login error:', error)
      throw error
    }
  },
  
  register: async (data: { email: string; password: string; name?: string }) => {
    const response = await api.post('/api/auth/register', data)
    return response.data
  },
}

// 请求API
export const requestAPI = {
  getRequests: async (): Promise<Request[]> => {
    const response = await api.get('/api/requests')
    return response.data
  },
  
  getRequest: async (id: string): Promise<Request> => {
    const response = await api.get(`/api/requests/${id}`)
    return response.data
  },
  
  createRequest: async (data: CreateRequestRequest): Promise<Request> => {
    const response = await api.post('/api/requests', data)
    return response.data
  },
  
  updateRequest: async (id: string, data: { status?: string; assignee?: string; configData?: Record<string, any>; companyName?: string; rakId?: string; tags?: Array<{ type: string; value: string; label: string }> }) => {
    const response = await api.put(`/api/requests/${id}`, data)
    return response.data
  },
  
  getUsers: async () => {
    const response = await api.get('/api/users')
    return response.data
  },
  
  getMyAssignments: async () => {
    const response = await api.get('/api/users/me/assignments')
    return response.data
  },
  
  deleteRequest: async (id: string) => {
    const response = await api.delete(`/api/requests/${id}`)
    return response.data
  },
  
  deleteRequests: async (ids: string[]) => {
    // 使用批量删除API
    try {
      const response = await api.post('/api/requests/batch/delete', { ids })
      return { message: response.data.message, results: ids.map(id => ({ id, success: true })) }
    } catch (error: any) {
      // 如果批量删除失败，尝试单个删除
      const results = []
      for (const id of ids) {
        try {
          const response = await api.delete(`/api/requests/${id}`)
          results.push({ id, success: true, data: response.data })
        } catch (err: any) {
          results.push({ id, success: false, error: err.response?.data?.detail || err.message })
        }
      }
      return { message: `Processed ${ids.length} requests`, results }
    }
  },
}

// 文件API
export const fileAPI = {
  uploadFile: async (requestId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post(`/api/files/upload/${requestId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
}

// 模板API
export interface Template {
  id: string
  name: string
  description?: string
  category: string
  configData: Record<string, any>
  variables: Array<{
    name: string
    type: 'text' | 'select' | 'date' | 'number'
    label: string
    defaultValue?: string
    options?: string[]
    required: boolean
    description?: string
  }>
  tags?: string[]
  isPublic: boolean
  createdAt: string
  updatedAt: string
  version: number
  usageCount: number
  createdBy: string
  createdByName: string
}

export interface CreateTemplateRequest {
  name: string
  description?: string
  category?: string
  configData: Record<string, any>
  variables?: Array<{
    name: string
    type: 'text' | 'select' | 'date' | 'number'
    label: string
    defaultValue?: string
    options?: string[]
    required: boolean
    description?: string
  }>
  tags?: string[]
  isPublic?: boolean
}

export interface UpdateTemplateRequest {
  name?: string
  description?: string
  category?: string
  configData?: Record<string, any>
  variables?: Array<{
    name: string
    type: 'text' | 'select' | 'date' | 'number'
    label: string
    defaultValue?: string
    options?: string[]
    required: boolean
    description?: string
  }>
  tags?: string[]
  isPublic?: boolean
}

export const templateAPI = {
  getTemplates: async (params?: { category?: string; is_public?: boolean; search?: string }): Promise<Template[]> => {
    const response = await api.get('/api/templates', { params })
    return response.data
  },
  
  getTemplate: async (id: string): Promise<Template> => {
    const response = await api.get(`/api/templates/${id}`)
    return response.data
  },
  
  createTemplate: async (data: CreateTemplateRequest) => {
    const response = await api.post('/api/templates', data)
    return response.data
  },
  
  updateTemplate: async (id: string, data: UpdateTemplateRequest) => {
    const response = await api.put(`/api/templates/${id}`, data)
    return response.data
  },
  
  deleteTemplate: async (id: string) => {
    const response = await api.delete(`/api/templates/${id}`)
    return response.data
  },
  
  applyTemplate: async (id: string, variableValues: Record<string, string>) => {
    const response = await api.post(`/api/templates/${id}/apply`, variableValues)
    return response.data
  },
  
  getCategories: async (): Promise<string[]> => {
    const response = await api.get('/api/templates/categories')
    return response.data
  },
}

export default api
