// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-10
import { test, expect } from '@playwright/test'
import {
  createPreconfigRequest, createWisdmRecord, getWisdmRecord, loginApi,
  updateWisdmContent, updateWisdmWorkflow, uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-015: History 仅记录创建和实际 Workflow 变化并倒序展示', async ({ request }) => {
    const session = await loginApi(request, 'admin')
    const barcode = uniqueValue('BC-HISTORY')
    await createPreconfigRequest(request, session, { barcode })
    const created = await createWisdmRecord(request, session, {
      soNumber: uniqueValue('SO-HISTORY'), barcodes: [barcode], whitelistRequired: true,
    })
    let detail = await getWisdmRecord(request, session, created.recordId)
    expect(detail.history).toHaveLength(1)
    expect(detail.history[0]).toMatchObject({ eventType: 'created', actor: { email: session.user.email } })

    const content = await updateWisdmContent(request, session, detail, { notes: uniqueValue('NOTE') })
    expect(content.status()).toBe(200)
    detail = await getWisdmRecord(request, session, created.recordId)
    expect(detail.history).toHaveLength(1)

    const firstChange = await updateWisdmWorkflow(request, session, created.recordId, detail.version, 'WHITELIST_DONE')
    expect(firstChange.status()).toBe(200)
    const firstChanged = await firstChange.json()
    const same = await updateWisdmWorkflow(request, session, created.recordId, firstChanged.version, 'WHITELIST_DONE')
    expect(same.status()).toBe(200)
    const secondChange = await updateWisdmWorkflow(request, session, created.recordId, firstChanged.version, 'ALL_DONE')
    expect(secondChange.status()).toBe(200)

    detail = await getWisdmRecord(request, session, created.recordId)
    expect(detail.history).toHaveLength(3)
    expect(detail.history.map((item: any) => item.newWorkflow)).toEqual(['ALL_DONE', 'WHITELIST_DONE', 'CREATED'])
    const timestamps = detail.history.map((item: any) => Date.parse(item.createdAt))
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a))
  })
})
