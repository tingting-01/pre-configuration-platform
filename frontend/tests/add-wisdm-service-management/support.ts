import fs from 'node:fs'
import path from 'node:path'
import { APIRequestContext, APIResponse, Page, expect } from '@playwright/test'

export const API_BASE_URL = process.env.PW_API_BASE_URL || 'http://localhost:8000'
export const PLAN_PATH = 'tests/plans/add-wisdm-service-management.md'
export const PRODUCTION_REQUEST_TIMEOUT = 600_000

type AccountName = 'admin' | 'internalCreator' | 'internalOther' | 'external'

interface Account {
  email: string
  password: string
}

export interface LoginSession {
  accessToken: string
  user: {
    id: number
    email: string
    name?: string
    role?: string
  }
}

export interface PreconfigOptions {
  barcode?: string
  soNumber?: string
  companyName?: string
  customerEmail?: string
  wisdmEnabled?: boolean
  whitelist?: boolean
  provisioning?: boolean
}

const localEnvPath = path.resolve(process.cwd(), '.env.playwright.local')

function loadLocalEnv(): void {
  if (!fs.existsSync(localEnvPath)) return
  for (const rawLine of fs.readFileSync(localEnvPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

loadLocalEnv()

const accountKeys: Record<AccountName, [string, string]> = {
  admin: ['PW_ADMIN_EMAIL', 'PW_ADMIN_PASSWORD'],
  internalCreator: ['PW_INTERNAL_CREATOR_EMAIL', 'PW_INTERNAL_CREATOR_PASSWORD'],
  internalOther: ['PW_INTERNAL_OTHER_EMAIL', 'PW_INTERNAL_OTHER_PASSWORD'],
  external: ['PW_EXTERNAL_EMAIL', 'PW_EXTERNAL_PASSWORD'],
}

export function getAccount(name: AccountName): Account {
  const [emailKey, passwordKey] = accountKeys[name]
  const email = process.env[emailKey]
  const password = process.env[passwordKey]
  if (!email || !password) {
    throw new Error(`缺少测试账号环境变量：${emailKey}/${passwordKey}`)
  }
  return { email, password }
}

export function uniqueValue(label: string): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `E2E-WDM-${label}-${timestamp}-${random}`
}

export function authHeaders(session: LoginSession): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  }
}

