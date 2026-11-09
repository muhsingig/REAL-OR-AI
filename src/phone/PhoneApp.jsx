import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useConnection, useRemaining, tabStore as store } from '../net.js';
import { Avatar, Bubble, Icons, Logo, Stamp, TypingDots, ConnectionLine } from '../ui.jsx';

const LETTERS = ['A', 'B', 'C', 'D'];
const buzz = (pattern) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not every phone allows vibration.
  }
};

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function PhoneApp() {
  const urlCode = useMemo(() => (new URLSearchParams(location.search).get('code') ?? '').toUpperCase().slice(0, 4), []);
  const [code, setCode] = useState(urlCode);
  const [ended, setEnded] = useState(null);
  const connRef = useRef(null);

  const conn = useConnection({
    hello: () => {
      const saved = store.get('roa:player');
      if (saved && (!urlCode || saved.code === urlCode)) return { t: 'player:resume', code: saved.code, playerId: saved.playerId };
      if (urlCode) return { t: 'player:join', code: urlCode };
      return null;
    },
    onMessage: (msg) => {
      if (msg.t === 'joined') {
        store.set('roa:player', { code: msg.code, playerId: msg.playerId });
        setEnded(null);
      }
      if (msg.t === 'gone') {
        store.set('roa:player', null);
        connRef.current?.setState(null);
        setEnded(msg.kicked ? 'The host removed you from this game.' : msg.left ? null : 'That game has ended.');
        if (msg.left || msg.kicked) history.replaceState(null, '', '/play');
      }
    },
  });
  connRef.current = conn;
  const { state, send, error, status } = conn;

  let screen;
  let dark = false;
  if (!state) {
    screen = <JoinCode code={code} setCode={setCode} send={send} error={error} ended={ended} />;
  } else if (!state.me.name) {
    screen = state.chat ? <PickName state={state} send={send} error={error} /> : <WaitForChat state={state} />;
  } else if (state.phase === 'lobby' || state.phase === 'setup') {
    screen = <Waiting state={state} send={send} />;
  } else if (state.phase === 'studying') {
    screen = <PhoneStudying state={state} />;
  } else if (state.phase === 'round' && state.round) {
    const r = state.round;
    dark = r.isSubject && r.type === 'bluff' && r.phase !== 'reveal';
    screen = <PhoneRound state={state} send={send} />;
  } else if (state.phase === 'final' && state.final) {
    screen = <PhoneFinal state={state} />;
  } else {
    screen = <Waiting state={state} send={send} />;
  }

  return (
    <div className={`phone-bg ${dark ? 'dark' : ''}`}>
      <div className="phone">
        <div className="phone-top">
          <Logo />
          {state && <span className="code-chip">{state.code}</span>}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={screenKey(state)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {screen}
          </motion.div>
        </AnimatePresence>
      </div>
      {state && !state.hostConnected && status === 'open' && <div className="status-line">The big screen lost connection. Hang tight.</div>}
      <ConnectionLine status={status} />
    </div>
  );
}

function screenKey(state) {
  if (!state) return 'join';
  if (!state.me.name) return 'pick';
  const r = state.round;
  if (state.phase === 'round' && r) return `r${r.index}-${r.phase}-${r.myVote === null ? 'open' : 'locked'}`;
  return state.phase;
}

function MeBar({ state }) {
  const me = state.me;
  return (
    <footer className="me-bar">
      <span className="who">
        <Avatar name={me.name} tint={me.tint} size="32px" />
        {me.name}
      </span>
      <span className="mono">
        {me.score.toLocaleString('en-IN')}
        {me.score > 0 ? ` · ${ordinal(me.rank)}` : ''}
      </span>
    </footer>
  );
}

function JoinCode({ code, setCode, send, error, ended }) {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (error) setSent(false);
  }, [error]);
  const submit = (e) => {
    e.preventDefault();
    if (code.length !== 4) return;
    setSent(true);
    send({ t: 'player:join', code });
  };
  return (
    <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 className="display">Join the game.</h1>
        <p className="sub">{ended ?? 'Type the 4-letter code from the big screen.'}</p>
      </div>
      <label className="sr-only" htmlFor="room-code">Room code</label>
      <input
        id="room-code"
        className="code-input"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 4))}
        placeholder="ABCD"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
      />
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--real-ink)', fontWeight: 600 }}>
          {error}
        </p>
      )}
      <div style={{ marginTop: 'auto' }} />
      <button type="submit" className="big-btn" disabled={code.length !== 4 || sent}>
        {sent ? <TypingDots /> : 'Join'}
      </button>
    </form>
  );
}

