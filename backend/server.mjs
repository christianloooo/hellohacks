import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateActivities } from './planner.mjs'

const here = dirname(fileURLToPath(import.meta.url))
try {
  const envText = await readFile(join(here, '.env'), 'utf8')
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match && !match[2].startsWith('#') && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
} catch {}
const PORT = Number(process.env.PORT || 3001)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || FRONTEND_ORIGIN
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:' + PORT + '/auth/google/callback'
const TIME_ZONE = process.env.TIME_ZONE || 'America/Vancouver'
const DEMO_MODE = process.env.DEMO_MODE !== 'false'
const DATA_FILE = join(here, 'data', 'sessions.json')
const COOKIE = 'huddle_session'
const STATE_COOKIE = 'huddle_oauth_state'
const GOOGLE_SCOPE = 'openid email profile https://www.googleapis.com/auth/calendar.events.freebusy'
const sessions = new Map()
const loginSessions = new Map()
const credentialsByUser = new Map()
const oauthStates = new Map()
let writeQueue = Promise.resolve()

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}
function cookie(res, name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.appendHeader('Set-Cookie', name + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=' + maxAge)
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }).filter(([key]) => key))
}
function newId(bytes = 20) { return randomBytes(bytes).toString('base64url') }
function userFor(req) {
  const id = cookies(req)[COOKIE]
  return id ? loginSessions.get(id)?.user || null : null
}
function requireUser(req) {
  const user = userFor(req)
  if (!user) throw Object.assign(new Error('Sign in before continuing.'), { status: 401 })
  return user
}
async function readBody(req) {
  let raw = ''
  for await (const part of req) {
    raw += part
    if (raw.length > 64000) throw Object.assign(new Error('Request is too large.'), { status: 413 })
  }
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { throw Object.assign(new Error('Request must be valid JSON.'), { status: 400 }) }
}
function text(value, limit = 180) { return typeof value === 'string' ? value.trim().slice(0, limit) : '' }
function cleanPreferences(input = {}) {
  const interests = Array.isArray(input.interests) ? [...new Set(input.interests.filter((x) => typeof x === 'string').map((x) => text(x, 40)))].slice(0, 8) : []
  const budget = Number(input.budget)
  const windows = Array.isArray(input.manualAvailability) ? [...new Set(input.manualAvailability.filter((x) => typeof x === 'string' && /^[a-z]+-(morning|afternoon|evening)$/.test(x)))].slice(0, 12) : []
  return { interests, budget: Number.isFinite(budget) ? Math.max(5, Math.min(500, budget)) : 40, needs: text(input.needs, 240), location: text(input.location, 80) || 'near campus', manualAvailability: windows }
}
function requirePlanningSession(id) {
  const session = sessions.get(id)
  if (!session) throw Object.assign(new Error('Planning session not found. Ask the group to share a new invite.'), { status: 404 })
  return session
}
function member(session, user) {
  let person = session.participants.find((entry) => entry.userId === user.id)
  if (!person) {
    person = { userId: user.id, name: text(user.name, 80) || 'Group member', calendarConnected: credentialsByUser.has(user.id), preferences: null }
    session.participants.push(person)
    invalidatePlans(session)
  }
  return person
}
function publicSession(session, user) {
  return { id: session.id, createdAt: session.createdAt, inviteUrl: inviteUrl(session.id), participants: session.participants.map(({ userId, ...person }) => ({ ...person, calendarConnected: credentialsByUser.has(userId), isYou: userId === user.id })), plans: session.plans || [], votes: session.votes || {}, planMode: session.planMode || null, generationStatus: session.generationStatus || 'waiting', generationError: session.generationError || null, ...readiness(session) }
}
function inviteUrl(id) { return PUBLIC_APP_URL.replace(/\/$/, '') + '/?session=' + encodeURIComponent(id) }
function createSession(user, extra = []) {
  return { id: newId(), createdAt: new Date().toISOString(), participants: [...(user ? [{ userId: user.id, name: user.name, calendarConnected: credentialsByUser.has(user.id), preferences: null }] : []), ...extra], plans: [], votes: {}, revision: 0, generationStatus: 'waiting' }
}
async function saveSessions() {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    await mkdir(dirname(DATA_FILE), { recursive: true })
    const temp = DATA_FILE + '.tmp'
    await writeFile(temp, JSON.stringify([...sessions.values()], null, 2), { mode: 0o600 })
    await rename(temp, DATA_FILE)
  })
  await writeQueue
}
async function loadSessions() {
  try {
    const saved = JSON.parse(await readFile(DATA_FILE, 'utf8'))
    for (const entry of saved) if (entry?.id) {
      entry.participants = entry.participants.filter((person) => !person.userId.startsWith('invite-'))
      if (entry.generationStatus === 'generating') {
        entry.generationStatus = 'error'
        entry.generationError = 'The server restarted while generating. Reconnect Calendar and try again.'
      }
      sessions.set(entry.id, entry)
    }
  } catch (error) { if (error.code !== 'ENOENT') console.error('Could not load sessions:', error.message) }
}

