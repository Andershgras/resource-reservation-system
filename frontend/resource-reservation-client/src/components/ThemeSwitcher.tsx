import { useId } from 'react'
import { useThemePreference, type ThemePreference } from '../app/theme'
import { Select } from '../ui/Field'
import './ThemeSwitcher.css'

const options: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// Chooses the colour theme. System follows the device's setting.
export function ThemeSwitcher() {
  const [preference, setPreference] = useThemePreference()
  const id = useId()

  return (
    <div className="theme-switcher">
      <label htmlFor={id}>Theme</label>
      <Select
        id={id}
        className="theme-switcher-select"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
    </div>
  )
}
