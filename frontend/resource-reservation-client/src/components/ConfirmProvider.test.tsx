import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../test/axe'
import { mainContentId } from '../ui/ConfirmDialog'
import { useConfirm, type ConfirmationRequest } from './confirmContext'
import { ConfirmProvider } from './ConfirmProvider'

// A list item with a delete button that opens the dialog. Confirming removes
// the item, and with it the button that opened the dialog.
function DeletableItem({ request }: { request: Partial<ConfirmationRequest> }) {
  const confirm = useConfirm()
  const [isDeleted, setIsDeleted] = useState(false)

  return (
    <main id={mainContentId} tabIndex={-1}>
      <button type="button">Before</button>
      {!isDeleted && (
        <button
          type="button"
          onClick={() => confirm({
            title: 'Delete resource',
            message: 'Delete resource "Room A"?',
            confirmLabel: 'Delete resource',
            ...request,
            onConfirm: async () => {
              await request.onConfirm?.()
              setIsDeleted(true)
            },
          })}
        >
          Delete
        </button>
      )}
    </main>
  )
}

function renderDialog(request: Partial<ConfirmationRequest> = {}) {
  return render(
    <ConfirmProvider>
      <DeletableItem request={request} />
    </ConfirmProvider>,
  )
}

async function openDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

  return screen.getByRole('alertdialog')
}

describe('ConfirmProvider', () => {
  it('opens a modal alert dialog named by its title and described by its message', async () => {
    renderDialog()

    const dialog = await openDialog()

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Delete resource')
    expect(dialog).toHaveAccessibleDescription('Delete resource "Room A"?')
  })

  it('has no accessibility violations while open', async () => {
    const { container } = renderDialog()

    await openDialog()

    await expectNoAxeViolations(container.ownerDocument.body)
  })

  it('focuses the least destructive action first', async () => {
    renderDialog()

    await openDialog()

    expect(screen.getByRole('button', { name: 'Keep unchanged' })).toHaveFocus()
  })

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    renderDialog()
    await openDialog()
    const keep = screen.getByRole('button', { name: 'Keep unchanged' })
    const confirm = screen.getByRole('button', { name: 'Delete resource' })

    await userEvent.tab()
    expect(confirm).toHaveFocus()

    await userEvent.tab()
    expect(keep).toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(confirm).toHaveFocus()
  })

  it('makes the page behind it inert until it closes', async () => {
    renderDialog()
    const page = screen.getByRole('main').parentElement!

    await openDialog()
    expect(page).toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('hidden')

    await userEvent.keyboard('{Escape}')
    expect(page).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
  })

  it('cancels with Escape and returns focus to the button that opened it', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    renderDialog({ onCancel, onConfirm })

    await openDialog()
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels with the cancel button, using its own label when given', async () => {
    renderDialog({ cancelLabel: 'Stay on page' })

    await openDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Stay on page' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('confirms with the keyboard, then moves focus to the main content when the opener is gone', async () => {
    renderDialog()
    await openDialog()

    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('main')).toHaveFocus()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('stays open and keeps focus while working, ignoring Escape and further clicks', async () => {
    let finish = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    renderDialog({ onConfirm })
    await openDialog()

    const confirm = screen.getByRole('button', { name: 'Delete resource' })
    await userEvent.click(confirm)

    expect(confirm).toHaveTextContent('Working...')
    expect(confirm).toHaveFocus()
    expect(confirm).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('alertdialog')).toHaveAttribute('aria-busy', 'true')

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Keep unchanged' }))
    await userEvent.click(confirm)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(onConfirm).toHaveBeenCalledOnce()

    await act(async () => finish())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('stays open with an error when the action fails', async () => {
    renderDialog({ onConfirm: () => Promise.reject(new Error('The network is down.')) })
    await openDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Delete resource' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The network is down.')
    expect(screen.getByRole('button', { name: 'Delete resource' })).not.toHaveAttribute('aria-disabled')
  })

  it('closes and unlocks the page when the provider unmounts, as on session expiry', async () => {
    const { unmount } = renderDialog()
    await openDialog()

    unmount()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })
})