async function accessToken(userId) {
  const item = credentialsByUser.get(userId)
  if (!item) return null
  if (item.accessToken && item.expiresAt > Date.now() + 60000) return item.accessToken
  if (!item.refreshToken) return null
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: item.refreshToken, grant_type: 'refresh_token' }),
  })
  const token = await response.json()
  if (!response.ok) throw Object.assign(new Error('Google authorization expired. Reconnect Calendar.'), { status: 401 })
  item.accessToken = token.access_token
  item.expiresAt = Date.now() + (token.expires_in || 3600) * 1000
  return item.accessToken
}
function zonedParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]))
}
function zonedDate(y, m, d, h) {
  const target = Date.UTC(y, m - 1, d, h)
  let ms = target
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(ms))
    ms += target - Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
  }
  return new Date(ms)
}
function candidateSlots() {
  const now = new Date()
  const today = zonedParts(now)
  const base = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day))
  const result = []
  for (let offset = 0; offset < 22; offset++) {
    const date = new Date(base + offset * 86400000)
    const dow = date.getUTCDay()
    if (![5, 6, 0].includes(dow)) continue
    const hours = dow === 5 ? [18] : [11, 14, 17]
    for (const hour of hours) {
      const start = zonedDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour)
      const end = new Date(start.getTime() + 2 * 3600000)
      if (start <= now) continue
      const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dow]
      const period = hour < 12 ? 'morning' : hour < 16 ? 'afternoon' : 'evening'
      const label = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(start)
      result.push({ start, end, label, key: day + '-' + period })
    }
  }
  return result
}
async function busyPeriods(person) {
  const token = await accessToken(person.userId)
  if (!token) return null
  const slots = candidateSlots()
  if (!slots.length) return []
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: slots[0].start.toISOString(), timeMax: slots[slots.length - 1].end.toISOString(), timeZone: TIME_ZONE, items: [{ id: 'primary' }] }),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'Calendar availability request failed.'), { status: 502 })
  const calendar = result.calendars?.primary
  if (calendar?.errors?.length || !Array.isArray(calendar?.busy)) {
    throw Object.assign(new Error('Google Calendar availability could not be retrieved. Reconnect Calendar and grant availability access.'), { status: 502 })
  }
  return calendar.busy
}
function overlaps(slot, busy) { return busy.some((range) => new Date(range.start) < slot.end && new Date(range.end) > slot.start) }

