import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from './axe'

describe('expectNoAxeViolations', () => {
  it('fails for markup with a violation', async () => {
    const { container } = render(<input type="text" />)

    await expect(expectNoAxeViolations(container)).rejects.toThrow(/label/)
  })
})
