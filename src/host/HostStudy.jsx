import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Avatar, Icons, TypingDots } from '../ui.jsx';
import { sfx } from '../sfx.js';

const TILTS = ['-1.5deg', '1deg', '-0.5deg', '1.5deg', '-1deg', '0.5deg'];

export function Studying({ state, send }) {
  const s = state.study;
  const finished = s.cards.filter((c) => c.status !== 'reading').length;
  const pct = s.done ? 100 : Math.round((finished / Math.max(1, s.cards.length)) * 92) + 4;

  const prev = useRef(finished);
  useEffect(() => {
    if (finished > prev.current) sfx.pop();
    prev.current = finished;
  }, [finished]);

  let title = 'The AI is studying you.';
  if (s.done && s.error) title = 'Hmm. Not enough to go on.';
  else if (s.done) title = 'Done. It knows you now.';

  return (
    <>
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25em' }}>
        <motion.h1 key={title} className="display h-xl" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          {title}
        </motion.h1>
        <p className="lede">
          {s.error ?? `Reading ${s.total.toLocaleString('en-IN')} messages so it can text exactly like you. Don't panic.`}
        </p>
        <div className="progress">
          <div className="progress-track" role="img" aria-label={`${pct} percent done`}>
            <motion.div className="progress-fill" initial={{ width: '4%' }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
          </div>
          <span className="mono" style={{ fontWeight: 600, fontSize: '1.25em', minWidth: '3em', textAlign: 'right' }}>
            {pct}%
          </span>
        </div>
      </section>

      <section className="study-grid" aria-label="What the AI learned">
        {s.cards.map((c, i) => (
          <motion.article
            key={c.name}
            className="card study-card"
            initial={{ y: 30, opacity: 0, rotate: 0 }}
            animate={{ y: 0, opacity: 1, rotate: TILTS[i % TILTS.length] }}
            transition={{ delay: 0.12 * i, type: 'spring', stiffness: 220, damping: 20 }}
          >
            <div className="top">
              <Avatar name={c.name} tint={c.tint} />
              <b>{c.name}</b>
              {c.status === 'reading' && (
                <span className="badge badge-soft" aria-label="Still reading">
                  <TypingDots />
                </span>
              )}
              {c.status === 'done' && (
                <motion.span className="badge" initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
                  LEARNED
                </motion.span>
              )}
              {c.status === 'skipped' && <span className="badge badge-soft">GUESSER</span>}
            </div>
            <div className="stat">{c.stat}</div>
            <p>{c.line}</p>
          </motion.article>
        ))}
      </section>

      <footer className="study-foot">
        <span className="counter blue">
          <Icons.Pen /> {s.written} fakes written
        </span>
        <span className="counter">
          <Icons.Bin /> {s.dropped} thrown out {s.mode === 'ai' ? 'for being too obvious' : 'for being too close to a real message'}
        </span>
        {s.note && <span className="muted" style={{ maxWidth: '34em', lineHeight: 1.4 }}>{s.note}</span>}
        <span style={{ flex: 1 }} />
        {s.done && (
          <motion.button
            type="button"
            className="btn btn-ink btn-big"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            onClick={() => send({ t: 'host:next' })}
          >
            {s.error ? 'Back to the lobby' : 'Start round 1'} <Icons.Arrow size="0.9em" />
          </motion.button>
        )}
      </footer>
    </>
  );
}
