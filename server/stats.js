// Reads a person's messages and works out how they text: the facts shown on the
// "AI is studying you" screen, the hints given to the model, and which real
// messages are safe and interesting enough to show in a round.

const EMOJI = /\p{Extended_Pictographic}/gu;
const LAUGH = /^(?:(?:ha){2,}h?|(?:he){2,}|(?:hi){2,}|lo+l|lmf?a+o+|rofl|xd+|😂|🤣|💀)$/iu;

// Words too common to say anything about a person (English + Hinglish).
const STOPWORDS = new Set(
  `a an the i me my you your u ur we our they them he she it its is am are was were be been to of in on at for with and or but so
  if not no yes ok okay k hmm this that these those there here what when where who why how do does did done have has had
  will would can could should just like get got go going come coming all any some one two also too very really then than
  im i'm its it's dont don't cant can't yeah ya haan han na nahi nhi hai hain ho hu hoon tha thi the kya kyu kyun ye yeh wo woh
  ka ki ke ko se me mein main mai mujhe mera meri mere tu tum aap apna bhi to toh hi ek aur par pe kar karo karna kuch abhi
  sab koi kaun kab kaha kahan raha rahi rahe tha gaya gayi diya liya de do le lo hua hui wala wali wale bas ab`
    .split(/\s+/)
    .filter(Boolean),
);

const SENSITIVE = /\b(otp|password|passcode|pin|cvv|bank|account|a\/c|ifsc|upi|paytm|gpay|phonepe|aadhaar|aadhar|pan card|address|loan|salary|rent|hospital|doctor|medicine|pregnan|period|sex|nude|drunk|weed|breakup|divorce|died|death|funeral|suicide)\b/i;

export function words(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
}

export function normalize(text) {
  return words(text).join(' ');
}

// Jaccard overlap of word sets, used to catch fakes that copy a real line.
export function overlap(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / (A.size + B.size - shared);
}

export function tooCloseToReal(text, reals) {
  const n = normalize(text);
  if (!n) return true;
  for (const r of reals) {
    const rn = normalize(r.text);
    if (!rn) continue;
    if (rn === n || rn.includes(n) || n.includes(rn) && rn.length > 12) return true;
    if (overlap(text, r.text) >= 0.72) return true;
  }
  return false;
}

// Real messages we are willing to put on the big screen.
export function isShowable(text) {
  if (text.length < 6 || text.length > 170) return false;
  if (text.includes('\n')) return false;
  if (/https?:\/\/|www\./i.test(text)) return false;
  if (/\d{6,}/.test(text.replace(/\s/g, ''))) return false;
  if (/@\d{6,}/.test(text)) return false;
  if (SENSITIVE.test(text)) return false;
  if (!/\p{L}/u.test(text)) return false;
  return true;
}

export function isSafeFake(text) {
  return isShowable(text) && text.trim().length > 0;
}

function topEntry(map) {
  let best = null;
  for (const [key, count] of map) if (!best || count > best[1]) best = [key, count];
  return best;
}

