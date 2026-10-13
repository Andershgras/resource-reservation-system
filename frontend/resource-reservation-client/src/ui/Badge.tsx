import type { ReactNode } from 'react'
import './Badge.css'

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

interface BadgeProps {
  tone?: BadgeTone
  // Read instead of the visible text, such as "3 resources" for a bare "3".
  label?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', label, children }: BadgeProps) {
  if (label) {
    return (
      <span className={`badge badge-${tone}`}>
        <span aria-hidden="true">{children}</span>
        <span className="visually-hidden">{label}</span>
      </span>
    )
  }

  return <span className={`badge badge-${tone}`}>{children}</span>
}
