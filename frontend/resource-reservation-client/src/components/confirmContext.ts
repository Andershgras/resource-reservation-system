import { createContext, useContext } from 'react'

export interface ConfirmationRequest {
  title: string
  message: string
  confirmLabel: string
  // Runs when the user confirms. The dialog stays open, showing "Working...",
  // until it finishes.
  onConfirm: () => Promise<void>
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
