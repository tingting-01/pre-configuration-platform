// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-02, AC-11
import { test, expect } from '@playwright/test'
import {
  API_BASE_URL, authHeaders, createPreconfigRequest, createWisdmRecord, getWisdmRecord,
  listWisdmRecords, loginApi, updateWisdmContent, updateWisdmWorkflow, uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-010: 手工、自动和非 CREATED 记录执行正确内容权限', async ({ request }) => {
    const creator = await loginApi(request, 'internalCreator')
    const other = await loginApi(request, 'internalOther')
    const admin = await loginApi(request, 'admin')
    const external = await loginApi(request, 'external')

    const manualBarcode = uniqueValue('BC-PERM-MANUAL')
    await createPreconfigRequest(request, creator, { barcode: manualBarcode })
    const manual = await createWisdmRecord(request, creator, {
      soNumber: uniqueValue('SO-PERM-MANUAL'), barcodes: [manualBarcode], whitelistRequired: true,
    })
    expect((await getWisdmRecord(request, creator, manual.recordId)).permissions.canEditContent).toBe(true)
    expect((await getWisdmRecord(request, admin, manual.recordId)).permissions.canEditContent).toBe(true)
    const otherView = await getWisdmRecord(request, other, manual.recordId)
    expect(otherView.permissions).toEqual({ canEditContent: false, canUpdateWorkflow: true, canDelete: false })
    const forbiddenEdit = await updateWisdmContent(request, other, otherView, { notes: 'must-not-save' })
    expect(forbiddenEdit.status()).toBe(403)

    const autoBarcode = uniqueValue('BC-PERM-AUTO')
    const autoSo = uniqueValue('SO-PERM-AUTO')
    await createPreconfigRequest(request, creator, { barcode: autoBarcode, soNumber: autoSo, wisdmEnabled: true, whitelist: true })
    const [automatic] = await listWisdmRecords(request, other, { search: autoSo })
    expect(automatic.sourceType).toBe('automatic')
    expect(automatic.permissions.canEditContent).toBe(true)

    const moved = await updateWisdmWorkflow(request, creator, manual.recordId, manual.version, 'WHITELIST_DONE')
    expect(moved.status()).toBe(200)
    const locked = await getWisdmRecord(request, admin, manual.recordId)
    expect(locked.permissions).toEqual({ canEditContent: false, canUpdateWorkflow: true, canDelete: true })

    const forbiddenWorkflow = await request.put(`${API_BASE_URL}/api/wisdm-service-records/${manual.recordId}`, {
      headers: authHeaders(external), data: { workflow: 'CREATED', version: locked.version },
    })
    expect(forbiddenWorkflow.status()).toBe(403)
    expect((await getWisdmRecord(request, admin, manual.recordId)).workflow).toBe('WHITELIST_DONE')
  })
})