function WaitForChat() {
  return (
    <div className="center-col">
      <TypingDots />
      <h1 className="display" style={{ fontSize: 36 }}>You're in the room.</h1>
      <p className="sub">The host is loading the group chat. Your name will show up here in a moment.</p>
    </div>
  );
}

function PickName({ state, send, error }) {
  const [sel, setSel] = useState(null);
  const [guest, setGuest] = useState('');
  const [consent, setConsent] = useState(false);
  const [query, setQuery] = useState('');
  const people = state.chat.people;
  const shown = query ? people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : people;
  const isGuest = sel === '__guest';
  const ready = isGuest ? guest.trim().length > 0 : sel && consent;

  const submit = () => {
    if (!ready) return;
    buzz(15);
    send(isGuest ? { t: 'player:claim', guestName: guest.trim() } : { t: 'player:claim', chatName: sel, consent: true });
  };

  return (
    <>
      <div>
        <h1 className="display">Which one is you?</h1>
        <p className="sub">Pick your name from {state.chat.groupName}.</p>
      </div>
      {people.length > 10 && (
        <>
          <label className="sr-only" htmlFor="find-name">Find your name</label>
          <input id="find-name" className="text-input" placeholder="Find your name" value={query} onChange={(e) => setQuery(e.target.value)} />
        </>
      )}
      <fieldset className="names" style={{ maxHeight: '46dvh' }}>
        <legend className="sr-only">Your name in the chat</legend>
        {shown.map((p) => (
          <label key={p.name} className={`name-opt ${sel === p.name ? 'selected' : ''} ${p.taken ? 'taken' : ''}`}>
            <input type="radio" name="me" value={p.name} checked={sel === p.name} disabled={p.taken} onChange={() => setSel(p.name)} />
            <Avatar name={p.name} tint={p.tint} size="40px" />
            <b>{p.name}</b>
            <span className="count">{p.taken ? 'Taken' : `${p.count.toLocaleString('en-IN')} msgs`}</span>
            {sel === p.name && <Icons.Check size="22px" />}
          </label>
        ))}
        <label className={`name-opt ${isGuest ? 'selected' : ''}`}>
          <input type="radio" name="me" value="__guest" checked={isGuest} onChange={() => setSel('__guest')} />
          <Avatar name="?" tint="#E8E2D3" size="40px" />
          <b style={{ fontSize: 16 }}>I'm not in this chat</b>
          <span className="count">Just guessing</span>
        </label>
      </fieldset>

      {isGuest ? (
        <>
          <label className="sr-only" htmlFor="guest-name">Your name</label>
          <input id="guest-name" className="text-input" placeholder="Your name" maxLength={24} value={guest} onChange={(e) => setGuest(e.target.value)} />
        </>
      ) : (
        <label className="consent" style={{ marginTop: 'auto' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            <b>Use my messages in this game</b>
            <span>
              The AI only copies everyday chat.{' '}
              {state.ai ? `Your messages go to ${state.ai.name} to write the fakes. ${state.ai.note} ` : ''}
              The game deletes everything when it ends.
            </span>
          </span>
        </label>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--real-ink)', fontWeight: 600 }}>
          {error}
        </p>
      )}
      <button type="button" className="big-btn" disabled={!ready} onClick={submit}>
        I'm in
      </button>
    </>
  );
}

function Waiting({ state, send }) {
  const me = state.me;
  return (
    <>
      <div className="center-col">
        <motion.span initial={{ scale: 0.3, rotate: -20 }} animate={{ scale: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
          <Avatar name={me.name} tint={me.tint} size="96px" />
        </motion.span>
        <h1 className="display" style={{ fontSize: 40 }}>You're in, {me.name}.</h1>
        <p className="sub" style={{ marginTop: 0 }}>
          {me.chatName
            ? 'Eyes on the big screen. The game starts when the host is ready.'
            : "You're guessing this time. Your messages aren't in the game."}
        </p>
        <div className="player-chips" aria-label="Players in the room">
          {state.players.map((p) => (
            <span key={p.id}>
              <Avatar name={p.name} tint={p.tint} size="24px" /> {p.name}
            </span>
          ))}
        </div>
      </div>
      <button type="button" className="link-btn" onClick={() => send({ t: 'player:unclaim' })}>
        Not you? Pick again
      </button>
    </>
  );
}

function PhoneStudying({ state }) {
  const card = state.study?.card;
  return (
    <>
      <div className="center-col">
        <h1 className="display" style={{ fontSize: 40 }}>{state.study?.done ? 'Ready.' : 'The AI is studying you.'}</h1>
        <p className="sub" style={{ marginTop: 0 }}>
          {state.study?.done ? 'Round 1 is about to start. Look up.' : 'It is reading the chat to learn how everyone texts.'}
        </p>
        {card && (
          <motion.div className="card" style={{ padding: 20, width: '100%', textAlign: 'left', borderRadius: 24, boxShadow: '5px 5px 0 var(--ink)' }} initial={{ rotate: 0, y: 20, opacity: 0 }} animate={{ rotate: -1.5, y: 0, opacity: 1 }}>
            <span className="kicker" style={{ fontSize: 12 }}>What it learned about you</span>
            <div className="display" style={{ fontSize: 56, margin: '10px 0 6px' }}>{card.stat}</div>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.35 }}>{card.line}</p>
          </motion.div>
        )}
        {!state.study?.done && <TypingDots />}
      </div>
      <MeBar state={state} />
    </>
  );
}

function RoundHeader({ state }) {
  const r = state.round;
  const left = useRemaining(r.remainingMs, state.receivedAt, 200);
  const secs = left == null ? null : Math.ceil(left / 1000);
  const frac = left == null || !r.totalMs ? 0 : left / r.totalMs;
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
          ROUND {r.index + 1}/{state.roundsTotal}
        </span>
        {secs !== null && r.phase !== 'reveal' && (
          <span className="mono" style={{ fontWeight: 700, fontSize: 22, color: secs <= 5 ? 'var(--real-ink)' : undefined }}>{secs}s</span>
        )}
      </div>
      {secs !== null && r.phase !== 'reveal' && (
        <div className="timer-track" style={{ height: 10 }} role="img" aria-label={`${secs} seconds left`}>
          <div className={`timer-fill ${secs <= 5 ? 'hot' : ''}`} style={{ transform: `scaleX(${Math.max(0, Math.min(1, frac))})` }} />
        </div>
      )}
    </header>
  );
}

