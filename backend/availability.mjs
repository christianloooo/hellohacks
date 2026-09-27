export const TIME_ZONE = process.env.TIME_ZONE || 'America/Vancouver'
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export function zonedParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]))
}
function zonedDate(y, m, d, h) {
  const target = Date.UTC(y, m - 1, d, h)
  let ms = target
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(ms))
    ms += target - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  }
  return new Date(ms)
}
export function planningWindow() {
  const now = new Date()
  const today = zonedParts(now)
  const base = Date.UTC(+today.year, +today.month - 1, +today.day)
  const days = Array.from({ length: 21 }, (_, offset) => {
    const date = new Date(base + offset * 86400000)
    const at = hour => zonedDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour)
    return { date: date.toISOString().slice(0, 10), day: dayNames[date.getUTCDay()], start: at(0).toISOString(), end: at(24).toISOString(), label: new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' }).format(at(12)), slots: Array.from({ length: 7 }, (_, i) => {
      const hour = 8 + i * 2
      return { key: date.toISOString().slice(0, 10) + 'T' + String(hour).padStart(2, '0') + ':00', start: at(hour).toISOString(), end: at(hour + 2).toISOString(), hour, legacyKey: dayNames[date.getUTCDay()] + '-' + (hour < 12 ? 'morning' : hour < 16 ? 'afternoon' : 'evening'), label: new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at(hour)) }
    }) }
  })
  return { timeZone: TIME_ZONE, days, start: days[0].start, end: days.at(-1).end, slots: days.flatMap(day => day.slots).filter(slot => new Date(slot.start) > now) }
}
export function candidateSlots() { return planningWindow().slots.map(slot => ({ ...slot, start: new Date(slot.start), end: new Date(slot.end) })) }
export function selectedSlot(manual, slot) { return manual.includes(slot.key) || manual.includes(slot.legacyKey) }
export function overlaps(slot, busy) { return busy.some(range => new Date(range.start) < new Date(slot.end) && new Date(range.end) > new Date(slot.start)) }
export function mergeBusy(ranges) {
  const sorted = ranges.filter(r => Number.isFinite(Date.parse(r.start)) && Date.parse(r.end) > Date.parse(r.start)).map(r => ({ start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() })).sort((a, b) => a.start.localeCompare(b.start))
  return sorted.reduce((all, range) => {
    const last = all.at(-1)
    if (last && range.start <= last.end) last.end = last.end > range.end ? last.end : range.end
    else all.push({ ...range })
    return all
  }, [])
}
