import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useAuth } from '../auth/authContext'
import { expireSession, getSessionGeneration } from '../auth/authSession'
import { expectNoAxeViolations } from '../test/axe'
import { renderScreen } from '../test/renderScreen'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

// A form with one field. It has unsaved changes once anything is typed.
function DraftScreen() {
  const [draft, setDraft] = useState('')
  const { logOut } = useAuth()

  useUnsavedChangesGuard(draft !== '')

  return (
    <main>
      <label>
        Name
        <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button type="button" onClick={() => setDraft('')}>Save</button>
      <button type="button" onClick={logOut}>Logout</button>
    </main>
  )
}

async function typeDraft() {
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Room A')
}

function leaveLink() {
  return screen.getByRole('link', { name: 'Go elsewhere' })
}

describe('useUnsavedChangesGuard', () => {
  it('lets a form without changes leave straight away', async () => {
    renderScreen(<DraftScreen />)

    await userEvent.click(leaveLink())

    expect(screen.getByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('asks before leaving with unsaved changes, and stays when asked to', async () => {
    renderScreen(<DraftScreen />)
    await typeDraft()

    await userEvent.click(leaveLink())

    const dialog = screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })
    expect(screen.getByRole('button', { name: 'Stay on page' })).toHaveFocus()
    await expectNoAxeViolations(dialog)

    await userEvent.click(screen.getByRole('button', { name: 'Stay on page' }))

    expect(screen.queryByRole('heading', { name: 'Elsewhere' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Room A')
    expect(leaveLink()).toHaveFocus()
  })

  it('stays when the dialog is closed with Escape', async () => {
    renderScreen(<DraftScreen />)
    await typeDraft()

    await userEvent.click(leaveLink())
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Room A')
  })

  it('leaves when the changes are discarded', async () => {
    renderScreen(<DraftScreen />)
    await typeDraft()

    await userEvent.click(leaveLink())
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })

  it('blocks the back button too', async () => {
    const { router } = renderScreen(<DraftScreen />)
    // History: /screen, /elsewhere, /screen.
    await userEvent.click(leaveLink())
    await act(() => router.navigate('/screen'))
    await typeDraft()

    await act(() => router.navigate(-1))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/screen')
  })

  // Stay and a new navigation before React renders again: the blocker goes
  // from blocked to unblocked and back, and must still ask the second time.
  it('asks again when leaving straight after choosing to stay', async () => {
    const { router } = renderScreen(<DraftScreen />)
    await typeDraft()
    await userEvent.click(leaveLink())

    await act(async () => {
      screen.getByRole('button', { name: 'Stay on page' }).click()
      void router.navigate('/elsewhere')
    })

    expect(screen.getByRole('alertdialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/screen')
  })

  it('does not block changes within the same screen', async () => {
    const { router } = renderScreen(<DraftScreen />)
    await typeDraft()

    await userEvent.click(screen.getByRole('link', { name: 'Same screen' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(router.state.location.search).toBe('?filter=1')
  })

  it('lets saved changes leave', async () => {
    renderScreen(<DraftScreen />)
    await typeDraft()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(leaveLink())

    expect(screen.getByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })

  it('never blocks the session expiring', async () => {
    const { router } = renderScreen(<DraftScreen />)
    await typeDraft()

    act(() => expireSession(getSessionGeneration()))

    expect(await screen.findByRole('heading', { name: 'Login screen' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  // The role guard normally unmounts the screen before redirecting. This checks
  // the guard itself turns off once there is no user.
  it('stops guarding once the session has ended, even if the screen is still shown', async () => {
    const { router } = renderScreen(<DraftScreen />, { withRoleGuard: false })
    await typeDraft()

    act(() => expireSession(getSessionGeneration()))
    await act(() => router.navigate('/login'))

    expect(screen.getByRole('heading', { name: 'Login screen' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('does not block logging out', async () => {
    renderScreen(<DraftScreen />)
    await typeDraft()

    await userEvent.click(screen.getByRole('button', { name: 'Logout' }))

    expect(await screen.findByRole('heading', { name: 'Login screen' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('asks the browser to confirm a reload only while there are unsaved changes', async () => {
    renderScreen(<DraftScreen />)
    const reload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    expect(reload()).toBe(false)

    await typeDraft()
    expect(reload()).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(reload()).toBe(false)
  })
})
