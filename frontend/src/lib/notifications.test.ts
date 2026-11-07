import assert from 'node:assert/strict'
import test from 'node:test'
import { dayLabel, manilaDate } from './format.ts'
import { nextToast, notificationTime } from './notifications.ts'

test('notificationTime: minutes and hours while recent', () => {
  const now = new Date('2026-11-07T12:00:00+08:00')
  assert.equal(notificationTime('2026-11-07T11:59:30+08:00', now), 'Just now')
  assert.equal(notificationTime('2026-11-07T12:00:10+08:00', now), 'Just now') // a server clock slightly ahead
  assert.equal(notificationTime('2026-11-07T11:55:00+08:00', now), '5m ago')
  assert.equal(notificationTime('2026-11-07T09:00:00+08:00', now), '3h ago')
})

test('notificationTime: under a day counts hours even across midnight', () => {
  assert.equal(notificationTime('2026-11-06T23:00:00+08:00', new Date('2026-11-07T01:00:00+08:00')), '2h ago')
})

test('notificationTime: past a day it reads like the Activity list', () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 864e5)
  assert.equal(notificationTime(twoDaysAgo.toISOString()), dayLabel(manilaDate.format(twoDaysAgo)))
})

test('nextToast: first load stays quiet, and only a newer row toasts', () => {
  assert.deepEqual(nextToast(null, [{ id: 5, title: 'A' }]), { title: null, lastSeen: 5 })
  assert.deepEqual(nextToast(null, []), { title: null, lastSeen: 0 })
  assert.deepEqual(nextToast(0, [{ id: 1, title: 'A' }]), { title: 'A', lastSeen: 1 })
  assert.deepEqual(nextToast(5, [{ id: 7, title: 'B' }, { id: 6, title: 'A' }]), { title: 'B', lastSeen: 7 })
  assert.deepEqual(nextToast(7, [{ id: 7, title: 'B' }]), { title: null, lastSeen: 7 })
})
