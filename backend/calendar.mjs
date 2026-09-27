// RFC 5545: use UTC instants, escape TEXT, and fold by UTF-8 bytes.
function stamp(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
function escapeText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}
function fold(line) {
  let result = '', length = 0
  for (const character of line) {
    const size = Buffer.byteLength(character)
    if (length + size > 75) { result += '\r\n '; length = 1 }
    result += character
    length += size
  }
  return result
}
function description(plan, shareUrl) {
  return `${plan.detail}\nEstimated cost: CAD $${plan.price} per person.\nPlanned with HUDDLE.\n${shareUrl}`
}
export function calendarLinks(plan, origin) {
  const base = origin.replace(/\/$/, '')
  const shareUrl = `${base}/?plan=${encodeURIComponent(plan.shareId)}`
  const params = new URLSearchParams({ action: 'TEMPLATE', text: plan.title,
    dates: `${stamp(plan.start)}/${stamp(plan.end)}`, details: description(plan, shareUrl), location: plan.location })
  return { shareUrl, calendarDownloadUrl: `${base}/api/plans/${encodeURIComponent(plan.shareId)}/calendar.ics`,
    googleCalendarUrl: `https://calendar.google.com/calendar/render?${params}` }
}
export function calendarFile(plan, origin) {
  const { shareUrl } = calendarLinks(plan, origin)
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HUDDLE//Group Plans//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${plan.shareId}@huddle`, `DTSTAMP:${stamp(plan.sharedAt)}`,
    `DTSTART:${stamp(plan.start)}`, `DTEND:${stamp(plan.end)}`, `SUMMARY:${escapeText(plan.title)}`,
    `DESCRIPTION:${escapeText(description(plan, shareUrl))}`, `LOCATION:${escapeText(plan.location)}`,
    `URL:${shareUrl}`, 'END:VEVENT', 'END:VCALENDAR', ''].map(fold).join('\r\n')
}
