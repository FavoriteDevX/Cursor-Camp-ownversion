// Servidor de tempo real da Pracinha.
//
// Ele só repassa mensagens entre quem está na mesma sala e guarda o estado compartilhado
// (azulejos, flores, moedas, placar, commits, recordes) na memória. Não guarda conversa nenhuma.
// Toda mensagem é reconstruída pelas mesmas regras que o site usa (shared/protocol.js):
// o que não passa na regra é descartado.
//
// Rodar:  npm run relay            (porta 8787)
// Variáveis de ambiente:
//   PORT             porta (padrão 8787)
//   ALLOWED_ORIGINS  origens aceitas, separadas por vírgula (ex.: https://pracinha.vercel.app).
//                    Vazio = aceita qualquer origem (só para desenvolvimento).
//   ROOM_CAP         visitantes por sala (padrão 60); acima disso abre outra sala
//   MAX_CLIENTS      conexões no total (padrão 500)
//   MAX_PER_IP       conexões por endereço (padrão 8)
//   TRUST_PROXY      "0" para ignorar o cabeçalho X-Forwarded-For (padrão: usa, porque
//                    em hospedagens como Render, Fly e Railway todos chegam pelo mesmo proxy)
//   ROOM_TTL_MIN     minutos que uma sala vazia guarda o seu estado (padrão 360)

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { applyOp, sanitize } from '../shared/protocol.js';

const PORT = Number(process.env.PORT) || 8787;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
const ROOM_CAP = Number(process.env.ROOM_CAP) || 60;
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS) || 500;
const MAX_PER_IP = Number(process.env.MAX_PER_IP) || 8;
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';
const ROOM_TTL = (Number(process.env.ROOM_TTL_MIN) || 360) * 60_000;
const TICK_MS = 50;

/** @type {Map<string, { name: string, clients: Map<string, any>, store: Map<string, number>, queue: {from: string, json: string}[], emptyAt: number }>} */
const rooms = new Map();
/** @type {Map<string, number>} */
const perIp = new Map();
let total = 0;

// Os ids saem em ordem de chegada. O site escolhe como anfitrião o menor id da sala,
// ou seja, quem está há mais tempo: quem acabou de chegar nunca toma o lugar de quem já estava.
const ABC = 'abcdefghijklmnopqrstuvwxyz0123456789';
let seq = 0;
function newId() {
  return (seq++).toString(36).padStart(7, '0') + ABC[Math.floor(Math.random() * ABC.length)];
}

