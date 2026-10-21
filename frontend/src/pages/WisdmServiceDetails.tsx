import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import { Loader2 } from 'lucide-react'
import WisdmServiceForm, { WisdmServiceFormValues } from '../components/WisdmServiceForm'
import ToastContainer from '../components/ToastContainer'
import { useToast } from '../hooks/useToast'
import { useAuthStore } from '../stores/authStore'
import { WisdmWorkflow, wisdmServiceAPI } from '../services/api'
import {
  formatWisdmDate,
  getWisdmErrorMessage,
  WISDM_WORKFLOW_LABELS,
} from '../utils/wisdmUtils'

const editFormId = 'wisdm-service-edit-form'

const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid gap-2 border-b border-gray-100 py-4 sm:grid-cols-[190px_1fr]">
    <dt className="text-sm font-medium text-gray-500">{label}</dt>
    <dd className="text-sm text-gray-900">{children}</dd>
  </div>
)

const WisdmServiceDetails = () => {
  const { recordId = '' } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatingWorkflow, setUpdatingWorkflow] = useState(false)
  const [pendingWorkflow, setPendingWorkflow] = useState<WisdmWorkflow | null>(null)
  const { toasts, showError, removeToast } = useToast()
  const editRequested = searchParams.get('edit') === '1'

  const recordQuery = useQuery(
    ['wisdm-service-record', recordId],
    () => wisdmServiceAPI.getRecord(recordId),
    { enabled: Boolean(recordId), retry: false },
  )
  const record = recordQuery.data
  const editing = editRequested && Boolean(record?.permissions.canEditContent)
  const displayedWorkflow = pendingWorkflow ?? record?.workflow

  useEffect(() => {
    if (pendingWorkflow && record?.workflow === pendingWorkflow) {
      setPendingWorkflow(null)
    }
  }, [pendingWorkflow, record?.workflow])

  const history = useMemo(
    () => [...(record?.history ?? [])].sort((left, right) =>
      (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
    ),
    [record?.history],
  )

  const saveRecord = async (values: WisdmServiceFormValues) => {
    if (!record || saving) return
    setSaving(true)
    try {
      await wisdmServiceAPI.updateRecord(record.recordId, {
        companyName: values.companyName,
        barcodes: values.barcodes,
        whitelistRequired: values.whitelistRequired,
        provisioningRequired: values.provisioningRequired,
        jiraKeys: values.jiraKeys,
        notes: values.notes,
        version: record.version,
      })
      await Promise.all([
        queryClient.invalidateQueries(['wisdm-service-record', record.recordId]),
        queryClient.invalidateQueries('wisdm-service-records'),
      ])
      setSearchParams({})
    } catch (error) {
      showError(getWisdmErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const changeWorkflow = async (workflow: WisdmWorkflow) => {
    if (!record || workflow === record.workflow || updatingWorkflow || saving) return
    setPendingWorkflow(workflow)
    setUpdatingWorkflow(true)
    try {
      await wisdmServiceAPI.updateWorkflow(record.recordId, {
        workflow,
        version: record.version,
      })
      await Promise.all([
        queryClient.invalidateQueries(['wisdm-service-record', record.recordId]),
        queryClient.invalidateQueries('wisdm-service-records'),
      ])
      if (workflow !== 'CREATED') setSearchParams({})
    } catch (error) {
      setPendingWorkflow(null)
      showError(getWisdmErrorMessage(error))
    } finally {
      setUpdatingWorkflow(false)
    }
  }

  const confirmLogout = () => {
    logout()
    navigate('/login')
  }

  if (recordQuery.isLoading) {
    return <div className="flex min-h-72 items-center justify-center gap-2 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading service record…</div>
  }

  if (recordQuery.isError || !record) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
          {getWisdmErrorMessage(recordQuery.error)}
        </div>
        <button type="button" onClick={() => navigate('/wisdm-services')} className="mt-4 text-sm font-medium text-purple-700 no-underline">Back to WisDM Services</button>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9fafb',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#1f2937',
      lineHeight: 1.6
    }}>
      <div style={{
        background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)', position: 'fixed',
        top: 0, left: 0, right: 0, zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px', height: '32px', background: '#4c1d95', borderRadius: '0.5rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)'
            }}>
              <svg width="20" height="20" fill="#ffffff" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#4c1d95', fontFamily: 'Inter, sans-serif' }}>RAK</div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', fontFamily: 'Inter, sans-serif' }}>
            WisGateOS2 Pre-configuration Database
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px', height: '32px', background: '#4c1d95', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff',
              fontSize: '14px', fontWeight: '500'
            }}>
              {user?.name?.trim() ? user.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {user?.name?.trim() || user?.email?.split('@')[0] || 'User'}
            </span>
            <button onClick={() => setShowLogoutConfirm(true)} style={{
              padding: '6px 12px', background: '#ef4444', color: '#ffffff', border: 'none',
              borderRadius: '0.375rem', fontSize: '12px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease'
            }}>
              Logout
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[880px] space-y-6 py-4">
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/wisdm-services')}
            className="text-sm font-medium text-purple-700 no-underline hover:no-underline"
          >
            ← Back to WisDM Services
          </button>
          {editing ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSearchParams({})}
                disabled={saving || updatingWorkflow}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form={editFormId}
                disabled={saving || updatingWorkflow}
                className="inline-flex items-center rounded-lg bg-[#4c1d95] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          ) : record.permissions.canEditContent ? (
            <button
              type="button"
              onClick={() => setSearchParams({ edit: '1' })}
              style={{
                padding: '8px 16px', background: '#4c1d95', color: '#ffffff', border: 'none',
                borderRadius: '0.5rem', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                fontFamily: 'Inter, sans-serif'
              }}
            >
              Edit
            </button>
          ) : null}
        </div>
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">{record.soNumber}</h1>
          <p className="mt-2 text-gray-500">{record.recordId}</p>
        </div>
      </div>

      {editing ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {/* <h2 className="mb-5 text-xl font-semibold text-gray-900">Edit Service Record</h2> */}
          <WisdmServiceForm
            mode="edit"
            formId={editFormId}
            hideActions
            initialRecord={record}
            submitting={saving || updatingWorkflow}
            onCancel={() => setSearchParams({})}
            onSubmit={saveRecord}
            workflowValue={record.permissions.canUpdateWorkflow ? displayedWorkflow : undefined}
            allowedWorkflows={record.allowedWorkflows}
            onWorkflowChange={record.permissions.canUpdateWorkflow ? changeWorkflow : undefined}
          />
        </section>
      ) : (
        <section className="rounded-xl border border-gray-200 bg-white px-6 py-2 shadow-sm">
          <dl>
            <DetailRow label="Company">{record.companyName || '—'}</DetailRow>
            <DetailRow label="Barcodes / Preconfig">
              <div className="space-y-2">
                {record.barcodes.map((barcode) => (
                  <div key={`${barcode.requestId}-${barcode.barcode}`}>
                    {barcode.barcode}{' '}
                    <Link
                      to={`/request-details/${encodeURIComponent(barcode.requestId)}?from=${encodeURIComponent(`/wisdm-services/${record.recordId}`)}`}
                      className="text-purple-600 no-underline hover:text-purple-600"
                    >
                      {barcode.requestId}
                    </Link>
                  </div>
                ))}
              </div>
            </DetailRow>
            <DetailRow label="Whitelist">
              <span>{record.whitelistRequired ? 'Required' : 'Not required'}</span>
              {record.whitelistRequired && record.jiraKeys.length ? (
                <div className="mt-2 text-gray-500">Jira: {record.jiraKeys.join(', ')}</div>
              ) : null}
            </DetailRow>
            <DetailRow label="Provisioning">{record.provisioningRequired ? 'Required' : 'Not required'}</DetailRow>
            <DetailRow label="Workflow Process">
              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase text-blue-700">
                {WISDM_WORKFLOW_LABELS[record.workflow]}
              </span>
            </DetailRow>
            <DetailRow label="Notes"><span className="whitespace-pre-wrap">{record.notes || '—'}</span></DetailRow>
          </dl>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">History</h2>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No history events.</p>
        ) : (
          <ol className="mt-5 space-y-5">
            {history.map((event) => (
              <li key={event.eventKey} className="border-l-2 border-purple-200 pl-4">
                <p className="text-sm text-gray-800">
                  <span className="font-semibold">{event.eventType === 'created' ? 'Created' : 'Workflow'}</span>
                  {event.eventType === 'workflow_changed' ? (
                    <span> — {event.previousWorkflow ? WISDM_WORKFLOW_LABELS[event.previousWorkflow] : '—'} → {event.newWorkflow ? WISDM_WORKFLOW_LABELS[event.newWorkflow] : '—'}</span>
                  ) : event.reason ? <span> — {event.reason}</span> : null}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {formatWisdmDate(event.createdAt)} · {event.actor?.email || event.actor?.name || 'System'}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {showLogoutConfirm ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="wisdm-detail-logout-title">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 id="wisdm-detail-logout-title" className="text-lg font-semibold text-gray-900">Confirm Logout</h2>
            <p className="mt-3 text-sm text-gray-500">Are you sure you want to logout?</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowLogoutConfirm(false)} className="btn-outline px-4 py-2">Cancel</button>
              <button type="button" onClick={confirmLogout} className="btn bg-red-500 px-4 py-2 text-white hover:bg-red-600">Logout</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default WisdmServiceDetails
