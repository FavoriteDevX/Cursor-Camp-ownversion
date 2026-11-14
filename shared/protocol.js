// Regras da rede, usadas tanto pelo site (src/) quanto pelo servidor de tempo real (server/).
// Fica em JavaScript puro para os dois lados rodarem exatamente o mesmo código.
// Os tipos estão em protocol.d.ts.

export const W = 3600;
export const H = 2400;

export const ID_RE = /^[a-z0-9]{4,16}$/;
export const TILE_COUNT = 112;
export const FLOWER_SLOTS = 60;
export const LAPTOPS = 8;
export const CHAT_MAX = 120;
export const FLAG_MAX = 63;

const int = (v, a, b) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(b, Math.max(a, v))) : null);

/** Diz se uma operação no estado compartilhado é permitida. */
export function validOp(k, o, v) {
  if (typeof k !== 'string' || typeof v !== 'number' || !Number.isInteger(v)) return false;
  let m;
  if ((m = /^m:(\d{1,3})$/.exec(k))) return o === 's' && +m[1] < TILE_COUNT && v >= 0 && v <= 40;
  if ((m = /^f:(\d{1,2})$/.exec(k))) return o === 's' && +m[1] < FLOWER_SLOTS && v >= 0 && v <= 4_000_000;
  if (k === 'coins' || k === 'commits') return o === 'i' && v === 1;
  if (k === 'sa' || k === 'sb') return o === 's' && v >= 0 && v <= 999;
  if (/^hs[0-2]$/.test(k)) return o === 'm' && v >= 1 && v <= 9999;
  return false;
}

export const KEY_RE = /^(m:\d{1,3}|f:\d{1,2}|coins|commits|sa|sb|hs[0-2])$/;

/** Aplica uma operação a um valor. `i` soma, `m` guarda o maior, `s` substitui. */
export function applyOp(prev, o, v) {
  if (o === 'i') return Math.min(999_999, prev + v);
  if (o === 'm') return Math.max(prev, v);
  return v;
}

// ------------------------------------------------------------------ chat

