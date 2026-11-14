import { COLORS, FONT, INK, P } from '../config';
import type { Game } from '../game';
import { K } from '../particles';
import { F_SWING, type Activity, type Actor } from '../types';
import { circle, clamp, dist, lerp, rgba, rrect, TAU } from '../util';

// ---------------------------------------------------------------- gangorra

export const SEESAW = { x: 640, y: 960, half: 150, zone: 46, h: 46 };

/**
 * Gangorra. Desce para o lado que tiver mais ponteiros; com o mesmo número dos dois lados, balança.
 * A inclinação é calculada só a partir de onde cada um está.
 */
export class Seesaw implements Activity {
  /** +1 = lado direito no chão, -1 = lado esquerdo no chão. */
  private tilt = -1;
  private v = 0;
  private rest = -1;
  private together = 0;

  constructor(private game: Game) {}

  update(dt: number) {
    const game = this.game;
    const S = SEESAW;
    const left: Actor[] = [];
    const right: Actor[] = [];
    for (const a of game.list) {
      if (dist(a.x, a.y, S.x - S.half, S.y) < S.zone) left.push(a);
      else if (dist(a.x, a.y, S.x + S.half, S.y) < S.zone) right.push(a);
    }
    let target = this.rest;
    if (left.length > right.length) target = this.rest = -1;
    else if (right.length > left.length) target = this.rest = 1;
    else if (left.length > 0) target = Math.sin(game.time * 2.6) * 0.92;

    this.v += ((target - this.tilt) * 62 - this.v * 9) * dt;
    this.tilt += this.v * dt;
    if (Math.abs(this.tilt) > 1) {
      const side = Math.sign(this.tilt);
      if (Math.abs(this.v) > 1.3) {
        const ex = S.x + side * S.half;
        game.sfx.boing(ex, S.y);
        game.fx.add({ k: K.Puff, x: ex, y: S.y + 12, size: 12, color: P.sandDark, life: 0.5, layer: 0 });
      }
      this.tilt = side;
      this.v *= -0.25;
    }

    const hl = ((1 + this.tilt) / 2) * S.h;
    const hr = ((1 - this.tilt) / 2) * S.h;
    for (const a of game.list) {
      if (Math.abs(a.y - S.y) > 34 || Math.abs(a.x - S.x) > S.half + S.zone) continue;
      const u = clamp((a.x - (S.x - S.half)) / (S.half * 2), 0, 1);
      a.z = Math.max(a.z, lerp(hl, hr, u));
    }

    if (game.joined) {
      const me = game.me;
      const paired = (left.includes(me) && right.length > 0) || (right.includes(me) && left.length > 0);
      this.together = paired ? this.together + dt : 0;
      if (this.together > 1.2) game.album.award('gangorra');
    }
  }

  drawMid(g: CanvasRenderingContext2D) {
    const S = SEESAW;
    if (!this.game.inView(S.x, S.y, 260)) return;
    const hl = ((1 + this.tilt) / 2) * S.h;
    const hr = ((1 - this.tilt) / 2) * S.h;
    const x1 = S.x - S.half;
    const x2 = S.x + S.half;
    g.lineCap = 'round';
    // sombra da prancha
    g.strokeStyle = rgba(INK, 0.16);
    g.lineWidth = 24;
    g.beginPath();
    g.moveTo(x1 + 4 + hl * 0.3, S.y + 8 + hl * 0.2);
    g.lineTo(x2 + 4 + hr * 0.3, S.y + 8 + hr * 0.2);
    g.stroke();
    // cavalete
    rrect(g, S.x - 22, S.y - 30, 44, 52, 10);
    g.fillStyle = P.tealDark;
    g.fill();
    // prancha
    g.strokeStyle = P.mustard;
    g.lineWidth = 22;
    g.beginPath();
    g.moveTo(x1, S.y - hl);
    g.lineTo(x2, S.y - hr);
    g.stroke();
    g.strokeStyle = rgba('#FFFFFF', 0.3);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x1, S.y - hl - 5);
    g.lineTo(x2, S.y - hr - 5);
    g.stroke();
    // assentos e alças
    for (const [x, h, c] of [
      [x1, hl, P.terracotta],
      [x2, hr, P.teal],
    ] as [number, number, string][]) {
      circle(g, x, S.y - h, 22);
      g.fillStyle = c;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.beginPath();
      const hx = x + (x < S.x ? 30 : -30);
      const hh = lerp(hl, hr, (hx - x1) / (x2 - x1));
      g.moveTo(hx, S.y - hh - 14);
      g.lineTo(hx, S.y - hh + 14);
      g.stroke();
    }
    circle(g, S.x, S.y - (hl + hr) / 2, 7);
    g.fillStyle = INK;
    g.fill();
  }
}

