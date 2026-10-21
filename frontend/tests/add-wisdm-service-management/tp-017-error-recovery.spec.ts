// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-11, AC-12
import { test, expect } from '@playwright/test'
import { authenticatePage, loginApi } from './support'

const mockedRecord = {
  recordId: 'WDM-E2E-MOCK', soNumber: 'E2E-WDM-SO-MOCK', companyName: 'E2E mock',
  barcodes: [{ barcode: 'E2E-WDM-BC-MOCK', requestId: 'REQ-E2E-MOCK' }],
  whitelistRequired: true, provisioningRequired: false, jiraKeys: [], workflow: 'CREATED', notes: '',
  sourceType: 'manual', createdBy: { id: 1, name: 'Admin', email: 'admin@rakwireless.com' },
  updatedBy: { id: 1, name: 'Admin', email: 'admin@rakwireless.com' },
  createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z', version: 1,
  allowedWorkflows: ['CREATED', 'WHITELIST_DONE', 'ALL_DONE'],
  permissions: { canEditContent: true, canUpdateWorkflow: true }, history: [],
}

test.describe('add-wisdm-service-management', () => {
  test('TP-017: 加载、空结果和失败后状态恢复', async ({ page, request }) => {
    const session = await loginApi(request, 'admin')
    await authenticatePage(page, session)
    let listCalls = 0
    let workflowCalls = 0
    await page.route('**/api/wisdm-service-records**', async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() === 'PUT') {
        workflowCalls += 1
        if (workflowCalls === 1) return route.fulfill({ status: 409, json: { detail: 'Version conflict' } })
        return route.fulfill({ status: 200, json: { ...mockedRecord, workflow: 'WHITELIST_DONE', version: 2 } })
      }
      if (url.pathname.endsWith('/WDM-MISSING')) return route.fulfill({ status: 404, json: { detail: 'WisDM service record not found' } })
      listCalls += 1
      if (listCalls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return route.fulfill({ status: 200, json: { records: [mockedRecord] } })
      }
      if (url.searchParams.get('search')) return route.fulfill({ status: 200, json: { records: [] } })
      return route.fulfill({ status: 200, json: { records: [mockedRecord] } })
    })

    await page.goto('/wisdm-services')
    await expect(page.getByText(/Loading/i)).toBeVisible()
    await expect(page.getByRole('link', { name: mockedRecord.soNumber })).toBeVisible()
    const search = page.getByRole('textbox', { name: 'Search service records' })
    await search.fill('E2E-WDM-NO-RESULT')
    await search.press('Enter')
    await expect(page.getByText('No service records found')).toBeVisible()
    await expect(page.getByRole('link', { name: mockedRecord.soNumber })).toHaveCount(0)

    await page.goto('/wisdm-services/WDM-MISSING')
    await expect(page.getByText(/not found/i)).toBeVisible()

    await page.goto('/wisdm-services')
    const workflow = page.getByRole('combobox', { name: `Workflow for ${mockedRecord.soNumber}` })
    await workflow.selectOption('WHITELIST_DONE')
    await expect(page.getByText(/Version conflict/i)).toBeVisible()
    await expect(workflow).toHaveValue('CREATED')
    await workflow.selectOption('WHITELIST_DONE')
    await expect(workflow).toHaveValue('WHITELIST_DONE')
    expect(workflowCalls).toBe(2)
  })
})
