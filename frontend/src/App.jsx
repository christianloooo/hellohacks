import { useEffect, useState } from 'react'
import './App.css'
import './theme.css'
import huddleFriends from './assets/huddle-friends.png'
import AvailabilityCalendar, { TimePreferences } from './AvailabilityCalendar'
import useAvailability from './useAvailability'

const activities = ['Food & drinks', 'Games', 'Outdoors', 'Movies', 'Live music', 'Coffee']
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.')
  return result
}
function App() {
  const [step, setStep] = useState('welcome')
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [sessionId, setSessionId] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [budget, setBudget] = useState(35)
  const [selectedActivities, setSelectedActivities] = useState(['Food & drinks', 'Outdoors'])
  const [manualAvailability, setManualAvailability] = useState([])
  const [needs, setNeeds] = useState('')
  const [location, setLocation] = useState('near campus')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    async function restore() {
      let authenticatedUser = null
      try {
        const query = new URLSearchParams(window.location.search)
        if (query.get('auth') === 'cancelled') setNotice('Google connection was cancelled. You can try again or choose times manually.')
        const { user: signedInUser } = await api('/api/me')
        if (cancelled || !signedInUser) return
        authenticatedUser = signedInUser
        setUser(signedInUser)
        const querySession = new URLSearchParams(window.location.search).get('session')
        const pendingSession = querySession || localStorage.getItem('huddle_pending_session') || localStorage.getItem('huddle_active_session')
        if (pendingSession) {
          setSessionId(pendingSession)
          const joined = await api('/api/sessions/' + encodeURIComponent(pendingSession) + '/join', { method: 'POST', body: '{}' })
          if (cancelled) return
          setSession(joined.session)
          setInviteUrl(joined.session.inviteUrl)
          localStorage.setItem('huddle_active_session', pendingSession)
          const preferences = joined.session.participants.find((person) => person.isYou)?.preferences
          if (preferences) {
            setBudget(preferences.budget); setSelectedActivities(preferences.interests)
            setManualAvailability(preferences.manualAvailability); setNeeds(preferences.needs); setLocation(preferences.location)
          }
          const url = new URL(window.location.href)
          url.searchParams.delete('session')
          history.replaceState({}, '', url.pathname + url.search)
          localStorage.removeItem('huddle_pending_session')
          setStep(preferences ? 'submitted' : 'preferences')
        } else setStep('home')
      } catch (err) {
        localStorage.removeItem('huddle_active_session'); localStorage.removeItem('huddle_pending_session')
        if (!cancelled && authenticatedUser && err.message.includes('Planning session not found')) {
          setSession(null); setSessionId(''); setStep('home')
          const url = new URL(window.location.href)
          url.searchParams.delete('session')
          history.replaceState({}, '', url.pathname + url.search)
          setNotice('You’re signed in, but that group invite is no longer valid. Ask for a fresh invite or create a new group plan.')
        } else if (!cancelled) setError(err.message)
      }
    }
    restore()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!sessionId || !user) return
    let cancelled = false
    let timer
    async function poll() {
      try {
        const result = await api('/api/sessions/' + encodeURIComponent(sessionId))
        if (!cancelled) { setSession(result.session); setInviteUrl(result.session.inviteUrl) }
      } catch (err) { if (!cancelled) setError(err.message) }
      if (!cancelled) timer = setTimeout(poll, 4000)
    }
    timer = setTimeout(poll, 4000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [sessionId, user])

  const availabilityRevision = JSON.stringify(session?.participants.map(person => [person.name, person.calendarConnected, person.preferences?.manualAvailability]))
  const availability = useAvailability(sessionId, availabilityRevision)

  const responseCount = session?.participants.filter((person) => person.preferences).length || 0
  const myCalendar = availability.data?.people.find(person => person.isYou)
  const calendarCheckFailed = user?.calendarConnected && myCalendar?.status === 'error'
  const canSavePreferences = Boolean(manualAvailability.length || (user?.calendarConnected && !calendarCheckFailed))
  const inviteIsLocal = inviteUrl.includes('localhost') || inviteUrl.includes('127.0.0.1')
  function signIn() {
    const querySession = new URLSearchParams(window.location.search).get('session')
    const sessionToRestore = querySession || sessionId
    if (sessionToRestore) localStorage.setItem('huddle_pending_session', sessionToRestore)
    window.location.assign('/auth/google' + (sessionToRestore ? '?session=' + encodeURIComponent(sessionToRestore) : ''))
  }
  async function beginDemo() {
    setError(''); setLoading(true)
    try {
      const invitedSession = new URLSearchParams(window.location.search).get('session')
      const result = await api('/api/demo/session', { method: 'POST', body: JSON.stringify(invitedSession ? { sessionId: invitedSession } : {}) })
      localStorage.removeItem('huddle_pending_session')
      setUser(result.user); setSessionId(result.sessionId)
      localStorage.setItem('huddle_active_session', result.sessionId)
      const loaded = await api('/api/sessions/' + result.sessionId + '/join', { method: 'POST', body: '{}' })
      setSession(loaded.session); setInviteUrl(loaded.session.inviteUrl); setStep('preferences')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  async function createSession() {
    setError(''); setLoading(true)
    try {
      const result = await api('/api/sessions', { method: 'POST', body: '{}' })
      setSessionId(result.sessionId); setInviteUrl(result.inviteUrl)
      localStorage.setItem('huddle_active_session', result.sessionId)
      const loaded = await api('/api/sessions/' + result.sessionId + '/join', { method: 'POST', body: '{}' })
      setSession(loaded.session); setStep('preferences')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  function toggleActivity(activity) {
    setSelectedActivities((current) => current.includes(activity) ? current.filter((item) => item !== activity) : [...current, activity])
  }
  async function savePreferences() {
    setError(''); setLoading(true)
    try {
      const result = await api('/api/sessions/' + sessionId + '/preferences', { method: 'PUT', body: JSON.stringify({ interests: selectedActivities, budget, needs, location, manualAvailability }) })
      setSession(result.session); setNotice('Your preferences are saved. Ideas generate when everyone who joined is ready.'); setStep('submitted')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  async function generateIdeas() {
    setError(''); setNotice(''); setLoading(true)
    try {
      const result = await api('/api/sessions/' + encodeURIComponent(sessionId) + '/plans', { method: 'POST', body: '{}' })
      setSession(result.session)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  async function copyText(value, success) {
    try { await navigator.clipboard.writeText(value); setNotice(success) }
    catch { setError('Clipboard access was blocked. Copy the invite or plan text from the screen.') }
  }
  async function shareInvite() {
    if (!inviteUrl) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'HUDDLE group invite', text: 'Join our HUDDLE and add your preferences and availability.', url: inviteUrl })
        setNotice('Invite shared.')
      } catch (err) { if (err.name !== 'AbortError') setError('Could not open sharing. Copy the invite link instead.') }
    } else await copyText(inviteUrl, 'Invite link copied. Paste it into your group chat.')
  }
  async function signOut() {
    await api('/api/logout', { method: 'POST', body: '{}' })
    localStorage.removeItem('huddle_active_session'); localStorage.removeItem('huddle_pending_session')
    setUser(null); setSession(null); setSessionId(''); setStep('welcome')
  }
  const onInvitePage = new URLSearchParams(window.location.search).has('session')

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setStep(user ? 'home' : 'welcome') }}>
          <span className="brand-mark">✦</span><span>HUDDLE</span>
        </a>
        <span className="demo-pill"><i /> GROUP HANGOUT PLANNER</span>
      </header>
      <section className={'content ' + (['preferences', 'submitted'].includes(step) ? 'content-wide' : '')} aria-live="polite">
        {step === 'welcome' && (
          <div className="welcome view-card">
            <img className="welcome-art" src={huddleFriends} alt="HUDDLE’s hand-drawn crew: three friends ready for a hangout" width="319" height="327" />
            <p className="eyebrow">GOOD PLANS, MADE TOGETHER</p>
            <h1>{onInvitePage ? 'Join the group’s' : 'Make your group chat'}<br /><em>{onInvitePage ? 'hangout plan.' : 'go somewhere.'}</em></h1>
            <p className="subhead">Share your interests, budget, needs, and availability. HUDDLE finds ideas your group can enjoy together.</p>
            <button className="google-button" onClick={signIn}><span className="google-g">G</span> Continue with Google</button>
            <p className="fine-print">Group members can see your unavailable time blocks. Event details stay private.</p>
            <button className="demo-link" onClick={beginDemo} disabled={loading}>{loading ? 'Opening demo…' : 'Try a group demo'}</button>
            <div className="trust-row"><span>✧</span> You choose what to share <b>·</b> No chat-history reading</div>
          </div>
        )}
        {step === 'home' && (
          <div className="view-card home-card">
            <img className="home-art" src={huddleFriends} alt="The HUDDLE crew" width="319" height="327" />
            <p className="eyebrow">WELCOME, {user?.name?.toUpperCase() || 'FRIEND'}</p>
            <h1>Plan something<br /><em>together.</em></h1>
            <p className="subhead align-left">Start a group session, then invite everyone with a link. Each person adds their own preferences and availability.</p>
            <button className="primary-button" onClick={createSession} disabled={loading}>{loading ? 'Starting…' : 'Create a group plan'} <span>→</span></button>
            <div className="calendar-connect connected">
              <div className="calendar-icon">▦</div><div className="calendar-copy"><strong>Google Calendar</strong><span>{user?.calendarConnected ? 'Connected · free/busy access' : 'Not connected · add times manually'}</span></div>
              <button className="connect-button" onClick={signIn}>{user?.calendarConnected ? 'Reconnect' : 'Connect'}</button>
            </div>
            <button className="demo-link" onClick={signOut}>Sign out</button>
          </div>
        )}
        {step === 'preferences' && (
          <div className="preferences view-card">
            <button className="back-link" onClick={() => setStep('home')}>← Back</button>
            <p className="eyebrow">YOUR GROUP · {responseCount} RESPONDED</p>
            <h1>Add your<br /><em>preferences.</em></h1>
            <p className="subhead">Everyone submits their own choices. HUDDLE compares them for the group.</p>
            <section className="invite-panel" aria-label="Invite group members">
              <div className="section-label">INVITE YOUR GROUP</div>
              <p>Invite everyone with this link. Each person opens it, signs in with their own Google account, connects Calendar or selects free time blocks, then saves their preferences. Their name appears here after they join.</p>
              {inviteUrl && <>
                <input className="text-input" aria-label="Group invite link" value={inviteUrl} readOnly onFocus={(event) => event.target.select()} />
                <button className="secondary-button" onClick={shareInvite}>Share invite with friends</button>
                {inviteIsLocal && <p className="local-invite-warning">This is a localhost link. It works on this computer and its simulator, but your friends’ devices will open their own localhost. To invite them remotely, the website and backend need public HTTPS URLs.</p>}
              </>}
              <p className="invite-progress">{session?.participants.length || 1} joined · {responseCount} saved preferences</p>
            </section>
            <p className="fine-print">Saved preferences and shared available times are sent to OpenAI to suggest activities. Group members see your unavailable blocks. Calendar event details are never read.</p>
            <div className="section-label">WHAT SOUNDS FUN?</div>
            <div className="activity-grid">{activities.map((activity) => <button key={activity} className={'activity-chip ' + (selectedActivities.includes(activity) ? 'active' : '')} onClick={() => toggleActivity(activity)}><span>{activityEmoji(activity)}</span>{activity}</button>)}</div>
            <div className="budget-heading"><div><div className="section-label">YOUR BUDGET PER PERSON</div><span className="muted">HUDDLE will look for affordable matches</span></div><strong>{'$' + budget}</strong></div>
            <input aria-label="Maximum budget per person" className="budget-slider" type="range" min="10" max="100" step="5" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
            <div className="range-labels"><span>$10</span><span>$100</span></div>
            <label className="form-label">Preferred area<input className="text-input" value={location} maxLength={80} onChange={(event) => setLocation(event.target.value)} placeholder="Near campus" /></label>
            <label className="form-label">Needs to consider<input className="text-input" value={needs} maxLength={240} onChange={(event) => setNeeds(event.target.value)} placeholder="Food, access, travel, or other needs" /></label>
            <div className="section-label time-label">WHEN ARE YOU FREE?</div>
            <TimePreferences availability={availability} values={manualAvailability} onChange={setManualAvailability} />
            <div className={'calendar-connect ' + (user?.calendarConnected ? 'connected' : '')}>
              <div className="calendar-icon">▦</div><div className="calendar-copy"><strong>{user?.calendarConnected ? 'Google Calendar connected' : 'Check calendar availability'}</strong><span>{user?.calendarConnected ? 'Checks your primary calendar and selected calendars you own' : 'Connect securely or use your selected times'}</span></div>
              <button className="connect-button" onClick={signIn}>{user?.calendarConnected ? 'Reconnect' : 'Connect'}</button>
            </div>
            {!canSavePreferences && <p className="availability-required">{calendarCheckFailed ? 'Calendar is connected but could not be checked. Select at least one time block you know you can attend to continue.' : 'Select at least one free time block above, or connect Google Calendar, before saving.'}</p>}
            <button className="primary-button" onClick={savePreferences} disabled={loading || !canSavePreferences}>{loading ? 'Saving…' : 'Save my preferences'} <span>→</span></button>
          </div>
        )}
        {step === 'submitted' && (
          <div className="view-card shared">
            <div className="shared-check">✓</div>
            <p className="eyebrow">HUDDLE · {sessionId}</p>
            <h1>You’re in,<br /><em>{user?.name?.split(' ')[0] || 'friend'}.</em></h1>
            <p className="subhead">Invite your friends to this group. Once everyone who joins saves preferences and availability, HUDDLE generates activities you can share here or in Messages.</p>
            <div className="responses-panel">
              <strong>{responseCount} of {session?.participants.length || 0} people have saved preferences</strong>
              {session?.participants.map((person, index) => <p key={index}>{person.name}{person.isYou ? ' (you)' : ''} · {person.preferences ? 'Preferences saved' : 'Waiting for preferences'} · {person.calendarConnected ? 'Calendar connected' : person.preferences?.manualAvailability.length ? 'Times selected' : 'Needs availability'}</p>)}
            </div>
            <AvailabilityCalendar availability={availability} />
            {session?.generationStatus === 'generating' && <p className="mode-note" role="status">Checking shared availability and generating activities…</p>}
            {!session?.ready && <p className="mode-note">Waiting for everyone to save preferences and connect Calendar or choose available times.</p>}
            {session?.generationError && <p className="tradeoff-note" role="alert">{session.generationError}</p>}
            {!!session?.plans.length && <><p className="mode-note">AI suggestions · Estimated costs in CAD · Times in {session.plans[0].timeZone}</p><div className="idea-list">{session.plans.map((plan) => <article className="idea-card" key={plan.id}><span className="idea-emoji">{plan.emoji}</span><div className="idea-details"><strong>{plan.title}</strong><span>{plan.time} · about ${plan.price}/person</span><span>{plan.detail}</span><small>{plan.rationale}</small><button className="secondary-button" onClick={() => copyText(plan.title + ' · ' + plan.time + ' (' + plan.timeZone + ') · about $' + plan.price + '/person · ' + plan.location, 'Plan copied. Share it in your group chat.')}>Copy plan</button></div></article>)}</div></>}
            {!session?.plans.length && session?.ready && <button className="primary-button" disabled={loading || session?.generationStatus === 'generating'} onClick={generateIdeas}>{loading || session?.generationStatus === 'generating' ? 'Generating…' : 'Generate ideas'}</button>}
            <button className="secondary-button" onClick={signIn}>{user?.calendarConnected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</button>
            {inviteUrl && <button className="secondary-button" onClick={() => copyText(inviteUrl, 'Invite link copied. Share it in your group chat.')}>Copy group invite link <span>↗</span></button>}
            <button className="primary-button" onClick={() => setStep('preferences')}>Edit my preferences</button>
          </div>
        )}
      </section>
      {(error || notice) && <div className={error ? 'toast error-toast' : 'toast'} role="status">{error || notice}<button onClick={() => { setError(''); setNotice('') }}>×</button></div>}
      <footer className="footer"><span>HUDDLE</span><span>Plan together, effortlessly.</span><span>iMessage group planner</span></footer>
    </main>
  )
}
function activityEmoji(activity) {
  return ({ 'Food & drinks': '🍜', Games: '🎳', Outdoors: '🌿', Movies: '🎬', 'Live music': '🎵', Coffee: '☕' })[activity]
}
export default App
