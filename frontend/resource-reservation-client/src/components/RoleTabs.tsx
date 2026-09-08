interface RoleTab<TScreen extends string> {
  id: TScreen
  label: string
}

interface RoleTabsProps<TScreen extends string> {
  tabs: RoleTab<TScreen>[]
  activeTab: TScreen
  onTabChange: (tab: TScreen) => void
}

export function RoleTabs<TScreen extends string>({
  tabs,
  activeTab,
  onTabChange,
}: RoleTabsProps<TScreen>) {
  return (
    <nav className="role-tabs" aria-label="Section navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === activeTab ? 'active' : undefined}
          aria-current={tab.id === activeTab ? 'page' : undefined}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
