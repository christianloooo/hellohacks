// Split a day at every busy boundary so no person's interval paints over another.
export function calendarSegments(people, day, timeZone) {
  const dayStart = Date.parse(day.start), dayEnd = Date.parse(day.end)
  const clock = new Intl.DateTimeFormat('en-CA', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  const minutes = ms => {
    const parts = Object.fromEntries(clock.formatToParts(ms).map(p => [p.type, p.value]))
    return Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60
  }
  const ranges = people.flatMap(person => (person.busy || []).flatMap(range => {
    const start = Math.max(dayStart, Date.parse(range.start))
    const end = Math.min(dayEnd, Date.parse(range.end))
    if (!(end > start)) return []
    return [{ start, end, person }]
  }))
  const boundaries = [...new Set(ranges.flatMap(r => [r.start, r.end]))].sort((a, b) => a - b)
  const segments = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], end = boundaries[i + 1]
    const members = [...new Map(ranges.filter(r => r.start < end && r.end > start).map(r => [r.person.id, r.person])).values()]
    if (!members.length) continue
    const previous = segments.at(-1)
    if (previous?.end === start && previous.people.length === members.length && previous.people.every(p => members.some(m => m.id === p.id))) previous.end = end
    else segments.push({ start, end, people: members })
  }
  return segments.map(segment => ({ ...segment,
    top: segment.start === dayStart ? 0 : minutes(segment.start),
    bottom: segment.end === dayEnd ? 1440 : minutes(segment.end),
  }))
}
