import { useCallback, useState, type ReactNode } from 'react'
import { getErrorMessage } from '../lib/errors'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ConfirmContext, type ConfirmationRequest } from './confirmContext'

interface OpenRequest {
  // A new request replaces the dialog, rather than reusing its state.
  key: number
  request: ConfirmationRequest
}

// Shows one confirmation dialog at a time for the screens inside it, and makes
// those screens inert while it is open. It is mounted inside RequireAuth, so a
// dialog closes when the session ends.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenRequest | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')

  const confirm = useCallback((request: ConfirmationRequest) => {
    setOpen((current) => ({ key: (current?.key ?? 0) + 1, request }))
    setIsWorking(false)
    setError('')
  }, [])

  async function handleConfirm() {
    if (!open || isWorking) {
      return
    }

    setIsWorking(true)
    setError('')

    try {
      await open.request.onConfirm()
      setOpen(null)
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setIsWorking(false)
    }
  }

  function handleCancel() {
    if (!open || isWorking) {
      return
    }

    setOpen(null)
    setError('')
    open.request.onCancel?.()
  }

  return (
    <ConfirmContext value={confirm}>
      <div className="confirm-scope" inert={open !== null}>
        {children}
      </div>
      {open && (
        <ConfirmDialog
          key={open.key}
          title={open.request.title}
          message={open.request.message}
          confirmLabel={open.request.confirmLabel}
          cancelLabel={open.request.cancelLabel}
          tone={open.request.tone}
          isWorking={isWorking}
          error={error}
          onConfirm={() => void handleConfirm()}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext>
  )
}
