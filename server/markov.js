// Offline fakes: a word-level Markov chain trained on one person's messages.
// Rougher than Claude's, but it runs with no API key and still sounds like them.

import { words, tooCloseToReal, isSafeFake, overlap } from './stats.js';

const START = '\u0002';
const END = '\u0003';

function tokens(text) {
  return text.split(/\s+/).filter(Boolean);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function markovFakes(profile, { count = 10, seed = Date.now() } = {}) {
  const source = profile.messages.map((m) => m.text).filter((t) => !t.includes('\n') && t.length > 1);
  const chain = new Map();
  for (const text of source) {
    const toks = [START, START, ...tokens(text), END];
    for (let i = 2; i < toks.length; i += 1) {
      const key = `${toks[i - 2]} ${toks[i - 1]}`;
      if (!chain.has(key)) chain.set(key, []);
      chain.get(key).push(toks[i]);
    }
  }

  const lengths = source.map((t) => tokens(t).length).sort((a, b) => a - b);
  const minLen = Math.max(2, percentile(lengths, 0.25));
  const maxLen = Math.max(minLen + 2, percentile(lengths, 0.9));
  const random = rng(seed);
  const seen = new Set();
  const found = [];

  for (let attempt = 0; attempt < 400 && found.length < count * 2; attempt += 1) {
    const out = [];
    let a = START;
    let b = START;
    while (out.length < maxLen + 4) {
      const options = chain.get(`${a} ${b}`);
      if (!options) break;
      const next = options[Math.floor(random() * options.length)];
      if (next === END) break;
      out.push(next);
      a = b;
      b = next;
    }
    if (out.length < minLen || out.length > maxLen) continue;
    const text = out.join(' ');
    const key = words(text).join(' ');
    if (seen.has(key) || !isSafeFake(text) || tooCloseToReal(text, profile.messages)) continue;
    seen.add(key);
    // Lower overlap with any single real message = more original remix.
    const closest = Math.max(...profile.messages.map((m) => overlap(text, m.text)));
    found.push({ text, closest });
  }

  const top = profile.signature?.word;
  return found
    .sort((x, y) => x.closest - y.closest)
    .slice(0, count)
    .map((f, i) => ({
      text: f.text,
      why: top && words(f.text).includes(top)
        ? `Built around "${top}", ${profile.name}'s signature word.`
        : `Stitched together from ${profile.name}'s own phrases.`,
      score: 10 - i,
    }));
}
