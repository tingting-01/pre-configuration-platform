// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-02, AC-09, AC-11
import { test, expect } from '@playwright/test'
import {
  createPreconfigRequest, createWisdmRecord, getWisdmRecord, loginPageAs,
  updateWisdmWorkflow, uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-014: Workflow 选项、跳转、回退、非法状态和版本冲突', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const barcode = uniqueValue('BC-WORKFLOW')
    await createPreconfigRequest(request, session, { barcode })
    const whitelist = await createWisdmRecord(request, session, { soNumber: uniqueValue('SO-WF-W'), barcodes: [barcode], whitelistRequired: true })
    const provisioning = await createWisdmRecord(request, session, {
      soNumber: uniqueValue('SO-WF-P'), barcodes: [barcode], whitelistRequired: false, provisioningRequired: true,
    })
    const both = await createWisdmRecord(request, session, { soNumber: uniqueValue('SO-WF-B'), barcodes: [barcode], whitelistRequired: true, provisioningRequired: true })

    await page.goto('/wisdm-services')
    await expect(page.getByRole('combobox', { name: `Workflow for ${whitelist.soNumber}` }).getByRole('option')).toHaveText(['Created', 'Whitelist Done', 'All Done'])
    await expect(page.getByRole('combobox', { name: `Workflow for ${provisioning.soNumber}` }).getByRole('option')).toHaveText(['Created', 'Provisioning Done', 'All Done'])
    await expect(page.getByRole('combobox', { name: `Workflow for ${both.soNumber}` }).getByRole('option')).toHaveText(['Created', 'Whitelist Done', 'Provisioning Done', 'All Done'])

    const toDone = await updateWisdmWorkflow(request, session, both.recordId, both.version, 'ALL_DONE')
    expect(toDone.status()).toBe(200)
    let current = await toDone.json()
    const back = await updateWisdmWorkflow(request, session, both.recordId, current.version, 'CREATED')
    expect(back.status()).toBe(200)
    current = await back.json()
    expect(current.permissions.canEditContent).toBe(true)

    const invalid = await updateWisdmWorkflow(request, session, whitelist.recordId, whitelist.version, 'PROVISIONING_DONE')
    expect(invalid.status()).toBe(400)
    expect((await getWisdmRecord(request, session, whitelist.recordId)).workflow).toBe('CREATED')

    const winning = await updateWisdmWorkflow(request, session, provisioning.recordId, provisioning.version, 'PROVISIONING_DONE')
    expect(winning.status()).toBe(200)
    const stale = await updateWisdmWorkflow(request, session, provisioning.recordId, provisioning.version, 'ALL_DONE')
    expect(stale.status()).toBe(409)
    expect((await getWisdmRecord(request, session, provisioning.recordId)).workflow).toBe('PROVISIONING_DONE')
  })
})
