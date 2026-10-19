import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { resetSessionForTests } from '../auth/authSession'

afterEach(() => {
  cleanup()
  localStorage.clear()
  // The session lives in module state, which tests in a file share.
  resetSessionForTests()
})