// ---------------------------------------------------------------- balanços

export const SWINGS = { xs: [550, 640, 730], y: 1440, len: 105 };
const SEAT_COLORS = [P.terracotta, P.mustard, P.teal];
/** Altura da trave, só para o desenho. */
const BAR_H = 96;

/**
 * Balanços. O ponteiro senta, e mexer o mouse para cima e para baixo no ritmo dá impulso.
 * Para os outros visitantes, o assento é desenhado embaixo de quem está sentado.
 */
export class Swings implements Activity {
  private th = [0, 0, 0];
  private om = [0, 0, 0];
  /** Em qual balanço o visitante local está (-1 = nenhum). */
  mine = -1;
  private dwell = 0;
  private dwellI = -1;
  private lateral = 0;
  private cooldown = 0;
  private hint = 0;

  constructor(private game: Game) {}

  seatY(i: number) {
    return SWINGS.y + SWINGS.len * Math.sin(this.th[i]);
  }

  private lift(i: number) {
    return 40 * (1 - Math.cos(this.th[i])) + 10;
  }

  update(dt: number) {
    const game = this.game;
    const me = game.me;
    const occ: (Actor | null)[] = [null, null, null];
    for (const a of game.list) {
      const s = (a.flags & F_SWING) >> 1;
      if (s && a !== me) occ[s - 1] = a;
    }

    for (let i = 0; i < 3; i++) {
      const a = occ[i];
      if (a) {
        const nt = Math.asin(clamp((a.y - SWINGS.y) / SWINGS.len, -0.96, 0.96));
        this.om[i] = clamp((nt - this.th[i]) / Math.max(dt, 0.001), -8, 8);
        this.th[i] = nt;
        a.z = Math.max(a.z, this.lift(i));
        // dois sentaram ao mesmo tempo: fica quem tem o menor id
        if (i === this.mine && a.id < me.id) this.release(1);
      } else if (i !== this.mine) {
        this.om[i] += (-9 * Math.sin(this.th[i]) - 0.8 * this.om[i]) * dt;
        this.th[i] += this.om[i] * dt;
      }
    }

    if (!game.joined) return;
    this.cooldown -= dt;
    this.hint = Math.max(0, this.hint - dt);

    if (this.mine < 0) {
      let hit = -1;
      for (let i = 0; i < 3; i++) {
        if (!occ[i] && dist(me.x, me.y, SWINGS.xs[i], this.seatY(i)) < 24) hit = i;
      }
      if (hit >= 0 && this.cooldown <= 0) {
        if (hit === this.dwellI) this.dwell += dt;
        else {
          this.dwellI = hit;
          this.dwell = 0;
        }
        if (this.dwell > 0.22) this.attach(hit);
      } else {
        this.dwellI = -1;
      }
      return;
    }

    const i = this.mine;
    const before = this.th[i];
    this.om[i] += game.mdy * 0.0075;
    this.om[i] += (-9 * Math.sin(this.th[i]) - 0.3 * this.om[i]) * dt;
    this.om[i] = clamp(this.om[i], -6, 6);
    this.th[i] += this.om[i] * dt;
    if (Math.abs(this.th[i]) > 1.22) {
      this.th[i] = Math.sign(this.th[i]) * 1.22;
      this.om[i] *= -0.3;
    }
    if (before * this.th[i] < 0 && Math.abs(this.om[i]) > 1.6) game.sfx.creak(me.x, me.y);
    me.x = SWINGS.xs[i];
    me.y = this.seatY(i);
    me.z = Math.max(me.z, this.lift(i));
    if (Math.abs(this.th[i]) > 0.9) game.album.award('balanco');
    // um puxão forte para o lado desce do balanço
    this.lateral = this.lateral * Math.exp(-dt * 5) + game.mdx;
    if (Math.abs(this.lateral) > 130) this.release(Math.sign(this.lateral));
  }