function PhoneRound({ state, send }) {
  const r = state.round;
  if (r.phase === 'reveal') return <PhoneResult state={state} />;
  if (r.isSubject && r.type === 'bluff') return <BluffSecret state={state} send={send} />;
  if (r.isSubject) return <SitOut state={state} />;
  if (r.phase === 'claim') {
    return (
      <>
        <RoundHeader state={state} />
        <div className="center-col">
          <span className="kicker" style={{ color: 'var(--real-ink)' }}>Bluff round</span>
          <h1 className="display" style={{ fontSize: 38 }}>{r.subject} is deciding what to tell you.</h1>
          <p className="sub" style={{ marginTop: 0 }}>Watch their face. Then decide if they're lying.</p>
          <TypingDots />
        </div>
        <MeBar state={state} />
      </>
    );
  }
  if (r.myVote !== null) return <Locked state={state} />;
  return r.type === 'find' ? <VoteFind state={state} send={send} /> : <VoteRealAI state={state} send={send} />;
}

function VoteRealAI({ state, send }) {
  const r = state.round;
  const vote = (choice) => {
    buzz(20);
    send({ t: 'player:vote', choice });
  };
  return (
    <>
      <RoundHeader state={state} />
      <div className="mini-bubble">
        <Bubble name={r.subject} tint={r.subjectTint} time={r.message.time} text={r.message.text} avatarSize="30px" />
      </div>
      {r.type === 'bluff' && r.claim && (
        <p style={{ margin: 0, fontWeight: 600 }}>
          {r.subject} says <span className="display" style={{ fontSize: 20 }}>“{r.claim === 'mine' ? 'Yeah, I sent that.' : 'Not mine.'}”</span>
        </p>
      )}
      <div className="votes">
        <motion.button type="button" className="vote-btn vote-real" whileTap={{ scale: 0.97 }} onClick={() => vote('real')}>
          <span className="big">REAL</span>
          <span className="small">{r.subject} actually sent it</span>
        </motion.button>
        <motion.button type="button" className="vote-btn vote-ai" whileTap={{ scale: 0.97 }} onClick={() => vote('ai')}>
          <span className="big">AI</span>
          <span className="small">The AI wrote it</span>
        </motion.button>
      </div>
    </>
  );
}

