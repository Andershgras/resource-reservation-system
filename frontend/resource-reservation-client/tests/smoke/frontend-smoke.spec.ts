import { expect, test, type Page } from '@playwright/test'

type UserRole = 'Admin' | 'User'
type ReservationStatus = 'Active' | 'Cancelled'

interface UserResponse {
  id: number
  name: string
  email: string
  role: UserRole
}

interface ResourceResponse {
  id: number
  name: string
  description: string | null
  location: string | null
  isActive: boolean
}

interface AvailabilityResponse {
  id: number
  resourceId: number
  resourceName: string
  startTime: string
  endTime: string
}

interface AvailabilityRuleResponse {
  id: number
  resourceId: number
  resourceName: string
  dayOfWeek: number
  dayName: string
  startTime: string
  endTime: string
}

interface BookableSlotResponse {
  startTime: string
  endTime: string
}

interface ReservedSlotResponse {
  startTime: string
  endTime: string
}

interface ResourceScheduleResponse {
  resourceId: number
  resourceName: string
  fromDate: string
  toDate: string
  bookableSlots: BookableSlotResponse[]
  reservedSlots: ReservedSlotResponse[]
}

interface ReservationResponse {
  id: number
  resourceId: number
  resourceName: string
  userId: number
  userName: string
  userEmail: string
  startTime: string
  endTime: string
  status: ReservationStatus
}

