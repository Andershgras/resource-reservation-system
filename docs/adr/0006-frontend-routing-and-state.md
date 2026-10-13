# ADR 0006: Frontend Routing And Server State

- **Status:** Accepted. Amended in Milestone 5: the routes run in a data router (see below).
- **Date:** 2026-10-13
- **Related findings:** M7, L2 and L4 context in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

Before Milestone 4, `App.tsx` was 1,179 lines with about 60 `useState` hooks:

- every form's fields, every list with its own loading and message state, and every handler
- screens received up to about 60 props, passed down through wrapper components that added nothing
- the current tab was local state, so a reload lost your place, the back button left the app, and no screen could be linked
- five hand-written `loadX` functions repeated the same pattern, and each change re-fetched its lists by hand, inconsistently

The last point is how audit L2 happened: cancelling a reservation refreshed availability windows, which the user never sees, but not the booking schedule, which kept showing the cancelled time as reserved.

## Decision

### Routing: React Router 7, declarative mode

Each screen has an address. Login and protected routes are part of the route table:

| Address | Screen |
|---|---|
| `/login`, `/register` | Sign in and registration. A `returnTo` parameter is kept between them. |
| `/admin/resources`, `/admin/availability`, `/admin/weekly-schedule`, `/admin/reservations` | Admin screens, under `AdminLayout` |
| `/book`, `/my-reservations` | User screens, under `UserLayout` |
| `/` | Redirects to the user's first screen, or to `/login` |
| anything else | Not-found page |

Layout routes:

- **Layouts stay mounted.** Each layout (header, overview and tabs) stays mounted while you switch between its screens.
- **Tabs remember their search.** The layout remembers each tab's last search part, so returning to a tab restores its filters or booking selection.

Route guards:

- **`RequireAuth`** shows a layout only to its role. A logged-out visitor goes to `/login?returnTo=…`, and a user with the wrong role goes to their own home.
- **`RequireLoggedOut`** sends a logged-in user on to `returnTo` or home.
- **`returnTo` validation:** only a path inside the app is accepted, so a crafted link can't redirect to another site.

The guards make every redirect around login and logout. Event handlers don't navigate as well, because React Router applies navigation as a transition, after the change of user has already rendered. When the login screen navigated itself, the guard's redirect home won the race and `returnTo` was lost.

React Router 8 was available, but it needs Node 22.22 or later, and the development machine runs Node 22.19. Version 7 has the same declarative API and still receives fixes.

**Amended in Milestone 5:** the same route table now runs in a data router (`createBrowserRouter`, with `createMemoryRouter` in tests). Only a data router supports `useBlocker`, which the unsaved-changes guard needs. The routes, guards and layouts are unchanged, and there are still no loaders or actions: server data stays in TanStack Query. `AuthProvider` uses no router hooks, so it wraps the `RouterProvider`. The data router adds about 17 kB gzipped to the JavaScript bundle (97 kB to 114 kB), because it includes React Router's navigation state machine. That is the price of navigation blocking; React Router has no lighter way to block navigation.

### Server data: TanStack Query, one set of hooks per feature

Each feature folder has its query hooks, such as `useResources`, `useSaveResource` and `useCancelReservation`. Keys are central in `lib/queryKeys.ts` and nested, so invalidating `['reservations']` refreshes both the user's and the admin's lists.

The defaults keep the app's earlier behaviour:

- data loads once and stays until a change in this app invalidates it, or the page reloads
- no refetch on window focus or reconnect
- no retries

Each mutation invalidates everything its change affects, and resolves once the data on screen has reloaded. For example, cancelling a reservation refreshes the reservation lists and the booking schedules, which fixes L2.

`AuthProvider` clears the whole cache whenever a session starts or ends, so one user never sees another user's cached data.

### State lives where it is used

| State | Where |
|---|---|
| Form fields, drafts, messages | The page that shows them |
| Server data | TanStack Query |
| Logged-in user and session expiry | `AuthProvider` and `useAuth()` |
| Confirmation dialog | `ConfirmProvider` and `useConfirm()`, mounted inside `RequireAuth` so a dialog closes when the session ends |
| Filters and the booking selection | The address (`?resource=3&status=Active`, `?resource=3&from=…&to=…`). Invalid values are ignored. |

`App.tsx` is the route table, 45 lines.

## Alternatives considered

- **Hand-written hooks with `useState` and `useEffect`:** no dependency, but we would rebuild loading and error states, cache clearing and cross-screen refreshes ourselves.
- **TanStack Router:** fully typed routes, but less familiar, and more setup than six routes need.
- **React Router's loaders and actions:** overlap with TanStack Query, and would mean two ways to load data. (The data router itself is used since Milestone 5, for navigation blocking only.)

## Consequences

- **Form drafts don't survive a tab switch.** Each screen is its own route, so it unmounts when you leave it. Before, `App.tsx` kept every form's fields across tabs. Filters and the booking selection do survive, because they are in the address.
- **Hosting must serve `index.html` for unknown paths** (SPA fallback), so a reload on `/admin/reservations` works. Vite's dev and preview servers already do. This is tracked in the roadmap for Milestone 7.
- **Bundle size** grew from 69.7 kB to 94.1 kB gzipped: React Router about 13 kB, TanStack Query about 12 kB.
- **Adding a screen** means a route in `App.tsx`, a tab in its layout, and a page component with its feature hooks.
- **Testing:** pages and hooks can be tested on their own, with a test `QueryClient` and mocked API modules (see [testing](../testing.md)).
