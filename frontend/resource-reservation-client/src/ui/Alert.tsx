import type { ReactNode } from 'react'
import './Alert.css'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

interface AlertProps {
  tone?: AlertTone
  title?: ReactNode
  children: ReactNode
}

// A message about the page or the last action. Errors are announced straight
// away (role="alert"); other messages wait until the screen reader is idle
// (role="status").
export function Alert({ tone = 'info', title, children }: AlertProps) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <AlertIcon tone={tone} />
      <div className="alert-body">
        {title && <p className="alert-title">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}

const iconPaths: Record<AlertTone, string> = {
  info: 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 6a.8.8 0 0 0-.8.8v3.4a.8.8 0 0 0 1.6 0V7.8A.8.8 0 0 0 8 7Zm0-2.9a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z',
  success: 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.1 4.4a.8.8 0 0 0-1.1.1L7.2 8.9 6 7.7a.8.8 0 1 0-1.1 1.1l1.8 1.8a.8.8 0 0 0 1.2-.1l3.3-4a.8.8 0 0 0-.1-1.1Z',
  warning: 'M8.9 1.6a1 1 0 0 0-1.8 0L.9 13a1 1 0 0 0 .9 1.5h12.4a1 1 0 0 0 .9-1.5L8.9 1.6ZM8 11a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm0-6a.8.8 0 0 1 .8.8v3.4a.8.8 0 0 1-1.6 0V5.8A.8.8 0 0 1 8 5Z',
  danger: 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 9.5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8ZM8 4a.8.8 0 0 0-.8.8v4a.8.8 0 0 0 1.6 0v-4A.8.8 0 0 0 8 4Z',
}

function AlertIcon({ tone }: { tone: AlertTone }) {
  return (
    <svg className="alert-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={iconPaths[tone]} />
    </svg>
  )
}