const generationJobs = new Map()
function invalidatePlans(session) {
  session.revision = (session.revision || 0) + 1
  session.plans = []
  session.votes = {}
  session.planMode = null
  session.generationStatus = 'waiting'
  session.generationError = null
}
function readiness(session) {
  const people = session.participants
  const pending = people.filter((person) => !person.preferences || (!credentialsByUser.has(person.userId) && !person.preferences.manualAvailability.length))
  return { ready: people.length > 0 && !pending.length, pendingCount: pending.length }
}
function extensionSession(session) {
  return {
    sessionId: session.id, responseCount: session.participants.filter((person) => person.preferences).length,
    participantCount: session.participants.length, plans: session.plans || [], planMode: session.planMode || null,
    generationStatus: session.generationStatus || 'waiting',
    warning: session.generationError || (!readiness(session).ready ? 'Waiting for everyone to save preferences and connect Calendar or choose available times.' : null),
  }
}
async function makePlans(session) {
  if (!readiness(session).ready) throw Object.assign(new Error('Everyone in the group must save preferences and connect Calendar or choose available times first.'), { status: 409 })
  const revision = session.revision || 0
  const people = structuredClone(session.participants)
  const slots = candidateSlots()
  const busyByUser = new Map()
  await Promise.all(people.map(async (person) => {
    if (!credentialsByUser.has(person.userId)) return
    try {
      const busy = await busyPeriods(person)
      if (busy === null) throw new Error('Expired Calendar connection')
      busyByUser.set(person.userId, busy)
    } catch {
      throw Object.assign(new Error('A group Calendar could not be checked. Reconnect Google Calendar and try again.'), { status: 409 })
    }
  }))
  const shared = slots.filter((slot) => people.every((person) => {
    const manual = person.preferences.manualAvailability
    if (manual.length && !manual.includes(slot.key)) return false
    if (busyByUser.has(person.userId)) return !overlaps(slot, busyByUser.get(person.userId))
    return manual.includes(slot.key)
  }))
  if (!shared.length) throw Object.assign(new Error('No shared time was found in the next three weeks. Update your availability and try again.'), { status: 409 })
  const plans = await generateActivities(people, shared.slice(0, 12), TIME_ZONE)
  if ((session.revision || 0) !== revision) return
  session.plans = plans
  session.planMode = 'ai'
  session.generationStatus = 'ready'
  session.generationError = null
  session.votes = {}
  await saveSessions()
}
function startGeneration(session) {
  if (generationJobs.has(session.id)) return generationJobs.get(session.id)
  if (session.plans?.length || !readiness(session).ready) return Promise.resolve()
  const revision = session.revision || 0
  session.generationStatus = 'generating'
  session.generationError = null
  const job = makePlans(session).catch((error) => {
    if ((session.revision || 0) === revision) {
      session.generationStatus = 'error'
      session.generationError = error.expose || error.status < 500 ? error.message : 'Could not generate ideas. Please try again.'
    }
  }).finally(async () => {
    generationJobs.delete(session.id)
    try { await saveSessions() } catch (error) { console.error('Could not save generated plans:', error.message) }
    if ((session.revision || 0) !== revision && readiness(session).ready) startGeneration(session)
  })
  generationJobs.set(session.id, job)
  return job
}

async function googleStart(req, res, url) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return json(res, 503, { error: 'Google sign-in is not configured. Add OAuth credentials to backend/.env.' })
  for (const [key, pending] of oauthStates) if (pending.expiresAt < Date.now()) oauthStates.delete(key)
  let state = url.searchParams.get('handoff')
  let pending = state && oauthStates.get(state)
  if (state && (!pending || pending.started)) return json(res, 400, { error: 'Google sign-in expired. Please try again.' })
  if (!pending) {
    const sessionId = url.searchParams.get('session')
    if (sessionId) requirePlanningSession(sessionId)
    const previousUser = userFor(req)
    state = newId(24)
    pending = { expiresAt: Date.now() + 600000, sessionId, previousDemoId: previousUser?.provider === 'demo' ? previousUser.id : null }
    oauthStates.set(state, pending)
  }
  // Start on the callback host so the browser returns the OAuth state cookie.
  const callback = new URL(GOOGLE_REDIRECT_URI)
  if (url.hostname !== callback.hostname) {
    const start = new URL('/auth/google', callback)
    start.searchParams.set('handoff', state)
    res.writeHead(302, { Location: start.href })
    res.end()
    return
  }
  pending.started = true
  cookie(res, STATE_COOKIE, state, 600)
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: GOOGLE_SCOPE, state, access_type: 'offline', prompt: 'consent',
  })
  res.writeHead(302, { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() })
  res.end()
}
async function googleCallback(req, res, url) {
  const state = url.searchParams.get('state')
  const pending = state && oauthStates.get(state)
  oauthStates.delete(state)
  if (!state || state !== cookies(req)[STATE_COOKIE] || !pending || pending.expiresAt < Date.now()) return json(res, 400, { error: 'Google sign-in expired. Please try again.' })
  const returnUrl = new URL(FRONTEND_ORIGIN)
  if (pending.sessionId) returnUrl.searchParams.set('session', pending.sessionId)
  if (url.searchParams.get('error')) {
    cookie(res, STATE_COOKIE, '', 0)
    returnUrl.searchParams.set('auth', 'cancelled')
    res.writeHead(302, { Location: returnUrl.href }); res.end(); return
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code') || '',
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  const token = await response.json()
  if (!response.ok) throw Object.assign(new Error(token.error_description || 'Google sign-in failed.'), { status: 400 })
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token.access_token } })
  const profile = await profileResponse.json()
  if (!profileResponse.ok || !profile.sub) throw Object.assign(new Error('Google did not return a profile.'), { status: 400 })
  const existing = credentialsByUser.get(profile.sub)
  const grantedScopes = new Set((token.scope || '').split(' '))
  const calendarGranted = ['calendar.events.freebusy', 'calendar.freebusy', 'calendar.readonly', 'calendar'].some((scope) => grantedScopes.has('https://www.googleapis.com/auth/' + scope))
  if (calendarGranted) {
    credentialsByUser.set(profile.sub, { accessToken: token.access_token, expiresAt: Date.now() + (token.expires_in || 3600) * 1000, refreshToken: token.refresh_token || existing?.refreshToken || null })
  }
  for (const session of sessions.values()) {
    if (session.id === pending.sessionId && pending.previousDemoId) {
      const demoPerson = session.participants.find((person) => person.userId === pending.previousDemoId)
      const existingPerson = session.participants.find((person) => person.userId === profile.sub)
      if (demoPerson && !existingPerson) {
        demoPerson.userId = profile.sub
        demoPerson.name = text(profile.name || profile.given_name || 'Google user', 80)
      } else if (demoPerson && existingPerson) {
        session.participants = session.participants.filter((person) => person !== demoPerson)
      }
    }
    if (session.participants.some((person) => person.userId === profile.sub)) {
      invalidatePlans(session)
      startGeneration(session)
    }
  }
  await saveSessions()
  const authId = newId(32)
  const user = { id: profile.sub, name: text(profile.name || profile.given_name || 'Google user', 80), email: text(profile.email, 160), provider: 'google' }
  loginSessions.set(authId, { user, createdAt: Date.now() })
  cookie(res, COOKIE, authId, 604800)
  cookie(res, STATE_COOKIE, '', 0)
  res.writeHead(302, { Location: returnUrl.href }); res.end()
}