function VoteFind({ state, send }) {
  const r = state.round;
  return (
    <>
      <RoundHeader state={state} />
      <div>
        <h1 className="display" style={{ fontSize: 30 }}>Which one did {r.subject} really send?</h1>
      </div>
      <div className="find-opts">
        {r.options.map((o, i) => (
          <motion.button
            key={i}
            type="button"
            className="find-opt"
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              buzz(20);
              send({ t: 'player:vote', choice: i });
            }}
          >
            <span className="find-letter">{LETTERS[i]}</span>
            <span>{o.text}</span>
          </motion.button>
        ))}
      </div>
    </>
  );
}

function Locked({ state }) {
  const r = state.round;
  const waiting = Math.max(0, r.expected.filter((id) => !r.voted.includes(id)).length);
  const v = r.myVote;
  const isLetter = typeof v === 'number';
  return (
    <>
      <RoundHeader state={state} />
      <div className="center-col">
        <motion.span
          initial={{ scale: 1.6, rotate: -14, opacity: 0 }}
          animate={{ scale: 1, rotate: -6, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          className="vote-btn"
          style={{
            flex: 'none',
            minHeight: 0,
            padding: '18px 34px',
            background: isLetter ? 'var(--ink)' : v === 'real' ? 'var(--real)' : 'var(--ai)',
            color: isLetter || v === 'ai' ? 'var(--paper)' : 'var(--ink)',
          }}
        >
          <span className="big">{isLetter ? LETTERS[v] : v === 'real' ? 'REAL' : 'AI'}</span>
        </motion.span>
        <h1 className="display" style={{ fontSize: 40 }}>Locked in.</h1>
        <p className="sub" style={{ marginTop: 0 }}>
          {waiting > 0 ? `Waiting for ${waiting} more…` : 'Everyone voted. Look up.'}
        </p>
      </div>
      <MeBar state={state} />
    </>
  );
}

function SitOut({ state }) {
  const r = state.round;
  return (
    <>
      <RoundHeader state={state} />
      <div className="center-col" style={{ justifyContent: 'flex-start', paddingTop: 12 }}>
        <span className="kicker">This one's about you</span>
        <h1 className="display" style={{ fontSize: 44 }}>Poker face.</h1>
        <p className="sub" style={{ marginTop: 0 }}>Your friends are deciding if you really sent this. Don't react.</p>
        <div className="mini-bubble" style={{ width: '100%', textAlign: 'left' }}>
          {r.type === 'find' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {r.options.map((o, i) => (
                <div key={i} className="find-opt" style={{ boxShadow: 'none' }}>
                  <span className="find-letter">{LETTERS[i]}</span>
                  <span>{o.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <Bubble name={r.subject} tint={r.subjectTint} time={r.message.time} text={r.message.text} avatarSize="30px" />
          )}
        </div>
      </div>
      <MeBar state={state} />
    </>
  );
}

function BluffSecret({ state, send }) {
  const r = state.round;
  const fake = r.secret?.fake;
  if (r.phase === 'vote') {
    return (
      <>
        <RoundHeader state={state} />
        <div className="center-col">
          <span className="kicker" style={{ color: 'var(--real-on-ink)' }}>Locked in</span>
          <h1 className="display" style={{ fontSize: 40 }}>
            You said “{r.claim === 'mine' ? 'Yeah, I sent that' : 'Not mine'}”.
          </h1>
          <p className="sub" style={{ marginTop: 0 }}>Now keep a straight face while they vote.</p>
        </div>
        <MeBar state={state} />
      </>
    );
  }
  const claim = (c) => {
    buzz([20, 40, 20]);
    send({ t: 'player:bluff', claim: c });
  };
  return (
    <>
      <span className="secret-pill">
        <Icons.EyeOff size="16px" /> ONLY YOU CAN SEE THIS
      </span>
      <div>
        <span className="kicker" style={{ color: 'var(--real-on-ink)', fontSize: 14 }}>Bluff round</span>
        <h1 className="display" style={{ fontSize: 46, marginTop: 6 }}>Psst, {state.me.name}.</h1>
      </div>
      <div className="mini-bubble" style={{ position: 'relative', paddingBottom: 30 }}>
        <blockquote className="bubble" style={{ border: 0, boxShadow: 'none', color: 'var(--ink)' }}>
          {r.message.text}
        </blockquote>
        <span style={{ position: 'absolute', right: 6, bottom: -8, fontSize: 54 }}>
          <Stamp fake={fake} small="THE TRUTH" onInk delay={0.25} />
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 19, lineHeight: 1.4 }}>
        {fake ? 'The AI wrote this in your style.' : 'You really sent this one.'} Everyone else is about to guess.{' '}
        <strong>What do you tell them?</strong>
      </p>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <motion.button type="button" className="bluff-btn mine" whileTap={{ scale: 0.98 }} onClick={() => claim('mine')}>
          “Yeah, I sent that”
        </motion.button>
        <motion.button type="button" className="bluff-btn notmine" whileTap={{ scale: 0.98 }} onClick={() => claim('notmine')}>
          “Not mine”
        </motion.button>
        <p style={{ margin: '4px 0 0', textAlign: 'center', fontSize: 15, color: 'var(--muted-on-ink)' }}>
          You get 100 points for every friend you fool.
        </p>
      </div>
    </>
  );
}

function PhoneResult({ state }) {
  const r = state.round;
  const res = r.result;
  useEffect(() => {
    if (!res) return;
    if (r.isSubject) buzz(res.points > 0 ? [30, 60, 30] : 40);
    else buzz(res.correct ? [30, 50, 30] : [120]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!res) return null;

  const truthWord = r.type === 'find' ? `It was ${LETTERS[res.truth]}.` : res.fake ? 'The AI wrote it.' : `${r.subject} really sent it.`;
  let big;
  let title;
  if (r.isSubject) {
    big = `+${res.points}`;
    title = r.type === 'bluff' ? (res.points > 0 ? 'Great bluff.' : 'Nobody bought it.') : `${res.fooled} of ${res.voterCount} fell for it.`;
  } else if (!res.voted) {
    big = '+0';
    title = 'Too slow.';
  } else if (res.correct) {
    big = `+${res.points}`;
    title = 'You got it.';
  } else {
    big = '+0';
    title = res.fake || r.type === 'find' ? 'Fooled.' : 'Nope.';
  }

  return (
    <>
      <RoundHeader state={state} />
      <div className="center-col">
        {r.type !== 'find' && (
          <span style={{ fontSize: 64 }}>
            <Stamp fake={res.fake} delay={0.1} />
          </span>
        )}
        <motion.div className="result-num" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 380, damping: 16 }}>
          {big}
        </motion.div>
        <h1 className="display" style={{ fontSize: 40 }}>{title}</h1>
        <p className="sub" style={{ marginTop: 0 }}>{truthWord}</p>
      </div>
      <MeBar state={state} />
    </>
  );
}

function PhoneFinal({ state }) {
  const me = state.me;
  const f = state.final;
  return (
    <>
      <div className="center-col" style={{ gap: 12 }}>
        <span className="kicker">Game over</span>
        <motion.div className="result-num" style={{ fontSize: 120 }} initial={{ scale: 0.3, rotate: -20 }} animate={{ scale: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
          {ordinal(me.rank)}
        </motion.div>
        <p className="sub" style={{ marginTop: 0, fontSize: 18 }}>
          {me.score.toLocaleString('en-IN')} points · {f.headline}
        </p>
        {f.awards.map((a, i) => (
          <motion.article
            key={a.kind}
            className={`award phone-award ${a.tone}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1, rotate: i % 2 ? 1 : -1 }}
            transition={{ delay: 0.4 + i * 0.15 }}
          >
            <span className="t">{a.title}</span>
            <span className="n">{a.name}</span>
            <p>{a.line}</p>
          </motion.article>
        ))}
        {!f.awards.length && <p className="sub">No awards this time. Next game.</p>}
      </div>
      <p className="sub" style={{ textAlign: 'center', margin: 0 }}>The host can start another game from the big screen.</p>
    </>
  );
}
