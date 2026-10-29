// Source: OpenSpec change - openspec/changes/add-wisdm-service-record-deletion
import { expect, test } from '@playwright/test'

const session = {
  accessToken: 'wisdm-delete-mock-token',
  user: { id: 7, email: 'creator@rakwireless.com', name: 'Creator', role: 'rakwireless' },
}

function record(recordId: string, soNumber: string, canDelete: boolean) {
  return {
    recordId,
    soNumber,
    companyName: `${soNumber} Company`,
    barcodes: [{ barcode: `${soNumber}-BC`, requestId: `${soNumber}-REQ` }],
    whitelistRequired: true,
    provisioningRequired: false,
    jiraKeys: [],
    workflow: 'CREATED',
    notes: '',
    sourceType: 'manual',
    createdBy: {
      id: canDelete ? session.user.id : 8,
      name: canDelete ? 'Creator' : 'Other',
      email: canDelete ? session.user.email : 'other@example.test',
    },
    updatedBy: null,
    createdAt: '2026-10-29T00:00:00Z',
    updatedAt: '2026-10-29T00:00:00Z',
    version: 1,
    allowedWorkflows: ['CREATED', 'WHITELIST_DONE', 'ALL_DONE'],
    permissions: { canEditContent: true, canUpdateWorkflow: true, canDelete },
  }
}

test.describe('WisDM 服务记录删除', () => {
  test('列表只展示有权限的删除按钮，并支持取消、失败后重试和成功移除', async ({ page }) => {
    const ownRecord = record('WDM-DELETE-OWN', 'SO-DELETE-OWN', true)
    const otherRecord = record('WDM-DELETE-OTHER', 'SO-DELETE-OTHER', false)
    let records = [ownRecord, otherRecord]
    let deleteCalls = 0

    await page.addInitScript((auth) => {
      window.localStorage.setItem('auth-storage', JSON.stringify({
        state: {
          token: auth.accessToken,
          user: auth.user,
          isAuthenticated: true,
        },
        version: 0,
      }))
    }, session)
    await page.route('**/api/wisdm-service-records**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (request.method() === 'DELETE') {
        deleteCalls += 1
        if (deleteCalls === 1) {
          await route.fulfill({ status: 500, json: { detail: 'Delete failed' } })
          return
        }
        records = records.filter((item) => item.recordId !== ownRecord.recordId)
        await route.fulfill({ status: 200, json: { message: 'Deleted' } })
        return
      }

      if (url.pathname === '/api/wisdm-service-records') {
        await route.fulfill({ status: 200, json: { records } })
        return
      }

      await route.fulfill({ status: 404, json: { detail: 'Not found' } })
    })

    await page.goto('/wisdm-services')
    const ownRow = page.getByRole('link', { name: ownRecord.soNumber, exact: true }).locator('xpath=ancestor::tr')
    const otherRow = page.getByRole('link', { name: otherRecord.soNumber, exact: true }).locator('xpath=ancestor::tr')

    await expect(ownRow.locator('td').last().locator('a,button')).toHaveText(['View', 'Edit', 'Delete'])
    await expect(otherRow.getByRole('button', { name: 'Delete' })).toHaveCount(0)

    await ownRow.getByRole('button', { name: 'Delete' }).click()
    let dialog = page.getByRole('dialog', { name: 'Delete Service Record' })
    await expect(dialog).toContainText(ownRecord.soNumber)
    await expect(dialog).toContainText(ownRecord.recordId)
    await expect(dialog).toContainText('cannot be undone')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    expect(deleteCalls).toBe(0)

    await ownRow.getByRole('button', { name: 'Delete' }).click()
    dialog = page.getByRole('dialog', { name: 'Delete Service Record' })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Delete failed')).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()
    await expect(ownRow).toBeVisible()
    expect(deleteCalls).toBe(1)

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('link', { name: ownRecord.soNumber, exact: true })).toHaveCount(0)
    await expect(page.getByText(`Deleted ${ownRecord.recordId}`)).toBeVisible()
    await expect(page.getByRole('link', { name: otherRecord.soNumber, exact: true })).toBeVisible()
    expect(deleteCalls).toBe(2)
  })
})
