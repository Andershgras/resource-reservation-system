import type { UserResponse } from '../api/types'

interface HomeHeaderProps {
  currentUser: UserResponse
  onLogout: () => void
}

export function HomeHeader({ currentUser, onLogout }: HomeHeaderProps) {
  return (
    <header className="home-header">
      <div>
        <p className="eyebrow">Resource Reservation</p>
        <h1>{currentUser.role} workspace</h1>
        <p>{currentUser.name} - {currentUser.email}</p>
      </div>
      <div className="header-actions">
        <span className="role-badge">{currentUser.role}</span>
        <button type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}
