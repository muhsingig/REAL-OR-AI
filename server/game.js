import crypto from 'node:crypto';
import { buildProfiles, studyCards, offlineNotes, tooCloseToReal, isSafeFake } from './stats.js';
import { aiAvailable, aiName, aiDataNote, writeFakes, isAuthError } from './ai.js';
import { markovFakes } from './markov.js';
import { demoChat, demoFakes } from './demo.js';

const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';
const TINTS = ['#FFD5C2', '#CBD5FF', '#D9F2C4', '#FFE89A', '#F3C6E8', '#C9EDEE', '#FFC9B5', '#E3D5FF', '#CFEFD9', '#FFE0B8', '#D6E4FF', '#F7D6D0'];
// Round types in order; the game takes the first N. roa = "real or AI", find = "find the real one".
const ROUND_PLAN = ['roa', 'roa', 'roa', 'find', 'roa', 'bluff', 'roa', 'find', 'bluff', 'roa', 'roa', 'find', 'roa', 'bluff', 'roa'];
const POINTS = { right: 100, find: 150, speed: 50, bluff: 100 };
const CLAIM_MS = 30000;
const HOST_IDLE_TTL = 30 * 60 * 1000;

const newId = () => crypto.randomBytes(9).toString('base64url');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function runLimited(items, limit, work) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await work(queue.shift());
  });
  await Promise.all(workers);
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// When HOST_PASSWORD is set, only people who know it can open a room (and spend the AI key).
function hostPasswordOk(given) {
  const required = process.env.HOST_PASSWORD;
  if (!required) return true;
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(required);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Timestamps are wall-clock times stored as UTC, so read them back with getUTC*.
function formatTime(ts) {
  const d = new Date(ts);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export class Rooms {
  constructor() {
    this.rooms = new Map();
    setInterval(() => this.sweep(), 60000).unref();
  }

  newCode() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }

  handle(ws, msg) {
    switch (msg.t) {
      case 'host:create': {
        if (!hostPasswordOk(msg.password)) return send(ws, { t: 'need-password', wrong: Boolean(msg.password) });
        const room = new Room(this.newCode(), this);
        this.rooms.set(room.code, room);
        room.attachHost(ws);
        return;
      }
      case 'host:resume': {
        const room = this.rooms.get(msg.code);
        if (!room || room.hostToken !== msg.hostToken) return send(ws, { t: 'gone', role: 'host' });
        room.attachHost(ws);
        return;
      }
      case 'player:join':
      case 'player:resume': {
        const room = this.rooms.get(String(msg.code ?? '').trim().toUpperCase());
        if (!room) {
          if (msg.t === 'player:resume') return send(ws, { t: 'gone', role: 'player' });
          return send(ws, { t: 'error', code: 'no-room', message: 'No game with that code. Check the big screen.' });
        }
        room.join(ws, msg.playerId);
        return;
      }
      default:
        ws.room?.handle(ws, msg);
    }
  }

  disconnect(ws) {
    ws.room?.detach(ws);
  }

  remove(room) {
    this.rooms.delete(room.code);
  }

  sweep() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.hostIdleSince && now - room.hostIdleSince > HOST_IDLE_TTL) room.destroy();
    }
  }
}

class Room {
  constructor(code, rooms) {
    this.code = code;
    this.rooms = rooms;
    this.hostToken = newId();
    this.hosts = new Set();
    this.hostIdleSince = null;
    this.players = new Map();
    this.phase = 'setup';
    this.chat = null;
    this.settings = { rounds: 10, voteSeconds: 20, bluff: true };
    this.study = null;
    this.pool = {};
    this.usedTexts = new Set();
    this.plan = [];
    this.round = null;
    this.timer = null;
    this.final = null;
    this.resetTally();
  }

  resetTally() {
    this.tally = { voters: {}, subjects: {}, fakes: [] };
  }

  // ---- connections ----

  attachHost(ws) {
    ws.room = this;
    ws.role = 'host';
    this.hosts.add(ws);
    this.hostIdleSince = null;
    send(ws, { t: 'hosting', code: this.code, hostToken: this.hostToken });
    this.push();
  }

