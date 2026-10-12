import { useCallback, useState, type ReactNode } from 'react'
import { ConfirmContext, type ConfirmationRequest } from './confirmContext'

// Shows one confirmation dialog at a time for the screens inside it. It is
// mounted inside RequireAuth, so a dialog closes when the session ends.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const confirm = useCallback((nextRequest: ConfirmationRequest) => setRequest(nextRequest), [])

  async function handleConfirm() {
    if (!request) {
      return
    }

    setIsConfirming(true)

    try {
      await request.onConfirm()
      setRequest(null)
    } finally {
      setIsConfirming(false)
    }
  }

  function handleCancel() {
    if (!isConfirming) {
      setRequest(null)
    }
  }

  return (
    <ConfirmContext value={confirm}>
      {children}
      {request && (
        <div className="confirm-backdrop" role="presentation">
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <h2 id="confirm-dialog-title">{request.title}</h2>
            <p>{request.message}</p>
            <div className="confirm-actions">
              <button type="button" disabled={isConfirming} onClick={handleCancel}>
                Keep unchanged
              </button>
              <button type="button" disabled={isConfirming} onClick={() => void handleConfirm()}>
                {isConfirming ? 'Working...' : request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext>
  )
}
