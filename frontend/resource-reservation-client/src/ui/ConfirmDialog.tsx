import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Alert } from './Alert'
import { Button } from './Button'
import './ConfirmDialog.css'

// The element that gets focus when the control that opened a dialog is gone,
// for example after deleting the item it belonged to. The layouts give their
// <main> this id.
export const mainContentId = 'main-content'

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  // "danger" for actions that delete or cancel something.
  tone?: 'danger' | 'primary'
  isWorking?: boolean
  error?: string
  // Where focus goes when the dialog closes: the control that opened it.
  // The caller records it before the page behind becomes inert, because a
  // browser blurs an element as soon as it is inside an inert subtree.
  returnFocusTo: Element | null
  onConfirm: () => void
  onCancel: () => void
}

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// A modal confirmation, following the WAI-ARIA alert dialog pattern:
// - focus starts on the least destructive action, and Tab stays inside
// - Escape cancels
// - focus returns to where it was when the dialog closes
//
// The caller makes the rest of the page inert while it is open.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Keep unchanged',
  tone = 'danger',
  isWorking = false,
  error,
  returnFocusTo,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const messageId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const { overflow } = document.body.style

    cancelRef.current?.focus()
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = overflow

      if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) {
        returnFocusTo.focus()
      } else {
        document.getElementById(mainContentId)?.focus()
      }
    }
  }, [returnFocusTo])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()

      if (!isWorking) {
        onCancel()
      }

      return
    }

    if (event.key === 'Tab') {
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (!first || !last) {
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  // The buttons stay focusable while working: disabling the focused button
  // would move focus out of the dialog.
  return (
    <div className="confirm-backdrop" onClick={isWorking ? undefined : onCancel}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        aria-busy={isWorking || undefined}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="confirm-title">{title}</h2>
        <p id={messageId} className="confirm-message">{message}</p>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="confirm-actions">
          <Button
            ref={cancelRef}
            aria-disabled={isWorking || undefined}
            onClick={isWorking ? undefined : onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            aria-disabled={isWorking || undefined}
            onClick={isWorking ? undefined : onConfirm}
          >
            {isWorking ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
