import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { useConnection, store } from '../net.js';
import { parseWhatsAppFile } from '../whatsapp.js';
import { sfx, isMuted, setMuted } from '../sfx.js';
import { Logo, Avatar, Icons, Toast, ConnectionLine, TypingDots } from '../ui.jsx';
import { Studying } from './HostStudy.jsx';
import { Round } from './HostRound.jsx';
import { Final } from './HostFinal.jsx';

const DEMO_FACES = [
  ['Rohan', '#FFD5C2'],
  ['Kabir', '#CBD5FF'],
  ['Sneha', '#D9F2C4'],
  ['Aditi', '#FFE89A'],
  ['Zoya', '#F3C6E8'],
  ['Arjun', '#C9EDEE'],
];

export default function HostApp() {
  const [muted, setMutedState] = useState(isMuted);
  const [needPassword, setNeedPassword] = useState(null);
  const create = () => ({ t: 'host:create', password: store.get('roa:hostpass') ?? undefined });
  const { state, send, error, setError, status } = useConnection({
    hello: () => {
      const saved = store.get('roa:host');
      return saved ? { t: 'host:resume', code: saved.code, hostToken: saved.hostToken } : create();
    },
    onMessage: (msg, ws) => {
      if (msg.t === 'hosting') {
        store.set('roa:host', { code: msg.code, hostToken: msg.hostToken });
        setNeedPassword(null);
      }
      if (msg.t === 'need-password') {
        if (msg.wrong) store.set('roa:hostpass', null);
        setNeedPassword({ wrong: msg.wrong });
      }
      if (msg.t === 'gone' && msg.role === 'host') {
        store.set('roa:host', null);
        ws.send(JSON.stringify(create()));
      }
    },
  });

  useEffect(() => {
    if (!error) return undefined;
    const id = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(id);
  }, [error, setError]);

  // Render's free plan sleeps after 15 quiet minutes; a light ping while the host screen
  // is open keeps the room (which lives in memory) from being lost mid-game.
  useEffect(() => {
    const id = setInterval(() => fetch('/healthz').catch(() => {}), 4 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const unlock = (password) => {
    store.set('roa:hostpass', password);
    setNeedPassword(null);
    send({ t: 'host:create', password });
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const endGame = () => {
    if (window.confirm('End this game? Everyone is sent back to the start and the chat is deleted.')) send({ t: 'host:end' });
  };

  let screen = (
    <div className="stage">
      <TypingDots />
    </div>
  );
  if (needPassword) screen = <PasswordGate wrong={needPassword.wrong} onSubmit={unlock} />;
  else if (state?.phase === 'setup') screen = <Setup state={state} send={send} />;
  else if (state?.phase === 'lobby') screen = <Lobby state={state} send={send} />;
  else if (state?.phase === 'studying') screen = <Studying state={state} send={send} />;
  else if (state?.phase === 'round' && state.round) screen = <Round state={state} send={send} />;
  else if (state?.phase === 'final') screen = <Final state={state} send={send} />;

  return (
    <div className="host" onPointerDown={() => sfx.unlock()}>
      <div className="host-inner">
        <HostTop state={state} muted={muted} onMute={toggleMute} onEnd={endGame} />
        {screen}
      </div>
      <AnimatePresence>{error && <Toast key={error} message={error} />}</AnimatePresence>
      <ConnectionLine status={status} />
    </div>
  );
}

function HostTop({ state, muted, onMute, onEnd }) {
  const r = state?.round;
  const leader = state?.players?.length ? [...state.players].sort((a, b) => b.score - a.score)[0] : null;
  return (
    <header className="host-top">
      <Logo />
      {state?.phase === 'round' && r && (
        <div className="round-top-mid">
          <span className="mono" style={{ fontWeight: 600, fontSize: '1.15em' }}>
            ROUND {r.index + 1}/{state.roundsTotal}
          </span>
          <span className="round-dots" role="img" aria-label={`Round ${r.index + 1} of ${state.roundsTotal}`}>
            {Array.from({ length: state.roundsTotal }, (_, i) => (
              <span key={i} className={i < r.index ? 'done' : i === r.index ? 'now' : ''} />
            ))}
          </span>
        </div>
      )}
      <div className="right">
        {state?.phase === 'round' && leader && leader.score > 0 && (
          <span className="muted" style={{ fontSize: '1.05em' }}>
            {leader.name} leads with <strong className="mono" style={{ color: 'var(--ink)' }}>{leader.score}</strong>
          </span>
        )}
        {(state?.phase === 'lobby' || state?.phase === 'studying') && state.chat && (
          <span className="group-pill">
            <Icons.Chat />
            <strong>{state.chat.groupName}</strong>
            <span className="mono">
              {state.chat.total.toLocaleString('en-IN')} messages · {state.chat.peopleCount} people
            </span>
          </span>
        )}
        <button type="button" className="icon-btn" onClick={onMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={muted}>
          {muted ? <Icons.Mute /> : <Icons.Sound />}
        </button>
        {state && state.phase !== 'setup' && (
          <button type="button" className="icon-btn" onClick={onEnd} aria-label="End game">
            <Icons.Close />
          </button>
        )}
      </div>
    </header>
  );
}

function PasswordGate({ wrong, onSubmit }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="setup"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) onSubmit(value);
      }}
    >
      <section className="setup-main" style={{ maxWidth: '42em' }}>
        <h1 className="display h-xl">Host password.</h1>
        <p className="lede">Only people with the password can start a game here, so nobody else spends your AI key. Phones don't need it.</p>
        <label className="sr-only" htmlFor="host-pass">Host password</label>
        <input
          id="host-pass"
          type="password"
          className="text-input"
          style={{ fontSize: '1.4em', maxWidth: '18em', borderRadius: '0.6em' }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="current-password"
          autoFocus
        />
        {wrong && (
          <p className="note" role="alert" style={{ color: 'var(--real-ink)', fontWeight: 600 }}>
            That password didn't work.
          </p>
        )}
        <button type="submit" className="btn btn-ink btn-big" style={{ alignSelf: 'flex-start' }} disabled={!value}>
          Unlock <Icons.Arrow size="0.9em" />
        </button>
      </section>
    </form>
  );
}

function Setup({ state, send }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setProblem(null);
    setBusy(`Reading ${file.name}…`);
    try {
      const parsed = await parseWhatsAppFile(file);
      setBusy(`Found ${parsed.messages.length.toLocaleString('en-IN')} messages from ${parsed.people.length} people…`);
      send({ t: 'host:chat', ...parsed });
    } catch (err) {
      setProblem(err.message || 'Could not read that file.');
      setBusy(null);
    }
  };

  return (
    <div className="setup">
      <section className="setup-main">
        <motion.h1 className="display h-xl" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          Load your
          <br />
          group chat.
        </motion.h1>
        <p className="lede">Export it from WhatsApp and drop it here. The AI learns how everyone texts, then starts faking.</p>
        <ol className="steps" aria-label="How to export a WhatsApp chat">
          <li><b>1</b> Open the group</li>
          <li><b>2</b> ⋮ › More › Export chat</li>
          <li><b>3</b> Without media</li>
          <li><b>4</b> Send the file to this computer</li>
        </ol>
        <button
          type="button"
          className={`drop ${over ? 'over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
        >
          {busy ? (
            <>
              <TypingDots />
              <strong>{busy}</strong>
            </>
          ) : (
            <>
              <Icons.Upload size="2.6em" />
              <strong>Drop the chat here</strong>
              <span className="muted">or click to pick the .txt or .zip WhatsApp gave you</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.zip,text/plain,application/zip"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {problem && (
          <p className="note" role="alert" style={{ color: 'var(--real-ink)', fontWeight: 600 }}>
            {problem}
          </p>
        )}
      </section>

      <aside className="setup-side">
        <div className="card demo-card">
          <span className="kicker">No chat handy?</span>
          <h2 className="display h-md">Try the demo group.</h2>
          <div className="demo-faces" aria-hidden="true">
            {DEMO_FACES.map(([n, t]) => (
              <Avatar key={n} name={n} tint={t} size="3em" />
            ))}
          </div>
          <p className="note" style={{ color: 'var(--ink)' }}>
            Chai Sutta Club: six college friends, a lot of Hinglish, and one person who is never on time.
          </p>
          <button type="button" className="btn btn-ink btn-big" style={{ alignSelf: 'flex-start' }} onClick={() => send({ t: 'host:demo' })}>
            Play the demo <Icons.Arrow size="0.9em" />
          </button>
        </div>
        <p className="note">
          <Icons.Lock />
          <span>
            The chat is only held in the game's memory, never saved. Only messages from people who join and say yes get used
            {state.ai ? ` (and sent to ${state.aiName} to write the fakes)` : ''}, and everything is wiped when the game ends.
            {state.aiNote ? ` ${state.aiNote} Players see this before they agree.` : ''}
          </span>
        </p>
        {!state.ai && (
          <p className="note">
            <Icons.Pen />
            <span>No AI key set, so fakes for your own chat are remixed from your messages. Add a free MISTRAL_API_KEY to .env for sharper ones.</span>
          </p>
        )}
      </aside>
    </div>
  );
}

function Lobby({ state, send }) {
  const [info, setInfo] = useState(null);
  const [qr, setQr] = useState('');
  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const onLan = isLocal || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  const hostPart = isLocal && info?.lan?.[0] ? `${info.lan[0]}${location.port ? `:${location.port}` : ''}` : location.host;
  const url = `${location.protocol}//${hostPart}/play?code=${state.code}`;

  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16130E', light: '#0000' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  const prevCount = useRef(state.players.length);
  useEffect(() => {
    if (state.players.length > prevCount.current) sfx.pop();
    prevCount.current = state.players.length;
  }, [state.players.length]);

  const fromChat = state.players.filter((p) => p.chatName).length;
  const canStart = state.players.length >= 2 && fromChat >= 1;
  const why = state.players.length < 2 ? 'Waiting for at least 2 players' : fromChat < 1 ? 'Someone from the chat has to join' : null;
  const set = (patch) => send({ t: 'host:settings', settings: { ...state.settings, ...patch } });
  const joinedPeople = state.chat.people.filter((p) => p.joined);
  const waitingPeople = state.chat.people.filter((p) => !p.joined);
  // Joined people first, then the chattiest of everyone else.
  const roster = [...joinedPeople, ...waitingPeople].slice(0, Math.max(8, joinedPeople.length + 2));
  const hidden = state.chat.peopleCount - roster.length;

  return (
    <>
      <div className="lobby">
        <section className="lobby-join">
          <h1 className="display h-xl">
            Grab your phone.
            <br />
            Join the room.
          </h1>
          <div className="code-tiles" role="img" aria-label={`Room code ${state.code.split('').join(' ')}`}>
            {state.code.split('').map((ch, i) => (
              <motion.span
                key={ch + i}
                className="code-tile"
                initial={{ y: -40, opacity: 0, rotate: 0 }}
                animate={{ y: 0, opacity: 1, rotate: [-2, 1.5, -1, 2][i] }}
                transition={{ delay: 0.08 * i, type: 'spring', stiffness: 380, damping: 18 }}
              >
                {ch}
              </motion.span>
            ))}
          </div>
          <div className="join-row">
            <div className="qr" role="img" aria-label="QR code to join" dangerouslySetInnerHTML={{ __html: qr }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5em', minWidth: 0 }}>
              <span className="muted" style={{ fontSize: '1.1em' }}>Scan, or open this on your phone</span>
              <span className="join-url">{hostPart}/play</span>
              <span className="muted">{onLan ? 'Same Wi-Fi as this screen.' : 'Works from anywhere: in the room or on a call.'}</span>
            </div>
          </div>
        </section>

        <section className="card roster" aria-label="Who's in">
          <div className="roster-head">
            <h2 className="display h-sm">Who's in</h2>
            <span className="mono muted">
              {state.players.length} joined
              {state.choosing ? ` · ${state.choosing} picking a name` : ''}
            </span>
          </div>
          <ul>
            <AnimatePresence initial={false}>
              {roster.map((p) => (
                <motion.li key={p.name} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                  <Avatar name={p.name} tint={p.tint} />
                  <span className="who">
                    <b>{p.name}</b>
                    <span>{p.count.toLocaleString('en-IN')} messages</span>
                  </span>
                  {p.joined ? (
                    <motion.span className="tag-in" initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}>
                      <Icons.Check size="1em" /> In
                    </motion.span>
                  ) : (
                    <span className="tag-wait">Waiting</span>
                  )}
                </motion.li>
              ))}
              {state.guests.map((g) => (
                <motion.li key={`g-${g.id}`} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                  <Avatar name={g.name} tint={g.tint} />
                  <span className="who">
                    <b>{g.name}</b>
                    <span>Not in the chat, just guessing</span>
                  </span>
                  <span className="tag-in">
                    <Icons.Check size="1em" /> In
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {hidden > 0 && <span className="mono muted" style={{ fontSize: '0.9em' }}>+ {hidden} more in the chat</span>}
          <p className="note" style={{ fontSize: '0.95em' }}>
            Only people who join get used. Everyone else's messages stay out of the game.
          </p>
        </section>
      </div>

      <footer className="lobby-foot">
        <div className="settings" role="group" aria-label="Game settings">
          <span className="label">ROUNDS</span>
          {[6, 8, 10, 12].map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={state.settings.rounds === n} onClick={() => set({ rounds: n })}>
              {n}
            </button>
          ))}
          <span className="label">SECONDS</span>
          {[15, 20, 30].map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={state.settings.voteSeconds === n} onClick={() => set({ voteSeconds: n })}>
              {n}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={state.settings.bluff} onClick={() => set({ bluff: !state.settings.bluff })}>
            Bluff rounds {state.settings.bluff ? 'on' : 'off'}
          </button>
          <button type="button" className="chip chip-dashed" onClick={() => send({ t: 'host:unload' })}>
            Change chat
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1em', flexWrap: 'wrap' }}>
          {why && <span className="muted">{why}</span>}
          <button type="button" className="btn btn-ink btn-big" disabled={!canStart} onClick={() => send({ t: 'host:start' })}>
            Start the game <Icons.Arrow size="0.9em" />
          </button>
        </div>
      </footer>
    </>
  );
}