test('main frontend reservation flow', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => localStorage.clear())
  page.on('dialog', (dialog) => dialog.accept())

  await page.goto('/')

  await login(page, 'admin@example.com', 'Admin1234')
  await expect(page.getByRole('heading', { name: 'Booking operations' })).toBeVisible()

  const resourceForm = sectionByHeading(page, 'Create resource')
  await resourceForm.getByLabel('Name').fill('Smoke Test Room')
  await resourceForm.getByLabel('Description').fill('Used by smoke tests')
  await resourceForm.getByLabel('Location').fill('Test floor')
  await resourceForm.getByRole('button', { name: 'Create resource' }).click()
  await expect(page.getByText('Resource created.')).toBeVisible()

  const resourcesSection = sectionByHeading(page, 'Resources')
  await expect(resourcesSection.getByText('Smoke Test Room')).toBeVisible()

  await resourcesSection.getByRole('button', { name: 'Edit' }).click()
  const editResourceForm = sectionByHeading(page, 'Edit resource')
  await editResourceForm.getByLabel('Name').fill('Smoke Test Room Updated')
  await editResourceForm.getByRole('button', { name: 'Save resource' }).click()
  await expect(page.getByText('Resource updated.')).toBeVisible()
  await expect(resourcesSection.getByText('Smoke Test Room Updated')).toBeVisible()

  await selectRoleTab(page, 'Weekly schedule')
  const weeklyScheduleForm = sectionByHeading(page, 'Create weekly schedule')
  await weeklyScheduleForm.getByLabel('Resource').selectOption({ label: 'Smoke Test Room Updated' })
  await weeklyScheduleForm.getByLabel('Weekday').selectOption({ label: 'Monday' })
  await weeklyScheduleForm.getByLabel('Start time').fill('08:00')
  await weeklyScheduleForm.getByLabel('End time').fill('16:00')
  await weeklyScheduleForm.getByRole('button', { name: 'Create weekly schedule' }).click()
  await expect(page.getByText('Weekly schedule created.')).toBeVisible()

  const weeklyScheduleSection = sectionByHeading(page, 'Weekly schedule')
  await expect(weeklyScheduleSection.getByText('Smoke Test Room Updated')).toBeVisible()
  await expect(weeklyScheduleSection.getByText('Monday')).toBeVisible()
  await expect(weeklyScheduleSection.getByText('08:00–16:00')).toBeVisible()

  await weeklyScheduleSection.getByRole('button', { name: 'Edit' }).click()
  const editWeeklyScheduleForm = sectionByHeading(page, 'Edit weekly schedule')
  await editWeeklyScheduleForm.getByLabel('End time').fill('17:00')
  await editWeeklyScheduleForm.getByRole('button', { name: 'Save weekly schedule' }).click()
  await expect(page.getByText('Weekly schedule updated.')).toBeVisible()
  await expect(weeklyScheduleSection.getByText('08:00–17:00')).toBeVisible()

  await selectRoleTab(page, 'Availability')
  const availabilityForm = sectionByHeading(page, 'Create availability')
  await availabilityForm.getByLabel('Resource').selectOption({ label: 'Smoke Test Room Updated' })
  await availabilityForm.getByLabel('Start time').fill('2030-01-15T09:00')
  await availabilityForm.getByLabel('End time').fill('2030-01-15T11:00')
  await availabilityForm.getByRole('button', { name: 'Create availability' }).click()
  await expect(page.getByText('Availability created.')).toBeVisible()

  const availabilitySection = sectionByHeading(page, 'Availability')
  await expect(availabilitySection.getByText('Smoke Test Room Updated')).toBeVisible()

  await availabilitySection.getByRole('button', { name: 'Edit' }).click()
  const editAvailabilityForm = sectionByHeading(page, 'Edit availability')
  await editAvailabilityForm.getByLabel('End time').fill('2030-01-15T12:00')
  await editAvailabilityForm.getByRole('button', { name: 'Save availability' }).click()
  await expect(page.getByText('Availability updated.')).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByLabel('Name').fill('Smoke Test User')
  await page.getByLabel('Email').fill('smoke.user@example.com')
  await page.getByLabel('Password').fill('Password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Registration succeeded. You can log in now.')).toBeVisible()

  await login(page, 'smoke.user@example.com', 'Password123')
  await expect(page.getByRole('heading', { name: 'Your booking space' })).toBeVisible()
  const bookingSection = sectionByHeading(page, 'Book a resource')
  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await expect(bookingSection.getByText('Smoke Test Room Updated')).toBeVisible()

  await scheduleSection.getByLabel('From').fill('2030-01-15')
  await scheduleSection.getByLabel('To').fill('2030-01-15')
  await bookingSection.getByRole('button', { name: 'View availability' }).click()
  await expect(scheduleSection.getByText('Smoke Test Room Updated')).toBeVisible()
  await expect(scheduleSection.getByLabel('Bookable schedule')).toBeVisible()
  await expect(scheduleSection.getByRole('button', { name: 'Choose time' })).toBeVisible()

  await scheduleSection.getByRole('button', { name: 'Choose time' }).click()
  await scheduleSection.getByRole('button', { name: 'Reserve' }).click()
  await expect(page.getByText('Reservation created.')).toBeVisible()

  await selectRoleTab(page, 'My reservations')
  await expect(sectionByHeading(page, 'My reservations').getByText('Smoke Test Room Updated')).toBeVisible()

  await sectionByHeading(page, 'My reservations').getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel reservation' }).click()
  await expect(page.getByText('Reservation cancelled.')).toBeVisible()

  await selectRoleTab(page, 'Book resource')
  await sectionByHeading(page, 'Resource schedule').getByRole('button', { name: 'Update schedule' }).click()
  await sectionByHeading(page, 'Resource schedule').getByRole('button', { name: 'Choose time' }).click()
  await sectionByHeading(page, 'Resource schedule').getByRole('button', { name: 'Reserve' }).click()
  await expect(page.getByText('Reservation created.')).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await login(page, 'admin@example.com', 'Admin1234')

  await selectRoleTab(page, 'Reservations')
  const adminReservationsSection = sectionByHeading(page, 'Reservations')
  await expect(
    adminReservationsSection
      .locator('li')
      .filter({ hasText: 'Smoke Test Room Updated' })
      .filter({ hasText: 'Smoke Test User (smoke.user@example.com)' })
      .first(),
  ).toBeVisible()
  await adminReservationsSection.getByRole('button', { name: 'Cancel' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel reservation' }).click()
  await expect(page.getByText('Reservation cancelled.')).toBeVisible()

  await selectRoleTab(page, 'Availability')
  await sectionByHeading(page, 'Availability').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete availability' }).click()
  await expect(page.getByText('Availability deleted.')).toBeVisible()
  await expect(sectionByHeading(page, 'Availability').getByText('No availability found.')).toBeVisible()

  await selectRoleTab(page, 'Weekly schedule')
  await sectionByHeading(page, 'Weekly schedule').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete weekly schedule' }).click()
  await expect(page.getByText('Weekly schedule deleted.')).toBeVisible()
  await expect(sectionByHeading(page, 'Weekly schedule').getByText('No weekly schedule found.')).toBeVisible()

  await selectRoleTab(page, 'Resources')
  await sectionByHeading(page, 'Resources').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete resource' }).click()
  await expect(page.getByText('Resource deleted.')).toBeVisible()
  await expect(sectionByHeading(page, 'Resources').getByText('No resources found.')).toBeVisible()
})

