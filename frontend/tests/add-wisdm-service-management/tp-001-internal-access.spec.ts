// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-01
import { test, expect } from '@playwright/test'
import { API_BASE_URL, authHeaders, loginApi, loginPageAs, openWisdmList } from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-001: 内部账号可访问，非内部账号被前后端同时拒绝', async ({ browser, page, request }) => {
    // Step 1: 管理员可以看到菜单并进入 WisDM Services。
    await loginPageAs(page, request, 'admin')
    await openWisdmList(page)
    await expect(page.getByRole('link', { name: 'WisDM Services' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New Service Record' })).toBeVisible()

    // Step 2: 普通 RAK 内部账号可以读取全部服务记录页面。
    const internalPage = await browser.newPage()
    await loginPageAs(internalPage, request, 'internalCreator')
    await openWisdmList(internalPage)
    await expect(internalPage.getByRole('heading', { name: 'WisDM Services' })).toBeVisible()
    await internalPage.close()

    // Step 3-4: 外部账号不显示菜单，直接路由会被前端门禁送回 Dashboard。
    const externalPage = await browser.newPage()
    const externalSession = await loginPageAs(externalPage, request, 'external')
    await externalPage.goto('/dashboard')
    await expect(externalPage.getByRole('link', { name: 'WisDM Services' })).toHaveCount(0)
    await externalPage.goto('/wisdm-services')
    await expect(externalPage).toHaveURL(/\/dashboard$/)

    // Step 5: 外部账号直接调用接口返回 403 且没有记录数据。
    const forbidden = await request.get(`${API_BASE_URL}/api/wisdm-service-records`, {
      headers: authHeaders(externalSession),
    })
    expect(forbidden.status()).toBe(403)
    expect(await forbidden.text()).not.toContain('recordId')
    await externalPage.close()
  })
})
