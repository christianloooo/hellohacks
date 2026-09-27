import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarSegments } from './calendarSegments.js'

const day = { start: '2026-09-28T00:00:00-07:00', end: '2026-09-29T00:00:00-07:00' }
const at = time => `2026-09-28T${time}:00-07:00`
const person = (id, ranges) => ({ id, name: id, busy: ranges.map(([start, end]) => ({ start: at(start), end: at(end) })) })
const segments = people => calendarSegments(people, day, 'America/Vancouver')

test('Monday overlap retains both people and each non-overlapping portion', () => {
  const result = segments([person('Chris', [['09:00', '11:00']]), person('Jeffrey', [['10:00', '12:00']])])
  assert.deepEqual(result.map(s => [s.top, s.bottom, s.people.map(p => p.id)]), [
    [540, 600, ['Chris']], [600, 660, ['Chris', 'Jeffrey']], [660, 720, ['Jeffrey']],
  ])
})

test('every segment retains exactly the people busy at that time, including three-way overlaps', () => {
  const people = [person('Chris', [['09:00', '12:00'], ['10:00', '11:00']]), person('Jeffrey', [['10:00', '14:00']]), person('Sam', [['11:00', '13:00'], ['14:00', '15:00']])]
  const result = segments(people)
  for (let minute = 0; minute < 1440; minute++) {
    const instant = Date.parse(day.start) + (minute + 0.5) * 60000
    const expected = people.filter(p => p.busy.some(r => Date.parse(r.start) <= instant && instant < Date.parse(r.end))).map(p => p.id).sort()
    const covering = result.filter(s => s.start <= instant && instant < s.end)
    assert(covering.length <= 1, 'No block can paint over another')
    assert.deepEqual((covering[0]?.people || []).map(p => p.id).sort(), expected)
  }
})

test('touching events and duplicate events from the same person do not count as multiple people', () => {
  const result = segments([person('Chris', [['09:00', '10:00'], ['09:00', '10:00']]), person('Jeffrey', [['10:00', '11:00']])])
  assert.deepEqual(result.map(s => s.people.length), [1, 1])
})

test('clips overnight and all-day ranges to the displayed date in its timezone', () => {
  const result = segments([{ id: 'Jeffrey', busy: [{ start: '2026-09-28T06:00:00Z', end: '2026-09-28T08:00:00Z' }] }, { id: 'Chris', busy: [{ start: day.start, end: day.end }] }])
  assert.deepEqual(result.map(s => [s.top, s.bottom, s.people.length]), [[0, 60, 2], [60, 1440, 1]])
})
