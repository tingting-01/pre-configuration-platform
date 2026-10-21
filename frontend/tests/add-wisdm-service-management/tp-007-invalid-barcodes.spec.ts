// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-04, AC-11
import { test, expect } from '@playwright/test'
import {
  createPreconfigRequest, createWisdmRecord, findHistoricalDuplicateBarcode, getWisdmRecord,
  loginApi, uniqueValue, updateWisdmContent,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-007: 不存在、历史歧义和本记录重复 Barcode 均原子拒绝', async ({ request }) => {
    const session = await loginApi(request, 'admin')
    const validBarcode = uniqueValue('BC-VALID')
    await createPreconfigRequest(request, session, { barcode: validBarcode })

    const missing = await request.post('http://localhost:8000/api/wisdm-service-records', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: { soNumber: uniqueValue('SO-MISSING'), barcodes: [uniqueValue('BC-NOT-FOUND')], whitelistRequired: true },
    })
    expect(missing.status()).toBe(400)
    expect((await missing.json()).detail).toContain('does not exist')

    const repeated = await request.post('http://localhost:8000/api/wisdm-service-records', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: { soNumber: uniqueValue('SO-DUP-BC'), barcodes: [validBarcode, `  ${validBarcode.toLowerCase()}  `], whitelistRequired: true },
    })
    expect(repeated.status()).toBe(400)
    expect((await repeated.json()).detail).toContain('duplicated in this record')

    const own = await createWisdmRecord(request, session, {
      soNumber: uniqueValue('SO-ATOMIC'), barcodes: [validBarcode], whitelistRequired: true, notes: 'baseline',
    })
    const before = await getWisdmRecord(request, session, own.recordId)
    const failedEdit = await updateWisdmContent(request, session, before, { barcodes: [validBarcode, validBarcode.toLowerCase()] })
    expect(failedEdit.status()).toBe(400)
    const after = await getWisdmRecord(request, session, own.recordId)
    expect(after).toMatchObject({ version: before.version, notes: 'baseline', barcodes: before.barcodes })
    expect(after.history).toHaveLength(before.history.length)

    // 历史歧义只能读取既有脏数据验证；正常写入受全局唯一约束，测试不得制造冲突数据。
    const duplicateHistory = await findHistoricalDuplicateBarcode(request, session)
    const ambiguous = await request.post('http://localhost:8000/api/wisdm-service-records', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      data: { soNumber: uniqueValue('SO-AMBIGUOUS'), barcodes: [duplicateHistory.barcode], whitelistRequired: true },
    })
    expect(ambiguous.status()).toBe(400)
    const ambiguousDetail = (await ambiguous.json()).detail as string
    for (const requestId of duplicateHistory.requestIds) expect(ambiguousDetail).toContain(requestId)
  })
})
