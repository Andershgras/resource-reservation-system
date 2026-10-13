import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import * as resourcesApi from '../../api/resourcesApi'
import { expectNoAxeViolations } from '../../test/axe'
import { renderScreen } from '../../test/renderScreen'
import { AdminResourcesPage } from './AdminResourcesPage'
import { noRuleOverrides, testPolicy } from '../../test/fixtures'

vi.mock('../../api/resourcesApi')

beforeEach(() => {
  vi.mocked(resourcesApi.getResources).mockResolvedValue([])
  vi.mocked(resourcesApi.getBookingPolicy).mockResolvedValue(testPolicy)
})

function renderPage() {
  return renderScreen(<AdminResourcesPage />)
}

function nameInput() {
  return screen.getByRole('textbox', { name: 'Name' })
}

describe('AdminResourcesPage form', () => {
  it('shows a missing name beside the field and focuses it, without calling the API', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }))

    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput()).toHaveAccessibleDescription('Enter a resource name.')
    expect(nameInput()).toHaveFocus()
    expect(resourcesApi.createResource).not.toHaveBeenCalled()
  })

  it('shows API validation errors beside their fields', async () => {
    vi.mocked(resourcesApi.createResource).mockRejectedValue(new ApiError(
      'Location must be 200 characters or fewer.',
      400,
      { location: 'Location must be 200 characters or fewer.' },
    ))
    renderPage()

    await userEvent.type(nameInput(), 'Room A')
    await userEvent.type(screen.getByRole('textbox', { name: 'Location (optional)' }), 'Far away')
    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }))

    const location = screen.getByRole('textbox', { name: 'Location (optional)' })
    expect(location).toHaveAccessibleDescription('Location must be 200 characters or fewer.')
    expect(location).toHaveFocus()
    expect(nameInput()).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted fields.')
  })

  it('shows other API errors for the whole form', async () => {
    vi.mocked(resourcesApi.createResource).mockRejectedValue(new ApiError('Something broke.', 500))
    renderPage()

    await userEvent.type(nameInput(), 'Room A')
    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Error: Something broke.')
    expect(nameInput()).not.toHaveAttribute('aria-invalid')
  })

  it('has no accessibility violations with errors shown', async () => {
    const { container } = renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }))

    await expectNoAxeViolations(container)
  })
})

describe('AdminResourcesPage unsaved changes', () => {
  it('asks before leaving a half-filled form, and not after saving it', async () => {
    vi.mocked(resourcesApi.createResource).mockResolvedValue(
      { id: 5, name: 'Room A', description: null, location: null, isActive: true, ...noRuleOverrides },
    )
    renderPage()
    await userEvent.type(nameInput(), 'Room A')

    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }))
    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stay on page' }))

    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }))
    expect(await screen.findByText('Resource created.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }))

    expect(screen.getByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })

  it('treats an edit form as unchanged until a value differs from the resource', async () => {
    vi.mocked(resourcesApi.getResources).mockResolvedValue([
      { id: 1, name: 'Room A', description: 'Big', location: null, isActive: true, ...noRuleOverrides },
    ])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Room A' }))

    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })
})

describe('AdminResourcesPage booking rules', () => {
  function rule(label: string) {
    return screen.getByRole('spinbutton', { name: `${label} (optional)` })
  }

  it('shows the defaults and sends only the rules that were set', async () => {
    vi.mocked(resourcesApi.createResource).mockResolvedValue(
      { id: 5, name: 'Lab', description: null, location: null, isActive: true, ...noRuleOverrides },
    )
    renderPage()
    expect(await screen.findByText('Default: 8 h')).toBeInTheDocument()
    expect(screen.getByText('Default: none')).toBeInTheDocument()

    await userEvent.type(nameInput(), 'Lab')
    await userEvent.type(rule('Longest booking, minutes'), '60')
    await userEvent.type(rule('Notice needed, minutes'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }))

    expect(resourcesApi.createResource).toHaveBeenCalledWith({
      name: 'Lab',
      description: null,
      location: null,
      minDurationMinutes: null,
      maxDurationMinutes: 60,
      minLeadTimeMinutes: 0,
      maxAdvanceDays: null,
    })
  })

  it('checks a minimum longer than the default maximum before sending', async () => {
    renderPage()
    await screen.findByText('Default: 8 h')

    await userEvent.type(nameInput(), 'Lab')
    await userEvent.type(rule('Shortest booking, minutes'), '600')
    await userEvent.click(screen.getByRole('button', { name: 'Create resource' }))

    expect(rule('Shortest booking, minutes')).toHaveAccessibleDescription(
      "Default: 15 min The minimum duration can't be longer than the default maximum of 480 minutes.",
    )
    expect(resourcesApi.createResource).not.toHaveBeenCalled()
  })

  it('shows API errors beside the rule, and the rules a resource sets in the list', async () => {
    vi.mocked(resourcesApi.getResources).mockResolvedValue([
      { id: 1, name: 'Room A', description: null, location: null, isActive: true, ...noRuleOverrides, maxDurationMinutes: 60 },
    ])
    vi.mocked(resourcesApi.updateResource).mockRejectedValue(new ApiError(
      'Enter a number of days between 1 and 3650.',
      400,
      { maxAdvanceDays: 'Enter a number of days between 1 and 3650.' },
    ))
    renderPage()
    expect(await screen.findByText('At most 1 h')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Room A' }))
    expect(rule('Longest booking, minutes')).toHaveValue(60)
    await userEvent.click(screen.getByRole('button', { name: 'Save resource' }))

    expect(rule('Bookable ahead, days')).toHaveAccessibleDescription(
      'Default: 90 days Enter a number of days between 1 and 3650.',
    )
  })

  it('counts a changed rule as an unsaved change', async () => {
    renderPage()
    await userEvent.type(rule('Bookable ahead, days'), '30')

    await userEvent.click(screen.getByRole('link', { name: 'Go elsewhere' }))

    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
  })
})
