import { useState } from 'react'
import { useToast } from '../hooks/useToast'
import ToastContainer from './ToastContainer'

export interface SearchCondition {
  field: string
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'regex' | 'range' | 'wildcard'
  value: string | { from: string; to: string }
  caseSensitive?: boolean
}

export interface AdvancedSearchConfig {
  conditions: SearchCondition[]
  logic: 'AND' | 'OR'
}

interface AdvancedSearchProps {
  isOpen: boolean
  onClose: () => void
  onSearch: (config: AdvancedSearchConfig) => void
  onClear: () => void
  savedSearches?: Array<{ name: string; config: AdvancedSearchConfig }>
  onSaveSearch?: (name: string, config: AdvancedSearchConfig) => void
}

const AdvancedSearch = ({
  isOpen,
  onClose,
  onSearch,
  onClear,
  savedSearches = [],
  onSaveSearch
}: AdvancedSearchProps) => {
  const [conditions, setConditions] = useState<SearchCondition[]>([
    { field: 'id', operator: 'contains', value: '' }
  ])
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const [saveSearchName, setSaveSearchName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const { toasts, showError, removeToast } = useToast()

  const fieldOptions = [
    { value: 'id', label: 'Request ID' },
    { value: 'companyName', label: 'Company' },
    { value: 'rakId', label: 'RAK ID' },
    { value: 'creatorEmail', label: 'Creator' },
    { value: 'status', label: 'Status' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'submitTime', label: 'Submit Time' },
    { value: 'priority', label: 'Priority' }
  ]

  const operatorOptions = {
    text: [
      { value: 'contains', label: 'Contains' },
      { value: 'equals', label: 'Equals' },
      { value: 'startsWith', label: 'Starts With' },
      { value: 'endsWith', label: 'Ends With' },
      { value: 'wildcard', label: 'Wildcard (*, ?)' },
      { value: 'regex', label: 'Regular Expression' }
    ],
    date: [
      { value: 'range', label: 'Date Range' }
    ],
    select: [
      { value: 'equals', label: 'Equals' }
    ]
  }

  const getOperatorsForField = (field: string) => {
    if (field === 'submitTime') {
      return operatorOptions.date
    }
    if (field === 'status' || field === 'priority') {
      return operatorOptions.select
    }
    return operatorOptions.text
  }

  const addCondition = () => {
    setConditions([...conditions, { field: 'id', operator: 'contains', value: '' }])
  }

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index))
  }

  const updateCondition = (index: number, updates: Partial<SearchCondition>) => {
    const newConditions = [...conditions]
    newConditions[index] = { ...newConditions[index], ...updates }
    setConditions(newConditions)
  }

  const handleSearch = () => {
    const validConditions = conditions.filter(c => {
      if (c.operator === 'range') {
        return typeof c.value === 'object' && c.value.from && c.value.to
      }
      return c.value && String(c.value).trim() !== ''
    })

    if (validConditions.length === 0) {
      showError('Please add at least one valid search condition')
      return
    }

    onSearch({ conditions: validConditions, logic })
  }

  const handleClear = () => {
    setConditions([{ field: 'id', operator: 'contains', value: '' }])
    setLogic('AND')
    onClear()
  }

  const handleSaveSearch = () => {
    if (!saveSearchName.trim()) {
      showError('Please enter a name for this search')
      return
    }

    const validConditions = conditions.filter(c => {
      if (c.operator === 'range') {
        return typeof c.value === 'object' && c.value.from && c.value.to
      }
      return c.value && String(c.value).trim() !== ''
    })

    if (validConditions.length === 0) {
      showError('Please add at least one valid search condition')
      return
    }

    if (onSaveSearch) {
      onSaveSearch(saveSearchName, { conditions: validConditions, logic })
      setSaveSearchName('')
      setShowSaveDialog(false)
    }
  }

  const loadSavedSearch = (config: AdvancedSearchConfig) => {
    setConditions(config.conditions.length > 0 ? config.conditions : [{ field: 'id', operator: 'contains', value: '' }])
    setLogic(config.logic)
  }

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
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>Advanced Search</h2>
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

        {/* Saved Searches */}
        {savedSearches.length > 0 && (
          <div style={{ marginBottom: '24px', padding: '12px', background: '#f9fafb', borderRadius: '0.375rem' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>Saved Searches:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {savedSearches.map((saved, index) => (
                <button
                  key={index}
                  onClick={() => loadSavedSearch(saved.config)}
                  style={{
                    padding: '6px 12px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    fontSize: '12px',
                    cursor: 'pointer',
                    color: '#374151'
                  }}
                >
                  {saved.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Conditions */}
        <div style={{ marginBottom: '24px' }}>
          {conditions.map((condition, index) => (
            <div key={index} style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
              marginBottom: '12px',
              padding: '12px',
              background: '#f9fafb',
              borderRadius: '0.375rem'
            }}>
              {/* Field Select */}
              <select
                value={condition.field}
                onChange={(e) => updateCondition(index, { field: e.target.value, operator: getOperatorsForField(e.target.value)[0].value as any, value: '' })}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  minWidth: '140px'
                }}
              >
                {fieldOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Operator Select */}
              <select
                value={condition.operator}
                onChange={(e) => {
                  const newOp = e.target.value as SearchCondition['operator']
                  updateCondition(index, {
                    operator: newOp,
                    value: newOp === 'range' ? { from: '', to: '' } : ''
                  })
                }}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  minWidth: '140px'
                }}
              >
                {getOperatorsForField(condition.field).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Value Input */}
              {condition.operator === 'range' ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                  <input
                    type="date"
                    value={typeof condition.value === 'object' ? condition.value.from : ''}
                    onChange={(e) => updateCondition(index, {
                      value: {
                        from: e.target.value,
                        to: typeof condition.value === 'object' ? condition.value.to : ''
                      }
                    })}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      fontSize: '14px',
                      flex: 1
                    }}
                  />
                  <span style={{ color: '#6b7280' }}>to</span>
                  <input
                    type="date"
                    value={typeof condition.value === 'object' ? condition.value.to : ''}
                    onChange={(e) => updateCondition(index, {
                      value: {
                        from: typeof condition.value === 'object' ? condition.value.from : '',
                        to: e.target.value
                      }
                    })}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      fontSize: '14px',
                      flex: 1
                    }}
                  />
                </div>
              ) : condition.field === 'status' ? (
                <select
                  value={String(condition.value)}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    flex: 1
                  }}
                >
                  <option value="">Select Status</option>
                  <option value="Open">Open</option>
                  <option value="Pre-configuration file creating">Pre-configuration file creating</option>
                  <option value="Pre-configuration file testing">Pre-configuration file testing</option>
                  <option value="WisDM Provisioning">WisDM Provisioning</option>
                  <option value="Done">Done</option>
                </select>
              ) : condition.field === 'priority' ? (
                <select
                  value={String(condition.value)}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    flex: 1
                  }}
                >
                  <option value="">Select Priority</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={String(condition.value || '')}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  placeholder={
                    condition.operator === 'regex' ? 'Enter regex pattern (e.g., ^REQ.*)' :
                    condition.operator === 'wildcard' ? 'Use * for any, ? for single char' :
                    'Enter value'
                  }
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    flex: 1
                  }}
                />
              )}

              {/* Case Sensitive (for text operators) */}
              {['contains', 'equals', 'startsWith', 'endsWith', 'wildcard'].includes(condition.operator) && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={condition.caseSensitive || false}
                    onChange={(e) => updateCondition(index, { caseSensitive: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Case
                </label>
              )}

              {/* Remove Button */}
              {conditions.length > 1 && (
                <button
                  onClick={() => removeCondition(index)}
                  style={{
                    padding: '8px',
                    background: '#fee2e2',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    color: '#dc2626'
                  }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {/* Add Condition Button */}
          <button
            onClick={addCondition}
            style={{
              padding: '8px 16px',
              background: '#f3f4f6',
              border: '1px dashed #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '14px',
              cursor: 'pointer',
              color: '#6b7280',
              width: '100%'
            }}
          >
            + Add Condition
          </button>
        </div>

        {/* Logic Selector */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>Match Logic:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="radio"
              value="AND"
              checked={logic === 'AND'}
              onChange={() => setLogic('AND')}
              style={{ width: '16px', height: '16px' }}
            />
            <span style={{ fontSize: '14px', color: '#374151' }}>AND (all conditions)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="radio"
              value="OR"
              checked={logic === 'OR'}
              onChange={() => setLogic('OR')}
              style={{ width: '16px', height: '16px' }}
            />
            <span style={{ fontSize: '14px', color: '#374151' }}>OR (any condition)</span>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleClear}
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
            Clear
          </button>
          {onSaveSearch && (
            <button
              onClick={() => setShowSaveDialog(true)}
              style={{
                padding: '10px 20px',
                background: '#ffffff',
                border: '1px solid #7c3aed',
                borderRadius: '0.375rem',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                color: '#7c3aed'
              }}
            >
              Save Search
            </button>
          )}
          <button
            onClick={handleSearch}
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
            Search
          </button>
        </div>

        {/* Save Search Dialog */}
        {showSaveDialog && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '0.5rem',
              padding: '24px',
              width: '400px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Save Search</h3>
              <input
                type="text"
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                placeholder="Enter search name"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  fontSize: '14px',
                  marginBottom: '16px'
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowSaveDialog(false)
                    setSaveSearchName('')
                  }}
                  style={{
                    padding: '8px 16px',
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
                  onClick={handleSaveSearch}
                  style={{
                    padding: '8px 16px',
                    background: '#7c3aed',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '14px',
                    cursor: 'pointer',
                    color: '#ffffff'
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}

export default AdvancedSearch

