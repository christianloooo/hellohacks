import { useEffect, useState } from 'react'
import './App.css'

const activities = ['Food & drinks', 'Games', 'Outdoors', 'Movies', 'Live music', 'Coffee']
const timeOptions = [
  ['saturday-afternoon', 'Saturday afternoon'],
  ['saturday-evening', 'Saturday evening'],
  ['sunday-afternoon', 'Sunday afternoon'],
  ['sunday-evening', 'Sunday evening'],
  ['friday-evening', 'Friday evening'],
]
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
  const [selectedPlanId, setSelectedPlanId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [planMode, setPlanMode] = useState('')

  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const { user: signedInUser } = await api('/api/me')
        if (cancelled || !signedInUser) return
        setUser(signedInUser)
        const querySession = new URLSearchParams(window.location.search).get('session')
        const pendingSession = querySession || localStorage.getItem('huddle_pending_session')
        if (pendingSession) {
          setSessionId(pendingSession)
          const joined = await api('/api/sessions/' + encodeURIComponent(pendingSession) + '/join', { method: 'POST', body: '{}' })
          if (cancelled) return
          setSession(joined.session)
          const url = new URL(window.location.href)
          url.searchParams.delete('session')
          history.replaceState({}, '', url.pathname + url.search)
          localStorage.removeItem('huddle_pending_session')
          setStep('preferences')
        } else setStep('home')
      } catch (err) { if (!cancelled) setError(err.message) }
    }
    restore()
    return () => { cancelled = true }
  }, [])

  const responseCount = session?.participants.filter((person) => person.preferences).length || 0
  const plans = session?.plans || []
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0]
  function signIn() {
    const querySession = new URLSearchParams(window.location.search).get('session')
    const sessionToRestore = querySession || sessionId
    if (sessionToRestore) localStorage.setItem('huddle_pending_session', sessionToRestore)
    window.location.assign('/auth/google')
  }
  async function beginDemo() {
    setError(''); setLoading(true)
    try {
      const result = await api('/api/demo/session', { method: 'POST', body: '{}' })
      setUser(result.user); setSessionId(result.sessionId)
      setInviteUrl(window.location.origin + '/?session=' + encodeURIComponent(result.sessionId))
      const loaded = await api('/api/sessions/' + result.sessionId + '/join', { method: 'POST', body: '{}' })
      setSession(loaded.session); setStep('preferences')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  async function createSession() {
    setError(''); setLoading(true)
    try {
      const result = await api('/api/sessions', { method: 'POST', body: '{}' })
      setSessionId(result.sessionId); setInviteUrl(result.inviteUrl)
      const loaded = await api('/api/sessions/' + result.sessionId + '/join', { method: 'POST', body: '{}' })
      setSession(loaded.session); setStep('preferences')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  function toggleActivity(activity) {
    setSelectedActivities((current) => current.includes(activity) ? current.filter((item) => item !== activity) : [...current, activity])
  }
  function toggleTime(value) {
    setManualAvailability((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }
  async function savePreferences() {
    setError(''); setLoading(true)
    try {
      const result = await api('/api/sessions/' + sessionId + '/preferences', { method: 'PUT', body: JSON.stringify({ interests: selectedActivities, budget, needs, location, manualAvailability }) })
      setSession(result.session); setNotice('Your preferences are saved for this group.'); setStep('ideas')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  async function refreshSession() {
    const result = await api('/api/sessions/' + sessionId)
    setSession(result.session)
  }
  async function findPlans() {
    setError(''); setLoading(true)
    try {
      const result = await api('/api/sessions/' + sessionId + '/plans', { method: 'POST', body: '{}' })
      setPlanMode(result.planMode); await refreshSession(); setSelectedPlanId(0)
      setNotice(result.availableTimeFound ? 'Plans use your group’s shared availability.' : 'No shared slot matched; showing the nearest suggested window.')
      if (result.calendarWarnings?.length) setNotice('Some calendars could not be checked. Add manual availability or reconnect Google Calendar.')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  async function vote(planId) {
    setError(''); setSelectedPlanId(planId)
    try {
      const result = await api('/api/sessions/' + sessionId + '/vote', { method: 'POST', body: JSON.stringify({ planId }) })
      setSession(result.session); setNotice('Your vote is saved.')
    } catch (err) { setError(err.message) }
  }
  async function copyText(value, success) {
    try { await navigator.clipboard.writeText(value); setNotice(success) }
    catch { setError('Clipboard access was blocked. Copy the invite or plan text from the screen.') }
  }
  async function signOut() {
    await api('/api/logout', { method: 'POST', body: '{}' })
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
      <section className="content" aria-live="polite">
        {step === 'welcome' && (
          <div className="welcome view-card">
            <div className="sparkle-orbit"><span>✦</span><i>✦</i><b>✦</b></div>
            <p className="eyebrow">GOOD PLANS, MADE TOGETHER</p>
            <h1>{onInvitePage ? 'Join the group’s' : 'Make your group chat'}<br /><em>{onInvitePage ? 'hangout plan.' : 'go somewhere.'}</em></h1>
            <p className="subhead">Share your interests, budget, needs, and availability. HUDDLE finds ideas your group can enjoy together.</p>
            <button className="google-button" onClick={signIn}><span className="google-g">G</span> Continue with Google</button>
            <p className="fine-print">Calendar access is used only to check free/busy times.</p>
            <button className="demo-link" onClick={beginDemo} disabled={loading}>{loading ? 'Opening demo…' : 'Try a group demo'}</button>
            <div className="trust-row"><span>✧</span> You choose what to share <b>·</b> No chat-history reading</div>
          </div>
        )}
        {step === 'home' && (
          <div className="view-card">
            <p className="eyebrow">WELCOME, {user?.name?.toUpperCase() || 'FRIEND'}</p>
            <h1>Plan something<br /><em>together.</em></h1>
            <p className="subhead align-left">Start a group session, then invite everyone with a link. Each person adds their own preferences and availability.</p>
            <button className="primary-button" onClick={createSession} disabled={loading}>{loading ? 'Starting…' : 'Create a group plan'} <span>→</span></button>
            <div className="calendar-connect connected">
              <div className="calendar-icon">▦</div><div className="calendar-copy"><strong>Google Calendar</strong><span>{user?.calendarConnected ? 'Connected · free/busy access' : 'Not connected · add times manually'}</span></div>
              {!user?.calendarConnected && <button className="connect-button" onClick={signIn}>Connect</button>}
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
            <div className="section-label">WHAT SOUNDS FUN?</div>
            <div className="activity-grid">{activities.map((activity) => <button key={activity} className={'activity-chip ' + (selectedActivities.includes(activity) ? 'active' : '')} onClick={() => toggleActivity(activity)}><span>{activityEmoji(activity)}</span>{activity}</button>)}</div>
            <div className="budget-heading"><div><div className="section-label">YOUR BUDGET PER PERSON</div><span className="muted">HUDDLE will look for affordable matches</span></div><strong>{'$' + budget}</strong></div>
            <input aria-label="Maximum budget per person" className="budget-slider" type="range" min="10" max="100" step="5" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
            <div className="range-labels"><span>$10</span><span>$100</span></div>
            <label className="form-label">Preferred area<input className="text-input" value={location} maxLength={80} onChange={(event) => setLocation(event.target.value)} placeholder="Near campus" /></label>
            <label className="form-label">Needs to consider<input className="text-input" value={needs} maxLength={240} onChange={(event) => setNeeds(event.target.value)} placeholder="Food, access, travel, or other needs" /></label>
            <div className="section-label time-label">WHEN ARE YOU FREE?</div>
            <p className="muted">Choose times manually, or let Google Calendar check free/busy.</p>
            <div className="time-grid">{timeOptions.map(([value, label]) => <button key={value} className={'time-chip ' + (manualAvailability.includes(value) ? 'active' : '')} onClick={() => toggleTime(value)}>{label}</button>)}</div>
            <div className={'calendar-connect ' + (user?.calendarConnected ? 'connected' : '')}>
              <div className="calendar-icon">▦</div><div className="calendar-copy"><strong>{user?.calendarConnected ? 'Google Calendar connected' : 'Check calendar availability'}</strong><span>{user?.calendarConnected ? 'HUDDLE checks free/busy only' : 'Connect securely or use your selected times'}</span></div>
              {!user?.calendarConnected && <button className="connect-button" onClick={signIn}>Connect</button>}
            </div>
            {inviteUrl && <button className="secondary-button" onClick={() => copyText(inviteUrl, 'Invite link copied. Share it in your group chat.')}>Copy group invite link</button>}
            <button className="primary-button" onClick={savePreferences} disabled={loading}>{loading ? 'Saving…' : 'Save my preferences'} <span>→</span></button>
          </div>
        )}
        {step === 'ideas' && (
          <div className="ideas view-card">
            <button className="back-link" onClick={() => setStep('preferences')}>← Edit my preferences</button>
            <p className="eyebrow">GROUP MATCH · {responseCount} RESPONSES</p>
            <h1>Ideas for<br /><em>your group.</em></h1>
            <p className="subhead align-left">{session?.participants.length || 1} people in this planning session. Options use preferences people shared.</p>
            <div className="group-status">
              <strong>{responseCount} of {session?.participants.length || 1} responded</strong>
              <div className="progress-track"><span style={{ width: Math.max(8, Math.round(100 * responseCount / (session?.participants.length || 1))) + '%' }} /></div>
              <span className="muted">{session?.participants.map((person) => person.name + (person.preferences ? ' ✓' : ' · waiting')).join('  ')}</span>
            </div>
            {plans.length > 0 ? (
              <>
                <div className="mode-note">{planMode === 'ai' || session?.planMode === 'ai' ? 'AI-written explanations · options checked against group rules' : 'Preference-matched ideas · AI explanations use a server key when configured'}</div>
                <div className="idea-list">{plans.map((plan) => <button key={plan.id} className={'idea-card ' + (selectedPlan?.id === plan.id ? 'selected' : '')} onClick={() => setSelectedPlanId(plan.id)}>
                  <span className="idea-emoji">{plan.emoji}</span><span className="idea-details"><strong>{plan.title}</strong><span>{plan.time} · {'~$' + plan.price + '/person'}</span><span>{plan.matchCount}/{plan.participantCount} preferences fit · {plan.location}</span><small>{plan.rationale}</small></span><span className="radio-check">{selectedPlan?.id === plan.id ? '✓' : ''}</span>
                </button>)}</div>
                <button className="primary-button" onClick={() => selectedPlan && vote(selectedPlan.id)}>Vote for this plan <span>→</span></button>
                {selectedPlan && <button className="secondary-button" onClick={() => copyText(selectedPlan.title + ' · ' + selectedPlan.time + ' · about $' + selectedPlan.price + ' per person', 'Plan text copied. Paste it into Messages.')}>Copy plan for Messages</button>}
                <div className="vote-summary">Votes: {Object.values(session?.votes || {}).filter((voteId) => voteId === selectedPlan?.id).length} for this idea</div>
              </>
            ) : (
              <div className="empty-plans"><p>Once people add preferences, HUDDLE can compare the group.</p><button className="primary-button" onClick={findPlans} disabled={loading}>{loading ? 'Finding a match…' : 'Find plans'} <span>→</span></button><button className="secondary-button" onClick={() => copyText(inviteUrl || window.location.href, 'Invite link copied. Share it in Messages.')}>Invite the group</button></div>
            )}
            <button className="secondary-button" onClick={refreshSession}>Refresh group responses</button>
            <button className="demo-link" onClick={() => setStep('preferences')}>Update my answers</button>
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
