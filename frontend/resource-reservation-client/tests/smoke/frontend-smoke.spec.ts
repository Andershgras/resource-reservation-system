import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

type UserRole = 'Admin' | 'User'
type ReservationStatus = 'Active' | 'Cancelled'

interface UserResponse {
  id: number
  name: string
  email: string
  role: UserRole
}

interface BookingRuleOverrides {
  minDurationMinutes: number | null
  maxDurationMinutes: number | null
  minLeadTimeMinutes: number | null
  maxAdvanceDays: number | null
}

interface ResourceResponse extends BookingRuleOverrides {
  id: number
  name: string
  description: string | null
  location: string | null
  isActive: boolean
}

interface BookingPolicyResponse {
  minDurationMinutes: number
  maxDurationMinutes: number
  minLeadTimeMinutes: number
  maxAdvanceDays: number
  maxActiveReservationsPerUser: number
}

const defaultPolicy: BookingPolicyResponse = {
  minDurationMinutes: 15,
  maxDurationMinutes: 480,
  minLeadTimeMinutes: 0,
  maxAdvanceDays: 90,
  maxActiveReservationsPerUser: 5,
}

const noRuleOverrides: BookingRuleOverrides = {
  minDurationMinutes: null,
  maxDurationMinutes: null,
  minLeadTimeMinutes: null,
  maxAdvanceDays: null,
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
  policy: BookingPolicyResponse
  bookableSlots: BookableSlotResponse[]
  reservedSlots: ReservedSlotResponse[]
  closedSlots: { startTime: string; endTime: string; reasons: string[] }[]
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
  createdAt: string | null
  updatedAt: string | null
  cancelledAt: string | null
  cancelledByUserId: number | null
  cancelledByName: string | null
  version: string
}

// The fields of a reservation that was just made, with a fresh version.
function newReservationFields(version: number) {
  return {
    createdAt: '2030-01-10T08:00:00+00:00',
    updatedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelledByName: null,
    version: `v${version}`,
  }
}

let nextVersion = 100

interface ClosureResponse {
  id: number
  resourceId: number
  resourceName: string
  startTime: string
  endTime: string
  reason: string
  createdAt: string
  createdByName: string | null
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
  await page.getByRole('link', { name: 'Register' }).click()
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

  await bookingSection.getByRole('button', { name: /^View availability/ }).click()
  await scheduleSection.getByLabel('Go to date').fill('2030-01-15')
  await expect(page).toHaveURL('/book?resource=1&week=2030-01-14')
  await expect(scheduleSection.getByText('Smoke Test Room Updated')).toBeVisible()
  // The weekly rule opens Monday; the one-off window opens Tuesday morning.
  await expect(scheduleSection.getByRole('button', { name: /^Available Mon 14 Jan 2030, 08:00–17:00/ })).toBeVisible()

  await scheduleSection.getByRole('button', { name: /^Available Tue 15 Jan 2030, 09:00–12:00/ }).click()
  await expect(scheduleSection.getByLabel('Start', { exact: true })).toHaveValue('2030-01-15T09:00:00')
  await expect(scheduleSection.getByLabel('End', { exact: true })).toHaveValue('2030-01-15T10:00:00')
  await scheduleSection.getByRole('button', { name: 'Reserve' }).click()
  await expect(page.getByText('Reservation created: Tue 15 Jan 2030, 09:00–10:00.')).toBeVisible()
  // Audit L3: the day is still shown once its free time is gone.
  await expect(scheduleSection.getByRole('region', { name: 'Tue 15 Jan' }).getByText('Fully booked')).toBeVisible()

  await selectRoleTab(page, 'My reservations')
  await expect(sectionByHeading(page, 'My reservations').getByText('Smoke Test Room Updated')).toBeVisible()

  await sectionByHeading(page, 'My reservations').getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel reservation' }).click()
  await expect(page.getByText('Reservation cancelled.')).toBeVisible()

