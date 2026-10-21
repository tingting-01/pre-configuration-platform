// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-07
import { test, expect } from '@playwright/test'
import { createPreconfigRequest, getWisdmRecord, listWisdmRecords, loginApi, uniqueValue } from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-012: 满足条件时自动建档，缺项或仅主开关时不建档', async ({ request }) => {
    const session = await loginApi(request, 'admin')
    const soNumber = uniqueValue('SO-AUTO-CREATE')
    const barcode = uniqueValue('BC-AUTO-CREATE')
    const createdRequest = await createPreconfigRequest(request, session, {
      soNumber, barcode, wisdmEnabled: false, whitelist: true,
    })
    const [record] = await listWisdmRecords(request, session, { search: soNumber })
    expect(record).toMatchObject({ soNumber, sourceType: 'automatic', workflow: 'CREATED', whitelistRequired: true })
    expect(record.barcodes).toEqual([{ barcode, requestId: createdRequest.requestId }])
    const detail = await getWisdmRecord(request, session, record.recordId)
    expect(detail.history[0].reason).toBe('Created from preconfiguration request save')

    const noSo = uniqueValue('NO-SO')
    const noBarcodeSo = uniqueValue('SO-NO-BC')
    const noServiceSo = uniqueValue('SO-NO-SERVICE')
    await createPreconfigRequest(request, session, { barcode: uniqueValue(noSo), wisdmEnabled: true, whitelist: true })
    await createPreconfigRequest(request, session, { soNumber: noBarcodeSo, barcode: '', wisdmEnabled: true, whitelist: true })
    await createPreconfigRequest(request, session, { soNumber: noServiceSo, barcode: uniqueValue('BC-NO-SERVICE'), wisdmEnabled: true })
    expect(await listWisdmRecords(request, session, { search: noBarcodeSo })).toHaveLength(0)
    expect(await listWisdmRecords(request, session, { search: noServiceSo })).toHaveLength(0)
  })
})
