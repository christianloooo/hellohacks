import { useState } from 'react'

const clock = hour => `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`
const overlaps = (slot, busy) => busy.some(range => new Date(range.start) < new Date(slot.end) && new Date(range.end) > new Date(slot.start))
const selected = (values, slot) => values.includes(slot.key) || values.includes(slot.legacyKey)

function WeekNavigation({ data, week, setWeek }) {
  const days = data.days.slice(week * 7, week * 7 + 7)
  return <div className="week-nav"><button aria-label="Previous week" disabled={week === 0} onClick={() => setWeek(week - 1)}>←</button><strong>{days[0]?.label} – {days.at(-1)?.label}</strong><button aria-label="Next week" disabled={(week + 1) * 7 >= data.days.length} onClick={() => setWeek(week + 1)}>→</button></div>
}

export function TimePreferences({ availability, values, onChange }) {
  const [week, setWeek] = useState(0)
  const { data, error, loading, refresh } = availability
  if (!data) return <p className="calendar-status" role="status">{error || 'Loading time blocks…'}{error && <button className="connect-button" onClick={refresh}>Retry</button>}</p>
  const me = data.people.find(person => person.isYou)
  const days = data.days.slice(week * 7, week * 7 + 7)
  function toggle(slot) {
    // Expand saved recurring choices into dated blocks before editing an individual block.
    const expanded = data.slots.filter(s => selected(values, s)).map(s => s.key)
    onChange(expanded.includes(slot.key) ? expanded.filter(key => key !== slot.key) : [...expanded, slot.key])
  }
  return <section className="time-preferences" aria-label="Choose available time blocks">
    <p className="calendar-help">Select two-hour windows on any day. Google busy times are always excluded. With Google connected, leave all unselected to use Calendar availability only.</p>
    <WeekNavigation data={data} week={week} setWeek={setWeek} />
    <p className="calendar-zone">{data.timeZone} · Next 21 days · {values.length ? `${data.slots.filter(slot => selected(values, slot)).length} blocks selected` : me?.status === 'connected' ? 'Using Google Calendar' : 'Choose available blocks'}</p>
    {me?.status === 'error' && <p className="calendar-warning">{me.error} Busy times cannot be confirmed.</p>}
    <div className="calendar-scroll"><table className="preference-calendar"><caption className="sr-only">Availability for each day, in {data.timeZone}</caption><thead><tr><th scope="col">Time</th>{days.map(day => <th key={day.date} scope="col">{day.label}</th>)}</tr></thead><tbody>{[8, 10, 12, 14, 16, 18, 20].map((hour, row) => <tr key={hour}><th scope="row">{clock(hour)}–{clock(hour + 2)}</th>{days.map(day => {
      const slot = day.slots[row]
      const past = new Date(slot.start) <= new Date()
      const busy = overlaps(slot, me?.busy || [])
      const active = selected(values, slot)
      return <td key={day.date}><button className={`slot-choice ${active ? 'selected' : ''} ${busy ? 'busy' : ''}`} disabled={past || busy} aria-pressed={active} aria-label={`${day.label}, ${clock(hour)} to ${clock(hour + 2)}${busy ? ', unavailable on Google Calendar' : ''}`} onClick={() => toggle(slot)}>{past ? 'Past' : busy ? 'Busy' : active ? '✓ Free' : 'Select'}</button></td>
    })}</tr>)}</tbody></table></div>
    <div className="calendar-controls"><span>Selected times limit when HUDDLE can suggest plans.</span><button className="connect-button" onClick={() => onChange([])}>Clear choices</button><button className="connect-button" disabled={loading} onClick={refresh}>Refresh busy times</button></div>
  </section>
}

function dayRanges(person, day, timeZone) {
  const start = Date.parse(day.start), end = Date.parse(day.end)
  const parts = date => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]))
  return person.busy.filter(range => Date.parse(range.start) < end && Date.parse(range.end) > start).map(range => {
    const a = Math.max(start, Date.parse(range.start)), b = Math.min(end, Date.parse(range.end))
    const ap = parts(new Date(a)), bp = parts(new Date(b))
    const top = a === start ? 0 : +ap.hour * 60 + +ap.minute
    const bottom = b === end ? 1440 : +bp.hour * 60 + +bp.minute
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, hour: 'numeric', minute: '2-digit' })
    return { top, bottom: Math.max(top + 5, bottom), label: `${person.name} · Unavailable · ${formatter.format(a)}–${formatter.format(b)}` }
  })
}