  // The calendar has already reloaded, so the cancelled time is free again.
  await selectRoleTab(page, 'Book resource')
  await scheduleSection.getByRole('button', { name: /^Available Tue 15 Jan 2030, 09:00–12:00/ }).click()
  await scheduleSection.getByLabel('End', { exact: true }).selectOption({ label: '11:30' })
  await expect(scheduleSection.getByText('Duration 2 h 30 min')).toBeVisible()
  await scheduleSection.getByRole('button', { name: 'Reserve' }).click()
  await expect(page.getByText('Reservation created: Tue 15 Jan 2030, 09:00–11:30.')).toBeVisible()

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
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel reservation' }).click()
  await expect(page.getByText('Reservation cancelled.')).toBeVisible()

  await selectRoleTab(page, 'Availability')
  await sectionByHeading(page, 'Availability').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete availability' }).click()
  await expect(page.getByText('Availability deleted.')).toBeVisible()
  await expect(sectionByHeading(page, 'Availability').getByText('No availability found.')).toBeVisible()

  await selectRoleTab(page, 'Weekly schedule')
  await sectionByHeading(page, 'Weekly schedule').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete weekly schedule' }).click()
  await expect(page.getByText('Weekly schedule deleted.')).toBeVisible()
  await expect(sectionByHeading(page, 'Weekly schedule').getByText('No weekly schedule found.')).toBeVisible()

  await selectRoleTab(page, 'Resources')
  await sectionByHeading(page, 'Resources').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete resource' }).click()
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
  await bookingSection.getByRole('button', { name: /^View availability/ }).click()
  await scheduleSection.getByLabel('Go to date').fill('2030-01-15')
  await scheduleSection.getByRole('button', { name: /^Available Tue 15 Jan 2030, 09:00–11:00/ }).click()
  await scheduleSection.getByRole('button', { name: 'Reserve' }).click()
  await expect(scheduleSection.getByRole('alert')).toHaveText(
    'Error: Resource is already reserved in this time period. The calendar has been updated.',
  )
  await expect(scheduleSection.getByLabel('Start', { exact: true })).toHaveCount(0)
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
  await page.getByRole('link', { name: 'Register', exact: true }).click()
  await page.getByLabel('Name').fill('Validation User')
  await page.getByLabel('Email').fill('taken@example.com')
  await page.getByLabel('Password').fill('Password')
  await page.getByRole('button', { name: 'Create account' }).click()

  // Each message is shown beside its field, and read with it.
  await expect(page.getByLabel('Email')).toHaveAccessibleDescription('Email is already registered.')
  await expect(page.getByLabel('Password')).toHaveAccessibleDescription(
    'At least 8 characters, including a number. Password must contain a number.',
  )
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByRole('alert')).toHaveText('Error: Check the highlighted fields.')
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

test('a booking link opens the same week', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000)

  await page.goto('/book?resource=1&week=2030-01-14')

  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await expect(scheduleSection.getByText('Mon 14 Jan 2030 – Sun 20 Jan 2030')).toBeVisible()
  // The only window that week is fully booked, and the day is still shown.
  const tuesday = scheduleSection.getByRole('region', { name: 'Tue 15 Jan' })
  await expect(tuesday.getByText('Fully booked')).toBeVisible()
  await expect(tuesday.getByText('Reserved 09:00–11:00')).toBeVisible()
  await expect(scheduleSection.getByText('No bookable times found this week.')).toBeVisible()
})

test('a booking link from before the calendar opens the week of its date', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000)

  await page.goto('/book?resource=1&from=2030-01-15&to=2030-01-15')

  await expect(sectionByHeading(page, 'Resource schedule').getByText('Mon 14 Jan 2030 – Sun 20 Jan 2030')).toBeVisible()
})

test('an invalid booking link falls back to the defaults', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000)

  await page.goto('/book?resource=999&week=2030-02-30')

  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await expect(scheduleSection.getByText('Choose a resource to see bookable times.')).toBeVisible()
  await expect(scheduleSection.getByLabel('Go to date')).not.toHaveValue('2030-02-30')
  await expect(sectionByHeading(page, 'Book a resource').getByText('Reserved Test Room')).toBeVisible()
})

