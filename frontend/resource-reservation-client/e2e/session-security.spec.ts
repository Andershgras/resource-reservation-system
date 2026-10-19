import { expect, request, test } from '@playwright/test'
import { admin, baseUrl, collectPageErrors, signIn } from './support'

// What only a real browser on the real stack can show (ADR 0012): the
// session cookie's attributes as the browser stores them, that scripts can't
// read it, that it survives a reload, that another site can't use it, and
// that signing out ends it on the server.
test('the session cookie is httpOnly, survives a reload and ends on the server', async ({ page, context }) => {
  const errors = collectPageErrors(page)

  await signIn(page, admin.email, admin.password)
  await expect(page.getByRole('heading', { name: 'Booking operations' })).toBeVisible()

  const cookies = await context.cookies()
  const session = cookies.find((cookie) => cookie.name === '__Host-rr-session')
  const antiforgery = cookies.find((cookie) => cookie.name === '__Host-rr-csrf')
  for (const cookie of [session, antiforgery]) {
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' })
  }
  expect(await page.evaluate(() => document.cookie)).toBe('')
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['resource-reservation-signed-in'])

  await page.goto('/admin/users')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Booking operations' })).toBeVisible()

  // Another site posts a form to the API in the same browser: the browser
  // doesn't send the Strict cookie, and the API refuses the cross-site request.
  const otherSite = await context.newPage()
  await otherSite.goto('about:blank')
  await otherSite.setContent(`<form method="POST" action="${baseUrl}/api/auth/login" enctype="text/plain">
    <input name='{"email":"${admin.email}","password":"x","y":"' value='"}'></form>`)
  const forged = otherSite.waitForResponse(`${baseUrl}/api/auth/login`)
  await otherSite.evaluate(() => document.forms[0].submit())
  expect((await forged).status()).toBe(403)
  // Left open, closed with the context: closing a page whose navigation ended
  // on a JSON response, which Chromium may treat as a download, can stall.
  await page.bringToFront()

  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect((await context.cookies()).some((cookie) => cookie.name === '__Host-rr-session')).toBe(false)

  // A copy of the cookie stops working, because the session was revoked.
  const copy = await request.newContext({ baseURL: baseUrl, ignoreHTTPSErrors: true })
  const replay = await copy.get('/api/auth/me', { headers: { Cookie: `__Host-rr-session=${session!.value}` } })
  expect(replay.status()).toBe(401)
  await copy.dispose()

  expect(errors, 'console errors or CSP violations').toEqual([])
})
