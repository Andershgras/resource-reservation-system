import { describe, expect, it } from 'vitest'
import { homePathFor, loginPathFor, safeReturnTo } from './navigation'

describe('homePathFor', () => {
  it('sends each role to its first screen', () => {
    expect(homePathFor('Admin')).toBe('/admin/resources')
    expect(homePathFor('User')).toBe('/book')
  })
})

describe('loginPathFor', () => {
  it('returns to the requested page after login', () => {
    expect(loginPathFor('/book?resource=3')).toBe('/login?returnTo=%2Fbook%3Fresource%3D3')
  })

  it('needs no returnTo for the start page', () => {
    expect(loginPathFor('/')).toBe('/login')
  })
})

describe('safeReturnTo', () => {
  it('accepts a path inside the app', () => {
    expect(safeReturnTo('/admin/reservations')).toBe('/admin/reservations')
    expect(safeReturnTo('/book?resource=3&from=2030-01-14')).toBe('/book?resource=3&from=2030-01-14')
  })

  it.each([
    [null],
    [''],
    ['https://evil.example'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['admin/resources'],
  ])('rejects %j', (value) => {
    expect(safeReturnTo(value)).toBeNull()
  })
})