test('overlap error is shown when an active reservation already exists', async ({ page }) => {
  await mockApi(page, {
    seedOverlapReservation: true,
    showReservedSlotAsBookable: true,
  })
  await page.addInitScript(() => localStorage.clear())
  page.on('dialog', (dialog) => dialog.accept())

  await page.goto('/')

  await login(page, 'smoke.user@example.com', 'Password123')
  await expect(page.getByRole('heading', { name: 'Your booking space' })).toBeVisible()

  const bookingSection = sectionByHeading(page, 'Book a resource')
  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await scheduleSection.getByLabel('From').fill('2030-01-15')
  await scheduleSection.getByLabel('To').fill('2030-01-15')
  await bookingSection.getByRole('button', { name: 'View availability' }).click()
  await scheduleSection.getByRole('button', { name: 'Choose time' }).click()
  await scheduleSection.getByRole('button', { name: 'Reserve' }).click()
  await expect(
    page.getByText('Error: Resource is already reserved in this time period.'),
  ).toBeVisible()
})

test('validation errors from the API are shown per field', async ({ page }) => {
  await page.route('http://localhost:5052/api/auth/register', async (route) => {
    await route.fulfill(problemResponse(
      400,
      'One or more validation errors occurred.',
      undefined,
      {
        errors: {
          Email: ['Email is already registered.'],
          Password: ['Password must contain a number.'],
        },
      },
    ))
  })
  await page.addInitScript(() => localStorage.clear())

  await page.goto('/')
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  await page.getByLabel('Name').fill('Validation User')
  await page.getByLabel('Email').fill('taken@example.com')
  await page.getByLabel('Password').fill('Password')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(
    page.getByText('Error: Email is already registered. Password must contain a number.'),
  ).toBeVisible()
})

test('too many login attempts shows the rate limit message', async ({ page }) => {
  await page.route('http://localhost:5052/api/auth/login', async (route) => {
    const response = problemResponse(
      429,
      'Too Many Requests',
      'Too many attempts. Please wait a moment and try again.',
    )
    await route.fulfill({ ...response, headers: { 'Retry-After': '6' } })
  })
  await page.addInitScript(() => localStorage.clear())

  await page.goto('/')
  await login(page, 'someone@example.com', 'Password123')

  await expect(
    page.getByText('Error: Too many attempts. Please wait a moment and try again.'),
  ).toBeVisible()
})

test('an expired stored session opens the login screen', async ({ page }) => {
  await mockApi(page)
  await storeSession(page, Date.now() - 60_000)

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText(sessionExpiredMessage)).toBeVisible()
})

test('a stored session from before expiry times were saved opens the login screen', async ({ page }) => {
  await mockApi(page)
  await storeSession(page, null)

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText(sessionExpiredMessage)).toBeVisible()
})

test('a valid stored session is restored', async ({ page }) => {
  await mockApi(page)
  await storeSession(page, Date.now() + 60 * 60_000)

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Your booking space' })).toBeVisible()
})

test('a 401 during a session returns to the login screen once', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await login(page, 'admin@example.com', 'Admin1234')
  await expect(page.getByRole('heading', { name: 'Booking operations' })).toBeVisible()

  // The server no longer accepts the token, for example after a key rotation.
  await page.route('http://localhost:5052/api/resources', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }

    await route.fulfill(problemResponse(401, 'Unauthorized', 'Authentication is required.'))
  })
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('http://localhost:5052/api/')) {
      apiRequests.push(request.url())
    }
  })
  const resourceForm = sectionByHeading(page, 'Create resource')
  await resourceForm.getByLabel('Name').fill('Expired Session Room')
  await resourceForm.getByRole('button', { name: 'Create resource' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText(sessionExpiredMessage)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('resource-reservation-auth-token'))).toBeNull()

  // No loop: the login screen makes no further API calls.
  const requestsAtLogout = apiRequests.length
  await page.waitForTimeout(500)
  expect(apiRequests).toHaveLength(requestsAtLogout)
})

test('a failed login is not treated as an expired session', async ({ page }) => {
  await page.route('http://localhost:5052/api/auth/login', async (route) => {
    await route.fulfill(problemResponse(401, 'Unauthorized', 'Invalid email or password.'))
  })
  await page.addInitScript(() => localStorage.clear())

  await page.goto('/')
  await login(page, 'someone@example.com', 'WrongPassword1')

  await expect(page.getByText('Error: Invalid email or password.')).toBeVisible()
  await expect(page.getByText(sessionExpiredMessage)).toHaveCount(0)
})