  join(ws, playerId) {
    let player = playerId ? this.players.get(playerId) : null;
    if (!player) {
      player = { id: newId(), name: null, chatName: null, tint: null, score: 0, sockets: new Set(), joinedAt: Date.now() };
      this.players.set(player.id, player);
    }
    ws.room = this;
    ws.role = 'player';
    ws.playerId = player.id;
    player.sockets.add(ws);
    send(ws, { t: 'joined', code: this.code, playerId: player.id });
    this.push();
  }

  detach(ws) {
    if (ws.role === 'host') {
      this.hosts.delete(ws);
      if (!this.hosts.size) this.hostIdleSince = Date.now();
    } else {
      const player = this.players.get(ws.playerId);
      player?.sockets.delete(ws);
      // A phone that never picked a name and went away is just dropped.
      if (player && !player.sockets.size && !player.name) this.players.delete(player.id);
    }
    this.push();
    this.maybeRevealEarly();
  }

  destroy() {
    clearTimeout(this.timer);
    this.studyToken = null;
    for (const ws of this.hosts) send(ws, { t: 'gone', role: 'host' });
    for (const p of this.players.values()) for (const ws of p.sockets) send(ws, { t: 'gone', role: 'player' });
    // Drop the chat itself; nothing is kept once a room ends.
    this.chat = null;
    this.pool = {};
    this.rooms.remove(this);
  }

  // ---- messages ----

  handle(ws, msg) {
    if (ws.role === 'host') return this.handleHost(ws, msg);
    if (ws.role === 'player') return this.handlePlayer(ws, msg);
  }

  handleHost(ws, msg) {
    switch (msg.t) {
      case 'host:chat':
        return this.loadChat(msg);
      case 'host:demo':
        return this.loadDemo();
      case 'host:unload':
        if (this.phase === 'lobby') {
          this.chat = null;
          this.phase = 'setup';
          for (const p of this.players.values()) Object.assign(p, { name: null, chatName: null, tint: null });
          this.push();
        }
        return;
      case 'host:settings': {
        const s = msg.settings ?? {};
        if ([6, 8, 10, 12, 15].includes(s.rounds)) this.settings.rounds = s.rounds;
        if ([15, 20, 30, 45].includes(s.voteSeconds)) this.settings.voteSeconds = s.voteSeconds;
        if (typeof s.bluff === 'boolean') this.settings.bluff = s.bluff;
        this.push();
        return;
      }
      case 'host:start':
        return this.startStudy();
      case 'host:next':
        return this.next();
      case 'host:again':
        return this.again();
      case 'host:kick': {
        const p = this.players.get(msg.playerId);
        if (p && this.phase === 'lobby') {
          for (const s of p.sockets) send(s, { t: 'gone', role: 'player', kicked: true });
          this.players.delete(p.id);
          this.push();
        }
        return;
      }
      case 'host:end':
        return this.destroy();
      default:
    }
  }

  handlePlayer(ws, msg) {
    const player = this.players.get(ws.playerId);
    if (!player) return;
    switch (msg.t) {
      case 'player:claim':
        return this.claim(ws, player, msg);
      case 'player:unclaim':
        if (this.phase === 'lobby' || this.phase === 'setup') {
          Object.assign(player, { name: null, chatName: null, tint: null });
          this.push();
        }
        return;
      case 'player:vote':
        return this.vote(player, msg.choice);
      case 'player:bluff':
        return this.bluffClaim(player, msg.claim);
      case 'player:leave':
        for (const s of player.sockets) send(s, { t: 'gone', role: 'player', left: true });
        this.players.delete(player.id);
        this.push();
        this.maybeRevealEarly();
        return;
      default:
    }
  }

  // ---- setup & lobby ----