test('the back button returns to the previous booking selection', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000)
  await page.goto('/book?resource=1&week=2030-01-14')
  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  await expect(scheduleSection.getByText('Mon 14 Jan 2030 – Sun 20 Jan 2030')).toBeVisible()

  await scheduleSection.getByRole('button', { name: 'Next week' }).click()
  await expect(page).toHaveURL('/book?resource=1&week=2030-01-21')
  await expect(scheduleSection.getByText('Mon 21 Jan 2030 – Sun 27 Jan 2030')).toBeVisible()
  await page.goBack()

  await expect(page).toHaveURL('/book?resource=1&week=2030-01-14')
  await expect(scheduleSection.getByText('Mon 14 Jan 2030 – Sun 20 Jan 2030')).toBeVisible()
})

// Audit L2: the schedule kept showing a cancelled reservation as reserved until
// it was reloaded by hand.
test('cancelling a reservation frees its time in the booking schedule', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true, seededReservationIsOwn: true })
  await storeSession(page, Date.now() + 60 * 60_000)
  await page.goto('/book?resource=1&week=2030-01-14')
  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  const tuesday = scheduleSection.getByRole('region', { name: 'Tue 15 Jan' })
  await expect(tuesday.getByText('Fully booked')).toBeVisible()

  await selectRoleTab(page, 'My reservations')
  await sectionByHeading(page, 'My reservations').getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel reservation' }).click()
  await expect(page.getByText('Reservation cancelled.')).toBeVisible()
  await selectRoleTab(page, 'Book resource')

  // The tab remembers the selection, and the schedule has already reloaded.
  await expect(page).toHaveURL('/book?resource=1&week=2030-01-14')
  await expect(tuesday.getByRole('button', { name: /^Available Tue 15 Jan 2030, 09:00–11:00/ })).toBeVisible()
  await expect(tuesday.getByText('Reserved')).toHaveCount(0)
  await expect(tuesday.getByText('Fully booked')).toHaveCount(0)
})

test('a booking can be moved to a new time in the calendar', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true, seededReservationIsOwn: true, seedFreeTime: true })
  await storeSession(page, Date.now() + 60 * 60_000)
  await page.goto('/my-reservations')

  await sectionByHeading(page, 'My reservations').getByRole('link', { name: /^Move Reserved Test Room/ }).click()

  await expect(page).toHaveURL('/book?resource=1&week=2030-01-14&move=1')
  await expect(page.getByRole('heading', { name: 'Move a booking' })).toBeVisible()
  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  // The booking's own time shows as free while it is being moved.
  const tuesday = scheduleSection.getByRole('region', { name: 'Tue 15 Jan' })
  await expect(tuesday.getByRole('button', { name: /^Available Tue 15 Jan 2030, 09:00–11:00/ })).toBeVisible()
  await expectNoAccessibilityViolations(page, 'moving a booking')

  await scheduleSection.getByRole('button', { name: /^Available Wed 16 Jan 2030/ }).click()
  await scheduleSection.getByLabel('Start', { exact: true }).selectOption({ label: '10:00' })
  await scheduleSection.getByLabel('End', { exact: true }).selectOption({ label: '11:00' })
  await scheduleSection.getByRole('button', { name: 'Move booking' }).click()

  await expect(page.getByText('Booking moved to Wed 16 Jan 2030, 10:00–11:00.')).toBeVisible()
  await expect(page).toHaveURL('/book?resource=1&week=2030-01-14')
  await expect(scheduleSection.getByRole('region', { name: 'Wed 16 Jan' }).getByText('Reserved')).toBeVisible()
  await expect(tuesday.getByText('Reserved')).toHaveCount(0)

  await selectRoleTab(page, 'My reservations')
  await expect(sectionByHeading(page, 'My reservations').getByText('Moved')).toBeVisible()
})