export default function AvailabilityCalendar({ availability }) {
  const [week, setWeek] = useState(0)
  const { data, error, loading, refresh } = availability
  const days = data?.days.slice(week * 7, week * 7 + 7) || []
  return <section className="group-calendar" aria-labelledby="group-calendar-heading">
    <div className="calendar-heading"><div><p className="eyebrow">FIND A TIME TOGETHER</p><h2 id="group-calendar-heading">Group calendar</h2></div><button className="connect-button" disabled={loading} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <p className="calendar-help">Everyone’s unavailable blocks, color coded by person. Event titles, locations, and descriptions are never shared.</p>
    {error && <p className="calendar-warning" role="alert">{error} {data ? 'The calendar below may be out of date.' : ''}</p>}
    {!data && <p className="calendar-status" role="status">{error ? 'Calendar unavailable. Try refreshing.' : 'Loading everyone’s availability…'}</p>}
    {data && <>
      <ul className="calendar-legend">{data.people.map(person => <li key={person.id}><span className="person-dot" style={{ background: person.color }} /><span><strong>{person.name}{person.isYou ? ' (you)' : ''}</strong><small>{person.status === 'connected' ? `${person.calendarCount} Google calendar${person.calendarCount === 1 ? '' : 's'}` : person.status === 'manual' ? 'Manual times only' : person.status === 'error' ? 'Calendar could not be checked' : 'Availability not shared'}</small></span></li>)}</ul>
      {data.people.filter(p => p.status === 'error' || p.status === 'unknown' || p.needsReconnect).map(person => <p key={person.id} className="calendar-warning">{person.name}: {person.error || (person.needsReconnect ? 'Reconnect Google Calendar to include additional calendars. Currently checking the primary calendar.' : 'Has not shared availability yet. Empty space does not mean free.')}</p>)}
      <WeekNavigation data={data} week={week} setWeek={setWeek} />
      <p className="calendar-zone">{data.timeZone} · All 24 hours · Updated {new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
      <div className="calendar-scroll"><div className="calendar-board" style={{ '--people': Math.max(1, data.people.length) }}>
        <div className="day-headings"><div>Time</div>{days.map(day => <div key={day.date}>{day.label}</div>)}</div>
        <div className="calendar-body"><div className="hour-labels">{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ top: `${i / 12 * 100}%` }}>{clock(i * 2)}</span>)}</div>
          {days.map(day => <div className="calendar-day" key={day.date} aria-label={day.label}>{data.people.map((person, index) => <div key={person.id} className={`person-lane ${person.status === 'unknown' || person.status === 'error' ? 'unknown-lane' : ''}`} style={{ left: `${index / data.people.length * 100}%`, width: `${100 / data.people.length}%` }}>
            {dayRanges(person, day, data.timeZone).map((range, i) => <div key={i} className="busy-block" tabIndex={0} title={range.label} aria-label={`${day.label}, ${range.label}`} style={{ top: `${range.top / 1440 * 100}%`, height: `${(range.bottom - range.top) / 1440 * 100}%`, background: person.color }}><strong>{person.name}</strong><span>Unavailable</span></div>)}
            {person.manualAvailability.length > 0 && day.slots.filter(slot => !selected(person.manualAvailability, slot)).map(slot => <div key={slot.key} className="manual-block" title={`${person.name} · Outside selected availability · ${clock(slot.hour)}–${clock(slot.hour + 2)}`} aria-label={`${day.label}, ${person.name} outside selected availability, ${clock(slot.hour)} to ${clock(slot.hour + 2)}`} style={{ top: `${slot.hour / 24 * 100}%`, height: `${2 / 24 * 100}%`, borderColor: person.color }} />)}
          </div>)}</div>)}
        </div>
      </div></div>
      <p className="calendar-help">Solid blocks: unavailable on Google Calendar. Outlined blocks: outside selected planning times. Striped columns: availability unknown. Each person has a separate lane so overlapping blocks stay visible.</p>
      {data.people.every(person => !person.busy.length) && <p className="calendar-status">No Google busy blocks to display for this period. Check each person’s connection status above.</p>}
    </>}
  </section>
}
