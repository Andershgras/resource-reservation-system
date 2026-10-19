import { expect, request, type APIRequestContext, type Page } from '@playwright/test'

export const baseUrl = process.env.E2E_BASE_URL ?? 'https://localhost:8443'
const mailpitUrl = process.env.MAILPIT_URL ?? 'http://localhost:8025'

// The seed admin from .env, which CI and the local stack set.
export const admin = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? '',
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? '',
}

export function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
}

// The API as a client other than a browser: a bearer token from
// /api/auth/token, which needs no anti-forgery token.
export async function adminApi(): Promise<APIRequestContext> {
  expect(admin.email, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD, or SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD').not.toBe('')
  const anonymous = await request.newContext({ baseURL: baseUrl, ignoreHTTPSErrors: true })
  const response = await anonymous.post('/api/auth/token', { data: admin })
  expect(response.status()).toBe(200)
  const { token } = await response.json() as { token: string }
  await anonymous.dispose()

  return request.newContext({
    baseURL: baseUrl,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
}

// A resource open every day from 08:00 to 20:00.
export async function createOpenResource(api: APIRequestContext, name: string) {
  const created = await api.post('/api/resources', { data: { name, location: 'E2E floor' } })
  expect(created.status()).toBe(201)
  const { id } = await created.json() as { id: number }

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const rule = await api.post('/api/availabilityrules', {
      data: { resourceId: id, dayOfWeek, startTime: '08:00', endTime: '20:00' },
    })
    expect(rule.status()).toBe(201)
  }

  return id
}

// The day a week from today in Copenhagen, as the app shows it ("Mon 26 Oct
// 2026") and as a date input wants it ("2026-10-26").
export function dayAWeekAhead() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Copenhagen',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  )
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

  return {
    label: `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`,
    shortLabel: `${parts.weekday} ${parts.day} ${parts.month}`,
    iso,
  }
}

interface MailpitSummary {
  ID: string
  Subject: string
}

interface MailpitMessage {
  Subject: string
  Text: string
  Attachments: { FileName: string, ContentType: string }[]
}

// Waits for an email to the address whose subject starts with the given text,
// as delivery goes through the outbox or the account email queue.
export async function waitForEmail(to: string, subjectStart: string): Promise<MailpitMessage> {
  const mailpit = await request.newContext({ baseURL: mailpitUrl })

  try {
    let found: MailpitSummary | undefined

    await expect.poll(async () => {
      const response = await mailpit.get('/api/v1/search', { params: { query: `to:"${to}"` } })
      const { messages } = await response.json() as { messages: MailpitSummary[] }
      found = messages.find((message) => message.Subject.startsWith(subjectStart))

      return found !== undefined
    }, { message: `an email to ${to} starting "${subjectStart}"`, timeout: 45_000, intervals: [500, 1000, 2000] }).toBe(true)

    return await (await mailpit.get(`/api/v1/message/${found!.ID}`)).json() as MailpitMessage
  } finally {
    await mailpit.dispose()
  }
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.locator('form button[type="submit"]').click()
}

// Page sections are regions named by their heading.
export function section(page: Page, heading: string) {
  return page.getByRole('region', { name: heading, exact: true })
}

export async function selectTab(page: Page, tabName: string) {
  await page.getByRole('navigation', { name: 'Section navigation' })
    .getByRole('link', { name: tabName, exact: true })
    .click()
}

// Console errors and CSP violations, which a test can check at the end.
export function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    // A signed-out visitor's /api/auth/me is a 401, which the browser logs.
    if (message.type() === 'error' && !message.text().includes('status of 401')) {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))

  return errors
}
