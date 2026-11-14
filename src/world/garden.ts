import { COLORS, INK, P } from '../config';
import type { Game } from '../game';
import { K } from '../particles';
import { FLOWER_SLOTS, TILE_COUNT } from '../net/protocol';
import type { Activity } from '../types';
import { circle, clamp, dist, easeOutBack, irnd, rgba, rrect, TAU } from '../util';

// ---------------------------------------------------------------- canteiro

export const BED = { x: 2100, y: 1660, w: 440, h: 210 };

interface Flower {
  x: number;
  y: number;
  kind: number;
  color: number;
  born: number;
}

/** Codifica uma flor num único número inteiro (0 = vazio). */
export function encodeFlower(x: number, y: number, kind: number, color: number): number {
  return 1 + x + y * BED.w + kind * BED.w * BED.h + color * BED.w * BED.h * 4;
}

function decodeFlower(v: number, born: number): Flower | null {
  if (v <= 0) return null;
  let n = v - 1;
  const x = n % BED.w;
  n = Math.floor(n / BED.w);
  const y = n % BED.h;
  n = Math.floor(n / BED.h);
  const kind = n % 4;
  const color = Math.floor(n / 4);
  if (color > 9) return null;
  return { x, y, kind, color, born };
}

/** Canteiro: cada clique planta uma flor da cor do visitante. Todos veem o mesmo jardim. */
export class Flowerbed implements Activity {
  private flowers = new Map<number, Flower>();
  private sorted: Flower[] = [];
  private planted = 0;
  private lastPlant = -10;

  constructor(private game: Game) {
    game.store.on((k, v, _prev, origin) => {
      if (!k.startsWith('f:')) return;
      const slot = +k.slice(2);
      const f = decodeFlower(v, origin === 'snap' ? -100 : game.time);
      if (f) {
        this.flowers.set(slot, f);
        if (origin !== 'snap') game.sfx.plant(BED.x + f.x, BED.y + f.y);
      } else {
        this.flowers.delete(slot);
      }
      this.sorted = [...this.flowers.values()].sort((a, b) => a.y - b.y);
    });
  }

  update() {
    /* as flores só balançam: nada a simular */
  }

  click(): boolean {
    const game = this.game;
    const me = game.me;
    const m = 14;
    if (me.x < BED.x + m || me.x > BED.x + BED.w - m || me.y < BED.y + m || me.y > BED.y + BED.h - m) return false;
    if (game.time - this.lastPlant < 0.25) return true;
    this.lastPlant = game.time;
    game.store.set(`f:${irnd(FLOWER_SLOTS)}`, encodeFlower(Math.round(me.x - BED.x), Math.round(me.y - BED.y), irnd(4), me.color));
    game.fx.burst(K.Dot, me.x, me.y, 6, ['#8A6A4A', '#6E5238'], { speed: 60, up: 140, size: 2.6, life: 0.5 });
    if (++this.planted >= 3) game.album.award('jardim');
    return true;
  }

  drawGround(g: CanvasRenderingContext2D) {
    if (!this.game.inView(BED.x + BED.w / 2, BED.y + BED.h / 2, 320)) return;
    // mureta de tijolo e terra
    rrect(g, BED.x - 12, BED.y - 12, BED.w + 24, BED.h + 24, 22);
    g.fillStyle = P.terracotta;
    g.fill();
    g.strokeStyle = P.terracottaDark;
    g.lineWidth = 3;
    g.stroke();
    rrect(g, BED.x, BED.y, BED.w, BED.h, 12);
    g.fillStyle = '#8A6A4A';
    g.fill();
    g.strokeStyle = '#7A5C40';
    g.lineWidth = 3;
    for (let y = BED.y + 30; y < BED.y + BED.h; y += 36) {
      g.beginPath();
      g.moveTo(BED.x + 14, y);
      g.lineTo(BED.x + BED.w - 14, y);
      g.stroke();
    }
  }

