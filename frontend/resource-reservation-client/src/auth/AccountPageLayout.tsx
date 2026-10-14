import type { ReactNode } from 'react'
import { Link } from 'react-router'
import './AuthPage.css'

interface AccountPageLayoutProps {
  title: string
  description: ReactNode
  children: ReactNode
}

// The frame of the pages that email links open, and of the requests for those
// emails: one centred card with a way back to signing in.
export function AccountPageLayout({ title, description, children }: AccountPageLayoutProps) {
  return (
    <main id="main-content" className="auth-page" tabIndex={-1}>
      <div className="account-panel">
        <p className="auth-logo account-logo">
          <span className="auth-logo-mark" aria-hidden="true">RR</span>
          Resource Reservation
        </p>
        <div className="auth-heading">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children}
        <p className="account-back">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}