  loadChat(msg) {
    if (this.phase !== 'setup' && this.phase !== 'lobby') return;
    const people = Array.isArray(msg.people) ? msg.people.slice(0, 500).map((n) => String(n).slice(0, 60)) : [];
    const rows = Array.isArray(msg.messages) ? msg.messages.slice(0, 300000) : [];
    const messages = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const [who, text, ts] = row;
      const sender = people[who];
      if (!sender || typeof text !== 'string' || !text.trim()) continue;
      messages.push({ sender, text: text.slice(0, 1000), ts: Number(ts) || 0 });
    }
    if (!messages.length) {
      for (const ws of this.hosts) send(ws, { t: 'error', message: 'That chat had no readable messages.' });
      return;
    }
    this.setChat(String(msg.groupName || 'Your group').slice(0, 80), messages, false);
  }

  loadDemo() {
    if (this.phase !== 'setup' && this.phase !== 'lobby') return;
    const { groupName, messages } = demoChat();
    this.setChat(groupName, messages, true);
  }

  setChat(groupName, messages, demo) {
    const counts = new Map();
    for (const m of messages) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
    const people = [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, count, tint: TINTS[i % TINTS.length] }));
    this.chat = { groupName, messages, people, demo };
    for (const p of this.players.values()) {
      if (p.chatName && !counts.has(p.chatName)) Object.assign(p, { name: null, chatName: null, tint: null });
    }
    this.phase = 'lobby';
    this.push();
  }

  claim(ws, player, msg) {
    if (this.phase === 'final' || !this.chat) return;
    if (msg.chatName) {
      const person = this.chat.people.find((p) => p.name === msg.chatName);
      const taken = [...this.players.values()].some((p) => p !== player && p.chatName === msg.chatName);
      if (!person || taken) return send(ws, { t: 'error', message: 'Someone already picked that name.' });
      if (!msg.consent) return send(ws, { t: 'error', message: 'Tick the box so the AI can use your messages.' });
      Object.assign(player, { name: person.name, chatName: person.name, tint: person.tint });
    } else {
      const name = String(msg.guestName ?? '').trim().slice(0, 24);
      if (!name) return send(ws, { t: 'error', message: 'Type a name first.' });
      const guests = [...this.players.values()].filter((p) => p.name && !p.chatName).length;
      Object.assign(player, { name, chatName: null, tint: player.tint ?? TINTS[(this.chat.people.length + guests) % TINTS.length] });
    }
    this.push();
  }

  named() {
    return [...this.players.values()].filter((p) => p.name);
  }

  // ---- studying ----

  async startStudy() {
    if (this.phase !== 'lobby' || !this.chat) return;
    const subjects = this.named().filter((p) => p.chatName).map((p) => p.chatName);
    if (this.named().length < 2 || !subjects.length) {
      for (const ws of this.hosts) send(ws, { t: 'error', message: 'You need at least 2 players, and at least one of them from the chat.' });
      return;
    }

    this.phase = 'studying';
    this.pool = {};
    this.resetTally();
    for (const p of this.players.values()) p.score = 0;

    const profiles = buildProfiles(this.chat.messages, subjects);
    const loudest = subjects.reduce((a, b) => (profiles[b].count > profiles[a].count ? b : a));
    const tintOf = Object.fromEntries(this.chat.people.map((p) => [p.name, p.tint]));
    const mode = this.chat.demo ? 'demo' : aiAvailable() ? 'ai' : 'offline';
    this.study = {
      mode,
      total: this.chat.messages.length,
      cards: studyCards(profiles, loudest).map((c) => ({ ...c, tint: tintOf[c.name], status: 'reading' })),
      written: 0,
      dropped: 0,
      done: false,
      error: null,
      note: mode === 'offline' ? 'Offline mode: no AI key, so fakes are remixed from your own messages. Add a free MISTRAL_API_KEY for sharper ones.' : null,
    };
    this.push();

    const token = newId();
    this.studyToken = token;
    // Only people who joined and agreed are ever sent to the model, context included.
    const joined = new Set(subjects);
    const groupSample = shuffle(this.chat.messages.filter((m) => joined.has(m.sender) && !m.text.includes('\n')))
      .slice(0, 160)
      .sort((a, b) => a.ts - b.ts);

    await runLimited(subjects, 3, async (name) => {
      const profile = profiles[name];
      let result = null;
      if (mode === 'demo') {
        await sleep(1200 + Math.random() * 2600);
        result = demoFakes(name);
      } else if (mode === 'ai' && !this.aiBroken) {
        try {
          result = await writeFakes({ groupName: this.chat.groupName, profile, others: subjects.filter((n) => n !== name), groupSample });
        } catch (err) {
          console.warn(`[real-or-ai] AI fakes failed for ${name}:`, err.message);
          if (isAuthError(err)) this.aiBroken = true;
          if (this.study) this.study.note = 'The AI could not be reached, so some fakes were remixed offline instead.';
        }
      }
      if (!result) {
        if (mode === 'offline') await sleep(900 + Math.random() * 1500);
        result = { notes: offlineNotes(profile), fakes: markovFakes(profile, { count: 10 }), dropped: 0 };
      }
      if (this.studyToken !== token) return;

      const fakes = result.fakes.filter((f) => isSafeFake(f.text) && !tooCloseToReal(f.text, profile.messages) && !this.usedTexts.has(f.text));
      const reals = shuffle(profile.reals.filter((m) => !this.usedTexts.has(m.text)));
      this.pool[name] = {
        notes: result.notes,
        fakes,
        reals,
        hours: profile.messages.filter((m) => m.ts).map((m) => m.ts),
      };
      const card = this.study.cards.find((c) => c.name === name);
      const usable = fakes.length >= 2 && reals.length >= 2;
      if (card) card.status = usable ? 'done' : 'skipped';
      if (card && !usable) card.line = 'Not enough messages to copy. Playing as a guesser.';
      this.study.written += result.fakes.length + (result.dropped ?? 0);
      this.study.dropped += (result.dropped ?? 0) + (result.fakes.length - fakes.length);
      this.push();
    });
    if (this.studyToken !== token) return;

    this.plan = this.makePlan();
    if (!this.plan.length) {
      this.study.error = 'Not enough messages to copy anyone yet. Try a bigger chat export.';
    }
    this.study.done = true;
    this.push();
  }

  makePlan() {
    const eligible = Object.keys(this.pool).filter((n) => this.pool[n].fakes.length >= 2 && this.pool[n].reals.length >= 2);
    if (!eligible.length) return [];
    const types = ROUND_PLAN.slice(0, this.settings.rounds).map((t) => (t === 'bluff' && !this.settings.bluff ? 'roa' : t));
    const order = [];
    let bag = [];
    for (let i = 0; i < types.length; i += 1) {
      if (!bag.length) bag = shuffle(eligible);
      let subject = bag.pop();
      if (subject === order[i - 1] && bag.length) {
        bag.unshift(subject);
        subject = bag.pop();
      }
      order.push(subject);
    }
    const binary = types.filter((t) => t !== 'find').length;
    const flags = shuffle(Array.from({ length: binary }, (_, i) => i < Math.ceil(binary / 2)));
    let f = 0;
    return types.map((type, i) => ({ type, subject: order[i], fake: type === 'find' ? null : flags[f++] }));
  }

  // Later rounds get the most convincing fakes.
  takeFakes(subject, count, progress) {
    const pool = this.pool[subject];
    const out = [];
    for (let k = 0; k < count && pool.fakes.length; k += 1) {
      const idx = Math.min(pool.fakes.length - 1, Math.floor((1 - progress) * (pool.fakes.length - 1) * 0.6));
      const [fake] = pool.fakes.splice(idx, 1);
      const hour = pool.hours.length ? pool.hours[Math.floor(Math.random() * pool.hours.length)] : Date.UTC(2025, 0, 1, 20);
      const ts = hour - (hour % 3600000) + Math.floor(Math.random() * 60) * 60000;
      this.usedTexts.add(fake.text);
      out.push({ text: fake.text, time: formatTime(ts), fake: true, why: fake.why });
    }
    return out;
  }

  takeReal(subject) {
    const pool = this.pool[subject];
    const real = pool.reals.shift();
    if (!real) return null;
    this.usedTexts.add(real.text);
    return { text: real.text, time: real.ts ? formatTime(real.ts) : '', date: real.ts ? formatDate(real.ts) : null, fake: false };
  }

  // ---- rounds ----

  next() {
    if (this.phase === 'studying' && this.study?.done) {
      if (this.study.error) {
        this.phase = 'lobby';
        this.study = null;
        this.push();
        return;
      }
      return this.startRound(0);
    }
    if (this.phase !== 'round' || !this.round) return;
    if (this.round.phase === 'claim') return this.bluffClaim(this.players.get(this.round.subjectId), 'mine', true);
    if (this.round.phase === 'vote') return this.reveal();
    if (this.round.index + 1 < this.plan.length) return this.startRound(this.round.index + 1);
    return this.finish();
  }

  startRound(index) {
    clearTimeout(this.timer);
    const spec = this.plan[index];
    let { type, fake } = spec;
    const { subject } = spec;
    const subjectPlayer = this.named().find((p) => p.chatName === subject);
    if (type === 'bluff' && !subjectPlayer?.sockets.size) type = 'roa';
    if (fake === null) fake = Math.random() < 0.5;
    const progress = this.plan.length > 1 ? index / (this.plan.length - 1) : 1;

    let message = null;
    let options = null;
    let answer = null;
    if (type === 'find') {
      const pool = this.pool[subject];
      if (pool.fakes.length >= 3 && pool.reals.length >= 1) {
        const fakes = this.takeFakes(subject, 3, progress);
        const real = this.takeReal(subject);
        options = shuffle([...fakes, real]);
        answer = options.indexOf(real);
      } else {
        type = 'roa';
      }
    }
    if (type !== 'find') {
      message = fake ? this.takeFakes(subject, 1, progress)[0] : this.takeReal(subject);
      message ??= fake ? this.takeReal(subject) : this.takeFakes(subject, 1, progress)[0];
      if (!message) {
        // This person has run out of material; move on rather than stall the game.
        if (index + 1 < this.plan.length) return this.startRound(index + 1);
        return this.finish();
      }
    }

    this.round = {
      index,
      type,
      subject,
      subjectId: subjectPlayer?.id ?? null,
      message,
      options,
      answer,
      phase: type === 'bluff' ? 'claim' : 'vote',
      claim: null,
      votes: new Map(),
      deadline: null,
      voteMs: this.settings.voteSeconds * 1000,
      results: null,
    };
    this.phase = 'round';
    if (type === 'bluff') {
      this.round.deadline = Date.now() + CLAIM_MS;
      this.timer = setTimeout(() => this.bluffClaim(subjectPlayer, 'mine', true), CLAIM_MS);
    } else {
      this.openVoting();
    }
    this.push();
  }

  openVoting() {
    const r = this.round;
    r.phase = 'vote';
    r.deadline = Date.now() + r.voteMs;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reveal(), r.voteMs + 250);
  }

  bluffClaim(player, claim, forced = false) {
    const r = this.round;
    if (!r || r.type !== 'bluff' || r.phase !== 'claim') return;
    if (!forced && player?.id !== r.subjectId) return;
    if (claim !== 'mine' && claim !== 'notmine') return;
    r.claim = claim;
    this.openVoting();
    this.push();
  }

  expectedVoters() {
    const r = this.round;
    return this.named().filter((p) => p.id !== r?.subjectId && p.sockets.size);
  }

  vote(player, choice) {
    const r = this.round;
    if (!r || r.phase !== 'vote' || !player.name || player.id === r.subjectId || r.votes.has(player.id)) return;
    const valid = r.type === 'find' ? Number.isInteger(choice) && choice >= 0 && choice < r.options.length : choice === 'real' || choice === 'ai';
    if (!valid) return;
    r.votes.set(player.id, { choice, at: Date.now() });
    this.push();
    this.maybeRevealEarly();
  }

  maybeRevealEarly() {
    const r = this.round;
    if (this.phase !== 'round' || !r || r.phase !== 'vote') return;
    const expected = this.expectedVoters();
    if (expected.length && expected.every((p) => r.votes.has(p.id))) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.reveal(), 700);
    }
  }

  reveal() {
    const r = this.round;
    if (!r || r.phase !== 'vote') return;
    clearTimeout(this.timer);
    r.phase = 'reveal';
    const truth = r.type === 'find' ? r.answer : r.message.fake ? 'ai' : 'real';
    const results = [];
    let fooled = 0;

    for (const [pid, v] of r.votes) {
      const p = this.players.get(pid);
      if (!p) continue;
      const correct = v.choice === truth;
      const speed = Math.max(0, Math.min(1, (r.deadline - v.at) / r.voteMs));
      const points = correct ? (r.type === 'find' ? POINTS.find : POINTS.right) + Math.round(POINTS.speed * speed) : 0;
      p.score += points;
      // "Fooled" means they believed a fake. Calling a real message AI is a wrong guess, not being fooled.
      const wasFooled = !correct && (r.type === 'find' || truth === 'ai');
      if (wasFooled) fooled += 1;
      const t = (this.tally.voters[pid] ??= { answered: 0, correct: 0, fooled: 0 });
      t.answered += 1;
      if (correct) t.correct += 1;
      if (wasFooled) t.fooled += 1;
      results.push({ id: pid, name: p.name, tint: p.tint, choice: v.choice, correct, points });
    }
    results.sort((a, b) => b.points - a.points);

    let bluffPoints = 0;
    if (r.type === 'bluff') {
      const wrong = results.filter((x) => !x.correct).length;
      bluffPoints = wrong * POINTS.bluff;
      const subject = this.players.get(r.subjectId);
      if (subject) subject.score += bluffPoints;
      const s = (this.tally.subjects[r.subject] ??= { fakeVotes: 0, fakeFooled: 0, bluffed: 0 });
      s.bluffed += wrong;
    }

    const voterCount = results.length;
    if (r.type === 'find' || r.message.fake) {
      const s = (this.tally.subjects[r.subject] ??= { fakeVotes: 0, fakeFooled: 0, bluffed: 0 });
      s.fakeVotes += voterCount;
      s.fakeFooled += fooled;
      if (r.type === 'find') {
        r.options.forEach((o, i) => {
          if (!o.fake) return;
          const picked = results.filter((x) => x.choice === i).length;
          this.tally.fakes.push({ subject: r.subject, text: o.text, time: o.time, fooled: picked, votes: voterCount });
        });
      } else {
        this.tally.fakes.push({ subject: r.subject, text: r.message.text, time: r.message.time, fooled, votes: voterCount });
      }
    }

    const missed = this.expectedVoters().filter((p) => !r.votes.has(p.id)).map((p) => ({ id: p.id, name: p.name, tint: p.tint }));
    r.results = { truth, results, missed, bluffPoints, fooled, voterCount };
    this.push();
  }

  ranking() {
    return this.named().sort((a, b) => b.score - a.score);
  }

  finish() {
    clearTimeout(this.timer);
    this.phase = 'final';
    this.round = null;
    this.final = this.computeAwards();
    this.push();
  }

  computeAwards() {
    const ranking = this.ranking();
    const top = ranking[0];
    const voters = this.tally.voters;
    const awards = [];

    if (top && top.score > 0) {
      const t = voters[top.id] ?? { correct: 0, answered: 0 };
      awards.push({ kind: 'best', tone: 'plain', title: 'Knows the group best', name: top.name, tint: top.tint, line: `Caught ${t.correct} out of ${t.answered}. Suspicious, honestly.` });
    }

    const subjects = Object.entries(this.tally.subjects)
      .filter(([, s]) => s.fakeVotes >= 2)
      .map(([name, s]) => ({ name, ratio: s.fakeFooled / s.fakeVotes, ...s }));
    if (subjects.length) {
      const most = subjects.reduce((a, b) => (b.ratio > a.ratio ? b : a));
      if (most.fakeFooled > 0) {
        const quip = most.ratio >= 0.6 ? 'The AI barely had to try.' : most.ratio >= 0.35 ? 'Easier to copy than you think.' : 'Still the easiest to copy.';
        awards.push({ kind: 'clonable', tone: 'real', title: 'Most clonable', name: most.name, tint: this.tintFor(most.name), line: `Fake ${most.name} fooled ${Math.round(most.ratio * 100)}% of you. ${quip}` });
      }
      const least = subjects.filter((s) => s.name !== most.name).reduce((a, b) => (!a || b.ratio < a.ratio ? b : a), null);
      if (least) {
        awards.push({ kind: 'unclonable', tone: 'ai', title: 'Unclonable', name: least.name, tint: this.tintFor(least.name), line: `Only ${least.fakeFooled} of ${least.fakeVotes} fell for fake ${least.name}. The AI gave up.` });
      }
    }

    const gullible = Object.entries(voters)
      .filter(([, v]) => v.fooled > 0)
      .sort((a, b) => b[1].fooled - a[1].fooled)[0];
    if (gullible) {
      const p = this.players.get(gullible[0]);
      if (p) awards.push({ kind: 'gullible', tone: 'plain', title: 'Fell for it most', name: p.name, tint: p.tint, line: `Believed ${gullible[1].fooled} fake${gullible[1].fooled === 1 ? '' : 's'}. Never share your OTP.` });
    }

    const bluffer = Object.entries(this.tally.subjects)
      .filter(([, s]) => s.bluffed > 0)
      .sort((a, b) => b[1].bluffed - a[1].bluffed)[0];
    if (bluffer) {
      awards.push({ kind: 'bluffer', tone: 'plain', title: 'Best poker face', name: bluffer[0], tint: this.tintFor(bluffer[0]), line: `Lied straight to ${bluffer[1].bluffed} friend${bluffer[1].bluffed === 1 ? '' : 's'}. Worrying.` });
    }

    const fakeOfNight = [...this.tally.fakes]
      .filter((f) => f.fooled > 0)
      .sort((a, b) => b.fooled - a.fooled || b.fooled / b.votes - a.fooled / a.votes)[0] ?? null;

    let headline = 'Nobody saw that coming.';
    if (top && ranking[1] && ranking[1].score === top.score && top.score > 0) headline = `${top.name} and ${ranking[1].name} tied. Rematch?`;
    else if (top && top.score > 0) headline = `${top.name} knows you all too well.`;

    return {
      headline,
      ranking: ranking.map((p, i) => ({ id: p.id, name: p.name, tint: p.tint, score: p.score, rank: i + 1 })),
      awards,
      fakeOfNight: fakeOfNight && { ...fakeOfNight, tint: this.tintFor(fakeOfNight.subject) },
    };
  }

  again() {
    if (this.phase !== 'final') return;
    clearTimeout(this.timer);
    this.phase = 'lobby';
    this.final = null;
    this.round = null;
    this.study = null;
    this.plan = [];
    for (const p of this.players.values()) p.score = 0;
    this.resetTally();
    this.push();
  }

  tintFor(name) {
    return this.chat?.people.find((p) => p.name === name)?.tint ?? this.named().find((p) => p.name === name)?.tint ?? TINTS[0];
  }

  // ---- views ----

  publicRound() {
    const r = this.round;
    if (!r) return null;
    const subjectPlayer = this.players.get(r.subjectId);
    const view = {
      index: r.index,
      type: r.type,
      phase: r.phase,
      subject: r.subject,
      subjectTint: this.tintFor(r.subject),
      subjectPlaying: Boolean(subjectPlayer),
      message: r.message && { text: r.message.text, time: r.message.time },
      options: r.options && r.options.map((o) => ({ text: o.text, time: o.time })),
      claim: r.phase === 'claim' ? null : r.claim,
      remainingMs: r.deadline ? Math.max(0, r.deadline - Date.now()) : null,
      totalMs: r.phase === 'claim' ? CLAIM_MS : r.voteMs,
      voted: [...r.votes.keys()],
      expected: this.expectedVoters().map((p) => p.id),
    };
    if (r.phase === 'reveal') {
      view.reveal = {
        ...r.results,
        fake: r.message ? r.message.fake : null,
        why: r.message?.why ?? null,
        date: r.message?.date ?? (r.options ? r.options[r.answer].date : null),
        notes: this.pool[r.subject]?.notes ?? [],
        options: r.options && r.options.map((o) => ({ text: o.text, time: o.time, fake: o.fake, why: o.why ?? null })),
      };
    }
    return view;
  }

  playerList() {
    return this.named().map((p) => ({ id: p.id, name: p.name, tint: p.tint, score: p.score, connected: p.sockets.size > 0, chatName: p.chatName }));
  }

  hostView() {
    const claimedBy = new Map(this.named().filter((p) => p.chatName).map((p) => [p.chatName, p]));
    return {
      role: 'host',
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      ai: aiAvailable(),
      aiName: aiName(),
      aiNote: aiDataNote(),
      chat: this.chat && {
        groupName: this.chat.groupName,
        total: this.chat.messages.length,
        demo: this.chat.demo,
        peopleCount: this.chat.people.length,
        people: this.chat.people.slice(0, 60).map((p) => ({
          name: p.name,
          count: p.count,
          tint: p.tint,
          joined: claimedBy.has(p.name),
          connected: claimedBy.get(p.name)?.sockets.size > 0,
        })),
      },
      players: this.playerList(),
      guests: this.named().filter((p) => !p.chatName).map((p) => ({ id: p.id, name: p.name, tint: p.tint, connected: p.sockets.size > 0 })),
      choosing: [...this.players.values()].filter((p) => !p.name && p.sockets.size).length,
      study: this.study,
      round: this.publicRound(),
      roundsTotal: this.plan.length,
      final: this.final,
    };
  }

  playerView(player) {
    const ranking = this.ranking();
    const rank = ranking.findIndex((p) => p.id === player.id) + 1;
    const claimed = new Set(this.named().filter((p) => p.chatName && p.id !== player.id).map((p) => p.chatName));
    const r = this.round;
    let round = null;
    if (r) {
      const pub = this.publicRound();
      const mine = r.votes.get(player.id);
      round = {
        ...pub,
        reveal: undefined,
        isSubject: r.subjectId === player.id,
        secret: r.subjectId === player.id && r.type === 'bluff' ? { fake: r.message.fake } : null,
        myVote: mine ? mine.choice : null,
      };
      if (r.phase === 'reveal') {
        const res = r.results.results.find((x) => x.id === player.id);
        round.result = {
          truth: r.results.truth,
          fake: r.message ? r.message.fake : null,
          voted: Boolean(res),
          correct: res?.correct ?? false,
          points: r.subjectId === player.id ? r.results.bluffPoints : res?.points ?? 0,
          fooled: r.results.fooled,
          voterCount: r.results.voterCount,
        };
      }
    }
    return {
      role: 'player',
      code: this.code,
      phase: this.phase,
      hostConnected: this.hosts.size > 0,
      // The demo never sends anything to an AI, so only real chats get the notice.
      ai: this.chat && !this.chat.demo && aiAvailable() ? { name: aiName(), note: aiDataNote() } : null,
      me: { id: player.id, name: player.name, chatName: player.chatName, tint: player.tint, score: player.score, rank, of: ranking.length },
      chat: this.chat && {
        groupName: this.chat.groupName,
        demo: this.chat.demo,
        people: this.chat.people.map((p) => ({ name: p.name, count: p.count, tint: p.tint, taken: claimed.has(p.name) })),
      },
      players: this.playerList(),
      study: this.study && { done: this.study.done, mode: this.study.mode, card: this.study.cards.find((c) => c.name === player.chatName) ?? null },
      round,
      roundsTotal: this.plan.length,
      final: this.final && {
        headline: this.final.headline,
        ranking: this.final.ranking,
        awards: this.final.awards.filter((a) => a.name === player.name),
      },
    };
  }

  push() {
    if (!this.chat && this.phase !== 'setup') return;
    const host = JSON.stringify({ t: 'state', state: this.hostView() });
    for (const ws of this.hosts) if (ws.readyState === 1) ws.send(host);
    for (const p of this.players.values()) {
      if (!p.sockets.size) continue;
      const view = JSON.stringify({ t: 'state', state: this.playerView(p) });
      for (const ws of p.sockets) if (ws.readyState === 1) ws.send(view);
    }
  }
}
