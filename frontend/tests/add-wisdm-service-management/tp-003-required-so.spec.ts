// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-03, AC-11
import { test, expect } from '@playwright/test'
import {
  API_BASE_URL,
  authHeaders,
  createPreconfigRequest,
  createWisdmRecord,
  fillServiceCreateForm,
  loginPageAs,
  openNewServiceDialog,
  openWisdmList,
  uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-003: 必填、重复 SO、SO 规范化及创建后不可修改', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const barcode = uniqueValue('BC-REQUIRED')
    const soNumber = uniqueValue('SO-CONFLICT')
    await createPreconfigRequest(request, session, { barcode })
    const existing = await createWisdmRecord(request, session, {
      soNumber,
      barcodes: [barcode],
      whitelistRequired: true,
    })

    // Step 1: 空表单显示三个明确的必填错误且不发出创建请求。
    await openWisdmList(page)
    await openNewServiceDialog(page)
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog.getByText('SO Number is required')).toBeVisible()
    await expect(dialog.getByText('Barcode is required')).toBeVisible()
    await expect(dialog.getByText('At least one WisDM service is required')).toBeVisible()

    // Step 2: 只填 SO 和 Barcode、不选择服务仍被前端拒绝。
    await dialog.getByRole('textbox', { name: 'SO Number *' }).fill(uniqueValue('SO-NO-SERVICE'))
    await dialog.getByRole('textbox', { name: 'Barcode 1', exact: true }).fill(barcode)
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog.getByText('At least one WisDM service is required')).toBeVisible()

    // Step 3: 大小写和首尾空白不同的重复 SO 返回 409，不产生第二条记录。
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await openNewServiceDialog(page)
    await fillServiceCreateForm(page, {
      soNumber: `  ${soNumber.toLowerCase()}  `,
      barcodes: [barcode],
      whitelist: true,
    })
    const duplicateResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/wisdm-service-records') && response.request().method() === 'POST',
    )
    await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click()
    expect((await duplicateResponse).status()).toBe(409)
    await expect(page.getByText(/already has a service record/i)).toBeVisible()

    // Step 4: 编辑页不提供 SO 输入框。
    await page.goto(`/wisdm-services/${existing.recordId}?edit=1`)
    await expect(page.getByRole('heading', { name: soNumber })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'SO Number *' })).toHaveCount(0)

    // Step 5: 直接提交 SO 修改返回 400，原 SO 保持不变。
    const immutable = await request.put(`${API_BASE_URL}/api/wisdm-service-records/${existing.recordId}`, {
      headers: authHeaders(session),
      data: { soNumber: uniqueValue('SO-CHANGED'), version: existing.version },
    })
    expect(immutable.status()).toBe(400)
    await page.reload()
    await expect(page.getByRole('heading', { name: soNumber })).toBeVisible()
  })
})
