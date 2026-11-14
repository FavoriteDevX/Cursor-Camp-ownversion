import { FONT, INK, P } from '../config';
import type { Game } from '../game';
import { K } from '../particles';
import { F_POP, type Activity } from '../types';
import { circle, clamp, dist, mulberry32, rgba, rnd, rrect, TAU } from '../util';

export const CART = { x: 1540, y: 1846 };
/** Onde o visitante espera a pipoca. */
export const CART_ZONE = { x: 1540, y: 1946, r: 54 };
const WAIT = 1.1;
const LASTS = 32;

/**
 * Carrinho de pipoca. Quem espera um instante na marca ganha um saquinho;
 * quem anda com ele vai deixando pipoca pelo chão, e os pombos vêm atrás.
 */
export class Popcorn implements Activity {
  private dwell = 0;
  private until = 0;
  private drop = new Map<string, number>();
  private popT = 0;
  private bits: number[] = [];

  constructor(private game: Game) {
    const rng = mulberry32(5);
    for (let i = 0; i < 26; i++) this.bits.push(rng() * 60 - 30, rng() * 26 - 13, 3 + rng() * 2.5);
  }

  update(dt: number) {
    const game = this.game;
    const me = game.me;

    if (game.joined) {
      const has = (me.flags & F_POP) !== 0;
      if (!has && dist(me.x, me.y, CART_ZONE.x, CART_ZONE.y) < CART_ZONE.r) {
        this.dwell += dt;
        if (this.dwell >= WAIT) {
          this.dwell = 0;
          me.flags |= F_POP;
          this.until = game.time + LASTS;
          for (let i = 0; i < 5; i++) game.sfx.pop(CART.x, CART.y, 0.3);
          game.fx.burst(K.Dot, CART.x, CART.y - 10, 16, ['#FFF3C4', '#FFFDF6'], { speed: 150, up: 300, size: 4, life: 1 });
          game.album.award('pipoca');
        }
      } else {
        this.dwell = Math.max(0, this.dwell - dt * 2);
      }
      if (has && game.time > this.until) me.flags &= ~F_POP;
    }

    // quem tem saquinho vai derrubando pipoca enquanto anda
    for (const a of game.list) {
      if (!(a.flags & F_POP) || a.speed < 40) continue;
      const t = (this.drop.get(a.id) ?? 0) - dt;
      if (t <= 0) {
        this.drop.set(a.id, rnd(0.35, 0.6));
        if (game.kernels.length >= 70) game.kernels.shift();
        game.kernels.push({ x: a.x + rnd(-10, 10) + 14, y: a.y + rnd(-8, 8) + 26, t: game.time });
      } else {
        this.drop.set(a.id, t);
      }
    }
    while (game.kernels.length && game.time - game.kernels[0].t > 22) game.kernels.shift();

    // a panela estourando
    this.popT -= dt;
    if (this.popT <= 0) {
      this.popT = rnd(0.25, 0.9);
      if (game.inView(CART.x, CART.y, 200)) {
        game.fx.add({ k: K.Dot, x: CART.x + rnd(-24, 24), y: CART.y - 6, vz: rnd(120, 220), grav: 520, vx: rnd(-20, 20), size: 3.2, color: '#FFF3C4', life: 0.6 });
        game.sfx.pop(CART.x, CART.y, 0.07);
      }
    }
  }

  drawGround(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (!game.inView(CART.x, CART.y, 220)) return;
    // marca de espera, com o progresso de quem está esperando
    g.setLineDash([10, 9]);
    g.strokeStyle = rgba(INK, 0.4);
    g.lineWidth = 3;
    circle(g, CART_ZONE.x, CART_ZONE.y, CART_ZONE.r);
    g.stroke();
    g.setLineDash([]);
    if (this.dwell > 0) {
      g.strokeStyle = P.terracotta;
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(CART_ZONE.x, CART_ZONE.y, CART_ZONE.r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(this.dwell / WAIT, 0, 1));
      g.stroke();
    }
    g.font = `700 15px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = rgba(INK, 0.5);
    g.fillText('wait here', CART_ZONE.x, CART_ZONE.y);

    // pipoca caída
    for (const k of game.kernels) {
      g.fillStyle = '#FFF3C4';
      circle(g, k.x, k.y, 3.2);
      g.fill();
      circle(g, k.x + 2.6, k.y - 1.6, 2.4);
      g.fill();
    }
  }

  drawMid(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (!game.inView(CART.x, CART.y, 220)) return;
    const { x, y } = CART;
    g.fillStyle = rgba(INK, 0.17);
    rrect(g, x - 62, y - 34, 140, 96, 14);
    g.fill();
    // rodas
    g.fillStyle = INK;
    rrect(g, x - 78, y + 8, 14, 34, 6);
    g.fill();
    rrect(g, x + 64, y + 8, 14, 34, 6);
    g.fill();
    // corpo
    rrect(g, x - 68, y - 44, 136, 92, 14);
    g.fillStyle = '#D8483A';
    g.fill();
    // vitrine
    rrect(g, x - 56, y - 34, 112, 40, 8);
    g.fillStyle = '#EAF7F8';
    g.fill();
    g.fillStyle = '#FFF3C4';
    for (let i = 0; i < this.bits.length; i += 3) {
      const wob = Math.sin(game.time * 6 + i) * 1.2;
      circle(g, x + this.bits[i] * 1.6, y - 14 + this.bits[i + 1] + wob, this.bits[i + 2]);
      g.fill();
    }
    g.strokeStyle = rgba(INK, 0.35);
    g.lineWidth = 2;
    rrect(g, x - 56, y - 34, 112, 40, 8);
    g.stroke();
    // toldo listrado
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? '#FFFDF6' : '#D8483A';
      g.fillRect(x - 68 + i * 17, y + 12, 17, 24);
    }
    g.strokeStyle = INK;
    g.lineWidth = 3;
    rrect(g, x - 68, y - 44, 136, 92, 14);
    g.stroke();
    g.fillStyle = INK;
    g.font = `800 16px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('POPCORN', x, y + 25);
  }

  lights(out: number[]) {
    out.push(CART.x, CART.y, 190, 0.8);
  }
}