test('an admin closes a resource, sees the booking inside first, and users see it closed', async ({ page }) => {
  // Without motion, so axe measures the dialog after it has faded in.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { seedOverlapReservation: true, seededReservationIsOwn: true })
  // Signed in through the form, not storeSession, whose script would restore
  // the admin on every page load and keep the user out of the calendar later.
  await page.goto('/login')
  await login(page, 'admin@example.com', 'Admin1234')
  await selectRoleTab(page, 'Closures')

  const form = sectionByHeading(page, 'Close a resource')
  await form.getByLabel('Resource').selectOption({ label: 'Reserved Test Room' })
  await form.getByLabel('Start').fill('2030-01-15T08:00')
  await form.getByLabel('End').fill('2030-01-15T12:00')
  await form.getByLabel('Reason').fill('Floor repairs')
  await form.getByRole('button', { name: 'Check affected bookings' }).click()

  const dialog = page.getByRole('alertdialog', { name: 'Close Reserved Test Room?' })
  await expect(dialog.getByRole('list', { name: 'Affected bookings' })).toContainText('Smoke Test User')
  await expectNoAccessibilityViolations(page, 'the closure confirmation')
  await dialog.getByRole('button', { name: 'Close resource' }).click()

  await expect(page.getByText(/1 booking is inside the closure and still active/)).toBeVisible()
  await expect(sectionByHeading(page, 'Bookings inside the new closure').getByText('Smoke Test User', { exact: false })).toBeVisible()
  await expect(sectionByHeading(page, 'Closures').getByText('Floor repairs')).toBeVisible()
  await expectNoAccessibilityViolations(page, 'the closures screen')

  await page.getByRole('button', { name: 'Logout' }).click()
  await login(page, 'smoke.user@example.com', 'Password123')
  await page.getByRole('button', { name: 'View availability for Reserved Test Room' }).click()
  await page.getByLabel('Go to date').fill('2030-01-15')
  const tuesday = sectionByHeading(page, 'Resource schedule').getByRole('region', { name: 'Tue 15 Jan' })
  await expect(tuesday.getByText('Floor repairs')).toBeVisible()
  await expect(tuesday.getByText('Closed', { exact: true }).first()).toBeVisible()
})

// In a real browser, making the page inert takes focus away from the button
// that opened the dialog, so the dialog must record it beforehand.
test('the confirmation dialog works with the keyboard alone', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true, seededReservationIsOwn: true })
  await storeSession(page, Date.now() + 60 * 60_000)
  await page.goto('/my-reservations')
  const cancel = sectionByHeading(page, 'My reservations').getByRole('button', { name: /^Cancel/ })
  const dialog = page.getByRole('alertdialog')

  await cancel.focus()
  await page.keyboard.press('Enter')

  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Keep unchanged' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Cancel reservation' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Keep unchanged' })).toBeFocused()

  await page.keyboard.press('Escape')

  await expect(dialog).toHaveCount(0)
  await expect(cancel).toBeFocused()

  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')

  await expect(page.getByText('Reservation cancelled.')).toBeVisible()
  // The opener is gone with the reservation's Cancel button, so focus moves
  // to the main content rather than being lost.
  await expect(page.getByRole('main')).toBeFocused()
})

