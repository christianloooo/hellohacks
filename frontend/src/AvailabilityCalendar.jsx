import { useState } from 'react'
import { calendarSegments } from './calendarSegments'

const clock = hour => `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`
const overlaps = (slot, busy) => busy.some(range => new Date(range.start) < new Date(slot.end) && new Date(range.end) > new Date(slot.start))
const selected = (values, slot) => values.includes(slot.key) || values.includes(slot.legacyKey)

function WeekNavigation({ data, week, setWeek }) {
  const days = data.days.slice(week * 7, week * 7 + 7)
  return <div className="week-nav"><button aria-label="Previous week" disabled={week === 0} onClick={() => setWeek(week - 1)}>←</button><strong>{days[0]?.label} – {days.at(-1)?.label}</strong><button aria-label="Next week" disabled={(week + 1) * 7 >= data.days.length} onClick={() => setWeek(week + 1)}>→</button></div>
}

export function TimePreferences({ availability, values, onChange }) {
  const [week, setWeek] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)
  const { data, error, loading, refresh } = availability
  if (!data) return <p className="calendar-status" role="status">{error || 'Loading time blocks…'}{error && <button className="connect-button" onClick={refresh}>Retry</button>}</p>
  const me = data.people.find(person => person.isYou)
  const days = data.days.slice(week * 7, week * 7 + 7)
  function toggle(slot) {
    // Expand saved recurring choices into dated blocks before editing an individual block.
    const expanded = data.slots.filter(s => selected(values, s)).map(s => s.key)
    onChange(expanded.includes(slot.key) ? expanded.filter(key => key !== slot.key) : [...expanded, slot.key])
  }
  const mobileDay = days[dayOffset] || days[0]
  function slotButton(day, slot, showTime = false) {
    const past = new Date(slot.start) <= new Date()
    const busy = overlaps(slot, me?.busy || [])
    const calendarUnknown = me?.status === 'error'
    const active = selected(values, slot)
    const label = past ? 'Past' : busy ? 'Busy' : calendarUnknown ? 'Unknown' : active ? 'Selected' : 'Select'
    return <button type="button" className={`slot-choice ${active ? 'selected' : ''} ${busy ? 'busy' : ''}`} disabled={past || busy || calendarUnknown} aria-pressed={active} aria-label={`${day.label}, ${clock(slot.hour)} to ${clock(slot.hour + 2)}${busy ? ', unavailable on Google Calendar' : calendarUnknown ? ', calendar status unknown' : ''}`} onClick={() => toggle(slot)}>{showTime && <strong>{clock(slot.hour)}–{clock(slot.hour + 2)}</strong>}<span>{label}</span></button>
  }
  return <section className="time-preferences" aria-label="Choose available time blocks">
    <p className="calendar-help">For connected accounts, only times confirmed free by Google Calendar can be selected. People who do not connect Calendar can choose times manually.</p>
    <WeekNavigation data={data} week={week} setWeek={setWeek} />
    <p className="calendar-zone">{data.timeZone} · Next 21 days · {values.length ? `${data.slots.filter(slot => selected(values, slot)).length} blocks selected` : me?.status === 'connected' ? 'Using Google Calendar' : 'Choose available blocks'}</p>
    {me?.status === 'error' && <p className="calendar-warning">{me.error} HUDDLE will not mark any times free until this calendar can be checked. Reconnect Google Calendar and refresh.</p>}
    <div className="mobile-time-picker">
      <label htmlFor="availability-day">Choose a day</label>
      <select id="availability-day" value={String(days.indexOf(mobileDay))} onChange={event => setDayOffset(Number(event.target.value))}>
        {days.map((day, index) => <option key={day.date} value={index}>{day.label}</option>)}
      </select>
      <div className="mobile-time-slots">{mobileDay?.slots.map(slot => <div key={slot.key}>{slotButton(mobileDay, slot, true)}</div>)}</div>
    </div>
    <div className="calendar-scroll desktop-time-picker"><table className="preference-calendar"><caption className="sr-only">Availability for each day, in {data.timeZone}</caption><thead><tr><th scope="col">Time</th>{days.map(day => <th key={day.date} scope="col">{day.label}</th>)}</tr></thead><tbody>{[8, 10, 12, 14, 16, 18, 20].map((hour, row) => <tr key={hour}><th scope="row">{clock(hour)}–{clock(hour + 2)}</th>{days.map(day => <td key={day.date}>{slotButton(day, day.slots[row])}</td>)}</tr>)}</tbody></table></div>
    <div className="calendar-controls"><span>Selected times limit when HUDDLE can suggest plans.</span><button className="connect-button" onClick={() => onChange([])}>Clear choices</button><button className="connect-button" disabled={loading} onClick={refresh}>Refresh busy times</button></div>
  </section>
}

