# Real or AI?

A party game for one big screen and everyone's phones. The AI reads your WhatsApp group, learns how each friend
texts, and mixes their real messages with fakes. Friends vote on their phones: real or AI?

Designs: the Claude Design canvas "Real or AI? — game screens" (https://claude.ai/artifact/4LRaTnk78JcrfgRWf1qAJv).

## Play

```bash
npm install
npm start
```

Open `http://localhost:3000/host` on the laptop or TV. Phones on the same Wi-Fi scan the QR code (or open the
`/play` address shown). For development, `npm run dev` and open `http://localhost:5173/host`.

## Put it online (Render, free)

The game needs one server that stays running (rooms and timers live in its memory), so it runs on Render
rather than Vercel. `render.yaml` describes the whole setup.

1. Put this folder in a GitHub repo (private is fine).
2. On https://render.com, sign in with GitHub, then **New › Blueprint** and pick the repo.
3. Render asks for two secrets:
   - `GEMINI_API_KEY`: your key from https://aistudio.google.com/apikey.
   - `HOST_PASSWORD`: anything you like. The big screen asks for it once, and phones never need it.
4. Click **Apply**. The first build takes a few minutes. Your game is at `https://<service-name>.onrender.com`.

Game night: open `/host` on the laptop or TV. Friends scan the QR code or open `/play` and type the code. Over a
video call, share your screen and send them the link.

Good to know:
- The free plan sleeps after 15 minutes with no visitors, so the first load can take about a minute. Open the
  host page a few minutes early. While it's open it keeps the server awake.
- A redeploy or restart ends any game in progress. Every push to GitHub redeploys, so don't push mid-game.

## AI fakes

Copy `.env.example` to `.env` and add one key:

- **Gemini (free):** key from https://aistudio.google.com/apikey, set `GEMINI_API_KEY`. Tries
  `gemini-3.6-flash`, then `gemini-3.5-flash`, then `gemini-flash-lite-latest`, skipping any that stall (the
  newest Flash models hung for minutes on the free plan in testing). Change the list with `GEMINI_MODEL`.
  On Google's free plan Google may keep and review what you send, so the phone consent box tells players before
  they agree. On a paid key, set `GEMINI_PAID=1`.
- **Mistral:** key from https://console.mistral.ai, set `MISTRAL_API_KEY`, and switch off "Anonymous improvement
  data" under Privacy.
- **Claude (paid, most convincing):** set `ANTHROPIC_API_KEY`.

If several are set, the order is Gemini, Mistral, Claude, unless `LLM_PROVIDER` says otherwise. The AI writes 12
fakes per player, then a second pass rates them and drops obvious, unkind or copied ones. Requests are spaced out
for free plans and retried when the provider says it's busy.

Without a key, your own chats get offline remixes (a Markov chain over each person's messages). The demo group
always uses its hand-written fakes and never calls an AI. Gemini has been tested end to end with a real key;
Mistral only against a stand-in server; Claude not yet.

## Rounds

- **Real or AI?**: one message, vote REAL or AI.
- **Find the real one**: four messages, one is real.
- **Bluff**: the person it's "from" is told the truth on their phone and claims "I sent that" or "Not mine".

Awards at the end: knows the group best, most clonable, unclonable, fell for it most, best poker face, fake of the night.

## Privacy

Only people who join and tick the consent box are used (and only their messages are sent to the AI). The chat
lives in server memory and is deleted when the game ends or the host is gone for 30 minutes. Set `HOST_PASSWORD`
whenever the game is online, so strangers can't start games on your AI key.

## Code

- `server/`: rooms and rounds (`game.js`), chat stats (`stats.js`), Gemini, Mistral and Claude (`ai.js`), offline fakes (`markov.js`), demo chat (`demo.js`)
- `src/whatsapp.js`: reads Android/iPhone exports (.txt or .zip) in the browser
- `src/host/`, `src/phone/`: big-screen and phone screens; `src/styles.css` holds the design tokens