test('a saved theme applies before the app runs, so it never flashes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('rr-theme', 'dark'))
  // Without the app's JavaScript, only index.html's own script can set the
  // theme. The stylesheet's dark tokens key off this attribute.
  await page.route('**/src/main.tsx', (route) => route.abort())

  await page.goto('/login')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('the theme switch overrides the device and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await mockApi(page)
  await storeSession(page, Date.now() + 60 * 60_000)
  await page.goto('/my-reservations')
  const theme = page.getByRole('combobox', { name: 'Theme' })
  await expect(theme).toHaveValue('system')

  await theme.selectOption({ label: 'Dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 17, 32)')
  await expectNoAccessibilityViolations(page, 'my reservations in a chosen dark theme on a light device')
  // Saved for the next visit, which index.html applies before the app runs.
  expect(await page.evaluate(() => localStorage.getItem('rr-theme'))).toBe('dark')

  await theme.selectOption({ label: 'System' })

  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  expect(await page.evaluate(() => localStorage.getItem('rr-theme'))).toBeNull()
})

// Accessibility in a real browser. Unlike the unit tests in jsdom, Chromium
// renders the page, so axe also checks colour contrast, in both themes.
const axePath = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')

async function expectNoAccessibilityViolations(page: Page, screen: string) {
  await page.addScriptTag({ path: axePath })
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document) => Promise<{
      violations: { id: string; help: string; nodes: { target: string[] }[] }[]
    }> } }).axe
    const results = await axe.run(document)

    return results.violations.map((violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`)
  })

  expect(violations, `Accessibility violations on ${screen}`).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the main screens have no accessibility violations in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await mockApi(page, { seedOverlapReservation: true, seededReservationIsOwn: true, seedFreeTime: true })

    // A new browser context starts logged out.
    await page.goto('/register')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByLabel('Name')).toBeFocused()
    await expectNoAccessibilityViolations(page, 'registration with errors')

    await page.getByRole('link', { name: 'Login', exact: true }).click()
    await login(page, 'smoke.user@example.com', 'Password123')
    await expect(page.getByRole('heading', { name: 'Your booking space' })).toBeVisible()
    await page.goto('/book?resource=1&week=2030-01-14')
    const scheduleSection = sectionByHeading(page, 'Resource schedule')
    await scheduleSection.getByRole('button', { name: /^Available Wed 16 Jan 2030/ }).click()
    await expect(scheduleSection.getByLabel('Start', { exact: true })).toBeFocused()
    await expectNoAccessibilityViolations(page, 'the booking calendar with a time being chosen')

    // The suggested times weren't changed, so leaving doesn't ask.
    await selectRoleTab(page, 'My reservations')
    await expect(sectionByHeading(page, 'My reservations').getByRole('listitem')).toHaveCount(1)
    await expectNoAccessibilityViolations(page, 'my reservations')

    await page.getByRole('button', { name: 'Logout' }).click()
    await login(page, 'admin@example.com', 'Admin1234')
    await expect(page.getByRole('heading', { name: 'Booking operations' })).toBeVisible()
    await page.getByRole('button', { name: 'Create resource' }).click()
    await expectNoAccessibilityViolations(page, 'admin resources with errors')

    await sectionByHeading(page, 'Resources').getByRole('button', { name: /^Delete/ }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expectNoAccessibilityViolations(page, 'the confirmation dialog')
    await page.keyboard.press('Escape')

    await selectRoleTab(page, 'Weekly schedule')
    await expect(sectionByHeading(page, 'Weekly schedule').getByRole('listitem')).toHaveCount(1)
    await expectNoAccessibilityViolations(page, 'the weekly schedule')

    await selectRoleTab(page, 'Reservations')
    await expect(sectionByHeading(page, 'Reservations').getByRole('listitem')).toHaveCount(1)
    await expectNoAccessibilityViolations(page, 'admin reservations')
  })
}

test('a time can be booked from the calendar with the keyboard alone', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true, seedFreeTime: true })
  await storeSession(page, Date.now() + 60 * 60_000)
  await page.goto('/book?resource=1&week=2030-01-14')
  const scheduleSection = sectionByHeading(page, 'Resource schedule')
  const free = scheduleSection.getByRole('button', { name: 'Available Wed 16 Jan 2030, 08:00–12:00. Choose a time' })
  await expect(free).toBeVisible()

  // Tab through the page until the free period has focus.
  for (let presses = 0; presses < 40 && !(await free.evaluate((element) => element === document.activeElement)); presses++) {
    await page.keyboard.press('Tab')
  }
  await expect(free).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(free).toHaveAttribute('aria-pressed', 'true')

  const start = scheduleSection.getByLabel('Start', { exact: true })
  await expect(start).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(start).toHaveValue('2030-01-16T08:15:00')
  // The suggested end, 09:00, is still after the start, so it stays.
  await expect(scheduleSection.getByLabel('End', { exact: true })).toHaveValue('2030-01-16T09:00:00')
  await page.keyboard.press('Tab')
  await expect(scheduleSection.getByLabel('End', { exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(scheduleSection.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(scheduleSection.getByRole('button', { name: 'Reserve' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByText('Reservation created: Wed 16 Jan 2030, 08:15–09:00.')).toBeVisible()
  // Focus moves to the result, so a screen reader reads it and Tab continues from there.
  await expect(page.locator('.booking-notice')).toBeFocused()
})

test('leaving a form with unsaved changes asks first', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 60 * 60_000, 'Admin')
  // History inside the app, so the back button stays in it.
  await page.goto('/admin/reservations')
  await selectRoleTab(page, 'Resources')
  await sectionByHeading(page, 'Create resource').getByLabel('Name').fill('Half-filled room')

  await selectRoleTab(page, 'Weekly schedule')
  const dialog = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Stay on page' })).toBeFocused()
  await page.keyboard.press('Escape')

  await expect(page).toHaveURL('/admin/resources')
  await expect(sectionByHeading(page, 'Create resource').getByLabel('Name')).toHaveValue('Half-filled room')

  await page.goBack()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page).toHaveURL('/admin/reservations')
})

test('a session that expires with unsaved changes still ends', async ({ page }) => {
  await mockApi(page, { seedOverlapReservation: true })
  await storeSession(page, Date.now() + 3_000, 'Admin')
  await page.goto('/admin/resources')
  await sectionByHeading(page, 'Create resource').getByLabel('Name').fill('Half-filled room')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(sessionExpiredMessage)).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
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

// Page sections are regions named by their heading.
function sectionByHeading(page: Page, heading: string) {
  return page.getByRole('region', { name: heading, exact: true })
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
    // With the seeded room: a weekly rule that opens it on Wednesdays, 08:00–12:00.
    seedFreeTime?: boolean
  } = {},
) {
  let nextResourceId = options.seedOverlapReservation ? 2 : 1
  let nextAvailabilityId = options.seedOverlapReservation ? 2 : 1
  let nextAvailabilityRuleId = options.seedFreeTime ? 2 : 1
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
          ...noRuleOverrides,
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
  let availabilityRules: AvailabilityRuleResponse[] = options.seedFreeTime
    ? [
        {
          id: 1,
          resourceId: 1,
          resourceName: 'Reserved Test Room',
          dayOfWeek: 3,
          dayName: 'Wednesday',
          startTime: '08:00',
          endTime: '12:00',
        },
      ]
    : []
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
          ...newReservationFields(1),
        },
      ]
    : []

  let closures: ClosureResponse[] = []
  let nextClosureId = 1

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

    if (request.method() === 'GET' && path === '/availabilityexceptions') {
      await route.fulfill({ status: 200, json: closures })
      return
    }

    if (request.method() === 'POST' && path.startsWith('/availabilityexceptions')) {
      const body = await request.postDataJSON() as { resourceId: number; startTime: string; endTime: string; reason: string }
      const affected = reservations.filter((reservation) =>
        reservation.resourceId === body.resourceId &&
        reservation.status === 'Active' &&
        reservation.startTime < `${body.endTime}:00` &&
        reservation.endTime > `${body.startTime}:00`)

      if (path === '/availabilityexceptions/preview') {
        await route.fulfill({ status: 200, json: affected })
        return
      }

      const closure: ClosureResponse = {
        id: nextClosureId++,
        resourceId: body.resourceId,
        resourceName: resources.find((resource) => resource.id === body.resourceId)?.name ?? '',
        startTime: `${body.startTime}:00`,
        endTime: `${body.endTime}:00`,
        reason: body.reason,
        createdAt: '2030-01-11T08:00:00+00:00',
        createdByName: currentUser.name,
      }
      closures = [...closures, closure]
      await route.fulfill({ status: 201, json: { closure, affectedReservations: affected } })
      return
    }

    const closureMatch = path.match(/^\/availabilityexceptions\/(\d+)$/)
    if (closureMatch && request.method() === 'DELETE') {
      closures = closures.filter((closure) => closure.id !== Number(closureMatch[1]))
      await route.fulfill({ status: 204 })
      return
    }

    if (request.method() === 'GET' && path === '/bookingpolicy') {
      await route.fulfill({ status: 200, json: defaultPolicy })
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
      const excludedId = Number(url.searchParams.get('excludeReservationId') ?? 0)

      await route.fulfill({
        status: 200,
        json: buildResourceSchedule(
          resourceId,
          fromDate,
          toDate,
          resources,
          availabilities,
          availabilityRules,
          reservations.filter((reservation) => reservation.id !== excludedId),
          options.showReservedSlotAsBookable ?? false,
          closures,
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
        ...noRuleOverrides,
        ...body,
        id: nextResourceId,
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
        ...newReservationFields(nextVersion++),
      }

      nextReservationId += 1
      reservations = [...reservations, reservation]
      await route.fulfill({ status: 200, json: reservation })
      return
    }

    const reservationMatch = path.match(/^\/reservations\/(\d+)$/)
    if (reservationMatch && request.method() === 'GET') {
      const reservation = reservations.find((item) => item.id === Number(reservationMatch[1]))

      await route.fulfill(reservation
        ? { status: 200, json: reservation }
        : problemResponse(404, 'Not Found', 'Reservation not found.'))
      return
    }

    if (reservationMatch && request.method() === 'PUT') {
      const reservationId = Number(reservationMatch[1])
      const body = await request.postDataJSON() as { startTime: string; endTime: string; version: string }
      const current = reservations.find((item) => item.id === reservationId)

      if (!current || current.version !== body.version) {
        await route.fulfill(problemResponse(
          409,
          'Conflict',
          'This reservation was changed by someone else. Reload it and try again.',
        ))
        return
      }

      const moved: ReservationResponse = {
        ...current,
        startTime: body.startTime,
        endTime: body.endTime,
        updatedAt: '2030-01-11T08:00:00+00:00',
        version: `v${nextVersion++}`,
      }
      reservations = reservations.map((item) => (item.id === reservationId ? moved : item))
      await route.fulfill({ status: 200, json: moved })
      return
    }

    const reservationCancelMatch = path.match(/^\/reservations\/(\d+)\/cancel$/)
    if (reservationCancelMatch && request.method() === 'PUT') {
      const reservationId = Number(reservationCancelMatch[1])
      reservations = reservations.map((reservation) =>
        reservation.id === reservationId
          ? {
              ...reservation,
              status: 'Cancelled',
              cancelledAt: '2030-01-11T08:00:00+00:00',
              cancelledByUserId: currentUser.id,
              cancelledByName: currentUser.name,
              version: `v${nextVersion++}`,
            }
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
  closures: ClosureResponse[] = [],
): ResourceScheduleResponse {
  const closedSlots = closures
    .filter((closure) =>
      closure.resourceId === resourceId &&
      closure.startTime.slice(0, 10) >= fromDate &&
      closure.startTime.slice(0, 10) <= toDate)
    .map((closure) => ({ startTime: closure.startTime, endTime: closure.endTime, reasons: [closure.reason] }))
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
    policy: { ...defaultPolicy, ...withoutNulls(resource ?? noRuleOverrides) },
    bookableSlots: showReservedSlotAsBookable
      ? [...availabilitySlots, ...ruleSlots]
      : [...availabilitySlots, ...ruleSlots].filter(
          (slot) =>
            ![...reservedSlots, ...closedSlots].some(
              (taken) =>
                slot.startTime < taken.endTime &&
                slot.endTime > taken.startTime,
            ),
        ),
    reservedSlots,
    closedSlots,
  }
}

// A resource's own rules, leaving out the ones it takes from the defaults.
function withoutNulls(overrides: BookingRuleOverrides) {
  return Object.fromEntries(
    Object.entries({
      minDurationMinutes: overrides.minDurationMinutes,
      maxDurationMinutes: overrides.maxDurationMinutes,
      minLeadTimeMinutes: overrides.minLeadTimeMinutes,
      maxAdvanceDays: overrides.maxAdvanceDays,
    }).filter(([, value]) => value !== null),
  )
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

// The local date, as the loop above walks local days. toISOString() would give
// the UTC date, which is the day before in time zones east of UTC.
function toDateValue(value: Date) {
  const month = (value.getMonth() + 1).toString().padStart(2, '0')
  const day = value.getDate().toString().padStart(2, '0')

  return `${value.getFullYear()}-${month}-${day}`
}