test('the session ends when the token lifetime runs out', async ({ page }) => {
  await page.clock.install()
  await mockApi(page)
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await login(page, 'smoke.user@example.com', 'Password123')
  await expect(page.getByRole('heading', { name: 'Your booking space' })).toBeVisible()

  // The mocked tokens last two hours.
  await page.clock.fastForward('01:59:00')
  await expect(page.getByRole('heading', { name: 'Your booking space' })).toBeVisible()
  await page.clock.fastForward('00:02:00')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText(sessionExpiredMessage)).toBeVisible()
})

test('each admin screen has its own address that survives a reload', async ({ page }) => {
  await mockApi(page)
  await storeSession(page, Date.now() + 60 * 60_000, 'Admin')

  await page.goto('/')
  await expect(page).toHaveURL('/admin/resources')

  await selectRoleTab(page, 'Weekly schedule')
  await expect(page).toHaveURL('/admin/weekly-schedule')
  await expect(sectionByHeading(page, 'Create weekly schedule')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Weekly schedule' })).toHaveAttribute('aria-current', 'page')

  await page.reload()

  await expect(sectionByHeading(page, 'Create weekly schedule')).toBeVisible()
})

test('the back button returns to the previous screen', async ({ page }) => {
  await mockApi(page)
  await storeSession(page, Date.now() + 60 * 60_000, 'Admin')
  await page.goto('/admin/resources')

  await selectRoleTab(page, 'Reservations')
  await selectRoleTab(page, 'Availability')
  await page.goBack()

  await expect(page).toHaveURL('/admin/reservations')
  await expect(sectionByHeading(page, 'Reservations')).toBeVisible()
})

test('a user can open my reservations directly', async ({ page }) => {
  await mockApi(page)
  await storeSession(page, Date.now() + 60 * 60_000)

  await page.goto('/my-reservations')

  await expect(sectionByHeading(page, 'My reservations')).toBeVisible()
})

test('an address outside the workspace opens its first screen', async ({ page }) => {
  await mockApi(page)
  await storeSession(page, Date.now() + 60 * 60_000)

  await page.goto('/admin/reservations')

  await expect(page).toHaveURL('/book')
  await expect(sectionByHeading(page, 'Book a resource')).toBeVisible()
})

test('logging in returns to the page that was asked for', async ({ page }) => {
  await mockApi(page)
  await page.addInitScript(() => localStorage.clear())

  await page.goto('/admin/reservations')
  await expect(page).toHaveURL('/login?returnTo=%2Fadmin%2Freservations')
  await login(page, 'admin@example.com', 'Admin1234')

  await expect(page).toHaveURL('/admin/reservations')
  await expect(sectionByHeading(page, 'Reservations')).toBeVisible()
})

test('after a session expires, logging in again returns to the same screen', async ({ page }) => {
  await page.clock.install()
  await mockApi(page)
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await login(page, 'admin@example.com', 'Admin1234')
  await selectRoleTab(page, 'Weekly schedule')

  await page.clock.fastForward('02:01:00')
  await expect(page.getByText(sessionExpiredMessage)).toBeVisible()
  await login(page, 'admin@example.com', 'Admin1234')

  await expect(page).toHaveURL('/admin/weekly-schedule')
})

test('logging out returns to the login screen', async ({ page }) => {
  await mockApi(page)
  await storeSession(page, Date.now() + 60 * 60_000, 'Admin')
  await page.goto('/admin/reservations')

  await page.getByRole('button', { name: 'Logout' }).click()

  await expect(page).toHaveURL('/login')
  await expect(page.getByText('You have been logged out.')).toBeVisible()
})

test('admin reservation filters are kept in the address', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000, 'Admin')
  await page.goto('/admin/reservations')

  const reservations = sectionByHeading(page, 'Reservations')
  await expect(reservations.getByRole('listitem')).toHaveCount(1)
  await reservations.getByLabel('Status').selectOption('Cancelled')
  await expect(page).toHaveURL('/admin/reservations?status=Cancelled')
  await page.reload()

  await expect(reservations.getByLabel('Status')).toHaveValue('Cancelled')
  await expect(reservations.getByText('No reservations match the selected filters.')).toBeVisible()
})

test('a booking link opens the same schedule', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000)

  await page.goto('/book?resource=1&from=2030-01-15&to=2030-01-15')

  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await expect(scheduleSection.getByLabel('From')).toHaveValue('2030-01-15')
  await expect(scheduleSection.getByLabel('To')).toHaveValue('2030-01-15')
  // The only window that day is fully booked.
  await expect(scheduleSection.getByText('No bookable times found.')).toBeVisible()
})

