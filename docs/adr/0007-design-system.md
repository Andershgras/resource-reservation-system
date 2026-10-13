# ADR 0007: Plain CSS With Design Tokens And Shared Components

- **Status:** Accepted
- **Date:** 2026-10-13
- **Related findings:** L1, L4, L10 in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

Before Milestone 5, the frontend had one global stylesheet, `App.css`, of 644 lines, plus colour variables in `index.css`:

- Every section built its own buttons, labels, lists and status messages. The same message could be a plain paragraph on one screen and an alert on another.
- Errors and successes shared one message string. Errors were told apart only by an "Error:" prefix, and screen readers didn't hear them as errors.
- Validation errors from the API were joined into one sentence, away from the fields they described.
- The confirmation dialog had a dialog role, but no focus handling: focus stayed behind it, Tab left it, and Escape did nothing.
- Dates were formatted in the browser's own locale and time zone, so the same reservation could read differently on two machines.
- The focus outline was amber, at under 2:1 contrast against white.

The options were a CSS framework (Tailwind), a component library (MUI, Chakra), CSS-in-JS, or plain CSS with conventions.

## Decision

### Plain CSS, with design tokens

- `src/styles/tokens.css` holds every colour, size, radius, shadow, duration and layer as a custom property, with a dark theme under `prefers-color-scheme: dark`.
- `src/styles/base.css` styles bare elements and the shared focus ring.
- Each component imports its own stylesheet, next to it, such as `Button.css`. Styles use tokens, not raw values.
- Class names are plain and namespaced by component (`.button-primary`, `.card-title`). There are no CSS modules: the app is small enough that clashes are easy to avoid.

Text and background pairs were checked against WCAG AA (4.5:1). Control borders and the focus ring meet the 3:1 non-text minimum in both themes.

### Shared components in `src/ui/`

| Component | What it guarantees |
|---|---|
| `Button` | `type="button"` unless set, four variants, one focus ring |
| `Field`, `Input`, `Select`, `Checkbox` | The label, hint and error are linked to the control with `aria-describedby`, and an error sets `aria-invalid` |
| `Card` | A `<section>` named by its heading, so it is a landmark region |
| `Alert` | Errors use `role="alert"` and start with a hidden "Error:", other tones use `role="status"` |
| `Badge`, `EmptyState`, `LoadingState`, `PageHeader` | One look for counts, statuses, empty lists, loading and page titles |
| `ConfirmDialog` | The WAI-ARIA alert dialog pattern: focus on the least destructive action, Tab kept inside, Escape cancels, focus restored. The page behind is inert. |

`src/components/` keeps the app-specific sections, such as the reservation list, built from these.

### Messages and errors

- Pages keep a `Notice` (`{ tone, text }`), not a bare string, so success and failure look and sound different.
- `ApiError` keeps the first validation message for each field, under the request's camelCase property name. `getFormErrors` puts each message beside its field and keeps any others for the form.
- After a failed submit, focus moves to the first invalid field.

### Dates

`lib/dates.ts` reads dates and times straight from the API's wall-clock text, and shows them as `en-GB` with a 24-hour clock: "Tue 15 Jan 2030, 09:00". The browser's time zone is never used, so every viewer sees the stored Copenhagen times ([ADR 0001](0001-time-zone-convention.md)). "Today" is worked out in `Europe/Copenhagen`.

## Alternatives considered

- **Tailwind:** fast to write, but it spreads design decisions across class lists in every component. It needs build configuration and a new vocabulary. With tokens, the same consistency comes from custom properties.
- **A component library (MUI, Chakra):** accessible widgets out of the box, but a large dependency with its own look to override. The app needs about ten simple components.
- **CSS-in-JS:** styles in TypeScript, but a runtime cost and another dependency, for no gain in an app this size.

## Consequences

- No new runtime dependency. `axe-core` is added as a development dependency for accessibility tests.
- **Bundle size:** CSS grew from 2.7 kB to 4.5 kB gzipped and JavaScript from 94.1 kB to 97.3 kB.
- **jsdom can't check colour contrast**, so the axe tests leave that rule off. Token contrast was checked by hand. Changing a colour token means checking its pairs again.
- **Adding a screen** means composing `src/ui/` components. A new visual pattern should become a component, or a token, rather than a one-off style.
- Dark mode follows the operating system. There is no in-app theme switch.

## Updates
- **Milestone 6 PR 2:** a Light/Dark/System theme switch in the header, saved in `localStorage`. The dark tokens apply under `data-theme="dark"`, or under the device's dark mode when no theme is chosen. CSS can't share one block between those two selectors, so the dark values appear twice, and a unit test fails if the copies differ. A small inline script in `index.html` applies the saved theme before the page draws, so there is no flash of the other theme. axe runs in the browser on a chosen dark theme on a light device. The section tabs now always have their own header row, so every tab stays visible.
