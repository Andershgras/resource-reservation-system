import { useEffect, useState } from 'react'

// Light, Dark, or System, which follows the device. The choice is kept in this
// browser only. index.html applies it before the page draws, so there is no
// flash of the other theme; keep the key and values there in step with these.
export type ThemePreference = 'light' | 'dark' | 'system'

export const themeStorageKey = 'rr-theme'

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(themeStorageKey)

    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

// System removes the attribute, so the stylesheet follows the device.
export function applyThemePreference(preference: ThemePreference) {
  if (preference === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', preference)
  }
}

function saveThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') {
      localStorage.removeItem(themeStorageKey)
    } else {
      localStorage.setItem(themeStorageKey, preference)
    }
  } catch {
    // Storage can be unavailable, such as in private browsing. The choice
    // still applies until the page is reloaded.
  }
}

// The current choice and a way to change it. A change in another tab of the
// app applies here too.
export function useThemePreference() {
  const [preference, setPreference] = useState(readThemePreference)

  useEffect(() => {
    applyThemePreference(preference)
  }, [preference])

  useEffect(() => {
    function followOtherTabs(event: StorageEvent) {
      if (event.key === themeStorageKey || event.key === null) {
        setPreference(readThemePreference())
      }
    }

    window.addEventListener('storage', followOtherTabs)

    return () => window.removeEventListener('storage', followOtherTabs)
  }, [])

  function changePreference(next: ThemePreference) {
    saveThemePreference(next)
    setPreference(next)
  }

  return [preference, changePreference] as const
}
