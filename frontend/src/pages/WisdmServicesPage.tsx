import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import { CloudCog, Loader2, Search, X } from 'lucide-react'
import WisdmServiceForm, { WisdmServiceFormValues } from '../components/WisdmServiceForm'
import ToastContainer from '../components/ToastContainer'
import { useToast } from '../hooks/useToast'
import { useAuthStore } from '../stores/authStore'
import { useWisdmServicesStore } from '../stores/wisdmServicesStore'
import {
  WisdmServiceListParams,
  WisdmServiceRecord,
  WisdmWorkflow,
  wisdmServiceAPI,
} from '../services/api'
import {
  getWisdmErrorMessage,
  WISDM_WORKFLOW_FILTERS,
  WISDM_WORKFLOW_LABELS,
} from '../utils/wisdmUtils'

const workflowClassName: Record<WisdmWorkflow, string> = {
  CREATED: 'border-amber-300 bg-amber-50 text-amber-700',
  WHITELIST_DONE: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  PROVISIONING_DONE: 'border-blue-300 bg-blue-50 text-blue-700',
  ALL_DONE: 'border-emerald-300 bg-emerald-50 text-emerald-700',
}

const WisdmServicesPage = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | WisdmWorkflow>('ALL')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [updatingWorkflows, setUpdatingWorkflows] = useState<Set<string>>(new Set())
  const listSectionRef = useRef<HTMLDivElement>(null)
  const {
    currentPage,
    itemsPerPage,
    setCurrentPage,
    setItemsPerPage,
    resetPagination,
  } = useWisdmServicesStore()
  const { toasts, showError, removeToast } = useToast()

  const params = useMemo<WisdmServiceListParams>(
    () => ({ ...(search ? { search } : {}), filter }),
    [filter, search],
  )
  const queryKey = useMemo(() => ['wisdm-service-records', params] as const, [params])
  const recordsQuery = useQuery(queryKey, () => wisdmServiceAPI.getRecords(params), {
    keepPreviousData: true,
    retry: false,
  })
  const records = recordsQuery.data ?? []
  const totalPages = Math.max(1, Math.ceil(records.length / itemsPerPage))
  const effectiveCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (effectiveCurrentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedRecords = records.slice(startIndex, endIndex)
  useEffect(() => {
    if (recordsQuery.isSuccess && currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, recordsQuery.isSuccess, setCurrentPage, totalPages])

  useEffect(() => {
    if (!showCreate) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showCreate])

  const submitSearch = (event?: FormEvent) => {
    event?.preventDefault()
    resetPagination()
    setSearch(searchInput.trim())
  }

  const changeFilter = (nextFilter: 'ALL' | WisdmWorkflow) => {
    resetPagination()
    setFilter(nextFilter)
  }

  const scrollToList = () => {
    if (!listSectionRef.current) return
    const top = listSectionRef.current.getBoundingClientRect().top + window.scrollY - 80
    window.scrollTo({ top, behavior: 'smooth' })
  }

  const changePage = (page: number) => {
    setCurrentPage(page)
    scrollToList()
  }

  const changeItemsPerPage = (nextItemsPerPage: number) => {
    setItemsPerPage(nextItemsPerPage)
    resetPagination()
    scrollToList()
  }

  const confirmLogout = () => {
    logout()
    navigate('/login')
  }

  const createRecord = async (values: WisdmServiceFormValues) => {
    if (creating) return
    setCreating(true)
    try {
      await wisdmServiceAPI.createRecord(values)
      await queryClient.invalidateQueries('wisdm-service-records')
      setShowCreate(false)
    } catch (error) {
      showError(getWisdmErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  const updateWorkflow = async (record: WisdmServiceRecord, workflow: WisdmWorkflow) => {
    if (workflow === record.workflow || updatingWorkflows.has(record.recordId)) return
    const previousRecords = queryClient.getQueryData<WisdmServiceRecord[]>(queryKey)
    setUpdatingWorkflows((current) => new Set(current).add(record.recordId))
    queryClient.setQueryData<WisdmServiceRecord[]>(queryKey, (current = []) =>
      current.map((item) => item.recordId === record.recordId ? { ...item, workflow } : item),
    )

    try {
      const updated = await wisdmServiceAPI.updateWorkflow(record.recordId, {
        workflow,
        version: record.version,
      })
      queryClient.setQueryData<WisdmServiceRecord[]>(queryKey, (current = []) =>
        current.map((item) => item.recordId === record.recordId ? updated : item),
      )
      queryClient.removeQueries(['wisdm-service-record', record.recordId])
    } catch (error) {
      queryClient.setQueryData(queryKey, previousRecords)
      showError(getWisdmErrorMessage(error))
    } finally {
      setUpdatingWorkflows((current) => {
        const next = new Set(current)
        next.delete(record.recordId)
        return next
      })
    }
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
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '8px 16px', background: '#4c1d95', color: '#ffffff', border: 'none',
              borderRadius: '0.5rem', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
              transition: 'all 0.2s ease', fontFamily: 'Inter, sans-serif'
            }}
          >
            New Service Record
          </button>
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
      <div className="mx-auto max-w-7xl space-y-6 py-4">
      <div>
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">WisDM Services</h1>
          <p className="mt-2 text-sm text-gray-500">
            SO-driven ops board. One SO can link multiple preconfig barcodes; whitelist / provisioning are service flags only.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Workflow filters">
        {WISDM_WORKFLOW_FILTERS.map((item) => (
          <button
            type="button"
            key={item.value}
            onClick={() => changeFilter(item.value)}
            aria-pressed={filter === item.value}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === item.value
                ? 'bg-purple-800 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form onSubmit={submitSearch} className="flex gap-2">
        <label htmlFor="wisdm-list-search" className="sr-only">Search service records</label>
        <input
          id="wisdm-list-search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="input h-12 flex-1"
          placeholder="Search SO / company / barcode / request / Jira"
        />
        <button type="submit" className="btn-outline h-12 px-5">
          <Search className="mr-2 h-4 w-4" /> Search
        </button>
      </form>

      <div ref={listSectionRef} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {recordsQuery.isLoading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading service records…
          </div>
        ) : recordsQuery.isError ? (
          <div role="alert" className="m-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {getWisdmErrorMessage(recordsQuery.error)}
            <button type="button" onClick={() => recordsQuery.refetch()} className="ml-3 font-semibold underline">
              Retry
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center text-gray-500">
            <CloudCog className="mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-700">No service records found</p>
            <p className="mt-1 text-sm">Change the search or filter, or create a new record.</p>
          </div>
        ) : (
          <>
            <div
              className="table-ping-right"
              style={{
                overflowX: 'auto',
                overflowY: 'visible',
                width: '100%',
                maxWidth: '100%',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <table className="min-w-full divide-y divide-gray-200 text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <tr>
                  <th className="px-4 py-3">SO Number</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Barcodes</th>
                  <th className="px-4 py-3 text-center">Whitelist</th>
                  <th className="px-4 py-3 text-center">Provisioning</th>
                  <th className="px-4 py-3">Workflow Process</th>
                  <th className="px-4 py-3" style={{
                    width: '180px',
                    minWidth: '180px',
                    maxWidth: '180px',
                    background: '#f9fafb',
                    position: 'sticky',
                    right: 0,
                    zIndex: 2
                  }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRecords.map((record) => {
                  const updating = updatingWorkflows.has(record.recordId)
                  return (
                    <tr key={record.recordId} className="group align-top hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-4">
                        <Link to={`/wisdm-services/${record.recordId}`} className="font-semibold text-purple-700 no-underline hover:text-purple-700 hover:no-underline">
                          {record.soNumber}
                        </Link>
                        <div className="mt-1 text-xs text-gray-400">{record.recordId}</div>
                      </td>
                      <td className="align-middle px-4 py-4 text-gray-700">{record.companyName || '—'}</td>
                      <td className="align-middle px-4 py-4">
                        <div className="space-y-1">
                          {record.barcodes.map((barcode) => (
                            <div
                              key={`${barcode.requestId}-${barcode.barcode}`}
                              className="whitespace-nowrap text-gray-700"
                            >
                              {barcode.barcode}{' '}
                              <Link
                                to={`/request-details/${encodeURIComponent(barcode.requestId)}?from=${encodeURIComponent('/wisdm-services')}`}
                                className="text-purple-600 no-underline hover:text-purple-600"
                              >
                                {barcode.requestId}
                              </Link>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="align-middle px-4 py-4">
                        <div className="flex justify-center">
                          <input type="checkbox" checked={record.whitelistRequired} readOnly className="h-4 w-4 accent-purple-700" aria-label={`Whitelist ${record.soNumber}`} />
                        </div>
                      </td>
                      <td className="align-middle px-4 py-4">
                        <div className="flex justify-center">
                          <input type="checkbox" checked={record.provisioningRequired} readOnly className="h-4 w-4 accent-purple-700" aria-label={`Provisioning ${record.soNumber}`} />
                        </div>
                      </td>
                      <td className="min-w-56 px-4 py-4">
                        <div className="relative inline-flex items-center">
                          <select
                            aria-label={`Workflow for ${record.soNumber}`}
                            value={record.workflow}
                            onChange={(event) => updateWorkflow(record, event.target.value as WisdmWorkflow)}
                            disabled={!record.permissions.canUpdateWorkflow || updating}
                            className={`rounded-full border px-3 py-1.5 pr-8 text-xs font-semibold uppercase outline-none disabled:cursor-wait ${workflowClassName[record.workflow]}`}
                          >
                            {record.allowedWorkflows.map((workflow) => (
                              <option key={workflow} value={workflow}>{WISDM_WORKFLOW_LABELS[workflow]}</option>
                            ))}
                          </select>
                          {updating ? <Loader2 className="pointer-events-none absolute right-7 h-3 w-3 animate-spin" /> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap bg-white px-4 py-4 group-hover:bg-gray-50" style={{
                        width: '180px',
                        minWidth: '180px',
                        maxWidth: '180px',
                        position: 'sticky',
                        right: 0,
                        zIndex: 1
                      }}>
                        <Link to={`/wisdm-services/${record.recordId}`} className="btn bg-purple-800 px-3 py-2 text-white hover:bg-purple-900">
                          View
                        </Link>
                        {record.permissions.canEditContent ? (
                          <Link to={`/wisdm-services/${record.recordId}?edit=1`} className="btn ml-2 bg-gray-100 px-3 py-2 text-gray-700 hover:bg-gray-200">
                            Edit
                          </Link>
                        ) : (
                          <button type="button" disabled className="btn ml-2 bg-gray-100 px-3 py-2 text-gray-400">Edit</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 px-4 py-5">
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <div>
                  Showing <span className="font-semibold text-gray-800">{startIndex + 1}</span>
                  {' - '}
                  <span className="font-semibold text-gray-800">{Math.min(endIndex, records.length)}</span>
                  {' of '}
                  <span className="font-semibold text-gray-800">{records.length}</span> records
                </div>
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <span>Rows per page</span>
                  <select
                    aria-label="Rows per page"
                    value={itemsPerPage}
                    onChange={(event) => changeItemsPerPage(Number(event.target.value))}
                    className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 font-medium text-gray-700 outline-none"
                  >
                    {[10, 20, 50, 100].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </label>
              </div>

              {totalPages > 1 ? (
                <nav aria-label="WisDM Services pagination" className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => changePage(effectiveCurrentPage - 1)}
                    disabled={effectiveCurrentPage === 1}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:opacity-60"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => {
                      const showPage =
                        page === 1 ||
                        page === totalPages ||
                        (page >= effectiveCurrentPage - 1 && page <= effectiveCurrentPage + 1) ||
                        (effectiveCurrentPage <= 3 && page <= 5) ||
                        (effectiveCurrentPage >= totalPages - 2 && page >= totalPages - 4)

                      if (!showPage) {
                        return page === effectiveCurrentPage - 2 || page === effectiveCurrentPage + 2
                          ? <span key={page} className="px-1 text-gray-400">...</span>
                          : null
                      }

                      return (
                        <button
                          type="button"
                          key={page}
                          onClick={() => changePage(page)}
                          aria-label={`Page ${page}`}
                          aria-current={page === effectiveCurrentPage ? 'page' : undefined}
                          className={`h-9 min-w-9 rounded-md border px-2 text-sm font-medium transition-colors ${
                            page === effectiveCurrentPage
                              ? 'border-purple-800 bg-purple-800 text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => changePage(effectiveCurrentPage + 1)}
                    disabled={effectiveCurrentPage === totalPages}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 disabled:opacity-60"
                  >
                    Next
                  </button>
                </nav>
              ) : null}
            </div>
          </>
        )}
      </div>

      {showCreate ? createPortal(
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="new-service-record-title">
          <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-xl bg-white p-6 shadow-[0_20px_40px_rgba(0,0,0,0.18)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="new-service-record-title" className="text-xl font-semibold text-gray-900">New Service Record</h2>
                <p className="mt-1 text-sm text-gray-500">Enter SO Number and one or more barcodes (each barcode maps to one preconfig request).</p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} disabled={creating} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <WisdmServiceForm
              mode="create"
              submitting={creating}
              onCancel={() => setShowCreate(false)}
              onSubmit={createRecord}
            />
          </div>
        </div>,
        document.body,
      ) : null}
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {showLogoutConfirm ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="wisdm-list-logout-title">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 id="wisdm-list-logout-title" className="text-lg font-semibold text-gray-900">Confirm Logout</h2>
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

export default WisdmServicesPage