  private attach(i: number) {
    const game = this.game;
    this.mine = i;
    this.lateral = 0;
    this.hint = 5;
    game.held = true;
    game.me.flags = (game.me.flags & ~F_SWING) | ((i + 1) << 1);
    game.sfx.creak(game.me.x, game.me.y);
  }

  release(dir: number) {
    const game = this.game;
    if (this.mine < 0) return;
    this.mine = -1;
    this.dwellI = -1;
    this.cooldown = 0.9;
    game.held = false;
    game.me.flags &= ~F_SWING;
    game.me.x += dir * 58;
  }

  click(): boolean {
    if (this.mine < 0) return false;
    this.release(1);
    return true;
  }

  drawGround(g: CanvasRenderingContext2D) {
    if (!this.game.inView(640, SWINGS.y, 320)) return;
    // sombra da armação no chão
    g.strokeStyle = rgba(INK, 0.14);
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(486 + 30, SWINGS.y + 16);
    g.lineTo(794 + 30, SWINGS.y + 16);
    g.stroke();
  }

  drawMid(g: CanvasRenderingContext2D) {
    if (!this.game.inView(640, SWINGS.y, 320)) return;
    const top = SWINGS.y - BAR_H;
    // pernas em "A": abrem no chão e se encontram na trave, lá em cima
    g.lineCap = 'round';
    g.strokeStyle = P.tealDark;
    g.lineWidth = 11;
    for (const x of [486, 794]) {
      g.beginPath();
      g.moveTo(x - 16, SWINGS.y - 44);
      g.lineTo(x, top);
      g.lineTo(x + 16, SWINGS.y + 52);
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const x = SWINGS.xs[i];
      const sy = this.seatY(i);
      const z = this.lift(i);
      g.fillStyle = rgba(INK, 0.17 * clamp(1 - z / 90, 0.4, 1));
      g.beginPath();
      g.ellipse(x + 4 + z * 0.3, sy + 8 + z * 0.1, 20, 9, 0, 0, TAU);
      g.fill();
      g.strokeStyle = rgba(INK, 0.6);
      g.lineWidth = 2.4;
      for (const o of [-13, 13]) {
        g.beginPath();
        g.moveTo(x + o, top);
        g.lineTo(x + o, sy - z);
        g.stroke();
      }
      rrect(g, x - 19, sy - z - 8, 38, 16, 6);
      g.fillStyle = SEAT_COLORS[i];
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2.4;
      g.stroke();
    }
  }

