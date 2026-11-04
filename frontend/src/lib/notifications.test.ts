import assert from 'node:assert/strict'
import test from 'node:test'
import { nextToast } from './notifications.ts'

test('nextToast: first load stays quiet, and only a newer row toasts', () => {
  assert.deepEqual(nextToast(null, [{ id: 5, title: 'A' }]), { title: null, lastSeen: 5 })
  assert.deepEqual(nextToast(null, []), { title: null, lastSeen: 0 })
  assert.deepEqual(nextToast(0, [{ id: 1, title: 'A' }]), { title: 'A', lastSeen: 1 })
  assert.deepEqual(nextToast(5, [{ id: 7, title: 'B' }, { id: 6, title: 'A' }]), { title: 'B', lastSeen: 7 })
  assert.deepEqual(nextToast(7, [{ id: 7, title: 'B' }]), { title: null, lastSeen: 7 })
})
