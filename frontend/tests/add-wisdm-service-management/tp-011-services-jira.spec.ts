// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-06
import { test, expect } from '@playwright/test'
import {
  createPreconfigRequest, createWisdmRecord, getWisdmRecord, loginPageAs,
  openNewServiceDialog, openWisdmList, updateWisdmContent, uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-011: 服务选择与 Jira keys 联动、规范化并保持原子性', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const barcode = uniqueValue('BC-JIRA')
    await createPreconfigRequest(request, session, { barcode })

    await openWisdmList(page)
    await openNewServiceDialog(page)
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('checkbox', { name: 'WisDM Whitelist required' }).check()
    await expect(dialog.getByText('Jira ticket(s)')).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Jira ticket 1' })).toBeVisible()

    const record = await createWisdmRecord(request, session, {
      soNumber: uniqueValue('SO-JIRA'), barcodes: [barcode], whitelistRequired: true,
      provisioningRequired: true, jiraKeys: [' demo-1 ', 'DEMO-1', ' demo-2 '],
    })
    expect(record.jiraKeys).toEqual(['DEMO-1', 'DEMO-2'])

    const clearJira = await updateWisdmContent(request, session, record, { whitelistRequired: false, provisioningRequired: true })
    expect(clearJira.status()).toBe(200)
    const provisioningOnly = await clearJira.json()
    expect(provisioningOnly.jiraKeys).toEqual([])

    const rejectNoService = await updateWisdmContent(request, session, provisioningOnly, { provisioningRequired: false })
    expect(rejectNoService.status()).toBe(400)
    const unchanged = await getWisdmRecord(request, session, record.recordId)
    expect(unchanged).toMatchObject({ provisioningRequired: true, whitelistRequired: false, jiraKeys: [] })
  })
})
