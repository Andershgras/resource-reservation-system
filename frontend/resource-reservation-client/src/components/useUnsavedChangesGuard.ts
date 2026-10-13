import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'
import { useAuth } from '../auth/authContext'
import { useConfirm } from './confirmContext'

// Asks before leaving a screen with unsaved changes, and lets the browser ask
// before a reload or closing the tab.
//
// It never stands in the way of the session ending: an expired session or a
// logout clears the user, which turns the guard off before the route guards
// redirect to the login screen. Changes within the same screen, such as a new
// filter in the address, aren't blocked either.
export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  const { currentUser } = useAuth()
  const confirm = useConfirm()
  const isGuarding = hasUnsavedChanges && currentUser !== null
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isGuarding && currentLocation.pathname !== nextLocation.pathname)
  const blockerRef = useRef(blocker)

  useEffect(() => {
    blockerRef.current = blocker
  })

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      return
    }

    confirm({
      title: 'Discard unsaved changes?',
      message: "You have changes that haven't been saved. If you leave this page, they will be lost.",
      confirmLabel: 'Discard changes',
      cancelLabel: 'Stay on page',
      tone: 'danger',
      onConfirm: () => blockerRef.current.proceed?.(),
      onCancel: () => blockerRef.current.reset?.(),
    })
  }, [blocker.state, confirm])

  useEffect(() => {
    if (!isGuarding) {
      return
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // Older browsers show the prompt only when returnValue is set.
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warnBeforeUnload)

    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [isGuarding])
}
