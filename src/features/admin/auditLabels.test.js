import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  AUDIT_GROUP_LABELS,
  auditActionMeta,
  auditEntityLabel,
} from './auditLabels'

const BASELINE = 'supabase/migrations/20260926000000_baseline_erd_v2.sql'
const SQL = readFileSync(BASELINE, 'utf8')

/** Ambil isi CHECK constraint registry sebagai daftar nilai enum. */
function registryValues(constraintName) {
  const match = SQL.match(new RegExp(`${constraintName} CHECK \\([^]*?\\)\\)`))
  expect(match, constraintName).toBeTruthy()
  return [...match[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

const ACTIONS = registryValues('audit_logs_action_registry')
const ENTITIES = registryValues('audit_logs_entity_registry')

describe('audit labels — cakupan registry DB', () => {
  it('registry terbaca dari baseline (repo utuh)', () => {
    expect(ACTIONS.length).toBeGreaterThan(20)
    expect(ENTITIES.length).toBeGreaterThan(5)
  })

  it('setiap action punya label, grup, dan tone yang valid', () => {
    for (const action of ACTIONS) {
      const meta = auditActionMeta(action)
      expect(meta.label, action).toBeTruthy()
      expect(meta.label, action).not.toBe(action)
      expect(Object.keys(AUDIT_GROUP_LABELS), action).toContain(meta.group)
      expect(['ok', 'danger', 'neutral'], action).toContain(meta.tone)
    }
  })

  it('setiap entity_type punya label terbaca', () => {
    for (const entity of ENTITIES) {
      expect(auditEntityLabel(entity), entity).not.toBe(entity)
    }
  })

  it('aksi tak dikenal tetap tampil apa adanya (tidak disembunyikan)', () => {
    const meta = auditActionMeta('future_action')
    expect(meta.label).toBe('future_action')
    expect(meta.tone).toBe('neutral')
  })
})
