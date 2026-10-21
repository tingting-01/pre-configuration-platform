import { FormEvent, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import {
  CreateWisdmServiceRecordInput,
  WisdmServiceRecord,
  WisdmWorkflow,
} from '../services/api'
import { WISDM_WORKFLOW_LABELS } from '../utils/wisdmUtils'

export interface WisdmServiceFormValues extends CreateWisdmServiceRecordInput {}

interface WisdmServiceFormProps {
  mode: 'create' | 'edit'
  initialRecord?: WisdmServiceRecord
  submitting: boolean
  onCancel: () => void
  onSubmit: (values: WisdmServiceFormValues) => Promise<void>
  formId?: string
  hideActions?: boolean
  workflowValue?: WisdmWorkflow
  allowedWorkflows?: WisdmWorkflow[]
  onWorkflowChange?: (workflow: WisdmWorkflow) => void
}

const WisdmServiceForm = ({
  mode,
  initialRecord,
  submitting,
  onCancel,
  onSubmit,
  formId,
  hideActions = false,
  workflowValue,
  allowedWorkflows = [],
  onWorkflowChange,
}: WisdmServiceFormProps) => {
  const [soNumber, setSoNumber] = useState(initialRecord?.soNumber ?? '')
  const [companyName, setCompanyName] = useState(initialRecord?.companyName ?? '')
  const [barcodes, setBarcodes] = useState<string[]>(() => {
    const existing = (initialRecord?.barcodes ?? []).map((item) => item.barcode)
    return existing.length ? existing : ['']
  })
  const [whitelistRequired, setWhitelistRequired] = useState(
    initialRecord?.whitelistRequired ?? false,
  )
  const [provisioningRequired, setProvisioningRequired] = useState(
    initialRecord?.provisioningRequired ?? false,
  )
  const [jiraKeys, setJiraKeys] = useState<string[]>(() =>
    initialRecord?.jiraKeys.length ? initialRecord.jiraKeys : [''],
  )
  const [notes, setNotes] = useState(initialRecord?.notes ?? '')
  const [fieldErrors, setFieldErrors] = useState<{
    soNumber?: string
    barcodes?: string
    services?: string
  }>({})

  const clearFieldError = (field: 'soNumber' | 'barcodes' | 'services') => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const updateBarcode = (index: number, value: string) => {
    setBarcodes((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))
    if (value.trim()) clearFieldError('barcodes')
  }

  const addBarcode = () => {
    setBarcodes((current) => [...current, ''])
  }

  const removeBarcode = (index: number) => {
    setBarcodes((current) => current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index))
  }

  const updateJiraKey = (index: number, value: string) => {
    setJiraKeys((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))
  }

  const handleWhitelistChange = (checked: boolean) => {
    setWhitelistRequired(checked)
    if (!checked) setJiraKeys([''])
    if (checked || provisioningRequired) clearFieldError('services')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedSo = soNumber.trim()
    const enteredBarcodes = barcodes.map((barcode) => barcode.trim()).filter(Boolean)
    const normalizedBarcodes = enteredBarcodes.map((barcode) => barcode.toUpperCase())
    const duplicatedBarcode = normalizedBarcodes.find(
      (barcode, index) => normalizedBarcodes.indexOf(barcode) !== index,
    )
    const nextErrors: {
      soNumber?: string
      barcodes?: string
      services?: string
    } = {}
    if (mode === 'create' && !normalizedSo) nextErrors.soNumber = 'SO Number is required'
    if (enteredBarcodes.length === 0) nextErrors.barcodes = 'Barcode is required'
    else if (duplicatedBarcode) {
      nextErrors.barcodes = `Barcode ${duplicatedBarcode} is duplicated in this record`
    }
    if (!whitelistRequired && !provisioningRequired) {
      nextErrors.services = 'At least one WisDM service is required'
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    await onSubmit({
      soNumber: normalizedSo,
      companyName: companyName.trim(),
      barcodes: enteredBarcodes,
      whitelistRequired,
      provisioningRequired,
      jiraKeys: whitelistRequired
        ? Array.from(new Set(jiraKeys.map((key) => key.trim().toUpperCase()).filter(Boolean)))
        : [],
      notes: notes.trim(),
    })
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5" noValidate>
      {mode === 'create' ? (
        <div>
          <label htmlFor="wisdm-so-number" className="mb-1 block text-sm font-medium text-gray-700">
            SO Number <span className="text-red-600">*</span>
          </label>
          <input
            id="wisdm-so-number"
            className="input"
            style={fieldErrors.soNumber ? { border: '1px solid #dc2626' } : undefined}
            value={soNumber}
            onChange={(event) => {
              setSoNumber(event.target.value)
              if (event.target.value.trim()) clearFieldError('soNumber')
            }}
            disabled={submitting}
            placeholder="SO-DEMO-XXXX"
            aria-invalid={Boolean(fieldErrors.soNumber)}
          />
          {fieldErrors.soNumber ? (
            <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.soNumber}</div>
          ) : null}
        </div>
      ) : null}

      <div>
        <label htmlFor="wisdm-company" className="mb-1 block text-sm font-medium text-gray-700">
          Company
        </label>
        <input
          id="wisdm-company"
          className="input"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          disabled={submitting}
        />
      </div>

      <div>
        <label htmlFor="wisdm-barcode-0" className="mb-1 block text-sm font-medium text-gray-700">
          Barcodes <span className="text-red-600">*</span>
        </label>
        <div className="space-y-2">
          {barcodes.map((barcode, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                id={index === 0 ? 'wisdm-barcode-0' : undefined}
                aria-label={`Barcode ${index + 1}`}
                className="input"
                style={fieldErrors.barcodes && !barcode.trim() ? { border: '1px solid #dc2626' } : undefined}
                value={barcode}
                onChange={(event) => updateBarcode(index, event.target.value)}
                aria-invalid={Boolean(fieldErrors.barcodes && !barcode.trim())}
                disabled={submitting}
                autoComplete="off"
              />
              {barcodes.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeBarcode(index)}
                  disabled={submitting}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-lg leading-none text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                  aria-label={`Remove barcode ${index + 1}`}
                >
                  −
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={addBarcode}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            <Plus className="h-4 w-4" /> Add barcode
          </button>
          {fieldErrors.barcodes ? (
            <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.barcodes}</div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <input
            type="checkbox"
            checked={whitelistRequired}
            onChange={(event) => handleWhitelistChange(event.target.checked)}
            disabled={submitting}
            className="h-4 w-4 rounded border-gray-300 text-purple-700 focus:ring-purple-600"
          />
          WisDM Whitelist required
        </label>
        {whitelistRequired ? (
          <div className="rounded-lg bg-gray-50 p-3">
            <span className="mb-2 block text-sm font-medium text-gray-700">Jira ticket(s)</span>
            <div className="space-y-2">
              {jiraKeys.map((jiraKey, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    aria-label={`Jira ticket ${index + 1}`}
                    className="input"
                    value={jiraKey}
                    onChange={(event) => updateJiraKey(index, event.target.value)}
                    disabled={submitting}
                    placeholder="DEMO-1842"
                  />
                  {jiraKeys.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setJiraKeys((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      disabled={submitting}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-lg leading-none text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                      aria-label={`Remove Jira ticket ${index + 1}`}
                    >
                      −
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setJiraKeys((current) => [...current, ''])}
                disabled={submitting}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Plus className="h-4 w-4" /> Add Jira key
              </button>
            </div>
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <input
            type="checkbox"
            checked={provisioningRequired}
            onChange={(event) => {
              setProvisioningRequired(event.target.checked)
              if (event.target.checked || whitelistRequired) clearFieldError('services')
            }}
            disabled={submitting}
            className="h-4 w-4 rounded border-gray-300 text-purple-700 focus:ring-purple-600"
          />
          WisDM Provisioning required
        </label>
        {fieldErrors.services ? (
          <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{fieldErrors.services}</div>
        ) : null}
      </div>

      {mode === 'edit' && workflowValue && onWorkflowChange ? (
        <div>
          <label htmlFor="wisdm-workflow" className="mb-1 block text-sm font-medium text-gray-700">
            Workflow Process
          </label>
          <select
            id="wisdm-workflow"
            className="input uppercase"
            value={workflowValue}
            onChange={(event) => onWorkflowChange(event.target.value as WisdmWorkflow)}
            disabled={submitting || allowedWorkflows.length === 0}
          >
            {allowedWorkflows.map((workflow) => (
              <option key={workflow} value={workflow}>
                {WISDM_WORKFLOW_LABELS[workflow]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor="wisdm-notes" className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          id="wisdm-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={submitting}
          rows={4}
          className="input h-auto resize-y"
        />
      </div>

      {hideActions ? null : (
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onCancel} disabled={submitting} className="btn-outline px-4 py-2">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn bg-purple-800 px-4 py-2 text-white hover:bg-purple-900">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      )}
    </form>
  )
}

export default WisdmServiceForm
