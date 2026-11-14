import { COLORS, CREAM, FONT, INK } from './config';
import { heart, note, star } from './particles';
import { F_COFFEE, F_POP, TRAIL_N, type Actor } from './types';
import { clamp, easeOutBack, mix, rrect, TAU } from './util';

export function makeActor(id: string, kind: Actor['kind'], color: number, x: number, y: number, now: number): Actor {
  return {
    id,
    kind,
    sim: kind === 'me',
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    speed: 0,
    color,
    flags: 0,
    z: 0,
    trail: new Float32Array(TRAIL_N * 2),
    trailInit: false,
    emote: -1,
    emoteT: -10,
    wet: 0,
    say: '',
    sayT: -100,
    seen: now,
    buf: [],
    born: now,
  };
}

const SEG = 5.5;

/** A fitinha presa na ponta do ponteiro: uma corrente de pontos que segue o rabo da seta. */
export function updateTrail(a: Actor, dt: number, time: number) {
  const t = a.trail;
  const ax = a.x + 8;
  const ay = a.y - a.z + 21;
  if (!a.trailInit) {
    for (let i = 0; i < TRAIL_N; i++) {
      t[i * 2] = ax;
      t[i * 2 + 1] = ay + i * SEG;
    }
    a.trailInit = true;
  }
  t[0] = ax;
  t[1] = ay;
  for (let i = 1; i < TRAIL_N; i++) {
    // a fita pesa para baixo e treme de leve
    t[i * 2 + 1] += 46 * dt;
    t[i * 2] += Math.sin(time * 5 + i * 0.9 + a.born) * 6 * dt;
    const dx = t[i * 2] - t[(i - 1) * 2];
    const dy = t[i * 2 + 1] - t[(i - 1) * 2 + 1];
    const d = Math.hypot(dx, dy);
    if (d > SEG) {
      t[i * 2] = t[(i - 1) * 2] + (dx / d) * SEG;
      t[i * 2 + 1] = t[(i - 1) * 2 + 1] + (dy / d) * SEG;
    }
  }
}

function arrowPath(g: CanvasRenderingContext2D) {
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, 24);
  g.lineTo(6.2, 18.2);
  g.lineTo(10.6, 28);
  g.lineTo(15, 26);
  g.lineTo(10.6, 16.6);
  g.lineTo(18.6, 16.6);
  g.closePath();
}

export function drawPointer(g: CanvasRenderingContext2D, a: Actor, time: number, isMe: boolean) {
  const col = COLORS[a.color] ?? COLORS[0];
  const x = a.x;
  const y = a.y - a.z;
  const age = time - a.born;
  const appear = clamp(age / 0.35, 0, 1);
  const s = (isMe ? 1.12 : 1) * (0.4 + 0.6 * easeOutBack(appear));

  // sombra no chão: quanto mais alto, mais longe e mais clara
  g.save();
  g.translate(a.x + 3 + a.z * 0.35, a.y + 4 + a.z * 0.2);
  g.scale(s, s);
  g.globalAlpha = 0.2 * appear * clamp(1 - a.z / 120, 0.35, 1);
  g.fillStyle = INK;
  arrowPath(g);
  g.fill();
  g.restore();

  // fitinha
  const t = a.trail;
  if (a.trailInit) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = mix(col, '#FFFFFF', 0.45);
    for (let i = 1; i < TRAIL_N; i++) {
      g.globalAlpha = appear * (1 - i / TRAIL_N) * 0.95;
      g.lineWidth = 5 * (1 - i / (TRAIL_N + 2));
      g.beginPath();
      g.moveTo(t[(i - 1) * 2], t[(i - 1) * 2 + 1]);
      g.lineTo(t[i * 2], t[i * 2 + 1]);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // seta
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.globalAlpha = appear;
  g.lineJoin = 'round';
  arrowPath(g);
  g.strokeStyle = INK;
  g.lineWidth = 5.5;
  g.stroke();
  g.strokeStyle = CREAM;
  g.lineWidth = 2.6;
  g.stroke();
  g.fillStyle = col;
  g.fill();
  // brilho
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.moveTo(2.2, 5);
  g.lineTo(2.2, 17);
  g.lineTo(5.4, 14);
  g.closePath();
  g.fill();

  if (a.flags & F_POP) drawPopBag(g, 22, 22);
  if (a.flags & F_COFFEE) drawCup(g, 26, 3);
  g.restore();

  // anel que ajuda a pessoa a se achar quando entra
  if (isMe && age < 3.2) {
    const k = (age % 0.8) / 0.8;
    g.globalAlpha = (1 - k) * clamp(3.2 - age, 0, 1) * 0.8;
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x + 6, y + 10, 16 + k * 34, 0, TAU);
    g.stroke();
    g.globalAlpha = 1;
  }
}

