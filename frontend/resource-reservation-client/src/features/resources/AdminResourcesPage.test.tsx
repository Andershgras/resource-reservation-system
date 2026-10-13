import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import * as resourcesApi from '../../api/resourcesApi'
import { createQueryClient } from '../../app/queryClient'
import { ConfirmProvider } from '../../components/ConfirmProvider'
import { expectNoAxeViolations } from '../../test/axe'
import { AdminResourcesPage } from './AdminResourcesPage'

vi.mock('../../api/resourcesApi')

beforeEach(() => {
  vi.mocked(resourcesApi.getResources).mockResolvedValue([])
})

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ConfirmProvider>
        <AdminResourcesPage />
      </ConfirmProvider>
    </QueryClientProvider>,
  )
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