export default function AvailabilityCalendar({ availability }) {
  const [selectedBusy, setSelectedBusy] = useState('')
  const [week, setWeek] = useState(0)
  const { data, error, loading, refresh } = availability
  const days = data?.days.slice(week * 7, week * 7 + 7) || []
  const timeLabel = value => new Intl.DateTimeFormat('en-CA', { timeZone: data.timeZone, hour: 'numeric', minute: '2-digit' }).format(value)
  return <section className="group-calendar" aria-labelledby="group-calendar-heading">
    <div className="calendar-heading"><div><p className="eyebrow">FIND A TIME TOGETHER</p><h2 id="group-calendar-heading">Group calendar</h2></div><button className="connect-button" disabled={loading} onClick={refresh}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <p className="calendar-help">Everyone’s unavailable blocks, color coded by person. Event titles, locations, and descriptions are never shared.</p>
    {error && <p className="calendar-warning" role="alert">{error} {data ? 'The calendar below may be out of date.' : ''}</p>}
    {!data && <p className="calendar-status" role="status">{error ? 'Calendar unavailable. Try refreshing.' : 'Loading everyone’s availability…'}</p>}
    {data && <>
      <ul className="calendar-legend">{data.people.map(person => <li key={person.id}><span className="person-dot" style={{ background: person.color }} /><span><strong>{person.name}{person.isYou ? ' (you)' : ''}</strong><small>{person.status === 'connected' ? `${person.calendarCount} Google calendar${person.calendarCount === 1 ? '' : 's'}` : person.status === 'manual' ? 'Manual times only' : person.status === 'error' ? 'Calendar could not be checked' : 'Availability not shared'}</small></span></li>)}<li><span className="person-dot overlap-swatch" /><span><strong>Unavailable for multiple</strong><small>Two or more people are busy</small></span></li></ul>
      {data.people.filter(p => p.status === 'error' || p.status === 'unknown' || p.needsReconnect).map(person => <p key={person.id} className="calendar-warning">{person.name}: {person.error || (person.needsReconnect ? 'Reconnect Google Calendar to include additional calendars. Currently checking the primary calendar.' : 'Has not shared availability yet. Empty space does not mean free.')}</p>)}
      <WeekNavigation data={data} week={week} setWeek={setWeek} />
      <p className="calendar-zone">{data.timeZone} · All 24 hours · Updated {new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
      <div className="calendar-scroll"><div className="calendar-board" style={{ '--people': Math.max(1, data.people.length) }}>
        <div className="day-headings"><div>Time</div>{days.map(day => <div key={day.date}>{day.label}</div>)}</div>
        <div className="calendar-body"><div className="hour-labels">{Array.from({ length: 12 }, (_, i) => <span key={i} style={{ top: `${i / 12 * 100}%` }}>{clock(i * 2)}</span>)}</div>
          {days.map(day => <div className="calendar-day" key={day.date} aria-label={day.label}>{data.people.map((person, index) => <div key={person.id} className={`person-lane ${person.status === 'unknown' || person.status === 'error' ? 'unknown-lane' : ''}`} style={{ left: `${index / data.people.length * 100}%`, width: `${100 / data.people.length}%` }}>
            {person.manualAvailability.length > 0 && day.slots.filter(slot => !selected(person.manualAvailability, slot)).map(slot => <div key={slot.key} className="manual-block" title={`${person.name} · Outside selected availability · ${clock(slot.hour)}–${clock(slot.hour + 2)}`} aria-label={`${day.label}, ${person.name} outside selected availability, ${clock(slot.hour)} to ${clock(slot.hour + 2)}`} style={{ top: `${slot.hour / 24 * 100}%`, height: `${2 / 24 * 100}%`, borderColor: person.color }} />)}
          </div>)}
            {calendarSegments(data.people, day, data.timeZone).map(segment => {
              const multiple = segment.people.length > 1
              const names = segment.people.map(person => person.name).join(', ')
              const label = `${day.label} · ${timeLabel(segment.start)}–${timeLabel(segment.end)} · ${multiple ? 'Unavailable for multiple' : 'Unavailable'}: ${names}`
              return <button type="button" key={segment.start} className={`busy-block ${multiple ? 'overlap-block' : ''}`} title={label} aria-label={label} onClick={() => setSelectedBusy(label)} style={{ top: `${segment.top / 1440 * 100}%`, height: `${Math.max(0, segment.bottom - segment.top) / 1440 * 100}%`, backgroundColor: multiple ? '#f3ba68' : segment.people[0].color }}><strong>{multiple ? 'Unavailable for multiple' : names}</strong><span>{multiple ? names : 'Unavailable'}</span></button>
            })}
          </div>)}
        </div>
      </div></div>
      <p className="calendar-help">Solid blocks: unavailable on Google Calendar. Outlined blocks: outside selected planning times. Striped columns: availability unknown. Amber blocks: multiple people are unavailable. Tap any busy block to see everyone affected and the exact times.</p>
      {selectedBusy && <p className="calendar-status" role="status">{selectedBusy}</p>}
      {data.people.every(person => !person.busy.length) && <p className="calendar-status">No Google busy blocks to display for this period. Check each person’s connection status above.</p>}
    </>}
  </section>
}
