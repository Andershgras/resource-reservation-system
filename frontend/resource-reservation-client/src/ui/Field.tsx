import { useId, type ComponentProps, type ReactNode } from 'react'
import './Field.css'

// What a Field gives its control, so the label, hint and error are announced
// with it.
export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  // Shown beside the control, and marks it invalid.
  error?: string
  optional?: boolean
  className?: string
  children: (controlProps: FieldControlProps) => ReactNode
}

// A label, the control, an optional hint and an error message.
//
//   <Field label="Name" error={errors.name}>
//     {(props) => <Input {...props} value={name} onChange={...} />}
//   </Field>
export function Field({ label, hint, error, optional = false, className, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <>{' '}<span className="field-optional">(optional)</span></>}
      </label>
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          <ErrorIcon />
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={['input', className].filter(Boolean).join(' ')} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={['input', 'select', className].filter(Boolean).join(' ')} {...props} />
}

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label: ReactNode
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={['checkbox', className].filter(Boolean).join(' ')}>
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  )
}

function ErrorIcon() {
  return (
    <svg className="field-error-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 9.5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8ZM8 4a.8.8 0 0 0-.8.8v4a.8.8 0 0 0 1.6 0v-4A.8.8 0 0 0 8 4Z"
      />
    </svg>
  )
}