test('an invalid booking link falls back to the defaults', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000)

  await page.goto('/book?resource=999&from=2030-02-30&to=nonsense')

  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await expect(scheduleSection.getByText('Choose a resource to see bookable times.')).toBeVisible()
  await expect(scheduleSection.getByLabel('From')).not.toHaveValue('2030-02-30')
  await expect(sectionByHeading(page, 'Book a resource').getByText('Reserved Test Room')).toBeVisible()
})

test('the back button returns to the previous booking selection', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000)
  await page.goto('/book?resource=1&from=2030-01-15&to=2030-01-15')
  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await expect(scheduleSection.getByText('No bookable times found.')).toBeVisible()

  await scheduleSection.getByLabel('To').fill('2030-01-17')
  await scheduleSection.getByRole('button', { name: 'Update schedule' }).click()
  await expect(page).toHaveURL('/book?resource=1&from=2030-01-15&to=2030-01-17')
  await page.goBack()

  await expect(page).toHaveURL('/book?resource=1&from=2030-01-15&to=2030-01-15')
  await expect(scheduleSection.getByLabel('To')).toHaveValue('2030-01-15')
})

// Audit L2: the schedule kept showing a cancelled reservation as reserved until
// it was reloaded by hand.
test('cancelling a reservation frees its time in the booking schedule', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true, seededReservationIsOwn: true })
  await storeSession(page, Date.now() + 60 * 60_000)
  await page.goto('/book?resource=1&from=2030-01-15&to=2030-01-15')
  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await expect(scheduleSection.getByText('No bookable times found.')).toBeVisible()

  await selectRoleTab(page, 'My reservations')
  await sectionByHeading(page, 'My reservations').getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel reservation' }).click()
  await expect(page.getByText('Reservation cancelled.')).toBeVisible()
  await selectRoleTab(page, 'Book resource')

  // The tab remembers the selection, and the schedule has already reloaded.
  await expect(page).toHaveURL('/book?resource=1&from=2030-01-15&to=2030-01-15')
  await expect(scheduleSection.getByRole('button', { name: 'Choose time' })).toBeVisible()
  await expect(scheduleSection.getByLabel('Reserved times')).toHaveCount(0)
})

test('an unknown address shows a not-found page', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())

  await page.goto('/no-such-page')

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Go to the start page' }).click()
  await expect(page).toHaveURL('/login')
})

const sessionExpiredMessage = 'Your session has expired. Please log in again.'

// Mirrors the API's login response. Tokens last two hours.
function authResponse(token: string, user: UserResponse) {
  const expiresInSeconds = 2 * 60 * 60

  return {
    token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    expiresInSeconds,
    user,
  }
}

// Stores a session as an earlier visit would have. A null expiry mimics a
// session saved before expiry times were stored.
async function storeSession(page: Page, expiresAt: number | null, role: UserRole = 'User') {
  await page.addInitScript(({ storedExpiresAt, storedRole }) => {
    localStorage.clear()
    localStorage.setItem('resource-reservation-auth-token', `${storedRole.toLowerCase()}-token`)
    localStorage.setItem('resource-reservation-auth-user', JSON.stringify(storedRole === 'Admin'
      ? { id: 1, name: 'Admin', email: 'admin@example.com', role: 'Admin' }
      : { id: 2, name: 'Smoke Test User', email: 'smoke.user@example.com', role: 'User' }))

    if (storedExpiresAt !== null) {
      localStorage.setItem('resource-reservation-auth-expires-at', String(storedExpiresAt))
    }
  }, { storedExpiresAt: expiresAt, storedRole: role })
}

// Mirrors the API's RFC 9457 problem details responses.
function problemResponse(
  status: number,
  title: string,
  detail?: string,
  extensions: Record<string, unknown> = {},
) {
  return {
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({
      type: 'https://tools.ietf.org/html/rfc9110',
      title,
      status,
      detail,
      traceId: '00-smoke-test',
      ...extensions,
    }),
  }
}

function sectionByHeading(page: Page, heading: string) {
  return page.locator('section.panel-section').filter({
    has: page.getByRole('heading', { name: heading, exact: true }),
  }).first()
}

async function selectRoleTab(page: Page, tabName: string) {
  await page.getByRole('navigation', { name: 'Section navigation' })
    .getByRole('link', { name: tabName, exact: true })
    .click()
}

async function login(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.locator('form button[type="submit"]').click()
}