// Palavras trocadas por "•••". A lista é curta de propósito: pega o grosso, não substitui moderação humana.
const BAD_WORDS = [
  'porra', 'caralho', 'krl', 'crl', 'puta', 'puto', 'putinha', 'merda', 'bosta', 'cu', 'cuzao', 'cuzinho',
  'foder', 'fuder', 'foda', 'fodase', 'fdp', 'pqp', 'vsf', 'vtnc', 'tnc', 'buceta', 'boceta', 'xoxota', 'ppk',
  'piroca', 'pica', 'punheta', 'viado', 'veado', 'viadinho', 'bicha', 'traveco', 'sapatao',
  'arrombado', 'arrombada', 'vagabunda', 'vadia', 'piranha', 'corno', 'estupro', 'estuprar', 'pedofilo',
  'nudes', 'nude', 'sexo', 'transar', 'gostosa', 'tesao',
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'rape',
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'porn', 'porno', 'nazi', 'hitler',
];
// Radicais: qualquer palavra que comece assim também é trocada.
const BAD_STEMS = ['caralh', 'fodas', 'fodend', 'putari', 'bucet', 'bocet', 'arromb', 'estupr', 'punhet', 'pedofil', 'fuck', 'porn'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

/** Reduz uma palavra à forma comparável: sem acento, sem "l33t", sem letra repetida. */
function fold(word) {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const BAD_SET = new Set(BAD_WORDS.map(fold));
const STEMS = BAD_STEMS.map(fold);

/**
 * Limpa uma mensagem de chat. Devolve null se não sobrar nada.
 * Tira caracteres de controle, corta no limite e troca por "•••" o que não pode circular
 * numa praça pública e anônima: links, e-mails, telefones e palavrões.
 */
export function cleanChat(raw) {
  if (typeof raw !== 'string' || raw.length > 600) return null;
  let s = raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  s = Array.from(s).slice(0, CHAT_MAX).join('');
  s = s
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '•••')
    .replace(/\S+@\S+\.\S+/g, '•••')
    .replace(/\b[\w-]+\.(?:com|net|org|br|io|gg|me|app|dev|xyz|ly|tv|co|ru|cc|link|site|online)\b\S*/gi, '•••')
    .replace(/(?:\d[\s().-]*){8,}/g, '••• ');
  s = s
    .split(' ')
    .map((tok) => {
      const f = fold(tok);
      if (!f) return tok;
      if (BAD_SET.has(f) || STEMS.some((st) => f.startsWith(st))) return '•••';
      return tok;
    })
    .join(' ')
    .trim();
  return s || null;
}

// ------------------------------------------------------------------ mensagens

/**
 * Reconstrói a mensagem campo a campo. O que vem da rede nunca é usado direto.
 * `local` libera as mensagens que só existem entre abas do mesmo navegador.
 */
export function sanitize(raw, local) {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw;
  switch (m.t) {
    case 's': {
      const x = int(m.x, 0, W);
      const y = int(m.y, 0, H);
      const c = int(m.c, 0, 9);
      const f = int(m.f, 0, FLAG_MAX);
      if (x === null || y === null || c === null || f === null) return null;
      return { t: 's', x, y, c, f };
    }
    case 'e': {
      const a = local && typeof m.a === 'string' && /^bot-\d$/.test(m.a) ? m.a : undefined;
      if (m.k === 'ping') {
        const x = int(m.x, 0, W);
        const y = int(m.y, 0, H);
        if (x === null || y === null) return null;
        return { t: 'e', k: 'ping', x, y, a };
      }
      if (m.k === 'emo') {
        const n = int(m.n, 0, 4);
        if (n === null) return null;
        return { t: 'e', k: 'emo', n, a };
      }
      if (m.k === 'coin' || m.k === 'draw') {
        const x = int(m.x, 0, W);
        const y = int(m.y, 0, H);
        const tx = int(m.tx, 0, W);
        const ty = int(m.ty, 0, H);
        if (x === null || y === null || tx === null || ty === null) return null;
        return { t: 'e', k: m.k, x, y, tx, ty, a };
      }
      if (m.k === 'goal') {
        const s = int(m.s, 0, 1);
        const sa = int(m.sa, 0, 999);
        const sb = int(m.sb, 0, 999);
        if (s === null || sa === null || sb === null) return null;
        const by = typeof m.by === 'string' && /^[a-z0-9-]{1,16}$/.test(m.by) ? m.by : '';
        return { t: 'e', k: 'goal', s, sa, sb, by };
      }
      if (m.k === 'commit') {
        const n = int(m.n, 0, LAPTOPS - 1);
        if (n === null) return null;
        return { t: 'e', k: 'commit', n, a };
      }
      if (m.k === 'deploy') return { t: 'e', k: 'deploy', a };
      return null;
    }
    case 'c': {
      const text = cleanChat(m.m);
      return text ? { t: 'c', m: text } : null;
    }
    case 'k': {
      if (!validOp(m.k, m.o, m.v)) return null;
      return { t: 'k', k: m.k, o: m.o, v: m.v };
    }
    case 'b': {
      const x = int(m.x, 0, W);
      const y = int(m.y, 0, H);
      const vx = int(m.vx, -2000, 2000);
      const vy = int(m.vy, -2000, 2000);
      const sa = int(m.sa, 0, 999);
      const sb = int(m.sb, 0, 999);
      const r = int(m.r, 0, 5000);
      if (x === null || y === null || vx === null || vy === null || sa === null || sb === null || r === null) return null;
      return { t: 'b', x, y, vx, vy, sa, sb, r };
    }
    case 'bs': {
      if (!local || !Array.isArray(m.l) || m.l.length > 10) return null;
      const l = [];
      for (const row of m.l) {
        if (!Array.isArray(row)) return null;
        const i = int(row[0], 0, 9);
        const x = int(row[1], 0, W);
        const y = int(row[2], 0, H);
        const c = int(row[3], 0, 9);
        const f = int(row[4], 0, FLAG_MAX);
        if (i === null || x === null || y === null || c === null || f === null) return null;
        l.push([i, x, y, c, f]);
      }
      return { t: 'bs', l };
    }
    case 'h':
      return local ? { t: 'h' } : null;
    case 'snap': {
      if (!local || typeof m.to !== 'string' || !m.s || typeof m.s !== 'object') return null;
      const s = {};
      for (const [k, v] of Object.entries(m.s)) {
        if (KEY_RE.test(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 9_999_999) s[k] = v;
      }
      return { t: 'snap', to: m.to, s };
    }
    case 'bye':
      return { t: 'bye' };
    default:
      return null;
  }
}
