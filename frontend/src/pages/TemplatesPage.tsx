import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { templateAPI, Template } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useToast } from '../hooks/useToast'
import ToastContainer from '../components/ToastContainer'

const TemplatesPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { toasts, showError, removeToast } = useToast()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)
  const [templateDetails, setTemplateDetails] = useState<Template | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (searchQuery) params.search = searchQuery
      const data = await templateAPI.getTemplates(params)
      setTemplates(data)
    } catch (err: any) {
      console.error('Failed to load templates:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (templateId: string) => {
    try {
      await templateAPI.deleteTemplate(templateId)
      setTemplates(templates.filter(t => t.id !== templateId))
      setShowDeleteConfirm(null)
    } catch (err: any) {
      showError(err.message || 'Failed to delete template')
    }
  }

  const handleApplyTemplate = async (template: Template) => {
    try {
      // 调用后端API记录使用次数（使用空变量值，因为用户会在配置页面填写）
      await templateAPI.applyTemplate(template.id, {})
    } catch (err: any) {
      // 即使API调用失败，也允许导航（不影响功能）
      console.warn('Failed to record template usage:', err)
    }
    
    // 导航到配置页面，并传递模板ID
    navigate(`/configuration?template=${template.id}`)
  }

  const handleEditTemplate = (template: Template) => {
    // 导航到配置页面，并传递模板ID用于编辑
    navigate(`/configuration?editTemplate=${template.id}`)
  }

  const handleViewDetails = async (template: Template) => {
    setLoadingDetails(true)
    setShowDetailsDialog(true)
    try {
      const details = await templateAPI.getTemplate(template.id)
      setTemplateDetails(details)
    } catch (err: any) {
      showError(err.message || 'Failed to load template details')
      setShowDetailsDialog(false)
    } finally {
      setLoadingDetails(false)
    }
  }

  // 将字段名转换为友好的显示名称
  const formatFieldName = (fieldName: string): string => {
    // 将 camelCase 转换为 "Camel Case"
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }

  // 渲染配置数据的辅助函数
  const renderConfigValue = (value: any, path: string = ''): React.ReactNode => {
    if (value === null || value === undefined || value === '') {
      return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>未设置</span>
    }
    
    if (typeof value === 'boolean') {
      return (
        <span style={{
          background: value ? '#d1fae5' : '#fee2e2',
          color: value ? '#065f46' : '#991b1b',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '13px',
          fontWeight: '500'
        }}>
          {value ? '已启用' : '已禁用'}
        </span>
      )
    }
    
    if (typeof value === 'string') {
      // 检查是否是变量占位符
      if (value.startsWith('{{') && value.endsWith('}}')) {
        const varName = value.slice(2, -2)
        // 查找对应的变量定义
        const variable = templateDetails?.variables?.find(v => v.name === varName)
        // 如果有默认值，显示默认值；否则显示"未设置"
        if (variable?.defaultValue) {
          return <span style={{ color: '#1f2937', fontSize: '14px' }}>{variable.defaultValue}</span>
        }
        return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>未设置</span>
      }
      return <span style={{ color: '#1f2937', fontSize: '14px' }}>{value}</span>
    }
    
    if (typeof value === 'number') {
      return <span style={{ color: '#1f2937', fontSize: '14px', fontWeight: '500' }}>{value}</span>
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>未设置</span>
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {value.map((item, index) => (
            <div key={index} style={{
              background: '#f3f4f6',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '13px'
            }}>
              {renderConfigValue(item, `${path}[${index}]`)}
            </div>
          ))}
        </div>
      )
    }
    
    if (typeof value === 'object') {
      // 如果是文件对象（有 name, id, size）
      if (value.name && (value.id !== undefined || value.size !== undefined)) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>
              📄 {value.name}
            </div>
            {value.size && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                大小: {(value.size / 1024).toFixed(2)} KB
              </div>
            )}
          </div>
        )
      }
      // 普通对象，递归渲染
      const keys = Object.keys(value)
      if (keys.length === 0) {
        return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>未设置</span>
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginLeft: '16px', marginTop: '8px' }}>
          {keys.map(key => (
            <div key={key} style={{
              borderLeft: '2px solid #e5e7eb',
              paddingLeft: '12px'
            }}>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px', fontWeight: '500' }}>
                {formatFieldName(key)}
              </div>
              <div style={{ fontSize: '14px' }}>
                {renderConfigValue(value[key], `${path}.${key}`)}
              </div>
            </div>
          ))}
        </div>
      )
    }
    
    return <span style={{ color: '#1f2937', fontSize: '14px' }}>{String(value)}</span>
  }

  // 渲染配置数据分组
  const renderConfigSection = (title: string, data: Record<string, any>) => {
    const keys = Object.keys(data)
    if (keys.length === 0) return null

    // 分组标题映射
    const sectionTitleMap: Record<string, string> = {
      'general': '基本信息',
      'network': '网络配置',
      'lora': 'LoRa 配置',
      'system': '系统配置',
      'extensions': '扩展功能',
      'other': '其他配置'
    }

    const displayTitle = sectionTitleMap[title.toLowerCase()] || formatFieldName(title)

    return (
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{
          margin: '0 0 16px 0',
          fontSize: '15px',
          fontWeight: '600',
          color: '#374151',
          paddingBottom: '8px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          {displayTitle}
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {keys.map(key => (
            <div
              key={key}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                padding: '16px',
                transition: 'all 0.2s'
              }}
            >
              <div style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '10px'
              }}>
                {formatFieldName(key)}
              </div>
              <div>
                {renderConfigValue(data[key], key)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const filteredTemplates = templates.filter(template => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        template.name.toLowerCase().includes(query) ||
        template.description?.toLowerCase().includes(query)
      )
    }
    return true
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9fafb',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{
        background: '#ffffff',
        borderRadius: '0.5rem',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '600' }}>
              Template Library
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
              Manage and reuse configuration templates
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => navigate('/configuration')}
              style={{
                padding: '10px 20px',
                background: '#7c3aed',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              + Create Template
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '10px 20px',
                background: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{
        background: '#ffffff',
        borderRadius: '0.5rem',
        padding: '16px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)'
      }}>
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: '0.375rem',
            fontSize: '14px'
          }}
        />
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading templates...</div>
      ) : filteredTemplates.length === 0 ? (
        <div style={{
          background: '#ffffff',
          borderRadius: '0.5rem',
          padding: '40px',
          textAlign: 'center',
          boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)'
        }}>
          <p style={{ color: '#6b7280', fontSize: '16px', margin: 0 }}>
            No templates found. Create your first template from the configuration page.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                padding: '20px',
                boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#7c3aed'
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', flex: 1 }}>
                  {template.name}
                </h3>
                {template.isPublic && (
                  <span style={{
                    background: '#dbeafe',
                    color: '#1e40af',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '500'
                  }}>
                    Public
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <span style={{
                  background: '#f3f4f6',
                  color: '#6b7280',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  {template.variables.length} variables
                </span>
                <span style={{
                  background: '#f3f4f6',
                  color: '#6b7280',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  Used {template.usageCount} times
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
                Created by {template.createdByName} • {new Date(template.createdAt).toLocaleDateString()}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleApplyTemplate(template)}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    background: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
                <button
                  onClick={() => handleViewDetails(template)}
                  style={{
                    padding: '8px 16px',
                    background: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Details
                </button>
                {(template.createdBy === user?.email || user?.email?.endsWith('@rakwireless.com')) && (
                  <>
                    <button
                      onClick={() => handleEditTemplate(template)}
                      style={{
                        padding: '8px 16px',
                        background: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(template.id)}
                      style={{
                        padding: '8px 16px',
                        background: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
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
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              Confirm Delete
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
              Are you sure you want to delete this template? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(null)}
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
                onClick={() => handleDelete(showDeleteConfirm)}
                style={{
                  padding: '10px 20px',
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Details Dialog */}
      {showDetailsDialog && (
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
            width: '90%',
            maxWidth: '900px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
                Template Details
              </h2>
              <button
                onClick={() => {
                  setShowDetailsDialog(false)
                  setTemplateDetails(null)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#6b7280'
                }}
              >
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingDetails ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Loading template details...</div>
            ) : templateDetails ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Basic Information */}
                <div>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                    Basic Information
                  </h3>
                  <div style={{
                    background: '#f9fafb',
                    borderRadius: '0.375rem',
                    padding: '16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '16px'
                  }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Name</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{templateDetails.name}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Category</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{templateDetails.category || 'N/A'}</div>
                    </div>
                    {templateDetails.description && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Description</div>
                        <div style={{ fontSize: '14px', color: '#1f2937' }}>{templateDetails.description}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Created By</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{templateDetails.createdByName}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Created At</div>
                      <div style={{ fontSize: '14px', color: '#1f2937' }}>
                        {new Date(templateDetails.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Updated At</div>
                      <div style={{ fontSize: '14px', color: '#1f2937' }}>
                        {new Date(templateDetails.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Version</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{templateDetails.version}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Usage Count</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{templateDetails.usageCount}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Visibility</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>
                        {templateDetails.isPublic ? (
                          <span style={{
                            background: '#dbeafe',
                            color: '#1e40af',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}>Public</span>
                        ) : (
                          <span style={{
                            background: '#f3f4f6',
                            color: '#6b7280',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}>Private</span>
                        )}
                      </div>
                    </div>
                    {templateDetails.tags && templateDetails.tags.length > 0 && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Tags</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {templateDetails.tags.map((tag, index) => (
                            <span
                              key={index}
                              style={{
                                background: '#ede9fe',
                                color: '#7c3aed',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px'
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Variables */}
                {templateDetails.variables && templateDetails.variables.length > 0 && (
                  <div>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                      Variables ({templateDetails.variables.length})
                    </h3>
                    <div style={{
                      background: '#f9fafb',
                      borderRadius: '0.375rem',
                      padding: '16px',
                      maxHeight: '300px',
                      overflow: 'auto'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {templateDetails.variables.map((variable, index) => (
                          <div
                            key={index}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '0.375rem',
                              padding: '12px'
                            }}
                          >
                             <div style={{ marginBottom: '8px' }}>
                               <div style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                                 {variable.label}
                                 {variable.required && (
                                   <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
                                 )}
                               </div>
                             </div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                              Name: <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '2px' }}>{variable.name}</code>
                            </div>
                            {variable.description && (
                              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                {variable.description}
                              </div>
                            )}
                            {variable.defaultValue && (
                              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                Default: <code style={{ background: '#f3f4f6', padding: '2px 4px', borderRadius: '2px' }}>{variable.defaultValue}</code>
                              </div>
                            )}
                            {variable.options && variable.options.length > 0 && (
                              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                Options: {variable.options.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Configuration Data */}
                <div>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                    Configuration Data
                  </h3>
                  <div style={{
                    background: '#f9fafb',
                    borderRadius: '0.375rem',
                    padding: '16px',
                    maxHeight: '500px',
                    overflow: 'auto'
                  }}>
                    {templateDetails.configData && Object.keys(templateDetails.configData).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {Object.keys(templateDetails.configData).map(sectionKey => {
                          const sectionData = templateDetails.configData[sectionKey]
                          if (!sectionData || (typeof sectionData === 'object' && Object.keys(sectionData).length === 0)) {
                            return null
                          }
                          return (
                            <div key={sectionKey}>
                              {renderConfigSection(sectionKey, sectionData)}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{
                        textAlign: 'center',
                        padding: '40px',
                        color: '#9ca3af',
                        fontSize: '14px'
                      }}>
                        No configuration data available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                No template details available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export default TemplatesPage

