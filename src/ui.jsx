import { motion } from 'motion/react';
import { useRemaining } from './net.js';

export function Logo() {
  return (
    <span className="logo" role="img" aria-label="Real or AI?">
      <span className="logo-chip logo-real" aria-hidden="true">Real</span>
      <span className="logo-or" aria-hidden="true">or</span>
      <span className="logo-chip logo-ai" aria-hidden="true">AI?</span>
    </span>
  );
}

export function Avatar({ name, tint, size = '2.75em', className = '' }) {
  return (
    <span className={`avatar ${className}`} style={{ '--s': size, background: tint ?? '#E8E2D3' }} aria-hidden="true">
      <span>{(name ?? '?').trim().charAt(0).toUpperCase()}</span>
    </span>
  );
}

export function Bubble({ name, tint, time, text, avatarSize = '2.2em', className = '', children, label }) {
  return (
    <figure className={`bubble-wrap ${className}`}>
      {name && (
        <figcaption className="bubble-meta">
          {label}
          <Avatar name={name} tint={tint} size={avatarSize} />
          <span className="bubble-name">{name}</span>
          {time && <span className="bubble-time">{time}</span>}
        </figcaption>
      )}
      <blockquote className="bubble">{text}</blockquote>
      {children}
    </figure>
  );
}

// The rubber stamp that slams onto a message at the reveal.
export function Stamp({ fake, small, onInk, delay = 0, still = false }) {
  const label = small ?? (fake ? 'WRITTEN BY' : 'REALLY SENT');
  const word = fake ? 'AI' : 'REAL';
  const body = (
    <span className={`stamp ${fake ? 'stamp-ai' : 'stamp-real'} ${onInk ? 'on-ink' : ''}`} role="img" aria-label={`${label} ${word}`}>
      {label && <small>{label}</small>}
      <span>{word}</span>
    </span>
  );
  if (still) return body;
  return (
    <motion.span
      style={{ display: 'inline-block' }}
      initial={{ scale: 2.6, rotate: -24, opacity: 0 }}
      animate={{ scale: 1, rotate: -9, opacity: 1 }}
      transition={{ delay, type: 'spring', stiffness: 520, damping: 22, mass: 0.9 }}
    >
      {body}
    </motion.span>
  );
}

export function TimerBar({ remainingMs, totalMs, receivedAt }) {
  const left = useRemaining(remainingMs, receivedAt);
  if (left == null) return null;
  const frac = totalMs ? left / totalMs : 0;
  const secs = Math.ceil(left / 1000);
  return (
    <div className="timer">
      <div className="timer-track" role="img" aria-label={`${secs} seconds left`}>
        <div className={`timer-fill ${secs <= 5 ? 'hot' : ''}`} style={{ transform: `scaleX(${Math.max(0, Math.min(1, frac))})` }} />
      </div>
      <span className="timer-num" aria-hidden="true">{secs}</span>
    </div>
  );
}

export function TypingDots() {
  return (
    <span className="dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

const icon = (paths, { fill = 'none', w = 2.2 } = {}) =>
  function Icon({ size = '1.15em', color = 'currentColor' }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {paths}
      </svg>
    );
  };

export const Icons = {
  Arrow: icon(<path d="M5 12h14M13 6l6 6-6 6" />, { w: 2.5 }),
  Check: icon(<path d="M5 12.5l4.5 4.5L19 7.5" />, { w: 3 }),
  Chat: icon(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />),
  Upload: icon(<path d="M12 16V4M7 9l5-5 5 5M5 20h14" />),
  Pen: icon(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>,
  ),
  Bin: icon(<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />),
  Lock: icon(
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>,
  ),
  EyeOff: icon(
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3 3l18 18" />
    </>,
  ),
  Sound: icon(
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </>,
  ),
  Mute: icon(
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </>,
  ),
  Restart: icon(
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>,
  ),
  Notes: icon(
    <>
      <path d="M4 4h12l4 4v12H4z" />
      <path d="M8 11h8M8 15h5" />
    </>,
  ),
  Phone: icon(
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M11 18h2" />
    </>,
  ),
  Screen: icon(
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>,
  ),
  Close: icon(<path d="M6 6l12 12M18 6L6 18" />, { w: 2.5 }),
};

export function Toast({ message }) {
  if (!message) return null;
  return (
    <motion.div className="toast" role="alert" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      {message}
    </motion.div>
  );
}

export function ConnectionLine({ status }) {
  if (status === 'open') return null;
  return <div className="status-line" role="status">{status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</div>;
}
