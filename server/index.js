import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Rooms } from './game.js';
import { aiAvailable, aiName } from './ai.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file: offline mode unless ANTHROPIC_API_KEY is already in the environment.
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');
// In development Vite owns PORT-style ports and proxies /ws here, so the dev script passes --dev.
const DEV = process.argv.includes('--dev');
const PORT = Number(DEV ? process.env.GAME_PORT : process.env.PORT) || 3000;

function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) found.push(addr.address);
    }
  }
  // Home Wi-Fi addresses first; virtual adapters (WSL, VPNs) usually sit elsewhere.
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return found.sort((a, b) => rank(a) - rank(b));
}

const app = express();
app.get('/healthz', (_req, res) => res.send('ok'));
app.get('/api/info', (req, res) => {
  // LAN addresses only matter (and are only shared) when the host screen is on this machine.
  const local = ['localhost', '127.0.0.1', '::1'].includes(req.hostname);
  res.json({ lan: local ? lanAddresses() : [], ai: aiAvailable() });
});
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  // `root` keeps Express's hidden-folder check to the file name, so the app still works
  // when it lives somewhere like a .claude folder.
  app.use((_req, res) => res.sendFile('index.html', { root: dist }));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 * 1024 });
const rooms = new Rooms();

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      rooms.handle(ws, msg);
    } catch (err) {
      console.error('[real-or-ai] message failed', msg?.t, err);
      ws.send(JSON.stringify({ t: 'error', message: 'Something went wrong. Try that again.' }));
    }
  });
  ws.on('close', () => rooms.disconnect(ws));
});

// Drop sockets that vanished without closing (phones locking, Wi-Fi switching).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000).unref();

const onListenError = (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Close the other game server, or set ${DEV ? 'GAME_PORT' : 'PORT'} to another port.\n`);
    process.exit(1);
  }
  throw err;
};
// ws re-emits the HTTP server's errors on itself, so both need a listener.
server.on('error', onListenError);
wss.on('error', onListenError);

server.listen(PORT, () => {
  const lan = lanAddresses()[0];
  if (DEV) {
    console.log(`\n  Real or AI? game server on port ${PORT} (open the Vite URL, usually http://localhost:5173/host)`);
  } else {
    console.log(`\n  Real or AI? Open http://localhost:${PORT}/host on the big screen`);
    if (lan) console.log(`  Phones on the same Wi-Fi: http://${lan}:${PORT}/play`);
  }
  console.log(`  AI fakes: ${aiAvailable() ? `on (${aiName()})` : 'offline (add MISTRAL_API_KEY or ANTHROPIC_API_KEY to .env)'}`);
  if (!DEV && aiAvailable() && !process.env.HOST_PASSWORD) {
    console.log('  Warning: no HOST_PASSWORD set, so anyone with the link can host games on your AI key.');
  }
  console.log('');
});
