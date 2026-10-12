import { Navigate, Route, Routes } from 'react-router'
import { AuthPage } from '../auth/AuthPage'
import { ConfirmProvider } from '../components/ConfirmProvider'
import { AdminAvailabilityPage } from '../features/availability/AdminAvailabilityPage'
import { BookingPage } from '../features/booking/BookingPage'
import { AdminReservationsPage } from '../features/reservations/AdminReservationsPage'
import { MyReservationsPage } from '../features/reservations/MyReservationsPage'
import { AdminResourcesPage } from '../features/resources/AdminResourcesPage'
import { AdminWeeklySchedulePage } from '../features/weekly-schedule/AdminWeeklySchedulePage'
import { AdminLayout } from './AdminLayout'
import { NotFoundPage } from './NotFoundPage'
import { HomeRedirect, RequireAuth, RequireLoggedOut } from './RequireAuth'
import { UserLayout } from './UserLayout'

// A layout route stays mounted while moving between its child screens.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<RequireLoggedOut><AuthPage /></RequireLoggedOut>}>
        <Route path="/login" />
        <Route path="/register" />
      </Route>

      <Route
        path="/admin"
        element={<RequireAuth role="Admin"><ConfirmProvider><AdminLayout /></ConfirmProvider></RequireAuth>}
      >
        <Route index element={<Navigate to="/admin/resources" replace />} />
        <Route path="resources" element={<AdminResourcesPage />} />
        <Route path="availability" element={<AdminAvailabilityPage />} />
        <Route path="weekly-schedule" element={<AdminWeeklySchedulePage />} />
        <Route path="reservations" element={<AdminReservationsPage />} />
      </Route>

      <Route element={<RequireAuth role="User"><ConfirmProvider><UserLayout /></ConfirmProvider></RequireAuth>}>
        <Route path="/book" element={<BookingPage />} />
        <Route path="/my-reservations" element={<MyReservationsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
