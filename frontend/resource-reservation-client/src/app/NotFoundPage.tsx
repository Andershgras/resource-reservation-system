import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <main className="app-shell">
      <section className="panel-section" aria-labelledby="not-found-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Error 404</p>
            <h2 id="not-found-title">Page not found</h2>
          </div>
        </div>
        <p>This address doesn't match any page.</p>
        <p>
          <Link to="/">Go to the start page</Link>
        </p>
      </section>
    </main>
  )
}
