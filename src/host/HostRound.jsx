import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useRemaining } from '../net.js';
import { sfx } from '../sfx.js';
import { Avatar, Bubble, Icons, Stamp, TimerBar, TypingDots } from '../ui.jsx';

const LETTERS = ['A', 'B', 'C', 'D'];
const KICKER = { roa: 'Real or AI?', find: 'Find the real one', bluff: 'Bluff round' };

export function Round({ state, send }) {
  const r = state.round;

  // Space or Enter moves the game on, so the host never needs the mouse.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('button, input, textarea')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        send({ t: 'host:next' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${r.index}-${r.phase === 'reveal' ? 'reveal' : 'play'}`}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2em' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25 }}
      >
        {r.phase === 'reveal' ? <Reveal state={state} send={send} /> : <Playing state={state} send={send} />}
      </motion.div>
    </AnimatePresence>
  );
}

function headline(r) {
  if (r.type === 'find') return `Only one of these is really ${r.subject}.`;
  if (r.type === 'bluff' && r.phase === 'claim') return `${r.subject} knows the truth.`;
  if (r.type === 'bluff') return `Do you believe ${r.subject}?`;
  return `Did ${r.subject} really send this?`;
}

function Playing({ state, send }) {
  const r = state.round;
  const left = useRemaining(r.remainingMs, state.receivedAt, 250);
  const secs = left == null ? null : Math.ceil(left / 1000);
  const votedCount = r.voted.length;

  const lastSecs = useRef(secs);
  useEffect(() => {
    if (r.phase === 'vote' && secs !== lastSecs.current && secs > 0 && secs <= 5) sfx.tick();
    lastSecs.current = secs;
  }, [secs, r.phase]);

  const lastVotes = useRef(votedCount);
  useEffect(() => {
    if (votedCount > lastVotes.current) sfx.lock();
    lastVotes.current = votedCount;
  }, [votedCount]);

  const voters = state.players.filter((p) => r.expected.includes(p.id) || r.voted.includes(p.id));

  return (
    <>
      <TimerBar remainingMs={r.remainingMs} totalMs={r.totalMs} receivedAt={state.receivedAt} />

      <main className="stage">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9em' }}>
          <span className="kicker">{KICKER[r.type]}</span>
          <h1 className="display">{headline(r)}</h1>
        </div>

        {r.type === 'find' ? (
          <div className="find-grid">
            {r.options.map((o, i) => (
              <motion.div key={i} className="find-item" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 * i }}>
                <Bubble
                  name={r.subject}
                  tint={r.subjectTint}
                  time={o.time}
                  text={o.text}
                  label={<span className="find-letter">{LETTERS[i]}</span>}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div className="hero-bubble" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
            <Bubble name={r.subject} tint={r.subjectTint} time={r.message.time} text={r.message.text} />
          </motion.div>
        )}

        {r.type === 'bluff' && r.phase === 'claim' && (
          <div className="claim-banner">
            Psst, {r.subject}. Check your phone. <TypingDots />
          </div>
        )}
        {r.type === 'bluff' && r.phase === 'vote' && (
          <motion.div className="claim-banner" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
            {r.subject} says <q>{r.claim === 'mine' ? 'Yeah, I sent that.' : 'Not mine.'}</q>
          </motion.div>
        )}
      </main>

      <footer className="round-foot">
        <div className="locked">
          <span style={{ fontWeight: 600, fontSize: '1.1em' }}>{r.phase === 'claim' ? 'Up next' : 'Locked in'}</span>
          <ul>
            {voters.map((p) => {
              const done = r.voted.includes(p.id);
              return (
                <li key={p.id} className={done ? '' : 'waiting'} aria-label={`${p.name} ${done ? 'has voted' : 'is still deciding'}`}>
                  <motion.span animate={done ? { scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.35 }} style={{ display: 'inline-flex' }}>
                    <Avatar name={p.name} tint={p.tint} size="2.9em" />
                  </motion.span>
                  {done && (
                    <span className="tick">
                      <Icons.Check size="0.8em" color="var(--paper)" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {r.subjectPlaying && r.type !== 'bluff' && <span className="chip chip-dashed">{r.subject} sits this one out. Poker face.</span>}
        </div>
        <div className="vote-hint">
          <button type="button" className="btn btn-ghost" onClick={() => send({ t: 'host:next' })}>
            {r.phase === 'claim' ? 'Skip' : 'Reveal now'}
          </button>
          <span className="muted">Vote on your phone</span>
          {r.type === 'find' ? (
            LETTERS.map((l) => (
              <span key={l} className="find-letter" style={{ fontSize: '1.2em' }}>
                {l}
              </span>
            ))
          ) : (
            <>
              <span className="vote-pill real">REAL</span>
              <span className="vote-pill ai">AI</span>
            </>
          )}
        </div>
      </footer>
      {secs !== null && <span className="sr-only" aria-live="polite">{secs <= 5 ? `${secs} seconds left` : ''}</span>}
    </>
  );
}

function verdictTitle(r) {
  const rv = r.reveal;
  const n = rv.voterCount;
  if (r.type === 'find') {
    if (!n) return 'Nobody voted. Wow.';
    const right = rv.results.filter((x) => x.correct).length;
    if (right === n) return n === 1 ? 'Found it.' : 'Everyone found it.';
    if (right === 0) return 'Nobody found the real one.';
    return `${right} of ${n} found it.`;
  }
  if (!n) return 'Nobody voted. The AI wins.';
  if (rv.fake) {
    if (rv.fooled === 0) return 'Nobody fell for it.';
    if (rv.fooled === n) return n === 1 ? 'Fooled. Completely.' : `All ${n} got fooled.`;
    return `${rv.fooled} of ${n} got fooled.`;
  }
  const wrong = rv.results.filter((x) => !x.correct).length;
  if (wrong === 0) return 'Everyone knew. Too easy.';
  if (wrong === n) return `Everyone called ${r.subject} a bot.`;
  return `${wrong} of ${n} thought a bot wrote this.`;
}

function saidLine(x, r) {
  if (r.type === 'find') return x.correct ? `Picked ${LETTERS[x.choice]}. Spot on.` : `Picked ${LETTERS[x.choice]}. Fooled.`;
  const said = x.choice === 'ai' ? 'Said AI.' : 'Said real.';
  if (x.correct) return `${said} Saw right through it.`;
  return `${said} ${r.reveal.fake ? 'Fooled.' : 'Wrong.'}`;
}

function Reveal({ state, send }) {
  const r = state.round;
  const rv = r.reveal;
  const last = r.index + 1 >= state.roundsTotal;

  useEffect(() => {
    const id = setTimeout(() => sfx.stamp(), 330);
    return () => clearTimeout(id);
  }, []);

  const realVotes = r.type === 'find' ? 0 : rv.results.filter((x) => x.choice === 'real').length;
  const aiVotes = r.type === 'find' ? 0 : rv.results.filter((x) => x.choice === 'ai').length;
  const shake = { x: [0, -10, 9, -5, 3, 0] };
  const shakeT = { delay: 0.36, duration: 0.4 };

  let bluffLine = null;
  if (r.type === 'bluff') {
    const lied = (r.claim === 'mine') === rv.fake;
    const fooled = rv.results.filter((x) => !x.correct).length;
    bluffLine = (
      <p className="bluff-line" style={{ margin: 0 }}>
        {r.subject} said “{r.claim === 'mine' ? 'Yeah, I sent that' : 'Not mine'}”. {lied ? 'That was a lie.' : 'That was the truth.'}{' '}
        {fooled > 0 ? <b>+{rv.bluffPoints} for fooling {fooled}.</b> : 'Nobody was fooled.'}
      </p>
    );
  }

  const notes = (rv.notes ?? []).filter((n) => n !== rv.why);
  const mostFooling = r.type === 'find'
    ? rv.options
        .map((o, i) => ({ ...o, picks: rv.results.filter((x) => x.choice === i).length }))
        .filter((o) => o.fake)
        .sort((a, b) => b.picks - a.picks)[0]
    : null;
  const why = r.type === 'find' ? mostFooling?.why : rv.why;

  return (
    <div className="reveal">
      <section className="reveal-main">
        {r.type === 'find' ? (
          <div className="find-grid" style={{ fontSize: '0.85em' }}>
            {rv.options.map((o, i) => {
              const picks = rv.results.filter((x) => x.choice === i).length;
              return (
                <motion.div key={i} className="find-item" animate={o.fake ? {} : shake} transition={shakeT}>
                  <Bubble
                    name={r.subject}
                    tint={r.subjectTint}
                    time={o.time}
                    text={o.text}
                    label={
                      <>
                        <span className="find-letter">{LETTERS[i]}</span>
                      </>
                    }
                  />
                  <span className="votes" style={{ position: 'absolute', top: '0.4em', right: '0.4em' }}>
                    {picks} vote{picks === 1 ? '' : 's'}
                  </span>
                  <span className="stamp-pos" style={o.fake ? { fontSize: '1.9em' } : undefined}>
                    <Stamp fake={o.fake} small={o.fake ? '' : 'REALLY SENT'} delay={o.fake ? 0.55 + i * 0.08 : 0.3} />
                  </span>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.div className="hero-bubble" animate={shake} transition={shakeT}>
            <Bubble name={r.subject} tint={r.subjectTint} time={r.message.time} text={r.message.text}>
              <span className="stamp-pos">
                <Stamp fake={rv.fake} delay={0.3} />
              </span>
            </Bubble>
          </motion.div>
        )}

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.75 }}>
          {rv.fake || (r.type === 'find' && why) ? (
            <section className="notes-card">
              <h2>
                <Icons.Notes /> THE AI'S NOTES ON {r.subject.toUpperCase()}
              </h2>
              {why && <p className="why">{why}</p>}
              {notes.length > 0 && (
                <ul>
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="real-card">
              <span className="kicker" style={{ color: 'var(--ink)' }}>The real thing</span>
              <b>
                {r.subject} really sent this{rv.date ? ` on ${rv.date}` : ''}.
              </b>
              {notes.length > 0 && <span>The AI's take on {r.subject}: {notes[0]}</span>}
            </section>
          )}
        </motion.div>
      </section>

      <motion.aside className="card verdict" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 22 }}>
        <h2 className="display">{verdictTitle(r)}</h2>
        {r.type !== 'find' && rv.voterCount > 0 && (
          <div className="split" role="img" aria-label={`${realVotes} said real, ${aiVotes} said AI`}>
            {realVotes > 0 && (
              <motion.div className="real" initial={{ flexGrow: 0.001 }} animate={{ flexGrow: realVotes }} transition={{ delay: 0.7, duration: 0.6 }}>
                REAL · {realVotes}
              </motion.div>
            )}
            {aiVotes > 0 && (
              <motion.div className={`ai ${realVotes ? 'has-real' : ''}`} initial={{ flexGrow: 0.001 }} animate={{ flexGrow: aiVotes }} transition={{ delay: 0.7, duration: 0.6 }}>
                AI · {aiVotes}
              </motion.div>
            )}
          </div>
        )}
        <ul className="results">
          {rv.results.map((x, i) => (
            <motion.li key={x.id} className={x.correct ? 'right' : ''} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.85 + i * 0.07 }}>
              <Avatar name={x.name} tint={x.tint} size="2.6em" />
              <span className="who">
                <b>{x.name}</b>
                <span>{saidLine(x, r)}</span>
              </span>
              <span className="pts">+{x.points}</span>
            </motion.li>
          ))}
          {rv.missed.map((x) => (
            <li key={x.id}>
              <Avatar name={x.name} tint={x.tint} size="2.6em" />
              <span className="who">
                <b>{x.name}</b>
                <span>Didn't vote in time.</span>
              </span>
              <span className="pts">+0</span>
            </li>
          ))}
        </ul>
        {bluffLine}
        <button type="button" className="btn btn-ink btn-big" style={{ alignSelf: 'flex-start', fontSize: '1.45em' }} onClick={() => send({ t: 'host:next' })}>
          {last ? 'See the awards' : 'Next round'} <Icons.Arrow size="0.9em" />
        </button>
      </motion.aside>
    </div>
  );
}
