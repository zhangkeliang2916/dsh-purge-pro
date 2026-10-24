import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { EvidenceLedger, UnknownRegistry, evidenceId } from '../lib/redteam/evidence-ledger.mjs'
import { sealObjectSchemas } from '../lib/redteam/schema-seal.js'

test('evidence hash is stable across object key order', () => {
  assert.equal(evidenceId({ a: 1, b: 2 }), evidenceId({ b: 2, a: 1 }))
})

test('claimed evidence must be verified before it is counted as observed', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const ledger = new EvidenceLedger(db)
    const claim = {
      operation: 'local-lab-check', parameters: { target: '127.0.0.1' },
      result: { reachable: true }, confidence: 'claimed', authority: 'subagent-report',
      source_agent: 'lab-worker', engagement_id: 'lab-1',
    }
    assert.equal(ledger.record({ ...claim, source_agent: '' }).ok, false)
    const first = ledger.record(claim)
    assert.equal(first.ok, true)
    assert.equal(first.duplicate, false)
    assert.equal(ledger.record(claim).duplicate, true)
    assert.equal(ledger.countUnresolvedClaims('lab-1'), 1)
    assert.equal(ledger.verify({ ...claim }).matched, true)
    assert.equal(ledger.upgrade({ claimed_ev_id: first.ev_id }).ok, false)
    const observed = ledger.upgrade({
      claimed_ev_id: first.ev_id, verified_result: { reachable: true, checked: 'direct' },
    })
    assert.equal(observed.ok, true)
    assert.equal(ledger.get(observed.ev_id).confidence, 'observed')
    assert.deepEqual(ledger.get(observed.ev_id).supporting_ev_ids, [first.ev_id])
    assert.equal(ledger.countUnresolvedClaims('lab-1'), 0)
  } finally {
    db.close()
  }
})

test('unresolved question can be withdrawn and missing IDs are rejected', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const unknowns = new UnknownRegistry(db)
    const first = unknowns.record({ question: 'Is the local service reachable?', engagement_id: 'lab-1' })
    assert.equal(first.ok, true)
    assert.equal(unknowns.record({ question: 'Is the local service reachable?', engagement_id: 'lab-1' }).duplicate, true)
    assert.equal(unknowns.resolve(first.unk_id, 'withdrawn', 'No longer relevant').ok, true)
    assert.equal(unknowns.list({ status: 'withdrawn', engagement_id: 'lab-1' }).length, 1)
    assert.equal(unknowns.resolve('unk_missing', 'resolved').ok, false)
  } finally {
    db.close()
  }
})

test('nested object schemas declare additionalProperties for DSH 0.2.1', () => {
  const schema = {
    type: 'object', properties: {
      fixed: { type: 'object', properties: { value: { type: 'string' } } },
      free: { type: 'object' },
      rows: { type: 'array', items: { type: 'object', properties: { id: { type: 'number' } } } },
    },
  }
  assert.equal(sealObjectSchemas(schema), schema)
  assert.equal(schema.additionalProperties, false)
  assert.equal(schema.properties.fixed.additionalProperties, false)
  assert.equal(schema.properties.free.additionalProperties, true)
  assert.equal(schema.properties.rows.items.additionalProperties, false)
})
