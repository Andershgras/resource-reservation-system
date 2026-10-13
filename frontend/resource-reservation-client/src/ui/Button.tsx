import type { ComponentProps } from 'react'
import { Link, type LinkProps } from 'react-router'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type ButtonSize = 'md' | 'sm'

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
}

function buttonClasses(variant: ButtonVariant, size: ButtonSize, className: string | undefined) {
  return ['button', `button-${variant}`, `button-${size}`, className].filter(Boolean).join(' ')
}

// A button is type="button" unless it says otherwise, so it never submits a
// form by accident.
export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
}

// A link that looks like a button, for actions that go to another page.
export function ButtonLink({ variant = 'secondary', size = 'md', className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />
}
