import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarFile, calendarLinks } from './calendar.mjs'

test('calendar exports preserve instants across DST and safely encode multiline Unicode text', () => {
  const plan = { shareId: 'fixed-plan', sharedAt: '2026-09-27T12:00:00Z',
    start: '2026-11-01T01:00:00-07:00', end: '2026-11-01T02:00:00-08:00',
    title: 'Coffee, cards; friends', location: 'Campus\\Cafe', price: 10,
    detail: '🌿'.repeat(80) + '\r\nBEGIN:VEVENT\nBring snacks, please;' }
  const file = calendarFile(plan, 'https://huddle.example')
  const unfolded = file.replace(/\r\n /g, '')
  assert(file.split('\r\n').every(line => Buffer.byteLength(line) <= 75))
  assert.match(unfolded, /DTSTART:20261101T080000Z\r\nDTEND:20261101T100000Z/)
  assert.equal(unfolded.split('\r\nBEGIN:VEVENT\r\n').length, 2, 'Newlines cannot inject additional events')
  assert(unfolded.includes('SUMMARY:Coffee\\, cards\\; friends'))
  assert(unfolded.includes('LOCATION:Campus\\\\Cafe'))
  assert(unfolded.includes('\\nBEGIN:VEVENT\\nBring snacks\\, please\\;'))
  assert.equal(calendarFile(plan, 'https://huddle.example'), file, 'Repeat downloads have the same UID and timestamp')
  const google = new URL(calendarLinks(plan, 'https://huddle.example/').googleCalendarUrl)
  assert.equal(google.searchParams.get('dates'), '20261101T080000Z/20261101T100000Z')
  assert.equal(google.searchParams.get('text'), plan.title)
})
