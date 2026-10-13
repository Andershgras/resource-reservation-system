import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import * as resourcesApi from '../../api/resourcesApi'
import { expectNoAxeViolations } from '../../test/axe'
import { renderScreen } from '../../test/renderScreen'
import { AdminResourcesPage } from './AdminResourcesPage'
import { noRuleOverrides } from '../../test/fixtures'

vi.mock('../../api/resourcesApi')

beforeEach(() => {
  vi.mocked(resourcesApi.getResources).mockResolvedValue([])
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
