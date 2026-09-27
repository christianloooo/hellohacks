import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

// Exercise the actual HTTP server in isolation. Only the Google/OpenAI providers
// are mocked; real credentials and the developer's persisted sessions are unused.
test('Google login, group invites, shared availability, and AI suggestions', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'huddle-integration-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const filename of ['server.mjs', 'planner.mjs', 'availability.mjs']) await copyFile(new URL(filename, import.meta.url), join(directory, filename))
  await writeFile(join(directory, 'providers.mjs'), `
    import { readFile, writeFile, appendFile } from 'node:fs/promises'
    const nativeFetch = globalThis.fetch
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
    globalThis.fetch = async (url, options = {}) => {
      const address = String(url)
      const mode = await readFile(new URL('./mode', import.meta.url), 'utf8').catch(() => '')
      if (address === 'https://oauth2.googleapis.com/token') {
        const person = new URLSearchParams(options.body).get('code') || 'refreshed'
        return json({ access_token: 'test-' + person, refresh_token: 'refresh-' + person, expires_in: 3600, scope: 'openid email profile https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly' })
      }
      if (address === 'https://www.googleapis.com/oauth2/v3/userinfo') {
        const sub = options.headers.Authorization.replace('Bearer test-', '')
        return json({ sub, name: sub, email: sub + '@example.test' })
      }
      if (address.startsWith('https://www.googleapis.com/calendar/v3/users/me/calendarList?')) {
        const sub = options.headers.Authorization.replace('Bearer test-', '')
        return json({ items: [{ id: sub + '-calendar', primary: true, selected: true }, { id: sub + '-shared', selected: true }] })
      }
      if (address === 'https://www.googleapis.com/calendar/v3/freeBusy') {
        if (mode === 'calendar-error') return json({ error: { message: 'Calendar API unavailable' } }, 403)
        const body = JSON.parse(options.body)
        const sub = options.headers.Authorization.replace('Bearer test-', '')
        const offset = sub === 'alice' ? 10 : 12
        return json({ calendars: Object.fromEntries(body.items.map(({ id }) => [id, mode === 'calendar-notfound' && id.endsWith('-shared') ? { errors: [{ domain: 'global', reason: 'notFound' }] } : { busy: mode === 'no-shared' ? [{ start: body.timeMin, end: body.timeMax }] : id.endsWith('-shared') ? [] : [{ start: new Date(Date.parse(body.timeMin) + offset * 3600000).toISOString(), end: new Date(Date.parse(body.timeMin) + (offset + 2) * 3600000).toISOString() }] }])) })
      }
      if (address === 'https://api.openai.com/v1/responses') {
        const body = JSON.parse(options.body)
        await writeFile(new URL('./request.json', import.meta.url), JSON.stringify(body))
        await appendFile(new URL('./requests', import.meta.url), 'request\\n')
        if (mode === 'ai-error') return json({ error: { message: 'Quota exceeded' } }, 429)
        if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 350))
        const input = JSON.parse(body.input)
        const activities = ['Park picnic', 'Coffee and cards', 'Outdoor sketching'].map((title) => ({ title, emoji: '🌿', detail: 'A relaxed activity.', price: Math.min(10, input.maxBudgetPerPerson), tags: ['Outdoors'], slotIndex: mode === 'invalid-slot' ? 999 : 0, location: 'Near campus', rationale: 'Fits the shared interests and budget.' }))
        return json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ activities }) }] }] })
      }
      return nativeFetch(url, options)
    }
  `)
  const child = spawn(process.execPath, ['--import', join(directory, 'providers.mjs'), join(directory, 'server.mjs')], {
    env: { ...process.env, PORT: '0', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REDIRECT_URI: 'http://localhost:3001/auth/google/callback', FRONTEND_ORIGIN: 'http://localhost:5173', PUBLIC_APP_URL: 'http://localhost:5173', OPENAI_API_KEY: 'test-key', DEMO_MODE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit') } })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out: ' + stderr)), 5000)
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Server exited: ' + stderr)) })
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/localhost:(\d+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
  })
  const base = 'http://localhost:' + port
  const request = (path, cookie = '', method = 'GET', body) => fetch(base + path, {
    method, redirect: 'manual', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = async (response, status = 200) => { assert.equal(response.status, status); return response.json() }
  const invite = await data(await request('/api/sessions/invite', '', 'POST', {}), 201)
  const id = invite.sessionId
  const path = '/api/sessions/' + id
  const extensionPath = '/api/extension/sessions/' + id
  assert.equal(new URL(invite.inviteUrl).searchParams.get('session'), id)
  assert.equal((await data(await request(extensionPath))).responseCount, 0)
  assert.equal((await request(path)).status, 401)

  async function login(name, initialCookie = '') {
    let start
    if (initialCookie) {
      const handoff = await fetch('http://127.0.0.1:' + port + '/auth/google?session=' + id, { redirect: 'manual', headers: { Cookie: initialCookie } })
      assert.equal(handoff.status, 302)
      const canonical = new URL(handoff.headers.get('location'))
      assert.equal(canonical.hostname, 'localhost')
      assert(canonical.searchParams.has('handoff'))
      start = await request(canonical.pathname + canonical.search)
    } else start = await request('/auth/google?session=' + id)
    assert.equal(start.status, 302)
    const google = new URL(start.headers.get('location'))
    assert.equal(google.hostname, 'accounts.google.com')
    assert(google.searchParams.get('scope').includes('calendar.events.freebusy'))
    const stateCookie = start.headers.getSetCookie()[0].split(';')[0]
    const callback = await request('/auth/google/callback?state=' + google.searchParams.get('state') + '&code=' + name, stateCookie)
    assert.equal(callback.status, 302)
    assert.equal(new URL(callback.headers.get('location')).searchParams.get('session'), id)
    const cookies = callback.headers.getSetCookie()
    assert.equal(cookies.length, 2, 'Login and OAuth cleanup cookies both survive')
    const cookie = cookies.find((value) => value.startsWith('huddle_session=')).split(';')[0]
    assert((await data(await request('/api/me', cookie))).user.calendarConnected)
    assert.equal((await request('/auth/google/callback?state=' + google.searchParams.get('state') + '&code=' + name, stateCookie)).status, 400, 'OAuth state cannot be replayed')
    return cookie
  }
  const alice = await login('alice')
  const bob = await login('bob')
  const savedAuth = JSON.parse(await readFile(join(directory, 'data', 'auth-state.json'), 'utf8'))
  assert.equal(savedAuth.credentials.length, 2, 'Both Google accounts are saved independently')
  assert(savedAuth.credentials.every(([, credential]) => credential.refreshToken && !('accessToken' in credential)), 'Only durable refresh tokens are persisted')
  assert.equal(savedAuth.loginSessions.length, 2, 'Each browser login session is persisted')
  await data(await request(path + '/join', alice, 'POST', {}))
  await data(await request(path + '/join', bob, 'POST', {}))
  const preferences = { interests: ['Outdoors'], budget: 25, needs: 'Prefer a quiet place', location: 'Near campus', manualAvailability: ['saturday-afternoon'] }
  await data(await request(path + '/preferences', alice, 'PUT', preferences))
  assert.equal((await request(path + '/plans', alice, 'POST', {})).status, 409, 'Unsubmitted friends block generation')
  await data(await request(path + '/preferences', bob, 'PUT', { ...preferences, budget: 15 }))
  const groupCalendar = await data(await request(path + '/availability', alice))
  assert.equal(groupCalendar.people.length, 2)
  assert(groupCalendar.people.every(person => person.status === 'connected' && person.busy.length === 1), 'Each participant has separate, verified Calendar busy blocks')
  assert.notDeepEqual(groupCalendar.people[0].busy, groupCalendar.people[1].busy, 'Busy blocks are read using each participant’s own Google account')
  const result = await data(await request(path + '/plans', alice, 'POST', {}))
  assert.equal(result.session.planMode, 'ai')
  assert.equal(result.session.plans.length, 3)
  assert(result.session.plans.every((plan) => plan.price <= 15 && plan.participantCount === 2 && new Date(plan.start).getTime() > Date.now()))
  const sent = JSON.parse(await readFile(join(directory, 'request.json'), 'utf8'))
  const input = JSON.parse(sent.input)
  assert.equal(sent.store, false)
  assert.equal(sent.text.format.type, 'json_schema')
  assert.equal(input.preferences.length, 2)
  assert.equal(input.maxBudgetPerPerson, 15)
  assert(input.sharedAvailability.length > 0)
  assert(!sent.input.includes('alice') && !sent.input.includes('@example.test') && !sent.input.includes('test-key'))
  assert.equal((await readFile(join(directory, 'requests'), 'utf8')).trim().split('\n').length, 1, 'Concurrent generation is deduplicated')
  const extension = await data(await request(extensionPath))
  assert.deepEqual(extension.plans, result.session.plans)
  assert.equal(extension.responseCount, 2)
  assert(!('participants' in extension), 'Extension does not receive private preferences')

  for (const [mode, message] of [['calendar-error', 'Calendar'], ['calendar-notfound', 'sharing access changed'], ['no-shared', 'No shared time'], ['ai-error', 'quota'], ['invalid-slot', 'valid activity']]) {
    await writeFile(join(directory, 'mode'), mode)
    const testPreferences = mode === 'calendar-error' ? { ...preferences, manualAvailability: [] } : preferences
    if (mode === 'calendar-error') await data(await request(path + '/preferences', alice, 'PUT', testPreferences))
    await data(await request(path + '/preferences', bob, 'PUT', testPreferences))
    const currentAvailability = await data(await request(path + '/availability?refresh=1', alice))
    if (mode === 'calendar-notfound') {
      assert(currentAvailability.people.every(person => person.status === 'error' && person.busy.length === 1), 'Verified primary busy blocks remain visible when a secondary calendar is missing')
    }
    const failureResponse = await request(path + '/plans', alice, 'POST', {})
    assert.equal(failureResponse.status, 502, `${mode} should fail generation`)
    const failure = await failureResponse.json()
    assert(failure.error.includes(message), failure.error)
    assert.equal((await data(await request(extensionPath))).plans.length, 0, 'Failures never masquerade as valid plans')
  }

  await writeFile(join(directory, 'mode'), 'slow')
  await data(await request(path + '/preferences', bob, 'PUT', preferences))
  const demoResponse = await request('/api/demo/session', '', 'POST', { sessionId: id })
  const demoCookie = demoResponse.headers.getSetCookie()[0].split(';')[0]
  const joiningFriend = await data(demoResponse, 201)
  assert.equal(joiningFriend.sessionId, id, 'Demo invite joins the existing group')
  await new Promise((resolve) => setTimeout(resolve, 450))
  const changed = await data(await request(extensionPath))
  assert.equal(changed.participantCount, 3)
  assert.equal(changed.plans.length, 0, 'A late response cannot overwrite newer group membership')
  assert.equal(changed.generationStatus, 'waiting')
  await login('charlie', demoCookie)
  assert.equal((await data(await request(extensionPath))).participantCount, 3, 'Connecting a demo member to Google does not leave a duplicate participant')
})
