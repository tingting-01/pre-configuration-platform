// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-03, AC-10
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
  test('TP-002: 手工创建有效记录并生成 WDM 编号、Company 与创建历史', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const barcode = uniqueValue('BC-A')
    const soNumber = uniqueValue('SO-MANUAL-A')
    const companyName = uniqueValue('COMPANY-A')
    const preconfig = await createPreconfigRequest(request, session, { barcode, companyName })

    // Step 1: 打开新建弹窗，新建模式不显示 Workflow。
    await openWisdmList(page)
    await openNewServiceDialog(page)
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('combobox', { name: 'Workflow Process' })).toHaveCount(0)

    // Step 2: Company 留空，以唯一 SO、有效 Barcode 和一项服务创建。
    await fillServiceCreateForm(page, {
      soNumber,
      companyName: '',
      barcodes: [barcode],
      whitelist: true,
    })
    const createResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/wisdm-service-records') && response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    const response = await createResponse
    expect(response.status()).toBe(201)
    const created = await response.json()
    expect(created.recordId).toMatch(/^WDM\d+$/)
    await expect(page.getByRole('link', { name: soNumber })).toBeVisible()
    await expect(page.getByText(created.recordId, { exact: true })).toBeVisible()

    // Step 3: 详情自动带出来源 Company 和 requestId，Workflow 为 Created。
    await page.getByRole('link', { name: soNumber }).click()
    await expect(page).toHaveURL(new RegExp(`/wisdm-services/${created.recordId}$`))
    await expect(page.getByText(companyName, { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: preconfig.requestId })).toBeVisible()
    await expect(page.locator('dl').getByText('Created', { exact: true })).toBeVisible()

    // Step 4: History 包含手工创建事件、操作者和时间。
    const history = page.getByRole('heading', { name: 'History' }).locator('..')
    await expect(history).toContainText('Created manually')
    await expect(history).toContainText(session.user.email)
  })
})
