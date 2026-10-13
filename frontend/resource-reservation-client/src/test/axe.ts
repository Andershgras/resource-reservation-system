import axe from 'axe-core'
import { expect } from 'vitest'

// Runs the axe-core accessibility rules on rendered markup and fails with a
// readable list of violations.
//
// jsdom has no layout or rendered colours, so axe can't check colour
// contrast here. The tokens' contrast is checked by hand (see
// styles/tokens.css). The "region" rule is off because a component rendered
// on its own isn't inside the page's landmarks.
export async function expectNoAxeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  })

  const violations = results.violations.map((violation) =>
    `${violation.id}: ${violation.help} (${violation.nodes
      .map((node) => node.target.join(' '))
      .join(', ')})`)

  expect(violations, `Accessibility violations:\n${violations.join('\n')}`).toEqual([])
}