async function mockApi(
  page: Page,
  options: {
    seedOverlapReservation?: boolean
    // The seeded reservation belongs to the smoke test user instead of someone else.
    seededReservationIsOwn?: boolean
    showReservedSlotAsBookable?: boolean
  } = {},
) {
  let nextResourceId = options.seedOverlapReservation ? 2 : 1
  let nextAvailabilityId = options.seedOverlapReservation ? 2 : 1
  let nextAvailabilityRuleId = 1
  let nextReservationId = options.seedOverlapReservation ? 2 : 1

  const adminUser: UserResponse = {
    id: 1,
    name: 'Admin',
    email: 'admin@example.com',
    role: 'Admin',
  }
  const normalUser: UserResponse = {
    id: 2,
    name: 'Smoke Test User',
    email: 'smoke.user@example.com',
    role: 'User',
  }

  let currentUser = adminUser
  let resources: ResourceResponse[] = options.seedOverlapReservation
    ? [
        {
          id: 1,
          name: 'Reserved Test Room',
          description: 'Already reserved in the smoke test.',
          location: 'Test floor',
          isActive: true,
        },
      ]
    : []
  let availabilities: AvailabilityResponse[] = options.seedOverlapReservation
    ? [
        {
          id: 1,
          resourceId: 1,
          resourceName: 'Reserved Test Room',
          startTime: '2030-01-15T09:00:00',
          endTime: '2030-01-15T11:00:00',
        },
      ]
    : []
  let availabilityRules: AvailabilityRuleResponse[] = []
  let reservations: ReservationResponse[] = options.seedOverlapReservation
    ? [
        {
          id: 1,
          resourceId: 1,
          resourceName: 'Reserved Test Room',
          userId: options.seededReservationIsOwn ? 2 : 99,
          userName: options.seededReservationIsOwn ? 'Smoke Test User' : 'Other User',
          userEmail: options.seededReservationIsOwn ? 'smoke.user@example.com' : 'other@example.com',
          startTime: '2030-01-15T09:00:00',
          endTime: '2030-01-15T11:00:00',
          status: 'Active',
        },
      ]
    : []

  await page.route('http://localhost:5052/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api', '')

    if (request.method() === 'POST' && path === '/auth/login') {
      const body = await request.postDataJSON() as { email: string }
      currentUser = body.email === adminUser.email ? adminUser : normalUser

      await route.fulfill({
        status: 200,
        json: authResponse(`${currentUser.role.toLowerCase()}-token`, currentUser),
      })
      return
    }

    if (request.method() === 'POST' && path === '/auth/register') {
      await route.fulfill({ status: 200, json: normalUser })
      return
    }

    if (request.method() === 'GET' && path === '/resources') {
      await route.fulfill({ status: 200, json: resources })
      return
    }

    const resourceScheduleMatch = path.match(/^\/resources\/(\d+)\/schedule$/)
    if (resourceScheduleMatch && request.method() === 'GET') {
      const resourceId = Number(resourceScheduleMatch[1])
      const fromDate = url.searchParams.get('from') ?? ''
      const toDate = url.searchParams.get('to') ?? ''

      await route.fulfill({
        status: 200,
        json: buildResourceSchedule(
          resourceId,
          fromDate,
          toDate,
          resources,
          availabilities,
          availabilityRules,
          reservations,
          options.showReservedSlotAsBookable ?? false,
        ),
      })
      return
    }

    if (request.method() === 'POST' && path === '/resources') {
      const body = await request.postDataJSON() as Omit<ResourceResponse, 'id' | 'isActive'>
      const resource: ResourceResponse = {
        id: nextResourceId,
        name: body.name,
        description: body.description,
        location: body.location,
        isActive: true,
      }

      nextResourceId += 1
      resources = [...resources, resource]
      await route.fulfill({ status: 200, json: resource })
      return
    }

    const resourceMatch = path.match(/^\/resources\/(\d+)$/)
    if (resourceMatch && request.method() === 'PUT') {
      const resourceId = Number(resourceMatch[1])
      const body = await request.postDataJSON() as ResourceResponse
      resources = resources.map((resource) =>
        resource.id === resourceId ? { ...resource, ...body, id: resourceId } : resource,
      )
      refreshResourceNames(resources, availabilities, availabilityRules, reservations)
      await route.fulfill({ status: 204 })
      return
    }

    if (resourceMatch && request.method() === 'DELETE') {
      const resourceId = Number(resourceMatch[1])
      resources = resources.filter((resource) => resource.id !== resourceId)
      await route.fulfill({ status: 204 })
      return
    }

    if (request.method() === 'GET' && path === '/availabilities') {
      await route.fulfill({ status: 200, json: availabilities })
      return
    }

    if (request.method() === 'POST' && path === '/availabilities') {
      const body = await request.postDataJSON() as Omit<AvailabilityResponse, 'id' | 'resourceName'>
      const resource = resources.find((item) => item.id === body.resourceId)
      const availability: AvailabilityResponse = {
        id: nextAvailabilityId,
        resourceId: body.resourceId,
        resourceName: resource?.name ?? '',
        startTime: body.startTime,
        endTime: body.endTime,
      }

      nextAvailabilityId += 1
      availabilities = [...availabilities, availability]
      await route.fulfill({ status: 200, json: availability })
      return
    }

    const availabilityMatch = path.match(/^\/availabilities\/(\d+)$/)
    if (availabilityMatch && request.method() === 'PUT') {
      const availabilityId = Number(availabilityMatch[1])
      const body = await request.postDataJSON() as Omit<AvailabilityResponse, 'id' | 'resourceName'>
      const resource = resources.find((item) => item.id === body.resourceId)
      availabilities = availabilities.map((availability) =>
        availability.id === availabilityId
          ? {
              ...availability,
              resourceId: body.resourceId,
              resourceName: resource?.name ?? '',
              startTime: body.startTime,
              endTime: body.endTime,
            }
          : availability,
      )
      await route.fulfill({ status: 204 })
      return
    }

    if (availabilityMatch && request.method() === 'DELETE') {
      const availabilityId = Number(availabilityMatch[1])
      availabilities = availabilities.filter((availability) => availability.id !== availabilityId)
      await route.fulfill({ status: 204 })
      return
    }

    if (request.method() === 'GET' && path === '/availabilityrules') {
      await route.fulfill({ status: 200, json: availabilityRules })
      return
    }

    if (request.method() === 'POST' && path === '/availabilityrules') {
      const body = await request.postDataJSON() as Omit<AvailabilityRuleResponse, 'id' | 'resourceName' | 'dayName'>
      const resource = resources.find((item) => item.id === body.resourceId)
      const availabilityRule: AvailabilityRuleResponse = {
        id: nextAvailabilityRuleId,
        resourceId: body.resourceId,
        resourceName: resource?.name ?? '',
        dayOfWeek: body.dayOfWeek,
        dayName: dayNames[body.dayOfWeek],
        startTime: body.startTime,
        endTime: body.endTime,
      }

      nextAvailabilityRuleId += 1
      availabilityRules = [...availabilityRules, availabilityRule]
      await route.fulfill({ status: 200, json: availabilityRule })
      return
    }

    const availabilityRuleMatch = path.match(/^\/availabilityrules\/(\d+)$/)
    if (availabilityRuleMatch && request.method() === 'PUT') {
      const availabilityRuleId = Number(availabilityRuleMatch[1])
      const body = await request.postDataJSON() as Omit<AvailabilityRuleResponse, 'id' | 'resourceName' | 'dayName'>
      const resource = resources.find((item) => item.id === body.resourceId)
      availabilityRules = availabilityRules.map((rule) =>
        rule.id === availabilityRuleId
          ? {
              ...rule,
              resourceId: body.resourceId,
              resourceName: resource?.name ?? '',
              dayOfWeek: body.dayOfWeek,
              dayName: dayNames[body.dayOfWeek],
              startTime: body.startTime,
              endTime: body.endTime,
            }
          : rule,
      )
      await route.fulfill({ status: 204 })
      return
    }

    if (availabilityRuleMatch && request.method() === 'DELETE') {
      const availabilityRuleId = Number(availabilityRuleMatch[1])
      availabilityRules = availabilityRules.filter((rule) => rule.id !== availabilityRuleId)
      await route.fulfill({ status: 204 })
      return
    }

    if (request.method() === 'GET' && path === '/reservations') {
      await route.fulfill({ status: 200, json: reservations })
      return
    }

    if (request.method() === 'GET' && path === '/reservations/me') {
      await route.fulfill({
        status: 200,
        json: reservations.filter((reservation) => reservation.userId === normalUser.id),
      })
      return
    }

    if (request.method() === 'POST' && path === '/reservations') {
      const body = await request.postDataJSON() as Omit<ReservationResponse, 'id' | 'resourceName' | 'status' | 'userId' | 'userName' | 'userEmail'>
      const hasOverlap = reservations.some((reservation) =>
        reservation.resourceId === body.resourceId &&
        reservation.status === 'Active' &&
        body.startTime < reservation.endTime &&
        body.endTime > reservation.startTime,
      )

      if (hasOverlap) {
        await route.fulfill(problemResponse(
          409,
          'Conflict',
          'Resource is already reserved in this time period.',
        ))
        return
      }

      const resource = resources.find((item) => item.id === body.resourceId)
      const reservation: ReservationResponse = {
        id: nextReservationId,
        resourceId: body.resourceId,
        resourceName: resource?.name ?? '',
        userId: normalUser.id,
        userName: normalUser.name,
        userEmail: normalUser.email,
        startTime: body.startTime,
        endTime: body.endTime,
        status: 'Active',
      }

      nextReservationId += 1
      reservations = [...reservations, reservation]
      await route.fulfill({ status: 200, json: reservation })
      return
    }

    const reservationCancelMatch = path.match(/^\/reservations\/(\d+)\/cancel$/)
    if (reservationCancelMatch && request.method() === 'PUT') {
      const reservationId = Number(reservationCancelMatch[1])
      reservations = reservations.map((reservation) =>
        reservation.id === reservationId
          ? { ...reservation, status: 'Cancelled' }
          : reservation,
      )
      await route.fulfill({ status: 204 })
      return
    }

    await route.fulfill({ status: 404, body: `Unhandled test route: ${request.method()} ${path}` })
  })
}

