// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-12
import { test, expect } from '@playwright/test'
import {
  createPreconfigRequest, createWisdmRecord, listWisdmRecords, loginPageAs,
  updateWisdmContent, updateWisdmWorkflow, uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-016: 搜索、筛选、精确关联、来源跳转和稳定排序', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const barcode = uniqueValue('BC-SEARCH')
    const source = await createPreconfigRequest(request, session, { barcode })
    const company = uniqueValue('COMPANY-SEARCH')
    const older = await createWisdmRecord(request, session, {
      soNumber: uniqueValue('SO-SEARCH-A'), companyName: company, barcodes: [barcode], whitelistRequired: true, jiraKeys: ['E2E-101'],
    })
    const newer = await createWisdmRecord(request, session, {
      soNumber: uniqueValue('SO-SEARCH-B'), companyName: company, barcodes: [barcode], provisioningRequired: true,
    })

    for (const keyword of [older.soNumber.toLowerCase(), company.toLowerCase(), barcode.toLowerCase(), source.requestId.toLowerCase(), 'e2e-101']) {
      await page.goto('/wisdm-services')
      const search = page.getByRole('textbox', { name: 'Search service records' })
      await search.fill(keyword)
      await search.press('Enter')
      await expect(page.getByRole('link', { name: older.soNumber })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Created', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Created', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'All', exact: true }).click()

    const byRequest = await listWisdmRecords(request, session, { preconfigRequestId: source.requestId })
    const byBarcode = await listWisdmRecords(request, session, { barcode })
    expect(byRequest.map((item) => item.recordId)).toEqual(expect.arrayContaining([older.recordId, newer.recordId]))
    expect(byBarcode.map((item) => item.recordId)).toEqual(expect.arrayContaining([older.recordId, newer.recordId]))

    const before = await listWisdmRecords(request, session, { search: company })
    expect(before.slice(0, 2).map((item) => item.recordId)).toEqual([newer.recordId, older.recordId])
    const olderDetail = before.find((item) => item.recordId === older.recordId)!
    expect((await updateWisdmContent(request, session, olderDetail, { notes: uniqueValue('SORT-NOTE') })).status()).toBe(200)
    const refreshedOlder = (await listWisdmRecords(request, session, { search: company })).find((item) => item.recordId === older.recordId)!
    expect((await updateWisdmWorkflow(request, session, older.recordId, refreshedOlder.version, 'WHITELIST_DONE')).status()).toBe(200)
    const after = await listWisdmRecords(request, session, { search: company })
    expect(after.slice(0, 2).map((item) => item.recordId)).toEqual([newer.recordId, older.recordId])

    await page.goto(`/wisdm-services/${older.recordId}`)
    await page.getByRole('link', { name: source.requestId }).click()
    await expect(page).toHaveURL(new RegExp(`/request-details/${source.requestId}`))
  })
})
