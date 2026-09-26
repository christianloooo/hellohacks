import './App.css'

function App() {
  return (
    <main className="prototype">
      <div className="eyebrow">IMESSAGE MINI GAMES</div>
      <h1>HelloHacks</h1>
      <p className="intro">Little games for the conversations you already have.</p>
      <section className="game-card" aria-label="Tic-tac-toe preview">
        <div className="card-heading"><span>QUICK PLAY</span><span className="online"><i /> READY</span></div>
        <h2>Tic-tac-toe</h2>
        <p>Challenge a friend without leaving your chat.</p>
        <div className="board" aria-hidden="true">
          <span className="x">×</span><span /><span className="o">○</span>
          <span /><span className="x">×</span><span />
          <span className="o">○</span><span /><span className="x">×</span>
        </div>
        <button type="button">Play in Messages <span>↗</span></button>
      </section>
      <footer>Native iOS extension project in <code>ios/</code></footer>
    </main>
  )
}

export default App