function refreshResourceNames(
  resources: ResourceResponse[],
  availabilities: AvailabilityResponse[],
  availabilityRules: AvailabilityRuleResponse[],
  reservations: ReservationResponse[],
) {
  for (const availability of availabilities) {
    const resource = resources.find((item) => item.id === availability.resourceId)
    availability.resourceName = resource?.name ?? availability.resourceName
  }

  for (const rule of availabilityRules) {
    const resource = resources.find((item) => item.id === rule.resourceId)
    rule.resourceName = resource?.name ?? rule.resourceName
  }

  for (const reservation of reservations) {
    const resource = resources.find((item) => item.id === reservation.resourceId)
    reservation.resourceName = resource?.name ?? reservation.resourceName
  }
}

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function buildResourceSchedule(
  resourceId: number,
  fromDate: string,
  toDate: string,
  resources: ResourceResponse[],
  availabilities: AvailabilityResponse[],
  availabilityRules: AvailabilityRuleResponse[],
  reservations: ReservationResponse[],
  showReservedSlotAsBookable: boolean,
): ResourceScheduleResponse {
  const resource = resources.find((item) => item.id === resourceId)
  const availabilitySlots = availabilities
    .filter((availability) =>
      availability.resourceId === resourceId &&
      availability.startTime.slice(0, 10) >= fromDate &&
      availability.startTime.slice(0, 10) <= toDate,
    )
    .map((availability) => ({
      startTime: availability.startTime,
      endTime: availability.endTime,
    }))
  const ruleSlots = buildRuleSlots(
    resourceId,
    fromDate,
    toDate,
    availabilityRules,
  )
  const reservedSlots = reservations
    .filter((reservation) =>
      reservation.resourceId === resourceId &&
      reservation.status === 'Active' &&
      reservation.startTime.slice(0, 10) >= fromDate &&
      reservation.startTime.slice(0, 10) <= toDate,
    )
    .map((reservation) => ({
      startTime: reservation.startTime,
      endTime: reservation.endTime,
    }))

  return {
    resourceId,
    resourceName: resource?.name ?? '',
    fromDate,
    toDate,
    bookableSlots: showReservedSlotAsBookable
      ? [...availabilitySlots, ...ruleSlots]
      : [...availabilitySlots, ...ruleSlots].filter(
          (slot) =>
            !reservedSlots.some(
              (reservedSlot) =>
                slot.startTime < reservedSlot.endTime &&
                slot.endTime > reservedSlot.startTime,
            ),
        ),
    reservedSlots,
  }
}

function buildRuleSlots(
  resourceId: number,
  fromDate: string,
  toDate: string,
  availabilityRules: AvailabilityRuleResponse[],
) {
  const slots: BookableSlotResponse[] = []
  const from = new Date(`${fromDate}T00:00:00`)
  const to = new Date(`${toDate}T00:00:00`)

  for (const date = new Date(from); date <= to; date.setDate(date.getDate() + 1)) {
    const dateValue = toDateValue(date)

    for (const rule of availabilityRules.filter(
      (item) => item.resourceId === resourceId && item.dayOfWeek === date.getDay(),
    )) {
      slots.push({
        startTime: `${dateValue}T${rule.startTime}:00`,
        endTime: `${dateValue}T${rule.endTime}:00`,
      })
    }
  }

  return slots
}

function toDateValue(value: Date) {
  return value.toISOString().slice(0, 10)
}