export async function loginApi(
  request: APIRequestContext,
  accountName: AccountName,
): Promise<LoginSession> {
  const account = getAccount(accountName)
  const response = await request.post(`${API_BASE_URL}/api/auth/login`, {
    data: account,
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
  expect(response.status(), `账号 ${accountName} 登录失败`).toBe(200)
  const body = await response.json()
  return {
    accessToken: body.access_token,
    user: body.user,
  }
}

export async function authenticatePage(page: Page, session: LoginSession): Promise<void> {
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
}

export async function loginPageAs(
  page: Page,
  request: APIRequestContext,
  accountName: AccountName,
): Promise<LoginSession> {
  const session = await loginApi(request, accountName)
  await authenticatePage(page, session)
  return session
}

export function buildPreconfigPayload(options: PreconfigOptions = {}) {
  const companyName = options.companyName || uniqueValue('COMPANY')
  return {
    companyName,
    rakId: options.customerEmail || 'e2e-wisdm@example.test',
    orderId: options.soNumber || '',
    configData: {
      general: {
        pid: uniqueValue('PID'),
        barcode: options.barcode || '',
        rakId: options.customerEmail || 'e2e-wisdm@example.test',
        orderId: options.soNumber || '',
        customerName: companyName,
      },
      system: {
        wisdmEnabled: options.wisdmEnabled ?? false,
        wisdmWhitelist: options.whitelist ?? false,
        wisdmConnect: options.provisioning ?? false,
      },
    },
    changes: {},
    originalConfig: {},
    tags: [],
  }
}

export async function expectJson(response: APIResponse, expectedStatus: number) {
  expect(response.status()).toBe(expectedStatus)
  return response.json()
}

export async function createPreconfigRequest(
  request: APIRequestContext,
  session: LoginSession,
  options: PreconfigOptions = {},
): Promise<{ requestId: string; payload: ReturnType<typeof buildPreconfigPayload> }> {
  const payload = buildPreconfigPayload(options)
  const response = await request.post(`${API_BASE_URL}/api/requests`, {
    headers: authHeaders(session),
    data: payload,
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
  const body = await expectJson(response, 200)
  return { requestId: body.request_id, payload }
}

export async function updatePreconfigRequest(
  request: APIRequestContext,
  session: LoginSession,
  requestId: string,
  payload: ReturnType<typeof buildPreconfigPayload>,
): Promise<APIResponse> {
  return request.put(`${API_BASE_URL}/api/requests/${encodeURIComponent(requestId)}`, {
    headers: authHeaders(session),
    data: {
      companyName: payload.companyName,
      rakId: payload.rakId,
      orderId: payload.orderId,
      configData: payload.configData,
      tags: payload.tags,
    },
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
}

export async function getPreconfigRequest(
  request: APIRequestContext,
  session: LoginSession,
  requestId: string,
) {
  const response = await request.get(`${API_BASE_URL}/api/requests/${encodeURIComponent(requestId)}`, {
    headers: authHeaders(session),
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
  return expectJson(response, 200)
}

export async function createWisdmRecord(
  request: APIRequestContext,
  session: LoginSession,
  input: {
    soNumber: string
    companyName?: string
    barcodes: string[]
    whitelistRequired?: boolean
    provisioningRequired?: boolean
    jiraKeys?: string[]
    notes?: string
  },
) {
  const response = await request.post(`${API_BASE_URL}/api/wisdm-service-records`, {
    headers: authHeaders(session),
    data: {
      soNumber: input.soNumber,
      companyName: input.companyName || '',
      barcodes: input.barcodes,
      whitelistRequired: input.whitelistRequired ?? true,
      provisioningRequired: input.provisioningRequired ?? false,
      jiraKeys: input.jiraKeys || [],
      notes: input.notes || '',
    },
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
  return expectJson(response, 201)
}

export async function getWisdmRecord(
  request: APIRequestContext,
  session: LoginSession,
  recordId: string,
) {
  const response = await request.get(`${API_BASE_URL}/api/wisdm-service-records/${encodeURIComponent(recordId)}`, {
    headers: authHeaders(session),
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
  return expectJson(response, 200)
}

export async function listWisdmRecords(
  request: APIRequestContext,
  session: LoginSession,
  params: Record<string, string> = {},
) {
  const response = await request.get(`${API_BASE_URL}/api/wisdm-service-records`, {
    headers: authHeaders(session),
    params,
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
  const body = await expectJson(response, 200)
  return body.records as any[]
}

export async function updateWisdmContent(
  request: APIRequestContext,
  session: LoginSession,
  record: any,
  overrides: Record<string, unknown> = {},
): Promise<APIResponse> {
  return request.put(`${API_BASE_URL}/api/wisdm-service-records/${encodeURIComponent(record.recordId)}`, {
    headers: authHeaders(session),
    data: {
      companyName: record.companyName,
      barcodes: record.barcodes.map((item: any) => item.barcode),
      whitelistRequired: record.whitelistRequired,
      provisioningRequired: record.provisioningRequired,
      jiraKeys: record.jiraKeys,
      notes: record.notes,
      version: record.version,
      ...overrides,
    },
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
}

export async function updateWisdmWorkflow(
  request: APIRequestContext,
  session: LoginSession,
  recordId: string,
  version: number,
  workflow: string,
): Promise<APIResponse> {
  return request.put(`${API_BASE_URL}/api/wisdm-service-records/${encodeURIComponent(recordId)}`, {
    headers: authHeaders(session),
    data: { workflow, version },
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
}

export async function openWisdmList(page: Page): Promise<void> {
  await page.goto('/wisdm-services')
  await expect(page.getByRole('heading', { name: 'WisDM Services' })).toBeVisible()
}

export async function openNewServiceDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New Service Record' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

export async function fillServiceCreateForm(
  page: Page,
  input: {
    soNumber: string
    companyName?: string
    barcodes: string[]
    whitelist?: boolean
    provisioning?: boolean
    notes?: string
  },
): Promise<void> {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'SO Number *' }).fill(input.soNumber)
  if (input.companyName !== undefined) {
    await dialog.getByRole('textbox', { name: 'Company' }).fill(input.companyName)
  }
  for (let index = 0; index < input.barcodes.length; index += 1) {
    if (index > 0) await dialog.getByRole('button', { name: 'Add barcode' }).click()
    await dialog.getByRole('textbox', { name: `Barcode ${index + 1}`, exact: true }).fill(input.barcodes[index])
  }
  if (input.whitelist) await dialog.getByRole('checkbox', { name: 'WisDM Whitelist required' }).check()
  if (input.provisioning) await dialog.getByRole('checkbox', { name: 'WisDM Provisioning required' }).check()
  if (input.notes !== undefined) await dialog.getByRole('textbox', { name: 'Notes' }).fill(input.notes)
}

export async function fillConfigurationBasics(
  page: Page,
  input: { barcode?: string; soNumber?: string; companyName?: string },
): Promise<void> {
  await page.getByPlaceholder('Enter BarCode').fill(input.barcode || '')
  await page.getByPlaceholder('Enter Customer Email').fill('e2e-wisdm@example.test')
  await page.getByPlaceholder('Enter SO Number').fill(input.soNumber || '')
  await page.getByPlaceholder('Enter company name').fill(input.companyName || uniqueValue('COMPANY'))
}

export async function enableConfigurationWisdm(
  page: Page,
  services: { whitelist?: boolean; provisioning?: boolean },
): Promise<void> {
  await page.getByRole('heading', { name: 'System Configuration' }).click()
  const wisdmLabel = page.getByText('WisDM', { exact: true })
  await wisdmLabel.locator('xpath=following-sibling::div').click()
  if (services.whitelist) {
    await page.getByText('WisDM Whitelist', { exact: true }).locator('..').getByRole('checkbox').check()
  }
  if (services.provisioning) {
    await page.getByText('WisDM Provisioning', { exact: true }).locator('..').getByRole('checkbox').check()
  }
}

export async function submitConfiguration(page: Page): Promise<APIResponse> {
  const responsePromise = page.waitForResponse(
    (response) => response.url().startsWith(`${API_BASE_URL}/api/requests`) &&
      ['POST', 'PUT'].includes(response.request().method()),
    { timeout: PRODUCTION_REQUEST_TIMEOUT },
  )
  await page.getByRole('button', { name: /Save Configuration|Update Configuration/ }).click()
  return responsePromise
}

export async function findHistoricalDuplicateBarcode(
  request: APIRequestContext,
  session: LoginSession,
): Promise<{ barcode: string; requestIds: string[] }> {
  const response = await request.get(`${API_BASE_URL}/api/requests`, {
    headers: authHeaders(session),
    timeout: PRODUCTION_REQUEST_TIMEOUT,
  })
  const requests = await expectJson(response, 200)
  const byBarcode = new Map<string, string[]>()
  for (const item of requests) {
    const general = item.configData?.general || {}
    const raw = general.barcode ?? general.barCode ?? general.BarCode ?? general.bar_code
    const barcode = String(raw || '').trim().toUpperCase()
    if (!barcode) continue
    byBarcode.set(barcode, [...(byBarcode.get(barcode) || []), item.id])
  }
  const duplicate = [...byBarcode.entries()].find(([, ids]) => ids.length > 1)
  if (!duplicate) throw new Error('环境中没有可用于只读歧义校验的历史重复 Barcode')
  return { barcode: duplicate[0], requestIds: duplicate[1] }
}
