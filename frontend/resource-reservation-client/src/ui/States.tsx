import type { ReactNode } from 'react'
import './States.css'

interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}

// Shown in place of a list or view that has nothing to show yet.
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {action}
    </div>
  )
}

// Shown while data loads. Screen readers announce the text once.
export function LoadingState({ children }: { children: ReactNode }) {
  return (
    <p className="loading-state" role="status">
      <span className="loading-spinner" aria-hidden="true" />
      {children}
    </p>
  )
}
