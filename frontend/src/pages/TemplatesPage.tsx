import { useState, useEffect } from 'react'
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

              {template.description && (
                <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#6b7280' }}>
                  {template.description}
                </p>
              )}

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

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export default TemplatesPage