  drawMid(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (!game.inView(BED.x + BED.w / 2, BED.y + BED.h / 2, 320)) return;
    const time = game.time;
    for (const f of this.sorted) {
      const x = BED.x + f.x;
      const y = BED.y + f.y;
      const grow = easeOutBack(clamp((time - f.born) / 0.9, 0, 1));
      // balança com o vento e com quem passa perto
      let sway = Math.sin(time * 1.8 + f.x * 0.05) * 2;
      for (const a of game.list) {
        const d = dist(a.x, a.y, x, y - 14);
        if (d < 44) sway += clamp(a.vx * 0.02, -9, 9) * (1 - d / 44);
      }
      const h = 26 * grow;
      const col = COLORS[f.color];
      g.strokeStyle = P.leafDark;
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + sway * 0.4, y - h * 0.5, x + sway, y - h);
      g.stroke();
      g.fillStyle = P.leaf;
      g.beginPath();
      g.ellipse(x + 5, y - h * 0.4, 6 * grow, 3 * grow, -0.5, 0, TAU);
      g.fill();
      const bx = x + sway;
      const by = y - h;
      const r = 6.5 * grow;
      if (f.kind === 0) {
        // margarida
        g.fillStyle = col;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          circle(g, bx + Math.cos(a) * r, by + Math.sin(a) * r, r * 0.62);
          g.fill();
        }
        circle(g, bx, by, r * 0.55);
        g.fillStyle = '#FFE08A';
        g.fill();
      } else if (f.kind === 1) {
        // tulipa
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(bx - r, by - r * 0.9);
        g.lineTo(bx - r * 0.4, by - r * 0.2);
        g.lineTo(bx, by - r * 1.1);
        g.lineTo(bx + r * 0.4, by - r * 0.2);
        g.lineTo(bx + r, by - r * 0.9);
        g.quadraticCurveTo(bx + r * 1.1, by + r, bx, by + r);
        g.quadraticCurveTo(bx - r * 1.1, by + r, bx - r, by - r * 0.9);
        g.fill();
      } else if (f.kind === 2) {
        // girassolzinho
        g.fillStyle = col;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU;
          g.beginPath();
          g.ellipse(bx + Math.cos(a) * r, by + Math.sin(a) * r, r * 0.6, r * 0.28, a, 0, TAU);
          g.fill();
        }
        circle(g, bx, by, r * 0.62);
        g.fillStyle = '#6E4B2A';
        g.fill();
      } else {
        // bolinha (hortênsia)
        g.fillStyle = col;
        circle(g, bx, by, r * 1.15);
        g.fill();
        g.fillStyle = rgba('#FFFFFF', 0.45);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.6;
          circle(g, bx + Math.cos(a) * r * 0.5, by + Math.sin(a) * r * 0.5, r * 0.26);
          g.fill();
        }
      }
    }
  }
}

// ---------------------------------------------------------------- painel de azulejos

export const TILES = { x: 2480, y: 330, cols: 14, rows: 8, s: 40 };

/**
 * Painel de azulejos: um mural coletivo. Clicar pinta o azulejo com a sua cor;
 * clicar de novo num azulejo seu troca o desenho.
 */
export class TilePanel implements Activity {
  private pop = new Float32Array(TILE_COUNT);
  private painted = 0;
  private lastPaint = -10;

  constructor(private game: Game) {
    game.store.on((k, _v, _prev, origin) => {
      if (!k.startsWith('m:')) return;
      const i = +k.slice(2);
      if (origin !== 'snap' && i < TILE_COUNT) {
        this.pop[i] = 1;
        game.sfx.tile(TILES.x + ((i % TILES.cols) + 0.5) * TILES.s, TILES.y + (Math.floor(i / TILES.cols) + 0.5) * TILES.s);
      }
    });
  }

  update(dt: number) {
    for (let i = 0; i < TILE_COUNT; i++) if (this.pop[i] > 0) this.pop[i] = Math.max(0, this.pop[i] - dt * 4);
  }

  private tileAt(x: number, y: number): number {
    const c = Math.floor((x - TILES.x) / TILES.s);
    const r = Math.floor((y - TILES.y) / TILES.s);
    if (c < 0 || c >= TILES.cols || r < 0 || r >= TILES.rows) return -1;
    return r * TILES.cols + c;
  }

  click(): boolean {
    const game = this.game;
    const i = this.tileAt(game.me.x, game.me.y);
    if (i < 0) return false;
    if (game.time - this.lastPaint < 0.12) return true;
    this.lastPaint = game.time;
    const cur = game.store.get(`m:${i}`);
    const mine = game.me.color;
    let pat = irnd(4);
    if (cur > 0 && Math.floor((cur - 1) / 4) === mine) pat = (((cur - 1) % 4) + 1) % 4;
    game.store.set(`m:${i}`, mine * 4 + pat + 1);
    if (++this.painted >= 5) game.album.award('azulejo');
    return true;
  }

