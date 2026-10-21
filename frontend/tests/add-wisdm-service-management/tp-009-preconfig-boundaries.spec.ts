// Test plan: tests/plans/add-wisdm-service-management.md
// Source: OpenSpec change - openspec/changes/add-wisdm-service-management/specs/wisdm-service-management/spec.md
// Acceptance criteria: AC-05
import { test, expect } from '@playwright/test'
import {
  API_BASE_URL, authHeaders, buildPreconfigPayload, createPreconfigRequest, loginApi,
  PRODUCTION_REQUEST_TIMEOUT, updatePreconfigRequest, uniqueValue,
} from './support'

test.describe('add-wisdm-service-management', () => {
  test('TP-009: 唯一比较排除自身并处理空值、大小写和空白', async ({ request }) => {
    const session = await loginApi(request, 'admin')
    const barcode = uniqueValue('BC-BOUNDARY')
    const owner = await createPreconfigRequest(request, session, { barcode })

    const unchanged = await updatePreconfigRequest(request, session, owner.requestId, owner.payload)
    expect(unchanged.status()).toBe(200)

    for (const duplicateBarcode of [barcode.toLowerCase(), `  ${barcode}  `]) {
      const response = await request.post(`${API_BASE_URL}/api/requests`, {
        headers: authHeaders(session), data: buildPreconfigPayload({ barcode: duplicateBarcode }), timeout: PRODUCTION_REQUEST_TIMEOUT,
      })
      expect(response.status()).toBe(400)
      expect((await response.json()).detail).toContain(owner.requestId)
    }

    const empty = await request.post(`${API_BASE_URL}/api/requests`, {
      headers: authHeaders(session), data: buildPreconfigPayload({ barcode: '' }), timeout: PRODUCTION_REQUEST_TIMEOUT,
    })
    expect(empty.status()).toBe(200)
  })
})
