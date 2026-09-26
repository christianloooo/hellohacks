import { useState } from 'react'
import './App.css'

const activities = ['Food & drinks', 'Games', 'Outdoors', 'Movies', 'Live music', 'Coffee']
const ideas = [
  { emoji: '🍜🎳', name: 'Ramen + Bowling', time: 'Saturday · 6:00 PM', price: 42, tags: ['Food & drinks', 'Games'] },
  { emoji: '🍣📸', name: 'Sushi + Photo booth', time: 'Saturday · 7:00 PM', price: 36, tags: ['Food & drinks'] },
  { emoji: '🌳☕', name: 'Park picnic + Coffee', time: 'Sunday · 11:00 AM', price: 24, tags: ['Outdoors', 'Coffee'] },
  { emoji: '☕🚶', name: 'Coffee + Park walk', time: 'Sunday · 10:00 AM', price: 18, tags: ['Outdoors', 'Coffee'] },
]

function App() {
  const [step, setStep] = useState('welcome')
  const [budget, setBudget] = useState(50)
  const [selectedActivities, setSelectedActivities] = useState(['Food & drinks', 'Games'])
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState(0)

  function toggleActivity(activity) {
    setSelectedActivities((current) => current.includes(activity)
      ? current.filter((item) => item !== activity)
      : [...current, activity])
  }

  const matchedIdeas = ideas
    .filter((idea) => idea.price <= budget + 5)
    .sort((first, second) => {
      const firstMatches = first.tags.filter((tag) => selectedActivities.includes(tag)).length
      const secondMatches = second.tags.filter((tag) => selectedActivities.includes(tag)).length
      return secondMatches - firstMatches
    })

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" onClick={() => setStep('welcome')}>
          <span className="brand-mark">✦</span><span>hangout<span className="brand-ai"> AI</span></span>
        </a>
        <span className="demo-pill"><i /> INTERACTIVE PREVIEW</span>
      </header>

      <section className="content" aria-live="polite">
        {step === 'welcome' && (
          <div className="welcome view-card">
            <div className="sparkle-orbit"><span>✦</span><i>✦</i><b>✦</b></div>
            <p className="eyebrow">GOOD PLANS, MADE TOGETHER</p>
            <h1>Make your group chat<br /><em>go somewhere.</em></h1>
            <p className="subhead">Tell us what your crew likes. We’ll find hangout ideas that fit everyone’s budget and schedule.</p>
            <button className="google-button" onClick={() => setStep('preferences')}>
              <span className="google-g">G</span> Continue with Google <span className="demo-label">DEMO</span>
            </button>
            <p className="fine-print">Demo only · Google sign-in and calendar access aren’t connected yet.</p>
            <div className="trust-row"><span>✧</span> Your calendar stays private <b>·</b> Your plans stay in the chat</div>
          </div>
        )}

        {step === 'preferences' && (
          <div className="preferences view-card">
            <button className="back-link" onClick={() => setStep('welcome')}>← Back</button>
            <p className="eyebrow">MAKE IT YOURS · 1 OF 2</p>
            <h1>What does your<br /><em>group enjoy?</em></h1>
            <p className="subhead">Choose a few things. Everyone in the chat can add their own preferences.</p>

            <div className="section-label">YOUR GROUP’S VIBE</div>
            <div className="activity-grid">
              {activities.map((activity) => (
                <button key={activity} className={`activity-chip ${selectedActivities.includes(activity) ? 'active' : ''}`} onClick={() => toggleActivity(activity)}>
                  <span>{activityEmoji(activity)}</span>{activity}
                </button>
              ))}
            </div>

            <div className="budget-heading"><div><div className="section-label">BUDGET PER PERSON</div><span className="muted">Keep ideas in everyone’s range</span></div><strong>${budget}</strong></div>
            <input aria-label="Maximum budget per person" className="budget-slider" type="range" min="20" max="100" step="5" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
            <div className="range-labels"><span>$20</span><span>$100+</span></div>

            <div className={`calendar-connect ${calendarConnected ? 'connected' : ''}`}>
              <div className="calendar-icon">▦</div>
              <div className="calendar-copy"><strong>{calendarConnected ? 'Calendar connected' : 'Find a time that works'}</strong><span>{calendarConnected ? 'Demo connection · no events read' : 'Connect Google Calendar to check availability'}</span></div>
              <button className="connect-button" onClick={() => setCalendarConnected((value) => !value)}>{calendarConnected ? 'Connected ✓' : 'Connect'}</button>
            </div>
            <p className="fine-print align-left">Calendar connection is a preview. No Google account or event data is accessed.</p>
            <button className="primary-button" onClick={() => setStep('ideas')}>Find ideas <span>→</span></button>
          </div>
        )}

        {step === 'ideas' && (
          <div className="ideas view-card">
            <button className="back-link" onClick={() => setStep('preferences')}>← Edit preferences</button>
            <p className="eyebrow">A FEW IDEAS FOR YOUR CREW</p>
            <h1>Your next<br /><em>good time.</em></h1>
            <p className="subhead">Based on your demo preferences · Connect calendars to check real availability.</p>
            <div className="idea-list">
              {matchedIdeas.map((idea, index) => (
                <button key={idea.name} className={`idea-card ${selectedIdea === index ? 'selected' : ''}`} onClick={() => setSelectedIdea(index)}>
                  <span className="idea-emoji">{idea.emoji}</span>
                  <span className="idea-details"><strong>{idea.name}</strong><span>▦ &nbsp;{idea.time}</span><span>♙ &nbsp;~${idea.price} / person</span></span>
                  <span className="radio-check">{selectedIdea === index ? '✓' : ''}</span>
                </button>
              ))}
            </div>
            <button className="primary-button" onClick={() => setStep('shared')}>Share this idea <span>→</span></button>
            <p className="fine-print">Ideas are examples for this preview. Real suggestions need group preferences and calendar access.</p>
          </div>
        )}

        {step === 'shared' && (
          <div className="view-card shared">
            <div className="shared-check">✓</div>
            <p className="eyebrow">READY FOR THE GROUP CHAT</p>
            <h1>Let’s make<br /><em>it happen.</em></h1>
            <p className="subhead">Send this idea to Messages so your group can weigh in.</p>
            <div className="share-preview"><span>{matchedIdeas[selectedIdea]?.emoji}</span><div><strong>{matchedIdeas[selectedIdea]?.name}</strong><small>{matchedIdeas[selectedIdea]?.time} · ~${matchedIdeas[selectedIdea]?.price}/person</small></div></div>
            <button className="primary-button" onClick={() => setStep('welcome')}>Back to start <span>↗</span></button>
          </div>
        )}
      </section>

      <footer className="footer"><span>hangout AI</span><span>Plan together, effortlessly.</span><span>iMessage extension concept</span></footer>
    </main>
  )
}

function activityEmoji(activity) {
  return ({ 'Food & drinks': '🍜', Games: '🎳', Outdoors: '🌿', Movies: '🎬', 'Live music': '🎵', Coffee: '☕' })[activity]
}

export default App
