import { useEffect } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../sfx.js';
import { Avatar, Bubble, Icons, Stamp } from '../ui.jsx';

const TILT = { real: 1, ai: -1, plain: 0 };

export function Final({ state, send }) {
  const f = state.final;

  useEffect(() => {
    sfx.fanfare();
  }, []);

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1.5em' }}>
        <motion.h1
          className="display h-xl"
          style={{ fontSize: '5em', maxWidth: '13em' }}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        >
          {f.headline}
        </motion.h1>
        <div style={{ display: 'flex', gap: '0.75em', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.confirm('Start over with a different chat? This one is deleted.')) send({ t: 'host:end' });
            }}
          >
            <Icons.Upload /> New chat
          </button>
          <button type="button" className="btn btn-ink" onClick={() => send({ t: 'host:again' })}>
            <Icons.Restart /> Play again
          </button>
        </div>
      </div>

      <main className="final">
        <section className="ranking" aria-label="Final scores">
          {f.ranking.map((p, i) => (
            <motion.div
              key={p.id}
              className={`rank-row ${i === 0 ? 'first' : ''}`}
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 + (f.ranking.length - i) * 0.12, type: 'spring', stiffness: 220, damping: 20 }}
            >
              <span className="n">{p.rank}</span>
              <Avatar name={p.name} tint={p.tint} />
              <b>{p.name}</b>
              <span className="pts">{p.score.toLocaleString('en-IN')}</span>
            </motion.div>
          ))}
        </section>

        <section className="awards" aria-label="Awards">
          {f.awards.map((a, i) => (
            <motion.article
              key={a.kind}
              className={`award ${a.tone}`}
              initial={{ y: 40, opacity: 0, rotate: 0 }}
              animate={{ y: 0, opacity: 1, rotate: TILT[a.tone] }}
              transition={{ delay: 0.9 + i * 0.15, type: 'spring', stiffness: 240, damping: 18 }}
            >
              <span className="t">{a.title}</span>
              <span className="n">{a.name}</span>
              <p>{a.line}</p>
            </motion.article>
          ))}
        </section>
      </main>

      {f.fakeOfNight && (
        <motion.section className="fon on-ink" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.6 }}>
          <div className="label">
            <span className="kicker">Fake of the night</span>
            <b>
              Fooled {f.fakeOfNight.fooled} of {f.fakeOfNight.votes}.
            </b>
          </div>
          <Bubble name={f.fakeOfNight.subject} tint={f.fakeOfNight.tint} time={f.fakeOfNight.time} text={f.fakeOfNight.text} avatarSize="1.9em" />
          <Stamp fake small="" onInk delay={2} />
        </motion.section>
      )}
    </>
  );
}
