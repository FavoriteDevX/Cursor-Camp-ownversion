import { CX, CY, FONT, INK, P } from '../config';
import type { Game } from '../game';
import { K } from '../particles';
import type { Activity, Actor, Ev } from '../types';
import { circle, clamp, dist, lerp, mulberry32, rgba, rnd, rrect, TAU } from '../util';

const X = CX;
const Y = CY;
/** Borda de pedra, espelho d'água, pedestal e bacia de cima. */
export const F_RO = 165;
export const F_RW = 148;
const RI = 62;
const RIW = 46;

interface Toss {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
}

/**
 * Chafariz. Entrar na água espirra; clicar da beirada joga uma moeda (a contagem é compartilhada).
 * Quanto mais gente em volta, mais alto os jatos sobem.
 */
export class Fountain implements Activity {
  private inWater = new Set<string>();
  private power = 0;
  private tosses: Toss[] = [];
  private lastToss = -10;
  private spots: number[] = [];

  constructor(private game: Game) {
    const rng = mulberry32(99);
    for (let i = 0; i < 44; i++) {
      const a = rng() * TAU;
      const r = RI + 12 + rng() * (F_RW - RI - 24);
      this.spots.push(X + Math.cos(a) * r, Y + Math.sin(a) * r);
    }
  }

  update(dt: number) {
    const game = this.game;
    let rim = 0;
    for (const a of game.list) {
      const d = dist(a.x, a.y, X, Y);
      const wet = d < F_RW - 4 && d > RI + 2;
      if (wet && !this.inWater.has(a.id)) {
        this.inWater.add(a.id);
        this.splash(a);
      } else if (!wet && this.inWater.has(a.id)) {
        this.inWater.delete(a.id);
      }
      if (wet) {
        a.wet = 3;
        if (a.speed > 70 && Math.random() < dt * 9) game.fx.ring(a.x, a.y, '#FFFFFF', 4, 22, 0.5, 0);
      }
      if (d >= F_RW && d < F_RO + 110) rim++;
    }
    if (this.inWater.size > game.list.length + 30) this.inWater.clear();
    this.power = lerp(this.power, clamp(rim / 4, 0, 1), 1 - Math.exp(-dt * 1.6));

    for (let i = this.tosses.length - 1; i >= 0; i--) {
      const c = this.tosses[i];
      c.t += dt / 0.62;
      if (c.t >= 1) {
        game.sfx.coin(c.tx, c.ty);
        game.fx.ring(c.tx, c.ty, '#FFFFFF', 3, 26, 0.6, 0);
        this.tosses.splice(i, 1);
      }
    }
  }

  private splash(a: Actor) {
    const game = this.game;
    game.sfx.splash(a.x, a.y);
    game.fx.ring(a.x, a.y, '#FFFFFF', 6, 40, 0.7, 0);
    game.fx.burst(K.Dot, a.x, a.y, 10, ['#FFFFFF', P.waterLight], { speed: 110, up: 230, size: 3.2, life: 0.7 });
    if (a === game.me) game.album.award('banho');
  }

  click(): boolean {
    const game = this.game;
    const me = game.me;
    const d = dist(me.x, me.y, X, Y);
    if (d < F_RO + 6 || d > F_RO + 190 || game.time - this.lastToss < 0.45) return false;
    this.lastToss = game.time;
    // a moeda cai no lado do chafariz mais perto de quem jogou
    const base = Math.atan2(me.y - Y, me.x - X);
    const a = base + rnd(-0.7, 0.7);
    const r = rnd(RI + 16, F_RW - 14);
    game.emit({ k: 'coin', x: Math.round(me.x), y: Math.round(me.y), tx: Math.round(X + Math.cos(a) * r), ty: Math.round(Y + Math.sin(a) * r) });
    game.store.inc('coins');
    game.album.award('desejo');
    return true;
  }

  event(_a: Actor | null, ev: Ev) {
    if (ev.k !== 'coin' || ev.x === undefined || ev.y === undefined || ev.tx === undefined || ev.ty === undefined) return;
    if (this.tosses.length < 24) this.tosses.push({ x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, t: 0 });
  }

