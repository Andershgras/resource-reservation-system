import { useEffect, type RefObject } from 'react'

// Moves focus to the first invalid field in a form whenever a submit attempt
// produces new errors, so keyboard and screen reader users land on what needs
// fixing, with its message read out. Pass the errors from the latest submit;
// a new object means a new attempt.
export function useFocusFirstInvalid(
  formRef: RefObject<HTMLFormElement | null>,
  fieldErrors: object,
) {
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [formRef, fieldErrors])
}
