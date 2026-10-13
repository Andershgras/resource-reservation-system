import { Link } from 'react-router'
import { mainContentId } from '../ui/ConfirmDialog'
import './NotFoundPage.css'

export function NotFoundPage() {
  return (
    <main id={mainContentId} className="not-found" tabIndex={-1}>
      <div className="not-found-panel">
        <p className="not-found-code">Error 404</p>
        <h1>Page not found</h1>
        <p>This address doesn't match any page.</p>
        <Link className="not-found-link" to="/">
          Go to the start page
        </Link>
      </div>
    </main>
  )
}
