// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-04
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
  test('TP-004: Barcode 规范化后仅按 Barcode 匹配唯一 requestId', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const barcodeA = uniqueValue('BC-A')
    const barcodeB = uniqueValue('BC-B')
    const sourceSoA = uniqueValue('SO-SOURCE-A')
    const sourceSoB = uniqueValue('SO-SOURCE-B')
    const serviceSo = uniqueValue('SO-MANUAL-DIFFERENT')
    const requestA = await createPreconfigRequest(request, session, { barcode: barcodeA, soNumber: sourceSoA })
    const requestB = await createPreconfigRequest(request, session, { barcode: barcodeB, soNumber: sourceSoB })

    // Step 1: 输入阶段仅显示 Barcode 文本框，不生成 requestId。
    await openWisdmList(page)
    await openNewServiceDialog(page)
    await fillServiceCreateForm(page, {
      soNumber: serviceSo,
      barcodes: [`  ${barcodeA.toLowerCase()}  `],
      provisioning: true,
    })
    await expect(page.getByRole('dialog')).not.toContainText(requestA.requestId)

    // Step 2-3: 保存时忽略来源 SO，只按 Barcode 匹配并保存大写值和既有 requestId。
    const createResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/wisdm-service-records') && response.request().method() === 'POST',
    )
    await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click()
    const response = await createResponse
    expect(response.status()).toBe(201)
    const created = await response.json()
    expect(created.barcodes).toEqual([{ barcode: barcodeA.toUpperCase(), requestId: requestA.requestId }])

    // Step 4: 编辑 Barcode 后保存时重新匹配新的 requestId。
    await page.goto(`/wisdm-services/${created.recordId}?edit=1`)
    await page.getByRole('textbox', { name: 'Barcode 1', exact: true }).fill(barcodeB)
    const updateResponse = page.waitForResponse((item) =>
      item.url().endsWith(`/api/wisdm-service-records/${created.recordId}`) && item.request().method() === 'PUT',
    )
    await page.getByRole('button', { name: 'Save' }).click()
    const updatedResponse = await updateResponse
    expect(updatedResponse.status()).toBe(200)
    const updated = await updatedResponse.json()
    expect(updated.barcodes).toEqual([{ barcode: barcodeB.toUpperCase(), requestId: requestB.requestId }])
  })
})
