import { Route, Routes } from 'react-router'
import { AuthPage } from '../auth/AuthPage'
import { ConfirmProvider } from '../components/ConfirmProvider'
import { NotFoundPage } from './NotFoundPage'
import { HomeRedirect, RequireAuth, RequireLoggedOut } from './RequireAuth'
import { Workspace } from './Workspace'

// The screens under one layout route stay mounted while moving between them,
// so their state survives switching tabs.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<RequireLoggedOut><AuthPage /></RequireLoggedOut>}>
        <Route path="/login" />
        <Route path="/register" />
      </Route>

      <Route element={<RequireAuth role="Admin"><ConfirmProvider><Workspace /></ConfirmProvider></RequireAuth>}>
        <Route path="/admin" />
        <Route path="/admin/resources" />
        <Route path="/admin/availability" />
        <Route path="/admin/weekly-schedule" />
        <Route path="/admin/reservations" />
      </Route>

      <Route element={<RequireAuth role="User"><ConfirmProvider><Workspace /></ConfirmProvider></RequireAuth>}>
        <Route path="/book" />
        <Route path="/my-reservations" />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
