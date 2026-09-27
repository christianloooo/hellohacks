import test from 'node:test'
import assert from 'node:assert/strict'
import { withoutEmoji } from './plan-text.mjs'
import { calendarFile, calendarLinks } from './calendar.mjs'

test('calendar exports preserve instants across DST and safely encode multiline Unicode text', () => {
  const plan = { shareId: 'fixed-plan', sharedAt: '2026-09-27T12:00:00Z',
    start: '2026-11-01T01:00:00-07:00', end: '2026-11-01T02:00:00-08:00',
    title: 'Coffee, cards; friends', location: 'Campus\\Cafe', price: 10,
    detail: 'Café 你好 '.repeat(80) + '\r\nBEGIN:VEVENT\nBring snacks, please;' }
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


test('removes emoji sequences while preserving useful plan text', () => {
  assert.equal(withoutEmoji('Picnic and Walk in Campus Park 🌳🍎'), 'Picnic and Walk in Campus Park')
  assert.equal(withoutEmoji('☕️ Café 👨‍👩‍👧‍👦 with friends 👍🏽 🇨🇦 1️⃣'), 'Café with friends')
  assert.equal(withoutEmoji('CAD $15, 2–4 PM · café #2 / 你好'), 'CAD $15, 2–4 PM · café #2 / 你好')
  const plan = { shareId: 'event', sharedAt: '2026-09-27T12:00:00Z', start: '2026-10-03T21:00:00Z', end: '2026-10-03T23:00:00Z', title: 'Picnic 🌳🍎', detail: 'Bring snacks 🥪', location: 'Campus 📍', price: 10 }
  const file = calendarFile(plan, 'https://huddle.example').replace(/\r\n /g, '')
  assert(file.includes('SUMMARY:Picnic\r\n'))
  assert(file.includes('LOCATION:Campus\r\n'))
  assert(!/[🌳🍎🥪📍]/u.test(file))
  const google = new URL(calendarLinks(plan, 'https://huddle.example').googleCalendarUrl)
  assert.equal(google.searchParams.get('text'), 'Picnic')
  assert.equal(google.searchParams.get('location'), 'Campus')
})
