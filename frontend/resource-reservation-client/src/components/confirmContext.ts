import { createContext, useContext, type ReactNode } from 'react'

export interface ConfirmationRequest {
  title: string
  message: string
  // Shown below the message, such as the items an action affects.
  details?: ReactNode
  confirmLabel: string
  // "Keep unchanged" unless given.
  cancelLabel?: string
  // "danger", the default, for actions that delete or cancel something.
  tone?: 'danger' | 'primary'
  // Runs when the user confirms. The dialog stays open, showing "Working...",
  // until it finishes. If it throws, the dialog stays open with an error.
  onConfirm: () => Promise<void> | void
  // Runs when the user closes the dialog without confirming.
  onCancel?: () => void
}

export const ConfirmContext = createContext<((request: ConfirmationRequest) => void) | null>(null)

// Returns a function that asks the user to confirm an action in a dialog.
export function useConfirm() {
  const confirm = useContext(ConfirmContext)

  if (!confirm) {
    throw new Error('useConfirm must be used inside ConfirmProvider.')
  }

  return confirm
}