function formatHour(h) {
  if (h === 0) return '12 am';
  if (h === 12) return '12 pm';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

function pick(list, seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

// Builds a profile per person. `messages` are {sender, text, ts}; `names` limits who gets profiled.
export function buildProfiles(messages, names) {
  const allWords = new Map();
  const byPerson = new Map(names.map((n) => [n, []]));
  for (const m of messages) {
    for (const w of words(m.text)) allWords.set(w, (allWords.get(w) ?? 0) + 1);
    byPerson.get(m.sender)?.push(m);
  }

  const profiles = {};
  for (const [name, msgs] of byPerson) {
    const wordCounts = new Map();
    const emojiCounts = new Map();
    const laughCounts = new Map();
    const hours = new Array(24).fill(0);
    let totalWords = 0;
    let caps = 0;
    let lowerStarts = 0;

    for (const m of msgs) {
      const ws = words(m.text);
      totalWords += ws.length;
      for (const w of ws) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
      for (const e of m.text.match(EMOJI) ?? []) emojiCounts.set(e, (emojiCounts.get(e) ?? 0) + 1);
      for (const tok of m.text.split(/\s+/)) {
        const t = tok.replace(/[.!?,]+$/, '');
        if (LAUGH.test(t)) {
          const key = /^(ha)+h?$/i.test(t) ? 'haha' : t.toLowerCase();
          laughCounts.set(key, (laughCounts.get(key) ?? 0) + 1);
        }
      }
      const letters = m.text.replace(/[^\p{L}]/gu, '');
      if (letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) caps += 1;
      const first = m.text.trim().match(/\p{L}/u)?.[0];
      if (first && first === first.toLowerCase() && first !== first.toUpperCase()) lowerStarts += 1;
      // Timestamps are wall-clock times stored as UTC.
      if (m.ts) hours[new Date(m.ts).getUTCHours()] += 1;
    }

    let signature = null;
    const minCount = msgs.length > 200 ? 4 : 2;
    for (const [w, c] of wordCounts) {
      if (c < minCount || w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      const share = c / (allWords.get(w) ?? c);
      const score = share * Math.log(1 + c);
      if (!signature || score > signature.score) signature = { word: w, count: c, score };
    }

    const hourCount = Math.max(...hours);
    const busiestHour = hourCount > 0 ? hours.indexOf(hourCount) : null;
    const emoji = topEntry(emojiCounts);
    const laugh = topEntry(laughCounts);
    const reals = msgs.filter((m) => isShowable(m.text));

    profiles[name] = {
      name,
      count: msgs.length,
      avgWords: msgs.length ? totalWords / msgs.length : 0,
      signature,
      emoji: emoji && emoji[1] >= 2 ? { char: emoji[0], count: emoji[1] } : null,
      laugh: laugh && laugh[1] >= 2 ? { word: laugh[0], count: laugh[1] } : null,
      caps,
      lowercaseShare: msgs.length ? lowerStarts / msgs.length : 0,
      busiestHour,
      messages: msgs,
      reals,
    };
  }
  return profiles;
}

// Plain-language facts for the model prompt.
export function describeForPrompt(p) {
  const lines = [
    `${p.count} messages in the export, ${p.avgWords.toFixed(1)} words per message on average.`,
    `${Math.round(p.lowercaseShare * 100)}% of messages start with a lowercase letter.`,
  ];
  if (p.signature) lines.push(`Uses "${p.signature.word}" ${p.signature.count} times, more than anyone else.`);
  if (p.emoji) lines.push(`Favourite emoji: ${p.emoji.char} (${p.emoji.count} times).`);
  if (p.laugh) lines.push(`Usual laugh: "${p.laugh.word}" (${p.laugh.count} times).`);
  if (p.caps >= 2) lines.push(`${p.caps} messages written fully in CAPS.`);
  if (p.busiestHour !== null) lines.push(`Most active around ${formatHour(p.busiestHour)}.`);
  return lines;
}

// One headline fact per person for the studying screen, varied across the group.
export function studyCards(profiles, loudest) {
  const used = new Map();
  const cards = [];
  for (const p of Object.values(profiles)) {
    const options = [];
    if (p.signature && p.signature.count >= 3) {
      options.push({
        kind: 'word',
        weight: 3 + p.signature.count / 10,
        stat: `"${p.signature.word}"`,
        line: `said ${p.signature.count} times. ${pick(['A signature move.', 'Nobody else comes close.', 'Every. Single. Week.'], p.name)}`,
      });
    }
    if (p.emoji && p.emoji.count >= 3) {
      options.push({ kind: 'emoji', weight: 2.5 + p.emoji.count / 20, stat: `${p.emoji.char} ×${p.emoji.count}`, line: 'their favourite emoji. Used for good news and bad.' });
    }
    if (p.caps >= 3) {
      options.push({ kind: 'caps', weight: 2 + p.caps / 5, stat: String(p.caps), line: 'messages in ALL CAPS. The group heard every one.' });
    }
    if (p.laugh && p.laugh.count >= 3) {
      options.push({ kind: 'laugh', weight: 2.2, stat: `"${p.laugh.word}"`, line: `their laugh of choice, ${p.laugh.count} times.` });
    }
    if (p.busiestHour !== null && (p.busiestHour <= 4 || p.busiestHour >= 23)) {
      options.push({ kind: 'hour', weight: 3, stat: formatHour(p.busiestHour), line: 'their busiest hour in the group. Sleep is optional.' });
    }
    if (p.avgWords > 0 && (p.avgWords < 4 || p.avgWords > 14)) {
      options.push({
        kind: 'length',
        weight: 2,
        stat: p.avgWords.toFixed(1),
        line: p.avgWords < 4 ? 'words per message, on average. Brevity is a lifestyle.' : 'words per message, on average. Essays only.',
      });
    }
    if (p.name === loudest) {
      options.push({ kind: 'count', weight: 1.8, stat: p.count.toLocaleString('en-IN'), line: 'messages sent. The loudest voice in the group.' });
    }
    if (!options.length) {
      options.push({ kind: 'count', weight: 1, stat: p.count.toLocaleString('en-IN'), line: 'messages read. Every one of them.' });
    }
    // Prefer kinds nobody else has been given yet, so the cards don't all say the same thing.
    options.sort((a, b) => b.weight / (1 + (used.get(b.kind) ?? 0) * 2) - a.weight / (1 + (used.get(a.kind) ?? 0) * 2));
    const chosen = options[0];
    used.set(chosen.kind, (used.get(chosen.kind) ?? 0) + 1);
    cards.push({ name: p.name, stat: chosen.stat, line: chosen.line });
  }
  return cards;
}

// Short notes about a person, used when the model is unavailable.
export function offlineNotes(p) {
  const notes = [];
  if (p.signature) notes.push(`Says "${p.signature.word}" more than anyone in the group.`);
  if (p.emoji) notes.push(`Reaches for ${p.emoji.char} whenever words run out.`);
  if (p.caps >= 3) notes.push('Switches to ALL CAPS when things get serious.');
  if (p.avgWords < 4) notes.push('Rarely uses more than four words.');
  if (p.lowercaseShare > 0.8) notes.push('Capital letters are optional.');
  if (p.laugh) notes.push(`Laughs in "${p.laugh.word}".`);
  return notes.slice(0, 3);
}
