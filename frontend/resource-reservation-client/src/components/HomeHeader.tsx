import type { UserResponse } from '../api/types'

interface HomeHeaderProps {
  currentUser: UserResponse
  onLogout: () => void
}

export function HomeHeader({ currentUser, onLogout }: HomeHeaderProps) {
  return (
    <header className="home-header">
      <div>
        <p className="label-text">Signed in as {currentUser.role}</p>
        <h1>{currentUser.name}</h1>
        <p>{currentUser.email}</p>
      </div>
      <button type="button" onClick={onLogout}>
        Logout
      </button>
    </header>
  )
}