  drawGround(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (!game.inView(X, Y, F_RO + 80)) return;
    const time = game.time;
    g.fillStyle = rgba(INK, 0.17);
    circle(g, X + 9, Y + 12, F_RO + 2);
    g.fill();
    circle(g, X, Y, F_RO);
    g.fillStyle = '#E9DFCB';
    g.fill();
    g.strokeStyle = '#CFC2A6';
    g.lineWidth = 4;
    g.stroke();

    const grad = g.createRadialGradient(X, Y, RI, X, Y, F_RW);
    grad.addColorStop(0, P.waterLight);
    grad.addColorStop(1, P.water);
    circle(g, X, Y, F_RW);
    g.fillStyle = grad;
    g.fill();

    // moedas no fundo
    const coins = Math.min(44, game.store.get('coins'));
    for (let i = 0; i < coins; i++) {
      const x = this.spots[i * 2];
      const y = this.spots[i * 2 + 1];
      const tw = 0.55 + 0.45 * Math.sin(time * 2 + i * 1.7);
      g.fillStyle = rgba('#F5C542', 0.5 + 0.4 * tw);
      circle(g, x, y, 4.2);
      g.fill();
    }

    // ondas
    g.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      const k = (time * 0.32 + i / 3) % 1;
      g.strokeStyle = rgba('#FFFFFF', (1 - k) * 0.55);
      circle(g, X, Y, RI + 6 + k * (F_RW - RI - 12));
      g.stroke();
    }

    // plaquinha com o total de desejos
    const total = game.store.get('coins');
    const label = total === 1 ? '1 wish' : `${total} wishes`;
    g.font = `700 17px ${FONT}`;
    const w = g.measureText(label).width + 26;
    rrect(g, X - w / 2, Y + F_RO + 20, w, 30, 15);
    g.fillStyle = rgba(INK, 0.62);
    g.fill();
    g.fillStyle = '#FFE9A8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, X, Y + F_RO + 36);
  }

  drawMid(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (!game.inView(X, Y, F_RO + 80)) return;
    const time = game.time;

    // pedestal e bacia de cima
    g.fillStyle = rgba(INK, 0.15);
    circle(g, X + 6, Y + 8, RI);
    g.fill();
    circle(g, X, Y, RI);
    g.fillStyle = '#E9DFCB';
    g.fill();
    g.strokeStyle = '#CFC2A6';
    g.lineWidth = 4;
    g.stroke();
    circle(g, X, Y, RIW);
    g.fillStyle = P.waterLight;
    g.fill();

    // jatos: arcos de gotas que saem do centro e caem no espelho d'água
    const reach = 46 + 62 * this.power;
    const height = 46 + 70 * this.power;
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * TAU + Math.sin(time * 0.3) * 0.2;
      for (let i = 0; i < 6; i++) {
        const u = (time * 0.85 + i / 6 + j * 0.13) % 1;
        const r = 12 + u * reach;
        const z = 4 * height * u * (1 - u);
        g.fillStyle = rgba('#FFFFFF', 0.55 + 0.4 * (1 - u));
        circle(g, X + Math.cos(a) * r, Y + Math.sin(a) * r * 0.92 - z, 3.6 - u * 1.4);
        g.fill();
      }
    }
    // pluma do meio
    for (let i = 0; i < 5; i++) {
      const u = (time * 1.1 + i / 5) % 1;
      g.fillStyle = rgba('#FFFFFF', 0.85 - u * 0.5);
      circle(g, X + Math.sin(time * 3 + i) * 2, Y - u * (40 + 46 * this.power), 6 - u * 3);
      g.fill();
    }
    circle(g, X, Y, 9);
    g.fillStyle = '#CFC2A6';
    g.fill();

    // moedas no ar
    for (const c of this.tosses) {
      const x = lerp(c.x, c.tx, c.t);
      const y = lerp(c.y, c.ty, c.t);
      const z = 4 * 70 * c.t * (1 - c.t);
      g.fillStyle = rgba(INK, 0.2);
      circle(g, x + 3, y + 4, 4);
      g.fill();
      g.fillStyle = '#F5C542';
      g.beginPath();
      g.ellipse(x, y - z, 5.5, 5.5 * Math.abs(Math.cos(c.t * 14)) + 1.2, 0, 0, TAU);
      g.fill();
      g.strokeStyle = '#C99A1C';
      g.lineWidth = 1.4;
      g.stroke();
    }
  }

  lights(out: number[]) {
    out.push(X, Y, 260, 0.6);
  }
}
