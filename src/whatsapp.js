// Reads a WhatsApp "Export chat" file (.txt, or the .zip iPhones make) in the browser.
// Handles Android ("12/03/24, 9:52 pm - Name: text") and iPhone ("[12/03/24, 9:52:13 PM] Name: text").

import { unzipSync, strFromU8 } from 'fflate';

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const START = /^\[?(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?\]?\s*(?:[-–]\s*)?(.*)$/i;
const SKIP = [
  /^<?media omitted>?$/i,
  /^(image|video|audio|sticker|gif|document|contact card|photo) omitted$/i,
  /^<attached: /i,
  /\(file attached\)$/i,
  /^this message was deleted\.?$/i,
  /^you deleted this message\.?$/i,
  /^waiting for this message/i,
  /^null$/i,
  /^missed (voice|video) call/i,
  /^location: /i,
  /^live location shared$/i,
  /^poll:/i,
  /^view once/i,
];

function groupNameFrom(fileName) {
  const base = fileName.replace(/\.(txt|zip)$/i, '');
  const m = base.match(/WhatsApp Chat (?:with |- )(.+)$/i);
  return (m ? m[1] : base).trim() || 'Your group';
}

async function readText(file) {
  if (/\.zip$/i.test(file.name)) {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /\.txt$/i.test(f.name) });
    const names = Object.keys(files);
    const chat = names.find((n) => /_chat\.txt$/i.test(n)) ?? names[0];
    if (!chat) throw new Error('That zip has no chat inside. Export the chat again and pick the .txt or .zip WhatsApp gives you.');
    return strFromU8(files[chat]);
  }
  return file.text();
}

export async function parseWhatsAppFile(file) {
  const raw = await readText(file);
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  // First pass: work out whether dates are day-first or month-first.
  let dayFirst = null;
  let yearFirst = false;
  for (const line of lines.slice(0, 4000)) {
    const m = line.replace(INVISIBLE, '').match(START);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 31) {
      yearFirst = true;
      break;
    }
    if (a > 12) {
      dayFirst = true;
      break;
    }
    if (b > 12) {
      dayFirst = false;
      break;
    }
  }
  dayFirst ??= true;

  const people = [];
  const index = new Map();
  const messages = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const text = current.text.replace(/\s*<This message was edited>\s*$/i, '').trim();
    if (text && !SKIP.some((re) => re.test(text))) {
      if (!index.has(current.sender)) {
        index.set(current.sender, people.length);
        people.push(current.sender);
      }
      messages.push([index.get(current.sender), text, current.ts]);
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(INVISIBLE, '');
    const m = line.match(START);
    if (!m) {
      if (current) current.text += `\n${line}`;
      continue;
    }
    flush();
    const [, p1, p2, p3, hh, mm, , ampm, rest] = m;
    const colon = rest.indexOf(': ');
    if (colon <= 0) continue; // "Rohan added Sneha", "Messages are end-to-end encrypted", etc.
    const sender = rest.slice(0, colon).replace(/^~\s*/, '').trim();
    if (!sender) continue;

    let day;
    let month;
    let year;
    if (yearFirst) [year, month, day] = [p1, p2, p3].map(Number);
    else if (dayFirst) [day, month, year] = [p1, p2, p3].map(Number);
    else [month, day, year] = [p1, p2, p3].map(Number);
    if (year < 100) year += 2000;
    let hour = Number(hh);
    if (ampm) {
      const pm = /^p/i.test(ampm);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    // Wall-clock time stored as UTC so the server shows exactly what the chat said.
    const ts = Date.UTC(year, month - 1, day, hour, Number(mm));
    current = { sender, text: rest.slice(colon + 2), ts: Number.isFinite(ts) ? ts : 0 };
  }
  flush();

  if (!messages.length) {
    throw new Error("Couldn't find any messages in that file. Make sure it's a WhatsApp chat export.");
  }
  return { groupName: groupNameFrom(file.name), people, messages };
}
