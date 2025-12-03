import { useState, useEffect } from 'react'
import { templateAPI, Template } from '../services/api'
import { applyTemplateToForm, validateTemplateVariables } from '../utils/templateUtils'

interface TemplateSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (formData: Record<string, any>, templateId?: string, variableValues?: Record<string, string>) => void
}

const TemplateSelector = ({ isOpen, onClose, onSelect }: TemplateSelectorProps) => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadTemplates()
    }
  }, [isOpen])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (searchQuery) params.search = searchQuery
      const data = await templateAPI.getTemplates(params)
      setTemplates(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template)
    // 初始化变量值
    const initialValues: Record<string, string> = {}
    template.variables.forEach(variable => {
      initialValues[variable.name] = variable.defaultValue || ''
    })
    setVariableValues(initialValues)
    setError('')
  }

  const handleApply = async () => {
    if (!selectedTemplate) return

    // 验证变量
    const validation = validateTemplateVariables(selectedTemplate, variableValues)
    if (!validation.valid) {
      setError(`Missing required variables: ${validation.missing.join(', ')}`)
      return
    }

    try {
      // 调用后端API记录使用次数
      await templateAPI.applyTemplate(selectedTemplate.id, variableValues)
      
      // 应用模板
      const formData = applyTemplateToForm(selectedTemplate, variableValues)
      onSelect(formData, selectedTemplate.id, variableValues)
      onClose()
    } catch (err: any) {
      // 即使API调用失败，也允许应用模板（不影响功能）
      console.warn('Failed to record template usage:', err)
      const formData = applyTemplateToForm(selectedTemplate, variableValues)
      onSelect(formData, selectedTemplate.id, variableValues)
      onClose()
    }
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

  if (!isOpen) return null

  return (
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
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Select Template</h2>
          <button
            onClick={onClose}
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

        {!selectedTemplate ? (
          /* Template List */
          <div>
            {/* Search */}
            <div style={{ marginBottom: '16px' }}>
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
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                No templates found
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '16px'
              }}>
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    onClick={() => handleTemplateSelect(template)}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: '#ffffff'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#7c3aed'
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
                      {template.name}
                    </h3>
                    {template.description && (
                      <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#6b7280' }}>
                        {template.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
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
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Variable Input Form */
          <div>
            <div style={{ marginBottom: '16px' }}>
              <button
                onClick={() => setSelectedTemplate(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#7c3aed',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to Templates
              </button>
            </div>

            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
              {selectedTemplate.name}
            </h3>

            {selectedTemplate.description && (
              <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
                {selectedTemplate.description}
              </p>
            )}

            <div style={{
              padding: '12px',
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '0.375rem',
              marginBottom: '24px',
              fontSize: '14px',
              color: '#0369a1'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>Note:</strong>
                  <span>After applying this template, you can view and modify all configuration details (including LoRa, Network, System, etc.) on the configuration page.</span>
                </div>
              </div>
            </div>

            {selectedTemplate.variables.length > 0 ? (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '500' }}>
                  Fill in the variables:
                </h4>
                {selectedTemplate.variables.map(variable => (
                  <div key={variable.name} style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      {variable.label}
                      {variable.required && <span style={{ color: '#ef4444' }}> *</span>}
                    </label>
                    {variable.description && (
                      <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: '#6b7280' }}>
                        {variable.description}
                      </p>
                    )}
                    {variable.type === 'select' && variable.options ? (
                      <select
                        value={variableValues[variable.name] || ''}
                        onChange={(e) => setVariableValues({
                          ...variableValues,
                          [variable.name]: e.target.value
                        })}
                        required={variable.required}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem',
                          fontSize: '14px'
                        }}
                      >
                        <option value="">Select {variable.label}</option>
                        {variable.options.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : 'text'}
                        value={variableValues[variable.name] || ''}
                        onChange={(e) => setVariableValues({
                          ...variableValues,
                          [variable.name]: e.target.value
                        })}
                        placeholder={variable.defaultValue || `Enter ${variable.label}`}
                        required={variable.required}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.375rem',
                          fontSize: '14px'
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
                This template has no variables. Click Apply to use it directly.
              </p>
            )}

            {error && (
              <div style={{
                padding: '12px',
                background: '#fee2e2',
                color: '#dc2626',
                borderRadius: '0.375rem',
                marginBottom: '16px',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  color: '#374151'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                style={{
                  padding: '10px 20px',
                  background: '#7c3aed',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  color: '#ffffff'
                }}
              >
                Apply Template
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TemplateSelector