  drawTop(g: CanvasRenderingContext2D) {
    if (!this.game.inView(640, SWINGS.y, 320)) return;
    const top = SWINGS.y - BAR_H;
    // a trave fica por cima dos ponteiros
    g.lineCap = 'round';
    g.strokeStyle = P.teal;
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(486, top);
    g.lineTo(794, top);
    g.stroke();
    g.strokeStyle = rgba('#FFFFFF', 0.25);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(490, top - 3);
    g.lineTo(790, top - 3);
    g.stroke();

    if (this.mine >= 0 && this.hint > 0) {
      g.globalAlpha = clamp(this.hint, 0, 1);
      g.font = `700 16px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const label = 'move up and down to swing · click to hop off';
      const w = g.measureText(label).width + 24;
      rrect(g, 640 - w / 2, SWINGS.y + 150, w, 30, 15);
      g.fillStyle = rgba(INK, 0.7);
      g.fill();
      g.fillStyle = '#FFFDF6';
      g.fillText(label, 640, SWINGS.y + 166);
      g.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------- amarelinha

const HX = 800;
const HY = 2010;
const HS = 68;

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  n: string;
}

export const HOP_CELLS: Cell[] = [
  { x: HX, y: HY - HS / 2, w: HS, h: HS, n: '1' },
  { x: HX + HS, y: HY - HS, w: HS, h: HS, n: '2' },
  { x: HX + HS, y: HY, w: HS, h: HS, n: '3' },
  { x: HX + HS * 2, y: HY - HS / 2, w: HS, h: HS, n: '4' },
  { x: HX + HS * 3, y: HY - HS, w: HS, h: HS, n: '5' },
  { x: HX + HS * 3, y: HY, w: HS, h: HS, n: '6' },
  { x: HX + HS * 4, y: HY - HS / 2, w: HS, h: HS, n: '7' },
  { x: HX + HS * 5, y: HY - HS, w: HS, h: HS, n: '8' },
  { x: HX + HS * 5, y: HY, w: HS, h: HS, n: '9' },
  { x: HX + HS * 6, y: HY - HS, w: HS, h: HS * 2, n: 'sky' },
];

/** Amarelinha: pise nas casas em ordem, do 1 até o céu. */
export class Hopscotch implements Activity {
  /** Próxima casa esperada do visitante local. */
  private step = 0;
  private cur = -1;
  private off = 0;
  private flash = new Float32Array(HOP_CELLS.length);
  private wrong = 0;

  constructor(private game: Game) {}

  private cellAt(x: number, y: number): number {
    for (let i = 0; i < HOP_CELLS.length; i++) {
      const c = HOP_CELLS[i];
      if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return i;
    }
    return -1;
  }

  update(dt: number) {
    const game = this.game;
    for (let i = 0; i < this.flash.length; i++) this.flash[i] = Math.max(0, this.flash[i] - dt * 2.5);
    this.wrong = Math.max(0, this.wrong - dt * 2);
    if (!game.joined) return;
    const me = game.me;
    const c = this.cellAt(me.x, me.y);
    if (c < 0) {
      this.cur = -1;
      this.off += dt;
      if (this.off > 2) this.step = 0;
      return;
    }
    this.off = 0;
    if (c === this.cur) return;
    this.cur = c;
    const cell = HOP_CELLS[c];
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h / 2;
    if (c === this.step) {
      this.step++;
      this.flash[c] = 1;
      game.sfx.tick(c, cx, cy);
      if (this.step === HOP_CELLS.length) {
        this.step = 0;
        game.sfx.jingle();
        game.fx.burst(K.Confetti, cx, cy, 34, COLORS, { speed: 220, up: 340, size: 5, life: 1.4 });
        game.album.award('amarelinha');
      }
    } else if (c > this.step && this.step > 0) {
      this.step = 0;
      this.wrong = 1;
      game.sfx.oops(cx, cy);
    }
  }

  drawGround(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (!game.inView(HX + HS * 3.5, HY, 360)) return;
    const mine = COLORS[game.me.color];
    // um trecho de piso escuro, para o giz aparecer
    rrect(g, HX - 22, HY - HS - 22, HS * 7 + 44, HS * 2 + 44, 26);
    g.fillStyle = '#59626F';
    g.fill();
    g.lineJoin = 'round';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < HOP_CELLS.length; i++) {
      const c = HOP_CELLS[i];
      const sky = i === HOP_CELLS.length - 1;
      g.beginPath();
      if (sky) {
        g.moveTo(c.x, c.y);
        g.arc(c.x, c.y + c.h / 2, c.h / 2, -Math.PI / 2, Math.PI / 2);
        g.closePath();
      } else {
        g.rect(c.x, c.y, c.w, c.h);
      }
      if (game.joined && i < this.step) {
        g.fillStyle = rgba(mine, 0.3);
        g.fill();
      }
      if (this.flash[i] > 0) {
        g.fillStyle = rgba('#FFFFFF', this.flash[i] * 0.8);
        g.fill();
      }
      if (this.wrong > 0) {
        g.fillStyle = rgba('#E4572E', this.wrong * 0.25);
        g.fill();
      }
      // giz
      g.strokeStyle = rgba('#FFFFFF', 0.92);
      g.lineWidth = 5;
      g.stroke();
      g.fillStyle = rgba('#FFFFFF', 0.95);
      g.font = `800 ${sky ? 26 : 30}px ${FONT}`;
      g.fillText(c.n, c.x + (sky ? c.w * 0.42 : c.w / 2), c.y + c.h / 2 + 2);
    }
    // quem estiver pisando acende a casa
    for (const a of game.list) {
      const i = this.cellAt(a.x, a.y);
      if (i < 0 || a === game.me) continue;
      const c = HOP_CELLS[i];
      g.fillStyle = rgba(COLORS[a.color], 0.22);
      g.fillRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
    }
  }
}
