// Optional text fields are sent as null when left empty.
export function emptyToNull(value: string) {
  const trimmedValue = value.trim()
  return trimmedValue.length === 0 ? null : trimmedValue
}
