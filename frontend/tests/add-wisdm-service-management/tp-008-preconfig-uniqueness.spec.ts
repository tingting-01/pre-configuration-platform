// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-05, AC-11
import { test, expect } from '@playwright/test'
import {
  API_BASE_URL, authHeaders, buildPreconfigPayload, createPreconfigRequest, getPreconfigRequest,
  loginPageAs, PRODUCTION_REQUEST_TIMEOUT, updatePreconfigRequest, uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-008: 新建、复制和编辑均执行 Barcode 全局唯一校验', async ({ page, request }) => {
    const session = await loginPageAs(page, request, 'admin')
    const occupied = uniqueValue('BC-OCCUPIED')
    const owner = await createPreconfigRequest(request, session, { barcode: occupied })

    const duplicatePayload = buildPreconfigPayload({ barcode: ` ${occupied.toLowerCase()} ` })
    const duplicate = await request.post(`${API_BASE_URL}/api/requests`, {
      headers: authHeaders(session), data: duplicatePayload, timeout: PRODUCTION_REQUEST_TIMEOUT,
    })
    expect(duplicate.status()).toBe(400)
    expect((await duplicate.json()).detail).toContain(owner.requestId)

    await page.goto(`/configuration?copy=${owner.requestId}`)
    await expect(page.getByText(new RegExp(`Copying from ${owner.requestId}`))).toBeVisible()
    const copyResponse = page.waitForResponse((response) => response.url().endsWith('/api/requests') && response.request().method() === 'POST', { timeout: PRODUCTION_REQUEST_TIMEOUT })
    await page.getByRole('button', { name: 'Save Configuration' }).click()
    const copyRejected = await copyResponse
    expect(copyRejected.status()).toBe(400)
    await expect(
      page.getByText(/Request failed with status code 400:/).filter({ hasText: owner.requestId }),
    ).toBeVisible()

    const editableBarcode = uniqueValue('BC-EDITABLE')
    const editable = await createPreconfigRequest(request, session, { barcode: editableBarcode })
    const editedPayload = editable.payload
    editedPayload.configData.general.barcode = occupied
    const editRejected = await updatePreconfigRequest(request, session, editable.requestId, editedPayload)
    expect(editRejected.status()).toBe(400)
    expect((await editRejected.json()).detail).toContain(owner.requestId)
    const unchanged = await getPreconfigRequest(request, session, editable.requestId)
    expect(unchanged.configData.general.barcode).toBe(editableBarcode)
  })
})
