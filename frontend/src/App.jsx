import { useEffect, useMemo, useState } from 'react'
import './App.css'

const activityOptions = [
  { id: 'outdoors', label: 'Outdoors', emoji: '🌿' },
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'games', label: 'Games', emoji: '🎳' },
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'relax', label: 'Low-key', emoji: '☕' },
]
const timeOptions = [
  { id: 'sat-evening', label: 'Saturday evening' },
  { id: 'sun-morning', label: 'Sunday morning' },
  { id: 'sun-afternoon', label: 'Sunday afternoon' },
]

function upcomingTimeSlots() {
  const now = new Date()
  return [
    { id: 'sat-evening', day: 6, start: [17, 0], end: [22, 0] },
    { id: 'sun-morning', day: 0, start: [10, 0], end: [14, 0] },
    { id: 'sun-afternoon', day: 0, start: [14, 0], end: [18, 0] },
  ].map((slot) => {
    const start = new Date(now)
    const daysAhead = (slot.day - now.getDay() + 7) % 7 || 7
    start.setDate(now.getDate() + daysAhead)
    start.setHours(...slot.start, 0, 0)
    const end = new Date(start)
    end.setHours(...slot.end, 0, 0)
    return { id: slot.id, start: start.toISOString(), end: end.toISOString() }
  })
}

async function api(path, options = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    })
  } catch {
    throw new Error('Cannot reach the HUDDLE backend. Start it in a terminal with `cd backend && npm run dev`, then reload this page.')
  }

  const contentType = response.headers.get('content-type') || ''
  let body = {}
  if (contentType.includes('application/json')) {
    try { body = await response.json() } catch {
      throw new Error(`The backend returned invalid JSON (HTTP ${response.status}). Restart it and check the backend terminal for errors.`)
    }
  } else {
    const message = (await response.text()).trim().slice(0, 180)
    if (!response.ok) {
      throw new Error(`Backend request failed (HTTP ${response.status}). ${message || 'Check that the backend is running on port 8787.'}`)
    }
    throw new Error('The backend returned a non-JSON response. Check that the Vite API proxy is configured and restart the frontend.')
  }
  if (!response.ok) throw new Error(body.error || 'Something went wrong.')
  return body
}