/** Saquinho de pipoca ao lado do ponteiro. */
function drawPopBag(g: CanvasRenderingContext2D, x: number, y: number) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#FFF3C4';
  for (const [px, py] of [
    [-4, -2],
    [1, -4],
    [5, -1],
    [-1, 0],
  ]) {
    g.beginPath();
    g.arc(px, py, 3.2, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.moveTo(-7, 0);
  g.lineTo(7, 0);
  g.lineTo(5, 13);
  g.lineTo(-5, 13);
  g.closePath();
  g.fillStyle = '#FFFDF6';
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 1.4;
  g.stroke();
  g.fillStyle = '#D8483A';
  g.fillRect(-3.4, 1, 2.2, 11.4);
  g.fillRect(1.2, 1, 2.2, 11.4);
  g.restore();
}

/** Desenha o símbolo de uma expressão dentro de uma caixa de lado 2r centrada em (x, y). */
export function drawGlyph(g: CanvasRenderingContext2D, n: number, x: number, y: number, r: number) {
  switch (n) {
    case 0: // sorriso
      g.fillStyle = '#F2C230';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(x - r * 0.36, y - r * 0.22, r * 0.13, 0, TAU);
      g.arc(x + r * 0.36, y - r * 0.22, r * 0.13, 0, TAU);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = r * 0.16;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(x, y + r * 0.05, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      break;
    case 1:
      g.fillStyle = '#E4476B';
      heart(g, x, y - r * 0.05, r * 0.82);
      break;
    case 2:
      g.fillStyle = '#F2B01E';
      star(g, x, y, r * 1.05);
      break;
    case 3:
      g.fillStyle = '#2A7F86';
      note(g, x - r * 0.05, y, r * 0.95);
      break;
    case 4: // zzz
      g.fillStyle = '#6C5CE7';
      g.font = `800 ${r * 1.25}px "Baloo 2", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('zz', x, y + r * 0.08);
      break;
  }
}

export function drawEmote(g: CanvasRenderingContext2D, a: Actor, time: number) {
  const age = time - a.emoteT;
  if (a.emote < 0 || age > 2.4) return;
  const pop = easeOutBack(clamp(age / 0.22, 0, 1));
  const fade = clamp((2.4 - age) / 0.3, 0, 1);
  const bx = a.x + 26;
  const by = a.y - a.z - 22 - Math.sin(clamp(age, 0, 1) * Math.PI) * 4;
  g.save();
  g.translate(bx, by);
  g.scale(pop, pop);
  g.globalAlpha = fade;
  // rabinho do balão
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(-15, 12);
  g.lineTo(-23, 23);
  g.lineTo(-5, 16);
  g.closePath();
  g.fill();
  rrect(g, -19, -19, 38, 36, 12);
  g.fillStyle = '#FFFDF6';
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 2.6;
  g.stroke();
  drawGlyph(g, a.emote, 0, -1, 10.5);
  g.restore();
}

/** Xícara de café ao lado do ponteiro. */
function drawCup(g: CanvasRenderingContext2D, x: number, y: number) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = INK;
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(7, 4, 3.6, -1.2, 1.2);
  g.stroke();
  g.beginPath();
  g.moveTo(-6, -2);
  g.lineTo(6, -2);
  g.lineTo(4.6, 9);
  g.lineTo(-4.6, 9);
  g.closePath();
  g.fillStyle = '#FFFDF6';
  g.fill();
  g.stroke();
  g.fillStyle = '#7A4A2A';
  g.fillRect(-4.6, -1, 9.2, 2.6);
  g.restore();
}

/** Quanto tempo uma fala fica na tela: frases longas ficam mais. */
export function sayDuration(text: string) {
  return 3.5 + Math.min(8, text.length * 0.07);
}

/** Balão de fala do chat, acima do ponteiro. O texto vai para o canvas, nunca para o HTML. */
export function drawSay(g: CanvasRenderingContext2D, a: Actor, time: number) {
  if (!a.say) return;
  const age = time - a.sayT;
  const dur = sayDuration(a.say);
  if (age > dur) return;
  g.font = `600 15px ${FONT}`;
  const maxW = 224;
  const words: string[] = [];
  for (const w of a.say.split(' ')) {
    // palavra comprida demais para uma linha: quebra em pedaços
    for (let i = 0; i < w.length; i += 22) words.push(w.slice(i, i + 22));
  }
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (cur && g.measureText(test).width > maxW) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 6) lines.length = 6;
  let w = 0;
  for (const l of lines) w = Math.max(w, g.measureText(l).width);
  w += 24;
  const h = lines.length * 19 + 14;
  const pop = easeOutBack(clamp(age / 0.2, 0, 1));
  const fade = clamp((dur - age) / 0.35, 0, 1);
  const ax = a.x + 9;
  // se houver uma expressão aberta, a fala sobe para não cobrir
  const ay = a.y - a.z - 12 - (a.emote >= 0 && time - a.emoteT < 2.4 ? 42 : 0);
  g.save();
  g.translate(ax, ay);
  g.scale(pop, pop);
  g.globalAlpha = fade;
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(-7, -9);
  g.lineTo(0, 1);
  g.lineTo(7, -9);
  g.closePath();
  g.fill();
  rrect(g, -w / 2, -8 - h, w, h, 13);
  g.fillStyle = '#FFFDF6';
  g.fill();
  g.strokeStyle = COLORS[a.color] ?? INK;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) g.fillText(lines[i], 0, -8 - h + 17 + i * 19);
  g.restore();
}
