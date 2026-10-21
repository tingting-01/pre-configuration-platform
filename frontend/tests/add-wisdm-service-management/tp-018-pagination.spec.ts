// Source: WisDM Services pagination implementation plan
import { expect, test } from '@playwright/test'

const records = Array.from({ length: 72 }, (_, index) => {
  const number = index + 1
  const recordId = `WDM${String(number).padStart(4, '0')}`
  return {
    recordId,
    soNumber: `SO-${String(number).padStart(3, '0')}`,
    companyName: `Company ${number}`,
    barcodes: [{ requestId: `REQ${number}`, barcode: `BC${number}` }],
    whitelistRequired: true,
    provisioningRequired: false,
    jiraKeys: [],
    workflow: number % 3 === 0 ? 'ALL_DONE' : 'CREATED',
    notes: '',
    sourceType: 'manual',
    createdBy: { id: 1, name: 'Admin', email: 'admin@example.test' },
    updatedBy: null,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
    version: 1,
    allowedWorkflows: ['CREATED', 'WHITELIST_DONE'],
    permissions: { canEditContent: true, canUpdateWorkflow: true },
  }
})

test.describe('WisDM Services pagination', () => {
  test('TP-018: 分页、筛选重置、状态持久化和越界校正', async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.localStorage.getItem('auth-storage')) {
        window.localStorage.setItem('auth-storage', JSON.stringify({
          state: {
            token: 'pagination-test-token',
            user: { id: 1, email: 'admin@example.test', name: 'Admin', role: 'admin' },
            isAuthenticated: true,
          },
          version: 0,
        }))
      }
      if (!window.localStorage.getItem('wisdm-services-list-storage')) {
        window.localStorage.setItem('wisdm-services-list-storage', JSON.stringify({
          state: { currentPage: 1, itemsPerPage: 10 },
          version: 0,
        }))
      }
    })
    await page.route('**/api/wisdm-service-records**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname !== '/api/wisdm-service-records') {
        const recordId = decodeURIComponent(url.pathname.split('/').pop() || '')
        const record = records.find((item) => item.recordId === recordId)
        await route.fulfill({
          status: record ? 200 : 404,
          contentType: 'application/json',
          body: JSON.stringify(record ? { ...record, history: [] } : { detail: 'Not found' }),
        })
        return
      }

      const search = (url.searchParams.get('search') || '').toLowerCase()
      const workflow = url.searchParams.get('filter') || 'ALL'
      const filtered = records.filter((record) => {
        const matchesSearch = !search || [record.soNumber, record.companyName]
          .some((value) => value.toLowerCase().includes(search))
        const matchesWorkflow = workflow === 'ALL' || record.workflow === workflow
        return matchesSearch && matchesWorkflow
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records: filtered }),
      })
    })

    await page.goto('/wisdm-services')
    const pagination = page.getByRole('navigation', { name: 'WisDM Services pagination' })
    await expect(page.getByText('Showing 1 - 10 of 72 records')).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(11)
    await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await expect(pagination.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')

    await pagination.getByRole('button', { name: 'Page 4' }).click()
    await expect(page.getByText('Showing 31 - 40 of 72 records')).toBeVisible()
    await expect(pagination.getByText('...')).toHaveCount(2)
    await pagination.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Showing 41 - 50 of 72 records')).toBeVisible()

    await page.getByRole('combobox', { name: 'Rows per page' }).selectOption('20')
    await expect(page.getByText('Showing 1 - 20 of 72 records')).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(21)

    await page.getByRole('combobox', { name: 'Rows per page' }).selectOption('10')
    await pagination.getByRole('button', { name: 'Page 2' }).click()
    await page.getByRole('link', { name: 'View' }).first().click()
    await expect(page.getByRole('button', { name: /Back to WisDM Services/ })).toBeVisible()
    await page.getByRole('button', { name: /Back to WisDM Services/ }).click()
    await expect(page.getByText('Showing 11 - 20 of 72 records')).toBeVisible()

    const search = page.getByRole('textbox', { name: 'Search service records' })
    await search.fill('SO-001')
    await search.press('Enter')
    await expect(page.getByText('Showing 1 - 1 of 1 records')).toBeVisible()

    await search.fill('')
    await search.press('Enter')
    await pagination.getByRole('button', { name: 'Page 2' }).click()
    await page.getByRole('button', { name: 'All Done', exact: true }).click()
    await expect(page.getByText('Showing 1 - 10 of 24 records')).toBeVisible()

    await page.evaluate(() => {
      window.localStorage.setItem('wisdm-services-list-storage', JSON.stringify({
        state: { currentPage: 99, itemsPerPage: 10 },
        version: 0,
      }))
    })
    await page.reload()
    await expect(page.getByText('Showing 71 - 72 of 72 records')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
