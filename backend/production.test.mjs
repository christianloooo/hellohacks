import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

test('production serves the website, protects private files, and keeps public invites across restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'huddle-production-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const staticDir = join(directory, 'dist')
  const dataDir = join(directory, 'data')
  await mkdir(join(staticDir, 'assets'), { recursive: true })
  await writeFile(join(staticDir, 'index.html'), '<!doctype html><h1>HUDDLE</h1>')
  await writeFile(join(staticDir, 'assets', 'app-123.js'), 'console.log("huddle")')
  await writeFile(join(directory, '.env'), 'PRIVATE_TEST_VALUE')
  await mkdir(dataDir)
  await writeFile(join(dataDir, 'sessions.json'), JSON.stringify([{ id: 'old-session', participants: [], plans: [
    { id: 0, title: 'Picnic', detail: 'Bring snacks.', location: 'Campus', price: 10, emoji: '🌿',
      start: '2026-11-01T18:00:00Z', end: '2026-11-01T20:00:00Z', timeZone: 'America/Vancouver', time: 'Sunday, 10 AM' },
  ] }]))
  let child
  async function stop() {
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit') }
  }
  t.after(stop)
  async function start() {
    child = spawn(process.execPath, [new URL('./server.mjs', import.meta.url).pathname], {
      env: { ...process.env, PORT: '0', NODE_ENV: 'production', DEMO_MODE: 'true', DATA_DIR: dataDir, STATIC_DIR: staticDir,
        RAILWAY_PUBLIC_DOMAIN: 'huddled.example.test', PUBLIC_APP_URL: '', FRONTEND_ORIGIN: '', GOOGLE_REDIRECT_URI: '',
        GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', OPENAI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Startup timeout')), 5000)
      child.once('exit', code => { clearTimeout(timeout); reject(new Error('Exited: ' + code)) })
      child.stdout.on('data', chunk => {
        const match = String(chunk).match(/localhost:(\d+)/)
        if (match) { clearTimeout(timeout); resolve('http://localhost:' + match[1]) }
      })
    })
  }
  let base = await start()
  const request = (path, options) => fetch(base + path, { redirect: 'manual', ...options })
  const page = await request('/?session=example')
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type'), /text\/html/)
  assert.match(await page.text(), /HUDDLE/)
  assert.equal((await request('/plan/shared-link')).status, 200)
  const head = await request('/', { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  const asset = await request('/assets/app-123.js')
  assert.match(asset.headers.get('content-type'), /javascript/)
  assert.match(asset.headers.get('cache-control'), /immutable/)
  for (const path of ['/assets/missing.js', '/.env', '/%2eenv', '/data/auth-state.json', '/api/missing', '/auth/missing']) {
    assert.equal((await request(path)).status, 404, path)
  }
  assert.deepEqual(await (await request('/api/config')).json(), { demoEnabled: false })
  assert.equal((await request('/api/demo/session', { method: 'POST' })).status, 404)
  const authStart = await request('/auth/google')
  const canonical = new URL(authStart.headers.get('location'))
  assert.equal(canonical.origin, 'https://huddled.example.test')
  const invite = await (await request('/api/sessions/invite', { method: 'POST' })).json()
  const migrated = await (await request('/api/extension/sessions/old-session')).json()
  const calendarPath = new URL(migrated.plans[0].calendarDownloadUrl).pathname
  const calendarBeforeRestart = await (await request(calendarPath)).text()
  assert.match(calendarBeforeRestart, /SUMMARY:Picnic/)
  assert.equal(new URL(invite.inviteUrl).origin, 'https://huddled.example.test')
  assert.match(await readFile(join(dataDir, 'sessions.json'), 'utf8'), new RegExp(invite.sessionId))
  await stop()
  base = await start()
  assert.equal(await (await request(calendarPath)).text(), calendarBeforeRestart, 'Migrated calendar links persist across restarts')
  assert.equal((await request('/api/extension/sessions/' + invite.sessionId)).status, 200)
})