  drawGround(g: CanvasRenderingContext2D) {
    const game = this.game;
    const T = TILES;
    const w = T.cols * T.s;
    const h = T.rows * T.s;
    if (!game.inView(T.x + w / 2, T.y + h / 2, 420)) return;
    g.fillStyle = rgba(INK, 0.17);
    rrect(g, T.x - 8, T.y - 6, w + 28, h + 28, 12);
    g.fill();
    rrect(g, T.x - 14, T.y - 14, w + 28, h + 28, 12);
    g.fillStyle = P.azul;
    g.fill();
    g.fillStyle = '#FBF8EF';
    g.fillRect(T.x, T.y, w, h);

    const hover = game.joined ? this.tileAt(game.me.x, game.me.y) : -1;
    for (let i = 0; i < TILE_COUNT; i++) {
      const cx = T.x + ((i % T.cols) + 0.5) * T.s;
      const cy = T.y + (Math.floor(i / T.cols) + 0.5) * T.s;
      const v = game.store.get(`m:${i}`);
      const s = T.s / 2 - 2;
      if (v <= 0) {
        // azulejo em branco, com um losango azul bem claro
        g.fillStyle = rgba(P.azul, 0.1);
        g.beginPath();
        g.moveTo(cx, cy - s * 0.5);
        g.lineTo(cx + s * 0.5, cy);
        g.lineTo(cx, cy + s * 0.5);
        g.lineTo(cx - s * 0.5, cy);
        g.closePath();
        g.fill();
      } else {
        const col = COLORS[Math.floor((v - 1) / 4)] ?? COLORS[0];
        const pat = (v - 1) % 4;
        const k = 1 + this.pop[i] * 0.22;
        g.save();
        g.translate(cx, cy);
        g.scale(k, k);
        g.beginPath();
        g.rect(-s, -s, s * 2, s * 2);
        g.clip();
        g.fillStyle = rgba(col, 0.16);
        g.fillRect(-s, -s, s * 2, s * 2);
        g.fillStyle = col;
        if (pat === 0) {
          g.beginPath();
          g.moveTo(0, -s * 0.86);
          g.lineTo(s * 0.86, 0);
          g.lineTo(0, s * 0.86);
          g.lineTo(-s * 0.86, 0);
          g.closePath();
          g.fill();
          g.fillStyle = '#FBF8EF';
          circle(g, 0, 0, s * 0.28);
          g.fill();
        } else if (pat === 1) {
          for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ]) {
            g.beginPath();
            g.moveTo(sx * s, sy * s);
            g.arc(sx * s, sy * s, s * 0.82, 0, TAU);
            g.fill();
          }
        } else if (pat === 2) {
          circle(g, 0, 0, s * 0.56);
          g.fill();
          for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ]) {
            circle(g, sx * s * 0.72, sy * s * 0.72, s * 0.2);
            g.fill();
          }
        } else {
          for (let j = 0; j < 4; j++) {
            g.beginPath();
            g.ellipse(Math.cos((j * TAU) / 4) * s * 0.44, Math.sin((j * TAU) / 4) * s * 0.44, s * 0.44, s * 0.24, (j * TAU) / 4, 0, TAU);
            g.fill();
          }
        }
        g.restore();
      }
      if (i === hover) {
        g.strokeStyle = COLORS[game.me.color];
        g.lineWidth = 3;
        g.strokeRect(cx - T.s / 2 + 2, cy - T.s / 2 + 2, T.s - 4, T.s - 4);
      }
    }
    // rejunte
    g.strokeStyle = rgba(P.azul, 0.22);
    g.lineWidth = 1.5;
    g.beginPath();
    for (let c = 1; c < T.cols; c++) {
      g.moveTo(T.x + c * T.s, T.y);
      g.lineTo(T.x + c * T.s, T.y + h);
    }
    for (let r = 1; r < T.rows; r++) {
      g.moveTo(T.x, T.y + r * T.s);
      g.lineTo(T.x + w, T.y + r * T.s);
    }
    g.stroke();
  }

  lights(out: number[]) {
    out.push(TILES.x + 280, TILES.y + 160, 380, 0.75);
  }
}
