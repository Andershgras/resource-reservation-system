import { useId, type ReactNode } from 'react'
import './Card.css'

interface CardProps {
  title: ReactNode
  // A short line under the title.
  description?: ReactNode
  // Shown on the right of the header, such as a count or a button.
  actions?: ReactNode
  headingLevel?: 2 | 3
  className?: string
  children?: ReactNode
}

// A section of a page with a heading. The section is labelled by its heading,
// so screen readers list it as a region with that name.
export function Card({
  title,
  description,
  actions,
  headingLevel = 2,
  className,
  children,
}: CardProps) {
  const titleId = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <section className={['card', className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
      <header className="card-header">
        <div className="card-heading">
          <Heading id={titleId} className="card-title">
            {title}
          </Heading>
          {description && <p className="card-description">{description}</p>}
        </div>
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}
