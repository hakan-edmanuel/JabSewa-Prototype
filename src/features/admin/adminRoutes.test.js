import { describe, expect, it } from 'vitest'
import { ADMIN_PAGE_IDS, adminPath, getAdminPageFromPath } from './adminRoutes'
import { SYS_CONTROL_ROOT, SYS_CONTROL_SUBPATHS } from '../../domain/postLoginRouting'

describe('adminPath', () => {
  it('dashboard adalah root area admin', () => {
    expect(adminPath('dashboard')).toBe(SYS_CONTROL_ROOT)
  })

  it('halaman lain memakai subpath root', () => {
    expect(adminPath('applications')).toBe(`${SYS_CONTROL_ROOT}/applications`)
  })
})

describe('getAdminPageFromPath', () => {
  it('memetakan root dan seluruh subpath terdaftar', () => {
    expect(getAdminPageFromPath(SYS_CONTROL_ROOT)).toBe('dashboard')
    for (const subpath of SYS_CONTROL_SUBPATHS) {
      expect(getAdminPageFromPath(`${SYS_CONTROL_ROOT}/${subpath}`), subpath).toBe(subpath)
    }
  })

  it('trailing slash tidak mengubah halaman', () => {
    expect(getAdminPageFromPath(`${SYS_CONTROL_ROOT}/audit/`)).toBe('audit')
    expect(getAdminPageFromPath(`${SYS_CONTROL_ROOT}/`)).toBe('dashboard')
  })

  it('path asing mengembalikan null — TIDAK jatuh ke dashboard', () => {
    expect(getAdminPageFromPath(`${SYS_CONTROL_ROOT}/tidak-ada`)).toBeNull()
    expect(getAdminPageFromPath(`${SYS_CONTROL_ROOT}/applications/extra`)).toBeNull()
    expect(getAdminPageFromPath(`${SYS_CONTROL_ROOT}/AUDIT`)).toBeNull()
  })

  it('path di luar area admin bukan halaman admin', () => {
    expect(getAdminPageFromPath('/consumer')).toBeNull()
    expect(getAdminPageFromPath('/sys-control-jabb')).toBeNull()
    expect(getAdminPageFromPath('')).toBeNull()
  })

  it('id halaman yang dipakai router hanya yang terdaftar', () => {
    expect(ADMIN_PAGE_IDS).toContain('dashboard')
    expect(new Set(ADMIN_PAGE_IDS).size).toBe(ADMIN_PAGE_IDS.length)
  })
})
