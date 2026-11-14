import { COLORS, FONT, INK, P } from '../config';
import type { Game } from '../game';
import { K, star } from '../particles';
import type { Activity, Actor } from '../types';
import { circle, dist, rgba, TAU } from '../util';
import { CORETO } from './scenery';

const X = CORETO.x;
const Y = CORETO.y;
const R = 200;
const RC = 58;
/** Escala pentatônica: qualquer sequência soa bem, então ninguém "erra". */
const FREQ = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const NAMES = ['do', 're', 'mi', 'sol', 'la', 'do', 're', 'mi'];
const FLAGS = [P.terracotta, P.mustard, P.teal, P.pink, P.leaf];

/** Ponto no centro de uma das 8 fatias do piso. */
export function wedgeSpot(i: number, r = 128): [number, number] {
  const a = (i * TAU) / 8;
  return [X + Math.cos(a) * r, Y + Math.sin(a) * r];
}

/**
 * Coreto musical. O piso tem oito fatias; cada uma toca uma nota quando um ponteiro entra.
 * O som nasce da posição de quem está lá, então todos ouvem a mesma música sem mandar nada extra pela rede.
 */
export class Coreto implements Activity {
  private glow = new Float32Array(9);
  private glowColor: string[] = new Array(9).fill('#fff');
  private where = new Map<string, number>();
  private myNotes = 0;

  constructor(private game: Game) {}

  private wedgeOf(x: number, y: number): number {
    const d = dist(x, y, X, Y);
    if (d > R) return -1;
    if (d < RC) return 8;
    const a = (Math.atan2(y - Y, x - X) + TAU + TAU / 16) % TAU;
    return Math.floor(a / (TAU / 8)) % 8;
  }

  update(dt: number) {
    const game = this.game;
    for (let i = 0; i < 9; i++) this.glow[i] = Math.max(0, this.glow[i] - dt * 2.4);
    for (const a of game.list) {
      const w = this.wedgeOf(a.x, a.y);
      const prev = this.where.get(a.id) ?? -1;
      if (w === prev) continue;
      this.where.set(a.id, w);
      if (w >= 0) this.hit(a, w);
    }
    if (this.where.size > game.list.length + 30) this.where.clear();
  }

  private hit(a: Actor, w: number) {
    const game = this.game;
    this.glow[w] = 1;
    this.glowColor[w] = COLORS[a.color];
    if (w === 8) {
      game.sfx.drum(X, Y);
      return;
    }
    game.sfx.note(FREQ[w], X, Y);
    game.fx.add({ k: K.Note, x: a.x + 10, y: a.y - 10, vy: -46, vx: (Math.random() - 0.5) * 30, size: 9, color: COLORS[a.color], life: 0.9 });
    if (a === game.me && ++this.myNotes >= 8) game.album.award('maestro');
  }

  private vertex(i: number, r = R): [number, number] {
    const a = (i * TAU) / 8 + TAU / 16;
    return [X + Math.cos(a) * r, Y + Math.sin(a) * r];
  }

  drawGround(g: CanvasRenderingContext2D) {
    if (!this.game.inView(X, Y, R + 60)) return;
    // sombra do piso
    g.fillStyle = rgba(INK, 0.16);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const [x, y] = this.vertex(i, R + 6);
      if (i === 0) g.moveTo(x + 8, y + 10);
      else g.lineTo(x + 8, y + 10);
    }
    g.closePath();
    g.fill();

    for (let i = 0; i < 8; i++) {
      const [x0, y0] = this.vertex(i - 1);
      const [x1, y1] = this.vertex(i);
      g.beginPath();
      g.moveTo(X, Y);
      g.lineTo(x0, y0);
      g.lineTo(x1, y1);
      g.closePath();
      g.fillStyle = i % 2 === 0 ? '#FBE6C6' : '#F5D2A4';
      g.fill();
      if (this.glow[i] > 0) {
        g.fillStyle = rgba(this.glowColor[i], this.glow[i] * 0.75);
        g.fill();
      }
    }
    g.strokeStyle = rgba(P.terracottaDark, 0.5);
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const [x, y] = this.vertex(i);
      g.beginPath();
      g.moveTo(X, Y);
      g.lineTo(x, y);
      g.stroke();
    }
    // nome das notas
    g.font = `700 20px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = rgba(INK, 0.42);
    for (let i = 0; i < 8; i++) {
      const [x, y] = wedgeSpot(i, 146);
      g.fillText(NAMES[i], x, y);
    }
    // borda
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const [x, y] = this.vertex(i);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = P.terracotta;
    g.lineWidth = 12;
    g.lineJoin = 'round';
    g.stroke();
    // miolo: o bumbo
    circle(g, X, Y, RC);
    g.fillStyle = P.teal;
    g.fill();
    if (this.glow[8] > 0) {
      g.fillStyle = rgba('#FFFFFF', this.glow[8] * 0.5);
      g.fill();
    }
    g.strokeStyle = P.tealDark;
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = P.mustard;
    star(g, X, Y, 26 + this.glow[8] * 6, this.game.time * 0.2);
  }

  drawMid(g: CanvasRenderingContext2D) {
    if (!this.game.inView(X, Y, R + 60)) return;
    const time = this.game.time;
    // bandeirinhas entre os postes
    for (let i = 0; i < 8; i++) {
      const [x0, y0] = this.vertex(i, R + 4);
      const [x1, y1] = this.vertex(i + 1, R + 4);
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      // a corda faz barriga para fora
      const ox = ((mx - X) / R) * 26;
      const oy = ((my - Y) / R) * 26 + 6;
      g.strokeStyle = rgba(INK, 0.55);
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x0, y0 - 14);
      g.quadraticCurveTo(mx + ox, my + oy - 14, x1, y1 - 14);
      g.stroke();
      for (let j = 1; j <= 5; j++) {
        const t = j / 6;
        const u = 1 - t;
        const bx = u * u * x0 + 2 * u * t * (mx + ox) + t * t * x1;
        const by = u * u * (y0 - 14) + 2 * u * t * (my + oy - 14) + t * t * (y1 - 14);
        const sw = Math.sin(time * 2.4 + i * 1.3 + j) * 2.5;
        g.fillStyle = FLAGS[(i + j) % FLAGS.length];
        g.beginPath();
        g.moveTo(bx - 7, by);
        g.lineTo(bx + 7, by);
        g.lineTo(bx + sw, by + 15);
        g.closePath();
        g.fill();
      }
    }
    // postes
    for (let i = 0; i < 8; i++) {
      const [x, y] = this.vertex(i, R + 4);
      g.fillStyle = rgba(INK, 0.18);
      circle(g, x + 5, y + 6, 11);
      g.fill();
      g.strokeStyle = P.terracottaDark;
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - 14);
      g.stroke();
      circle(g, x, y - 14, 9);
      g.fillStyle = '#FBE6C6';
      g.fill();
      g.strokeStyle = P.terracottaDark;
      g.lineWidth = 3;
      g.stroke();
    }
  }

  lights(out: number[]) {
    out.push(X, Y, 300, 0.75);
  }
}