function App() {
  const inviteCode = new URLSearchParams(window.location.search).get('session')?.toUpperCase() || ''
  const [step, setStep] = useState('welcome')
  const [code, setCode] = useState(inviteCode)
  const [name, setName] = useState('')
  const [budget, setBudget] = useState(35)
  const [interests, setInterests] = useState(['outdoors', 'food'])
  const [needs, setNeeds] = useState('')
  const [travelMiles, setTravelMiles] = useState(5)
  const [availability, setAvailability] = useState(['sat-evening', 'sun-morning'])
  const [calendarDemo, setCalendarDemo] = useState(false)
  const [googleUser, setGoogleUser] = useState(null)
  const [googleReady, setGoogleReady] = useState(false)
  const [openAIReady, setOpenAIReady] = useState(false)
  const [checkingCalendar, setCheckingCalendar] = useState(false)
  const [ideas, setIdeas] = useState('')
  const [session, setSession] = useState(null)
  const [selectedPlan, setSelectedPlan] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const plans = session?.suggestions || []
  const selected = useMemo(() => plans.find((plan) => plan.id === selectedPlan) || plans[0], [plans, selectedPlan])

  useEffect(() => {
    if (!inviteCode) return
    setLoading(true)
    api(`/sessions/${inviteCode}`)
      .then((result) => { setSession(result); setStep('preferences') })
      .catch(() => api('/sessions', { method: 'POST', body: JSON.stringify({ code: inviteCode }) })
        .then((result) => { setSession(result); setError('You’re first! Add your preferences to start the session.'); setStep('preferences') })
        .catch((requestError) => setError(requestError.message)))
      .finally(() => setLoading(false))
  }, [inviteCode])

  useEffect(() => {
    Promise.all([api('/auth/me'), api('/health')]).then(([auth, health]) => {
      if (auth.connected) { setGoogleUser(auth); setName(auth.name || '') }
      setGoogleReady(health.googleConfigured)
      setOpenAIReady(health.openAIConfigured)
    }).catch(() => {})
  }, [])

  async function startSession(event) {
    event?.preventDefault()
    setLoading(true); setError('')
    try {
      const created = await api('/sessions', { method: 'POST', body: JSON.stringify({}) })
      setCode(created.code); setSession(created); setStep('preferences')
      window.history.replaceState({}, '', `?session=${created.code}`)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  async function openInvite(event) {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      const normalized = code.trim().toUpperCase()
      if (!normalized) throw new Error('Enter the Huddle code from your group chat.')
      const result = await api(`/sessions/${normalized}`)
      setCode(normalized); setSession(result); setStep('preferences')
      window.history.replaceState({}, '', `?session=${normalized}`)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  function toggle(setter, current, value) {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  function connectCalendarDemo() {
    const next = !calendarDemo
    setCalendarDemo(next)
    setAvailability(next ? ['sat-evening', 'sun-morning'] : [])
  }

  function beginGoogleAuth() {
    const returnPath = `${window.location.pathname}${window.location.search}`
    window.location.href = `/auth/google?return=${encodeURIComponent(returnPath)}`
  }

  async function checkGoogleCalendar() {
    if (!googleUser) return beginGoogleAuth()
    setCheckingCalendar(true); setError('')
    try {
      const result = await api('/calendar/freebusy', { method: 'POST', body: JSON.stringify({ slots: upcomingTimeSlots() }) })
      const freeSlots = result.available.filter((slot) => slot.available).map((slot) => slot.id)
      setAvailability(freeSlots); setCalendarDemo(false)
      setError(freeSlots.length ? 'Google Calendar checked. Only busy/free status was used.' : 'No free sample times found this weekend. Choose another time or adjust your availability.')
    } catch (requestError) { setError(requestError.message) }
    finally { setCheckingCalendar(false) }
  }

  async function signOutGoogle() {
    await fetch('/auth/logout', { method: 'POST' })
    setGoogleUser(null)
  }

  async function submitPreferences(event) {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      const participantIdKey = `huddle-participant-${code}`
      const participantId = localStorage.getItem(participantIdKey) || crypto.randomUUID()
      localStorage.setItem(participantIdKey, participantId)
      await api(`/sessions/${code}/responses`, {
        method: 'POST',
        body: JSON.stringify({ participantId, name, budget, interests, needs, ideas, travelMiles, availability, calendarDemo, googleConnected: Boolean(googleUser) }),
      })
      const result = await api(`/sessions/${code}/ideas`, { method: 'POST', body: JSON.stringify({}) })
      setSession(result); setSelectedPlan(result.suggestions?.[0]?.id || ''); setStep('results')
      if (result.warning) setError(result.warning)
      else if (result.source === 'sample') setError('OpenAI is not configured, so sample ideas are shown.')
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  async function copyInvite() {
    const url = new URL(window.location.href)
    url.searchParams.set('session', code)
    await navigator.clipboard?.writeText(url.toString())
    setError('Invite link copied. Paste it into your group chat.')
  }

  async function refreshGroup() {
    try {
      const result = await api(`/sessions/${code}/ideas`, { method: 'POST', body: JSON.stringify({}) })
      setSession(result)
      setSelectedPlan((current) => result.suggestions?.some((plan) => plan.id === current) ? current : result.suggestions?.[0]?.id || '')
      setError(result.source === 'sample' ? 'Group responses updated. OpenAI is not configured, so sample ideas are shown.' : 'Group responses updated and plans regenerated.')
    } catch (requestError) { setError(requestError.message) }
  }

  async function shareItinerary() {
    if (!selected) return
    const text = `HUDDLE idea: ${selected.title} · about $${selected.cost} per person · within ${selected.miles} mi. ${selected.description}`
    try {
      if (navigator.share) await navigator.share({ title: 'Our HUDDLE plan', text })
      else { await navigator.clipboard?.writeText(text); setError('Itinerary copied. Paste it into your group chat.') }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setError('Could not open the share sheet. Copy the plan details from this page.')
    }
  }

  function renderWelcome() {
    return <div className="view-card welcome">
      <div className="sparkle-orbit"><span>✦</span><i>✦</i><b>✦</b></div>
      <p className="eyebrow">GOOD PLANS, MADE TOGETHER</p>
      <h1>Make your group chat<br /><em>go somewhere.</em></h1>
      <p className="subhead">HUDDLE turns everyone’s availability, budget, and interests into a plan the group can agree on.</p>
      {inviteCode ? <button className="primary-button" onClick={() => { setCode(inviteCode); setStep('preferences') }}>Join Huddle <span>→</span></button> : <button className="primary-button" disabled={loading} onClick={startSession}>Start a Huddle <span>→</span></button>}
      <div className="divider"><span>OR JOIN YOUR GROUP</span></div>
      <form className="join-form" onSubmit={openInvite}>
        <input aria-label="Huddle invite code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Enter invite code" maxLength={8} />
        <button type="submit" disabled={loading}>Join</button>
      </form>
      <p className="fine-print">Each person adds their own preferences. No reading past messages.</p>
    </div>
  }

  function renderPreferences() {
    return <form className="view-card preferences" onSubmit={submitPreferences}>
      <div className="step-heading"><div><p className="eyebrow">HUDDLE {code && `· ${code}`}</p><h1>Add your<br /><em>two cents.</em></h1></div><span className="step-count">01 <i>/ 02</i></span></div>
      <p className="subhead">Your answers help find a plan that works for the whole crew.</p>
      <label className="field-label" htmlFor="participant-name">YOUR NAME</label>
      <input id="participant-name" className="text-input" required value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" maxLength={40} />

      <div className="section-label">WHAT SOUNDS FUN?</div>
      <div className="activity-grid">
        {activityOptions.map((item) => <button type="button" key={item.id} className={`activity-chip ${interests.includes(item.id) ? 'active' : ''}`} onClick={() => toggle(setInterests, interests, item.id)}><span>{item.emoji}</span>{item.label}</button>)}
      </div>

      <div className="budget-heading"><div><div className="section-label">BUDGET PER PERSON</div><span className="muted">What feels comfortable?</span></div><strong>${budget}</strong></div>
      <input aria-label="Budget per person" className="budget-slider" type="range" min="10" max="100" step="5" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
      <div className="range-labels"><span>$10</span><span>$100+</span></div>

      <div className="availability-heading"><div><div className="section-label">WHEN ARE YOU FREE?</div><span className="muted">Pick any times that work</span></div><div className="calendar-actions">
        {googleUser && <button type="button" className="plain-action" onClick={signOutGoogle}>Sign out</button>}
        <button type="button" className={`calendar-connect ${calendarDemo || googleUser ? 'connected' : ''}`} disabled={checkingCalendar} onClick={googleUser ? checkGoogleCalendar : googleReady ? beginGoogleAuth : connectCalendarDemo}><span>▦</span>{checkingCalendar ? 'Checking…' : googleUser ? 'Check my Google Calendar' : googleReady ? 'Connect Google Calendar' : calendarDemo ? 'Reset sample calendar' : 'Try sample calendar'}</button>
      </div></div>
      <div className="time-list">{timeOptions.map((item) => <label key={item.id} className="time-option"><input type="checkbox" checked={availability.includes(item.id)} onChange={() => toggle(setAvailability, availability, item.id)} /><span>{item.label}</span></label>)}</div>
      {googleUser && <p className="fine-print align-left">Signed in as {googleUser.email || googleUser.name}. Sign-in is remembered on this browser. Only free/busy availability is requested.</p>}
      {calendarDemo && <p className="fine-print align-left">Simulated availability only. HUDDLE has not accessed your Google Calendar.</p>}

      <label className="field-label needs-label" htmlFor="ideas">IDEAS YOU’D LIKE TO TRY <span>OPTIONAL</span></label>
      <textarea id="ideas" className="text-input needs-input" value={ideas} onChange={(event) => setIdeas(event.target.value)} placeholder="Karaoke, escape room, beach picnic…" maxLength={600} rows={2} />

      <label className="field-label needs-label" htmlFor="needs">FOOD, ACCESS, OR OTHER NEEDS <span>OPTIONAL</span></label>
      <textarea id="needs" className="text-input needs-input" value={needs} onChange={(event) => setNeeds(event.target.value)} placeholder="Vegetarian, step-free access, nut allergy…" maxLength={300} rows={2} />
      <label className="field-label travel-label" htmlFor="travel">HOW FAR WOULD YOU TRAVEL? <strong>{travelMiles} mi</strong></label>
      <input id="travel" aria-label="Maximum travel distance in miles" className="budget-slider" type="range" min="1" max="25" value={travelMiles} onChange={(event) => setTravelMiles(Number(event.target.value))} />
      {openAIReady ? <p className="fine-print align-left">Your interests, budget, needs, availability, and idea suggestions will go to OpenAI to make the group plans. Your name and Google identity are excluded.</p> : <p className="fine-print align-left">OpenAI is not configured yet; sample plan ideas will be used.</p>}
      <button className="primary-button" type="submit" disabled={loading || !interests.length || !availability.length}>{loading ? 'Saving preferences & making plans…' : 'Add my preferences'} <span>→</span></button>
      {session && <p className="fine-print">{session.responses.length} {session.responses.length === 1 ? 'person has' : 'people have'} added preferences so far.</p>}
    </form>
  }

  function renderResults() {
    return <div className="view-card ideas">
      <button className="back-link" onClick={() => setStep('preferences')}>← Edit my preferences</button>
      <div className="step-heading"><div><p className="eyebrow">HUDDLE · {code}</p><h1>Ideas for<br /><em>your crew.</em></h1></div><span className="member-count">♙ {session?.responses.length || 0}</span></div>
      <p className="subhead">{session?.source === 'openai' ? 'Ideas grouped by OpenAI from your submitted preferences.' : 'Sample ideas are ranked using the submitted group preferences.'} No perfect-fit claims.</p>
      <div className="participant-strip">{session?.responses.map((person) => <span key={person.id} title={`${person.name}: $${person.budget} budget`}>{person.name.slice(0, 1).toUpperCase()}</span>)}</div>
      <div className="idea-list">
        {plans.map((plan) => <button key={plan.id} className={`idea-card ${selected?.id === plan.id ? 'selected' : ''}`} onClick={() => setSelectedPlan(plan.id)}>
          <span className="idea-emoji">{plan.emoji}</span>
          <span className="idea-details"><strong>{plan.title}</strong><span>~${plan.cost} per person · within {plan.miles} mi · {timeOptions.find((time) => time.id === plan.timeSlot)?.label}</span><span>{plan.description}</span><span className="plan-reasons">{plan.rationale}</span>
            <span className="fit-badges"><i>{plan.budgetFits}/{session.responses.length} budgets</i><i>{plan.availabilityFits}/{session.responses.length} schedules</i></span>
          <span className="plan-reasons">{plan.strengths.join(' · ')}</span></span>
          <span className="radio-check">{selected?.id === plan.id ? '✓' : ''}</span>
        </button>)}
      </div>
      <div className="responses-panel"><strong>Group preferences · {session?.responses.length} submitted</strong>{session?.responses.map((person) => <p key={person.id}><span>{person.name}</span><span>${person.budget} · {person.interests.join(', ') || 'no interests selected'}{person.ideas ? ` · Ideas: ${person.ideas}` : ''}{person.needs ? ` · Needs: ${person.needs}` : ''}</span></p>)}</div>
      {selected?.compromise && <p className="tradeoff-note">No idea fits every preference yet. HUDDLE is showing the best compromise and its tradeoffs.</p>}
      <button className="secondary-button" onClick={refreshGroup}>Refresh group responses <span>↻</span></button>
      <button className="primary-button" onClick={copyInvite}>Copy group invite <span>↗</span></button>
      <button className="secondary-button" onClick={() => setStep('itinerary')}>Choose this plan <span>→</span></button>
    </div>
  }

  function renderItinerary() {
    return <div className="view-card shared">
      <div className="shared-check">✓</div><p className="eyebrow">HUDDLE · {code}</p>
      <h1>Your plan,<br /><em>together.</em></h1>
      <p className="subhead">Here’s the idea to bring back to your group chat.</p>
      {selected && <div className="share-preview"><span>{selected.emoji}</span><div><strong>{selected.title}</strong><small>About ${selected.cost} per person · within {selected.miles} mi</small><small>{selected.description}</small></div></div>}
      <div className="responses-panel"><strong>Before you go</strong><p>Confirm the time and any food or accessibility needs with your group and the venue.</p></div>
      <button className="primary-button" onClick={shareItinerary}>Share itinerary <span>↗</span></button>
      <button className="secondary-button" onClick={() => setStep('results')}>Back to plan options</button>
    </div>
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); setStep('welcome') }}><span className="brand-mark">✦</span><span>HUDDLE</span></a><span className="demo-pill"><i /> HACKATHON PREVIEW</span></header>
    <section className="content" aria-live="polite">
      {loading && step === 'welcome' && <div className="loading-card">Loading Huddle…</div>}
      {!loading && step === 'welcome' && renderWelcome()}
      {step === 'preferences' && renderPreferences()}
      {step === 'results' && renderResults()}
      {step === 'itinerary' && renderItinerary()}
      {error && <p className={`status-message ${error.includes('copied') ? 'success' : ''}`} role="status">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></p>}
    </section>
    <footer className="footer"><span>HUDDLE</span><span>Turn everyone’s input into a plan.</span><span>Your preferences stay yours.</span></footer>
  </main>
}

export default App