function ipOf(req) {
  const xff = req.headers['x-forwarded-for'];
  if (TRUST_PROXY && typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

/** Acha uma sala com vaga: "praca", depois "praca-2", "praca-3"… */
function pickRoom(base) {
  for (let n = 1; n < 200; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    let room = rooms.get(name);
    if (!room) {
      room = { name, clients: new Map(), store: new Map(), queue: [], emptyAt: 0 };
      rooms.set(name, room);
    }
    if (room.clients.size < ROOM_CAP) return room;
  }
  return null;
}

/** Balde de fichas: `rate` por segundo, até `burst` de uma vez. */
function take(bucket, rate, burst, now) {
  bucket.n = Math.min(burst, bucket.n + ((now - bucket.t) / 1000) * rate);
  bucket.t = now;
  if (bucket.n < 1) return false;
  bucket.n -= 1;
  return true;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: total, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Pracinha — servidor de tempo real. Conecte por WebSocket.\n');
});

const wss = new WebSocketServer({
  server,
  maxPayload: 1024,
  perMessageDeflate: false,
  verifyClient(info, done) {
    const origin = (info.origin || '').replace(/\/$/, '');
    if (ORIGINS.length && !ORIGINS.includes(origin)) return done(false, 403, 'origem não permitida');
    if (total >= MAX_CLIENTS) return done(false, 503, 'praça cheia');
    if ((perIp.get(ipOf(info.req)) || 0) >= MAX_PER_IP) return done(false, 429, 'muitas conexões');
    done(true);
  },
});

wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  let base = 'praca';
  try {
    const r = new URL(req.url || '/', 'http://x').searchParams.get('room') || '';
    if (/^[a-z0-9-]{1,24}$/.test(r)) base = r;
  } catch {
    /* fica na sala padrão */
  }
  const room = pickRoom(base);
  if (!room) {
    ws.close(1013, 'sem vaga');
    return;
  }

  const now = Date.now();
  const c = {
    id: newId(),
    ws,
    ip,
    alive: true,
    state: null,
    dirty: false,
    strikes: 0,
    all: { n: 100, t: now },
    chat: { n: 3, t: now },
    ops: { n: 16, t: now },
  };
  room.clients.set(c.id, c);
  room.emptyAt = 0;
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  total++;

  ws.send(JSON.stringify({ t: 'hi', id: c.id, snap: Object.fromEntries(room.store) }));
  // quem já está na praça aparece na hora para quem chega
  const here = [];
  for (const o of room.clients.values()) if (o !== c && o.state) here.push(JSON.stringify([o.id, o.state]));
  if (here.length) ws.send('[' + here.join(',') + ']');

  ws.on('pong', () => (c.alive = true));

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const t = Date.now();
    if (!take(c.all, 50, 100, t)) {
      // insistiu demais: desconecta
      if (++c.strikes > 300) ws.close(1008, 'devagar');
      return;
    }
    let raw;
    try {
      raw = JSON.parse(data.toString());
    } catch {
      return;
    }
    const m = sanitize(raw, false);
    if (!m) return;
    switch (m.t) {
      case 's':
        c.state = m;
        c.dirty = true;
        return;
      case 'c':
        if (!take(c.chat, 1 / 1.2, 3, t)) return;
        break;
      case 'k': {
        if (!take(c.ops, 8, 16, t)) return;
        const prev = room.store.get(m.k) || 0;
        const next = applyOp(prev, m.o, m.v);
        if (next === prev) return;
        room.store.set(m.k, next);
        break;
      }
      case 'e':
      case 'b':
        break;
      default:
        return;
    }
    room.queue.push({ from: c.id, json: JSON.stringify([c.id, m]) });
  });

  ws.on('close', () => {
    if (!room.clients.delete(c.id)) return;
    total--;
    const n = (perIp.get(ip) || 1) - 1;
    if (n <= 0) perIp.delete(ip);
    else perIp.set(ip, n);
    room.queue.push({ from: c.id, json: JSON.stringify([c.id, { t: 'bye' }]) });
    if (room.clients.size === 0) room.emptyAt = Date.now();
  });

  ws.on('error', () => ws.terminate());
});

// A cada 50 ms junta tudo o que chegou e manda um único pacote para cada visitante.
setInterval(() => {
  for (const room of rooms.values()) {
    const parts = room.queue;
    room.queue = [];
    for (const c of room.clients.values()) {
      if (!c.dirty) continue;
      c.dirty = false;
      parts.push({ from: c.id, json: JSON.stringify([c.id, c.state]) });
    }
    if (!parts.length) continue;
    const senders = new Set(parts.map((p) => p.from));
    const full = '[' + parts.map((p) => p.json).join(',') + ']';
    for (const c of room.clients.values()) {
      if (c.ws.readyState !== 1 || c.ws.bufferedAmount > 1_000_000) continue;
      if (!senders.has(c.id)) {
        c.ws.send(full);
        continue;
      }
      // ninguém recebe de volta o que ele mesmo mandou
      const mine = parts.filter((p) => p.from !== c.id);
      if (mine.length) c.ws.send('[' + mine.map((p) => p.json).join(',') + ']');
    }
  }
}, TICK_MS);

// Derruba conexões mortas e esquece salas vazias há muito tempo.
setInterval(() => {
  const now = Date.now();
  for (const [name, room] of rooms) {
    for (const c of room.clients.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
    if (room.clients.size === 0 && room.emptyAt && now - room.emptyAt > ROOM_TTL) rooms.delete(name);
  }
}, 30_000);

server.listen(PORT, () => {
  console.log(`Pracinha: servidor de tempo real na porta ${PORT}`);
  if (!ORIGINS.length) console.log('Aviso: ALLOWED_ORIGINS vazio, aceitando qualquer origem. Defina-o em produção.');
});
