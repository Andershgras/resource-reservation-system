import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import tokens from '../styles/tokens.css?raw'
import { expectNoAxeViolations } from '../test/axe'
import { applyThemePreference, readThemePreference, themeStorageKey } from './theme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.restoreAllMocks()
})

describe('theme preference', () => {
  it('reads a saved Light or Dark, and System otherwise', () => {
    expect(readThemePreference()).toBe('system')
    localStorage.setItem(themeStorageKey, 'dark')
    expect(readThemePreference()).toBe('dark')
    localStorage.setItem(themeStorageKey, 'purple')
    expect(readThemePreference()).toBe('system')
  })

  it('falls back to System when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(readThemePreference()).toBe('system')
  })

  it('sets data-theme for Light and Dark, and removes it for System', () => {
    applyThemePreference('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    applyThemePreference('system')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })
})

describe('ThemeSwitcher', () => {
  it('applies and remembers the choice, and forgets it for System', async () => {
    render(<ThemeSwitcher />)
    const select = screen.getByRole('combobox', { name: 'Theme' })
    expect(select).toHaveValue('system')

    await userEvent.selectOptions(select, 'Dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(themeStorageKey)).toBe('dark')

    await userEvent.selectOptions(select, 'System')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(localStorage.getItem(themeStorageKey)).toBeNull()
  })

  it('starts from the saved choice', () => {
    localStorage.setItem(themeStorageKey, 'light')

    render(<ThemeSwitcher />)

    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('light')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ThemeSwitcher />)

    await expectNoAxeViolations(container)
  })
})

describe('dark theme tokens', () => {
  // Dark applies by choice or by the device's setting, from two blocks that
  // CSS can't share. They must declare the same values.
  it('are the same whether chosen or taken from the device', () => {
    const declarations = (selector: string) => {
      const start = tokens.indexOf(selector)
      const body = tokens.slice(tokens.indexOf('{', start) + 1, tokens.indexOf('}', start))

      return body.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('--'))
    }

    const fromDevice = declarations(":root:not([data-theme='light'])")
    const chosen = declarations(":root[data-theme='dark'] {")

    expect(fromDevice.length).toBeGreaterThan(20)
    expect(chosen).toEqual(fromDevice)
  })
})
