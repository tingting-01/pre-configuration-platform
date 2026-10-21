// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-04, AC-12
import { test, expect } from '@playwright/test'
import {
  createPreconfigRequest,
  fillServiceCreateForm,
  loginPageAs,
  openNewServiceDialog,
  openWisdmList,
  uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-005: 一个 SO 关联多条不同 Barcode，并正确展示和跳转来源', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const barcodeA = uniqueValue('BC-A')
    const barcodeB = uniqueValue('BC-B')
    const soNumber = uniqueValue('SO-MULTI')
    const requestA = await createPreconfigRequest(request, session, { barcode: barcodeA })
    const requestB = await createPreconfigRequest(request, session, { barcode: barcodeB })

    // Step 1: Add barcode 增加第二行，并提供对应移除按钮。
    await openWisdmList(page)
    await openNewServiceDialog(page)
    await fillServiceCreateForm(page, {
      soNumber,
      barcodes: [barcodeA, barcodeB],
      whitelist: true,
      provisioning: true,
    })
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('textbox', { name: 'Barcode 2', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Remove barcode 2' })).toBeVisible()

    // Step 2: 两条 Barcode 一次保存到同一条服务记录。
    const createResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/wisdm-service-records') && response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    const response = await createResponse
    expect(response.status()).toBe(201)
    const created = await response.json()
    expect(created.barcodes).toHaveLength(2)

    // Step 3: 列表按 BARCODE + requestId 展示两条来源。
    const row = page.getByRole('row').filter({ hasText: soNumber })
    await expect(row).toContainText(barcodeA.toUpperCase())
    await expect(row.getByRole('link', { name: requestA.requestId })).toBeVisible()
    await expect(row).toContainText(barcodeB.toUpperCase())
    await expect(row.getByRole('link', { name: requestB.requestId })).toBeVisible()

    // Step 4: 来源链接打开正确的预配置请求详情并携带 WisDM 返回路径。
    await row.getByRole('link', { name: requestA.requestId }).click()
    await expect(page).toHaveURL(new RegExp(`/request-details/${requestA.requestId}\\?from=`))
  })
})
