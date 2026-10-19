import { expect, test } from '@playwright/test'
import {
  adminApi,
  collectPageErrors,
  createOpenResource,
  dayAWeekAhead,
  section,
  selectTab,
  signIn,
  uniqueSuffix,
  waitForEmail,
} from './support'

// A new user's whole journey against the real stack, with every email read
// from Mailpit: register, confirm through the emailed link, sign in, then
// book, move and cancel, each with its email and calendar invitation.
test('a new user registers, confirms by email, and books, moves and cancels', async ({ page }) => {
  const errors = collectPageErrors(page)
  const suffix = uniqueSuffix()
  const email = `e2e-${suffix}@example.com`
  const password = `E2e-password-${suffix}`
  const resourceName = `E2E Room ${suffix}`
  const day = dayAWeekAhead()

  const api = await adminApi()
  await createOpenResource(api, resourceName)
  await api.dispose()

  // Register.
  await page.goto('/register')
  await page.getByLabel('Name').fill('E2E User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText(
    "Check your inbox to finish creating your account. If the email doesn't arrive, you can ask for a new one.",
  )).toBeVisible()

  // Confirm through the link in the real email.
  const verification = await waitForEmail(email, 'Confirm your email')
  const link = verification.Text.match(/https:\/\/\S+\/verify-email#token=[A-Za-z0-9_-]+/)?.[0]
  expect(link, 'the verification link in the email').toBeDefined()
  await page.goto(link!)
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible()
  // The token leaves the address at once.
  expect(new URL(page.url()).hash).toBe('')
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Confirm email' }).click()
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()

  // Sign in.
  await signIn(page, email, password)
  await expect(page.getByRole('heading', { name: 'Your booking space' })).toBeVisible()

  // Book 10:00–11:00 a week from today.
  await section(page, 'Book a resource')
    .getByRole('button', { name: `View availability for ${resourceName}` })
    .click()
  const schedule = section(page, 'Resource schedule')
  await schedule.getByLabel('Go to date').fill(day.iso)
  await schedule.getByRole('button', { name: new RegExp(`^Available ${day.label}, 08:00–20:00`) }).click()
  await schedule.getByLabel('Start', { exact: true }).selectOption({ label: '10:00' })
  await schedule.getByLabel('End', { exact: true }).selectOption({ label: '11:00' })
  await schedule.getByRole('button', { name: 'Reserve' }).click()
  await expect(page.getByText(`Reservation created: ${day.label}, 10:00–11:00.`)).toBeVisible()

  const confirmed = await waitForEmail(email, `Booking confirmed: ${resourceName}`)
  expect(confirmed.Attachments.map((attachment) => attachment.ContentType)).toEqual(
    [expect.stringContaining('text/calendar')],
  )

  // Move it to 13:00–14:00 from My reservations.
  await selectTab(page, 'My reservations')
  await section(page, 'My reservations')
    .getByRole('link', { name: new RegExp(`^Move ${resourceName}`) })
    .click()
  await expect(page.getByRole('heading', { name: 'Move a booking' })).toBeVisible()
  // The booking's own time shows as free while it is being moved.
  await schedule.getByRole('button', { name: new RegExp(`^Available ${day.label}, 08:00–20:00`) }).click()
  await schedule.getByLabel('Start', { exact: true }).selectOption({ label: '13:00' })
  await schedule.getByLabel('End', { exact: true }).selectOption({ label: '14:00' })
  await schedule.getByRole('button', { name: 'Move booking' }).click()
  await expect(page.getByText(`Booking moved to ${day.label}, 13:00–14:00.`)).toBeVisible()

  const moved = await waitForEmail(email, `Booking moved: ${resourceName}`)
  expect(moved.Attachments).toHaveLength(1)

  // Cancel it.
  await selectTab(page, 'My reservations')
  await section(page, 'My reservations').getByRole('button', { name: /^Cancel/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel reservation' }).click()
  await expect(page.getByText('Reservation cancelled.')).toBeVisible()

  const cancelled = await waitForEmail(email, `Booking cancelled: ${resourceName}`)
  expect(cancelled.Attachments).toHaveLength(1)

  // The time is free again.
  await selectTab(page, 'Book resource')
  await expect(schedule.getByRole('button', { name: new RegExp(`^Available ${day.label}, 08:00–20:00`) })).toBeVisible()

  expect(errors, 'console errors or CSP violations').toEqual([])
})
