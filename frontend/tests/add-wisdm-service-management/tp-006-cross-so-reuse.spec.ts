// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-04
import { test, expect } from '@playwright/test'
import { createPreconfigRequest, createWisdmRecord, loginPageAs, openWisdmList, uniqueValue } from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-006: 不同 SO 可复用同一 Barcode 与 requestId', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const barcode = uniqueValue('BC-REUSE')
    const soA = uniqueValue('SO-REUSE-A')
    const soB = uniqueValue('SO-REUSE-B')
    const source = await createPreconfigRequest(request, session, { barcode })

    const first = await createWisdmRecord(request, session, { soNumber: soA, barcodes: [barcode], whitelistRequired: true })
    const second = await createWisdmRecord(request, session, { soNumber: soB, barcodes: [barcode], provisioningRequired: true })
    expect(first.barcodes).toEqual([{ barcode, requestId: source.requestId }])
    expect(second.barcodes).toEqual([{ barcode, requestId: source.requestId }])

    await openWisdmList(page)
    await page.getByRole('textbox', { name: 'Search service records' }).fill(barcode)
    await page.getByRole('textbox', { name: 'Search service records' }).press('Enter')
    await expect(page.getByRole('link', { name: soA })).toBeVisible()
    await expect(page.getByRole('link', { name: soB })).toBeVisible()
    await expect(page.getByRole('link', { name: source.requestId })).toHaveCount(2)
  })
})
