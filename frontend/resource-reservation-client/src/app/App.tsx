import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
} from 'react-router'
import { forgotPassword, resendVerification } from '../api/authApi'
import { AuthPage } from '../auth/AuthPage'
import { EmailRequestPage } from '../auth/EmailRequestPage'
import { ResetPasswordPage } from '../auth/ResetPasswordPage'
import { VerifyEmailPage } from '../auth/VerifyEmailPage'
import { ConfirmProvider } from '../components/ConfirmProvider'
import { AdminAvailabilityPage } from '../features/availability/AdminAvailabilityPage'
import { AdminClosuresPage } from '../features/closures/AdminClosuresPage'
import { BookingPage } from '../features/booking/BookingPage'
import { AdminReservationsPage } from '../features/reservations/AdminReservationsPage'
import { MyReservationsPage } from '../features/reservations/MyReservationsPage'
import { AdminResourcesPage } from '../features/resources/AdminResourcesPage'
import { AdminUsersPage } from '../features/users/AdminUsersPage'
import { AdminWeeklySchedulePage } from '../features/weekly-schedule/AdminWeeklySchedulePage'
import { AdminLayout } from './AdminLayout'
import { NotFoundPage } from './NotFoundPage'
import { HomeRedirect, RequireAuth, RequireLoggedOut } from './RequireAuth'
import { UserLayout } from './UserLayout'

// The route table. It runs in a data router, which is what lets a form block
// navigation while it has unsaved changes (useBlocker). Data still loads
// through TanStack Query, not route loaders (ADR 0006).
//
// A layout route stays mounted while moving between its child screens.
export const appRoutes = createRoutesFromElements(
  <>
    <Route path="/" element={<HomeRedirect />} />

    <Route element={<RequireLoggedOut><AuthPage /></RequireLoggedOut>}>
      <Route path="/login" />
      <Route path="/register" />
    </Route>

    {/* Open to everyone, because email links open them. */}
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route
      path="/forgot-password"
      element={(
        <EmailRequestPage
          title="Forgot your password?"
          description="Enter your email address and we'll send you a link to choose a new password."
          submitLabel="Send reset link"
          send={forgotPassword}
        />
      )}
    />
    <Route
      path="/resend-verification"
      element={(
        <EmailRequestPage
          title="Confirm your email"
          description="Enter the address you registered with and we'll send a new confirmation link."
          submitLabel="Send a new link"
          send={resendVerification}
        />
      )}
    />

    <Route
      path="/admin"
      element={<RequireAuth role="Admin"><ConfirmProvider><AdminLayout /></ConfirmProvider></RequireAuth>}
    >
      <Route index element={<Navigate to="/admin/resources" replace />} />
      <Route path="resources" element={<AdminResourcesPage />} />
      <Route path="availability" element={<AdminAvailabilityPage />} />
      <Route path="weekly-schedule" element={<AdminWeeklySchedulePage />} />
      <Route path="calendar" element={<BookingPage variant="admin" />} />
      <Route path="closures" element={<AdminClosuresPage />} />
      <Route path="reservations" element={<AdminReservationsPage />} />
      <Route path="users" element={<AdminUsersPage />} />
    </Route>

    <Route element={<RequireAuth role="User"><ConfirmProvider><UserLayout /></ConfirmProvider></RequireAuth>}>
      <Route path="/book" element={<BookingPage />} />
      <Route path="/my-reservations" element={<MyReservationsPage />} />
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </>,
)

export function createAppRouter() {
  return createBrowserRouter(appRoutes)
}