await loadSessions()
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost:' + PORT))
  try {
    if (req.method === 'GET' && url.pathname === '/auth/google') return await googleStart(req, res, url)
    if (req.method === 'GET' && url.pathname === '/auth/google/callback') return await googleCallback(req, res, url)
    if (req.method === 'GET' && url.pathname === '/api/calendar/freebusy') {
      const user = requireUser(req)
      const busy = await busyPeriods({ userId: user.id })
      if (busy === null) return json(res, 401, { error: 'Connect Google Calendar before requesting availability.' })
      return json(res, 200, { calendarId: 'primary', timeZone: TIME_ZONE, busy })
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, name: 'HUDDLE API' })
    if (req.method === 'GET' && url.pathname === '/api/me') {
      const user = userFor(req)
      return json(res, 200, { user: user ? { name: user.name, email: user.email, provider: user.provider, calendarConnected: credentialsByUser.has(user.id) } : null })
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const id = cookies(req)[COOKIE]
      if (id) loginSessions.delete(id)
      cookie(res, COOKIE, '', 0)
      return json(res, 200, { ok: true })
    }
    if (req.method === 'POST' && url.pathname === '/api/sessions/invite') {
      const session = createSession(null)
      sessions.set(session.id, session)
      await saveSessions()
      return json(res, 201, { sessionId: session.id, inviteUrl: PUBLIC_APP_URL.replace(/\/$/, '') + '/?session=' + encodeURIComponent(session.id) })
    }
    // The random invite ID is a shared capability for the Messages group.
    // This response exposes counts and generated plans, never tokens or individual preferences.
    const extensionMatch = url.pathname.match(/^\/api\/extension\/sessions\/([A-Za-z0-9_-]+)(?:\/(plans))?$/)
    if (extensionMatch) {
      const session = requirePlanningSession(extensionMatch[1])
      if (req.method === 'GET' && !extensionMatch[2]) return json(res, 200, extensionSession(session))
      if (req.method === 'POST' && extensionMatch[2] === 'plans') {
        if (!readiness(session).ready) return json(res, 409, { error: extensionSession(session).warning })
        await startGeneration(session)
        if (session.generationError) return json(res, 502, { error: session.generationError })
        return json(res, 200, extensionSession(session))
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/demo/session') {
      if (!DEMO_MODE || process.env.NODE_ENV === 'production') return json(res, 404, { error: 'Demo mode is disabled.' })
      const input = await readBody(req)
      const invited = input.sessionId ? requirePlanningSession(input.sessionId) : null
      const user = { id: 'demo-' + newId(8), name: 'You', email: 'demo@huddle.local', provider: 'demo' }
      const authId = newId(32)
      loginSessions.set(authId, { user, createdAt: Date.now() })
      cookie(res, COOKIE, authId, 86400)
      const sample = [
        { userId: 'sample-' + newId(4) + '-maya', name: 'Maya', calendarConnected: true, preferences: cleanPreferences({ interests: ['Outdoors', 'Coffee'], budget: 25, location: 'near campus', manualAvailability: ['saturday-afternoon', 'sunday-afternoon'] }) },
        { userId: 'sample-' + newId(4) + '-jordan', name: 'Jordan', calendarConnected: true, preferences: cleanPreferences({ interests: ['Games', 'Food & drinks'], budget: 40, location: 'near campus', manualAvailability: ['saturday-afternoon', 'saturday-evening'] }) },
        { userId: 'sample-' + newId(4) + '-sam', name: 'Sam', calendarConnected: false, preferences: cleanPreferences({ interests: ['Outdoors', 'Food & drinks'], budget: 30, location: 'near campus', manualAvailability: ['saturday-afternoon', 'sunday-afternoon'] }) },
      ]
      const session = invited || createSession(user, sample)
      if (invited) member(session, user)
      sessions.set(session.id, session)
      await saveSessions()
      return json(res, 201, { user: { name: user.name, email: user.email, provider: user.provider, calendarConnected: false }, sessionId: session.id })
    }
    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      const user = requireUser(req)
      const session = createSession(user)
      sessions.set(session.id, session)
      await saveSessions()
      return json(res, 201, { sessionId: session.id, inviteUrl: PUBLIC_APP_URL.replace(/\/$/, '') + '/?session=' + encodeURIComponent(session.id) })
    }
    const match = url.pathname.match(/^\/api\/sessions\/([A-Za-z0-9_-]+)(?:\/(join|preferences|plans|vote))?$/)
    if (match) {
      const session = requirePlanningSession(match[1])
      const user = requireUser(req)
      const action = match[2]
      const isMember = session.participants.some((person) => person.userId === user.id)
      if (req.method === 'POST' && action === 'join') {
        member(session, user); await saveSessions()
        return json(res, 200, { session: publicSession(session, user) })
      }
      if (!isMember) throw Object.assign(new Error('Join this session before viewing or editing it.'), { status: 403 })
      if (req.method === 'GET' && !action) return json(res, 200, { session: publicSession(session, user) })
      if (req.method === 'PUT' && action === 'preferences') {
        const person = member(session, user)
        person.preferences = cleanPreferences(await readBody(req))
        person.calendarConnected = credentialsByUser.has(user.id)
        invalidatePlans(session)
        await saveSessions()
        startGeneration(session)
        return json(res, 200, { session: publicSession(session, user) })
      }
      if (req.method === 'POST' && action === 'plans') {
        if (!readiness(session).ready) return json(res, 409, { error: 'Everyone must save preferences and connect Calendar or choose available times first.' })
        await startGeneration(session)
        if (session.generationError) return json(res, 502, { error: session.generationError })
        return json(res, 200, { session: publicSession(session, user) })
      }
      if (req.method === 'POST' && action === 'vote') {
        const planId = Number((await readBody(req)).planId)
        if (!session.plans.some((plan) => plan.id === planId)) throw Object.assign(new Error('Select one of the available plans.'), { status: 400 })
        session.votes[user.id] = planId; await saveSessions()
        return json(res, 200, { session: publicSession(session, user) })
      }
    }
    return json(res, 404, { error: 'Route not found.' })
  } catch (error) {
    const status = error.status || 500
    if (status >= 500) console.error(error)
    return json(res, status, { error: status >= 500 && !error.expose ? 'Request failed. Check the backend log.' : error.message })
  }
})
server.listen(PORT, () => {
  console.log('HUDDLE API listening on http://localhost:' + server.address().port)
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) console.log('Google OAuth needs credentials in backend/.env.')
  if (!process.env.OPENAI_API_KEY) console.log('AI suggestions require OPENAI_API_KEY in backend/.env.')
})
