// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-07, AC-08
import { test, expect } from '@playwright/test'
import {
  createPreconfigRequest, getPreconfigRequest, getWisdmRecord, listWisdmRecords,
  loginApi, updatePreconfigRequest, updateWisdmWorkflow, uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-013: 自动补充取并集、保持 Workflow、幂等且不反向删除', async ({ request }) => {
    const session = await loginApi(request, 'admin')
    const soNumber = uniqueValue('SO-AUTO-MERGE')
    const barcodeA = uniqueValue('BC-MERGE-A')
    const barcodeB = uniqueValue('BC-MERGE-B')
    const reqA = await createPreconfigRequest(request, session, { soNumber, barcode: barcodeA, whitelist: true })
    let [record] = await listWisdmRecords(request, session, { search: soNumber })
    const moved = await updateWisdmWorkflow(request, session, record.recordId, record.version, 'WHITELIST_DONE')
    expect(moved.status()).toBe(200)

    const reqB = await createPreconfigRequest(request, session, { soNumber, barcode: barcodeB, provisioning: true })
    record = await getWisdmRecord(request, session, record.recordId)
    expect(record.workflow).toBe('WHITELIST_DONE')
    expect(record).toMatchObject({ whitelistRequired: true, provisioningRequired: true })
    expect(record.barcodes).toEqual(expect.arrayContaining([
      { barcode: barcodeA, requestId: reqA.requestId }, { barcode: barcodeB, requestId: reqB.requestId },
    ]))
    const historyLength = record.history.length
    const version = record.version

    const idempotent = await updatePreconfigRequest(request, session, reqB.requestId, reqB.payload)
    expect(idempotent.status()).toBe(200)
    record = await getWisdmRecord(request, session, record.recordId)
    expect(record).toMatchObject({ workflow: 'WHITELIST_DONE', version })
    expect(record.history).toHaveLength(historyLength)

    reqB.payload.configData.general.barcode = ''
    reqB.payload.configData.system.wisdmConnect = false
    const removeAtSource = await updatePreconfigRequest(request, session, reqB.requestId, reqB.payload)
    expect(removeAtSource.status()).toBe(200)
    record = await getWisdmRecord(request, session, record.recordId)
    expect(record.barcodes).toEqual(expect.arrayContaining([{ barcode: barcodeB, requestId: reqB.requestId }]))
    expect(record.provisioningRequired).toBe(true)
    expect((await getPreconfigRequest(request, session, reqA.requestId)).configData.general.barcode).toBe(barcodeA)
  })
})
