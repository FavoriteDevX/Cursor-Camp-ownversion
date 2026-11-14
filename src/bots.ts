import { CX, CY, H, W } from './config';
import { makeActor } from './actors';
import type { Game } from './game';
import { FLOWER_SLOTS, TILE_COUNT } from './net/protocol';
import { F_BUSY, F_COFFEE, F_POP, F_SWING, type Actor, type Ev } from './types';
import { clamp, dist, irnd, pick, rnd, TAU } from './util';
import { CAB_ZONES, FLOOR } from './world/arcade';
import { wedgeSpot } from './world/coreto';
import { COFFEE_ZONE, LAPTOP_SPOTS } from './world/cowork';
import { F_RO } from './world/fountain';
import { BED, encodeFlower, TILES } from './world/garden';
import { PITCH } from './world/pitch';
import { HOP_CELLS, SEESAW, SWINGS } from './world/playground';
import { CART_ZONE } from './world/popcorn';
import { BENCHES, PLAZA_R } from './world/scenery';

/** Um roteiro é um gerador: cada `yield` espera um quadro e recebe o dt. */
type Script = Generator<void, void, number>;

interface Bot {
  a: Actor;
  script: Script | null;
  task: string;
  popUntil: number;
  coffeeUntil: number;
}

const COUNT = 7;
const TASKS = ['passeio', 'coreto', 'chafariz', 'gangorra', 'balanco', 'bola', 'pipoca', 'banco', 'amarelinha', 'azulejo', 'flor', 'cowork', 'cowork', 'fliperama', 'pista'] as const;

function* wait(s: number): Script {
  let t = 0;
  while (t < s) t += yield;
}

/** Anda até um ponto do jeito que um mouse anda: acelera, freia e faz uma curva leve. */
function* goTo(b: Bot, x: number, y: number, speed = 470): Script {
  let t = 0;
  const amp = rnd(10, 30);
  const freq = rnd(2, 4);
  const ph = rnd(TAU);
  for (;;) {
    const dt = yield;
    t += dt;
    const dx = x - b.a.x;
    const dy = y - b.a.y;
    const d = Math.hypot(dx, dy);
    if (d < 5 || t > 14) return;
    const sp = Math.min(speed, 70 + d * 3.2);
    const step = Math.min(d, sp * dt);
    const w = Math.sin(t * freq + ph) * amp * Math.min(1, d / 220) * dt * 3;
    b.a.x += (dx / d) * step - (dy / d) * w;
    b.a.y += (dy / d) * step + (dx / d) * w;
  }
}

/**
 * Visitantes simulados. Só existem no modo de demonstração (sem servidor de tempo real),
 * para a praça não ficar vazia. A interface sempre avisa que são simulados.
 * Quando há várias abas abertas, só a aba anfitriã os simula e as outras recebem as posições.
 */
export class Bots {
  active = false;
  private bots: Bot[] = [];
  private sendT = 0;

  constructor(private game: Game) {}

  get count() {
    let n = 0;
    for (const a of this.game.actors.values()) if (a.kind === 'bot') n++;
    return n;
  }

  update(dt: number) {
    const game = this.game;
    const should = game.net.kind === 'local' && game.isHost;
    if (should && !this.active) this.takeOver();
    else if (!should && this.active) this.release();
    if (!this.active) return;

    for (const b of this.bots) {
      if (b.popUntil && game.time > b.popUntil) {
        b.popUntil = 0;
        b.a.flags &= ~F_POP;
      }
      if (b.coffeeUntil && game.time > b.coffeeUntil) {
        b.coffeeUntil = 0;
        b.a.flags &= ~F_COFFEE;
      }
      if (!b.script) b.script = this.next(b);
      if (b.script.next(dt).done) b.script = null;
      b.a.x = clamp(b.a.x, 20, W - 20);
      b.a.y = clamp(b.a.y, 20, H - 20);
      b.a.seen = game.time;
    }

    this.sendT -= dt;
    if (game.authority && this.sendT <= 0) {
      this.sendT = 0.1;
      game.net.send({ t: 'bs', l: this.bots.map((b, i) => [i, Math.round(b.a.x), Math.round(b.a.y), b.a.color, b.a.flags]) });
    }
  }

  /** Esta aba virou anfitriã: assume os simulados de onde eles estavam. */
  private takeOver() {
    const game = this.game;
    this.active = true;
    this.bots = [];
    for (let i = 0; i < COUNT; i++) {
      const id = 'bot-' + i;
      let a = game.actors.get(id);
      if (!a) {
        const ang = rnd(TAU);
        const r = rnd(F_RO + 60, PLAZA_R + 200);
        a = makeActor(id, 'bot', (i * 3 + 1) % 10, CX + Math.cos(ang) * r, CY + Math.sin(ang) * r, game.time);
        game.actors.set(id, a);
      }
      a.sim = true;
      a.buf.length = 0;
      a.flags &= ~(F_SWING | F_BUSY);
      this.bots.push({ a, script: null, task: '', popUntil: 0, coffeeUntil: 0 });
    }
  }

  /** Outra aba virou anfitriã: os simulados passam a vir pela rede. */
  private release() {
    this.active = false;
    for (const b of this.bots) {
      b.a.sim = false;
      b.a.buf.length = 0;
    }
    this.bots = [];
  }

  private emit(b: Bot, ev: Ev) {
    const game = this.game;
    game.handleEvent(b.a, ev);
    if (game.authority) game.net.send({ t: 'e', ...ev, a: b.a.id });
  }

  private next(b: Bot): Script {
    let task: string = pick(TASKS);
    if (task === b.task) task = 'passeio';
    b.task = task;
    return this.run(b, task);
  }

  private *run(b: Bot, task: string): Script {
    const game = this.game;
    const a = b.a;

    // de vez em quando cumprimenta quem está por perto
    if (game.joined && dist(a.x, a.y, game.me.x, game.me.y) < 280 && Math.random() < 0.35) {
      this.emit(b, { k: 'emo', n: pick([0, 0, 1, 2]) });
      yield* wait(0.6);
    }

    switch (task) {
      case 'passeio': {
        const ang = rnd(TAU);
        const r = rnd(F_RO + 40, PLAZA_R + 380);
        yield* goTo(b, clamp(CX + Math.cos(ang) * r, 60, W - 60), clamp(CY + Math.sin(ang) * r * 0.8, 60, H - 60));
        yield* wait(rnd(0.5, 2));
        break;
      }
      case 'coreto': {
        let i = irnd(8);
        const [sx, sy] = wedgeSpot(i, 240);
        yield* goTo(b, sx, sy);
        const n = 8 + irnd(9);
        for (let k = 0; k < n; k++) {
          i = (i + pick([1, 1, 2, 7, 3]) + 8) % 8;
          const [x, y] = wedgeSpot(i, rnd(110, 150));
          yield* goTo(b, x, y, 760);
          yield* wait(pick([0.16, 0.16, 0.34, 0.5]));
        }
        break;
      }
      case 'chafariz': {
        const ang = rnd(TAU);
        yield* goTo(b, CX + Math.cos(ang) * (F_RO + 60), CY + Math.sin(ang) * (F_RO + 60));
        yield* wait(rnd(0.8, 2));
        const ca = ang + rnd(-0.6, 0.6);
        const cr = rnd(84, 130);
        this.emit(b, { k: 'coin', x: Math.round(a.x), y: Math.round(a.y), tx: Math.round(CX + Math.cos(ca) * cr), ty: Math.round(CY + Math.sin(ca) * cr) });
        game.store.inc('coins');
        yield* wait(rnd(1, 2));
        if (Math.random() < 0.45) {
          yield* goTo(b, CX + Math.cos(ang) * 104, CY + Math.sin(ang) * 104, 300);
          yield* wait(0.5);
          yield* goTo(b, CX + Math.cos(ang + 1.4) * 110, CY + Math.sin(ang + 1.4) * 110, 260);
          yield* goTo(b, CX + Math.cos(ang + 1.6) * (F_RO + 70), CY + Math.sin(ang + 1.6) * (F_RO + 70));
        }
        break;
      }
      case 'gangorra': {
        // senta do lado que tiver menos gente
        let l = 0;
        let r = 0;
        for (const o of game.list) {
          if (dist(o.x, o.y, SEESAW.x - SEESAW.half, SEESAW.y) < SEESAW.zone) l++;
          else if (dist(o.x, o.y, SEESAW.x + SEESAW.half, SEESAW.y) < SEESAW.zone) r++;
        }
        const side = l < r ? -1 : r < l ? 1 : pick([-1, 1]);
        yield* goTo(b, SEESAW.x + side * SEESAW.half + rnd(-10, 10), SEESAW.y + rnd(-10, 10));
        yield* wait(rnd(6, 11));
        break;
      }
      case 'balanco': {
        const taken = new Set<number>();
        for (const o of game.list) {
          const s = (o.flags & F_SWING) >> 1;
          if (s) taken.add(s - 1);
        }
        const free = [0, 1, 2].filter((i) => !taken.has(i));
        if (!free.length) break;
        const i = pick(free);
        yield* goTo(b, SWINGS.xs[i], SWINGS.y);
        a.flags = (a.flags & ~F_SWING) | ((i + 1) << 1);
        const total = rnd(7, 11);
        let t = 0;
        while (t < total) {
          t += yield;
          const amp = 0.95 * Math.min(1, t / 3) * Math.min(1, (total - t) / 1.5);
          a.x = SWINGS.xs[i];
          a.y = SWINGS.y + SWINGS.len * Math.sin(amp * Math.sin(t * 3));
        }
        a.flags &= ~F_SWING;
        yield* goTo(b, SWINGS.xs[i] + 60, SWINGS.y + 40);
        break;
      }
      case 'bola': {
        const pitch = game.pitch;
        yield* goTo(b, PITCH.x + PITCH.w / 2 + rnd(-200, 200), PITCH.y + PITCH.h / 2 + rnd(-140, 140));
        const goalX = Math.random() < 0.5 ? PITCH.x - 20 : PITCH.x + PITCH.w + 20;
        const goalY = PITCH.y + PITCH.h / 2;
        const total = rnd(8, 14);
        let t = 0;
        while (t < total) {
          const dt = yield;
          t += dt;
          const ball = pitch.ball;
          // fica atrás da bola em relação ao gol e corre por dentro dela
          const gx = goalX - ball.x;
          const gy = goalY - ball.y;
          const gd = Math.hypot(gx, gy) || 1;
          const behindX = ball.x - (gx / gd) * 46;
          const behindY = ball.y - (gy / gd) * 46;
          const lined = dist(a.x, a.y, behindX, behindY) < 34;
          const tx = lined ? ball.x + (gx / gd) * 40 : behindX;
          const ty = lined ? ball.y + (gy / gd) * 40 : behindY;
          const dx = tx - a.x;
          const dy = ty - a.y;
          const d = Math.hypot(dx, dy) || 1;
          const sp = Math.min(lined ? 560 : 420, 80 + d * 5);
          a.x += (dx / d) * Math.min(d, sp * dt);
          a.y += (dy / d) * Math.min(d, sp * dt);
        }
        break;
      }
      case 'pipoca': {
        yield* goTo(b, CART_ZONE.x + rnd(-14, 14), CART_ZONE.y + rnd(-14, 14));
        yield* wait(1.4);
        a.flags |= F_POP;
        b.popUntil = game.time + 26;
        for (let k = 0; k < 4; k++) {
          const ang = rnd(TAU);
          const r = rnd(F_RO + 50, PLAZA_R - 40);
          yield* goTo(b, CX + Math.cos(ang) * r, CY + Math.sin(ang) * r, 150);
          yield* wait(rnd(1, 3));
        }
        break;
      }
      case 'banco': {
        const bench = pick(BENCHES);
        yield* goTo(b, bench.x + rnd(-20, 20), bench.y + rnd(-6, 6));
        yield* wait(rnd(6, 10));
        break;
      }
      case 'amarelinha': {
        yield* goTo(b, HOP_CELLS[0].x - 50, HOP_CELLS[0].y + HOP_CELLS[0].h / 2);
        for (const c of HOP_CELLS) {
          yield* goTo(b, c.x + c.w / 2 + rnd(-6, 6), c.y + c.h / 2 + rnd(-6, 6), 620);
          yield* wait(rnd(0.2, 0.4));
        }
        break;
      }
      case 'azulejo': {
        const n = 1 + irnd(3);
        for (let k = 0; k < n; k++) {
          const i = irnd(TILE_COUNT);
          yield* goTo(b, TILES.x + ((i % TILES.cols) + 0.5) * TILES.s, TILES.y + (Math.floor(i / TILES.cols) + 0.5) * TILES.s);
          yield* wait(0.5);
          game.store.set(`m:${i}`, a.color * 4 + irnd(4) + 1);
          yield* wait(0.5);
        }
        break;
      }
      case 'cowork': {
        if (Math.random() < 0.45) {
          yield* goTo(b, COFFEE_ZONE.x + rnd(-10, 10), COFFEE_ZONE.y + rnd(-10, 10));
          yield* wait(1.2);
          a.flags |= F_COFFEE;
          b.coffeeUntil = game.time + 40;
        }
        const free = LAPTOP_SPOTS.map((_, i) => i).filter((i) => !game.list.some((o) => o !== a && dist(o.x, o.y, LAPTOP_SPOTS[i].x, LAPTOP_SPOTS[i].y) < 30));
        if (!free.length) break;
        const i = pick(free);
        yield* goTo(b, LAPTOP_SPOTS[i].x + rnd(-6, 6), LAPTOP_SPOTS[i].y + rnd(-6, 6));
        const commits = 1 + irnd(3);
        for (let k = 0; k < commits; k++) {
          yield* wait(rnd(3.5, 6));
          this.emit(b, { k: 'commit', n: i });
          game.store.inc('commits');
        }
        yield* wait(rnd(0.5, 1.5));
        break;
      }
      case 'fliperama': {
        const free = [0, 1, 2].filter((i) => !game.list.some((o) => o !== a && dist(o.x, o.y, CAB_ZONES[i].x, CAB_ZONES[i].y) < CAB_ZONES[i].r + 10));
        if (!free.length) break;
        const z = CAB_ZONES[pick(free)];
        yield* goTo(b, z.x + rnd(-8, 8), z.y + rnd(-8, 8));
        a.flags |= F_BUSY;
        yield* wait(rnd(8, 14));
        a.flags &= ~F_BUSY;
        break;
      }
      case 'pista': {
        const n = 8 + irnd(8);
        for (let k = 0; k < n; k++) {
          const c = irnd(FLOOR.cols);
          const r = irnd(FLOOR.rows);
          yield* goTo(b, FLOOR.x + (c + 0.5) * FLOOR.s + rnd(-8, 8), FLOOR.y + (r + 0.5) * FLOOR.s + rnd(-8, 8), 700);
          yield* wait(pick([0.2, 0.2, 0.4]));
        }
        break;
      }
      case 'flor': {
        const n = 1 + irnd(2);
        for (let k = 0; k < n; k++) {
          const fx = Math.round(rnd(20, BED.w - 20));
          const fy = Math.round(rnd(20, BED.h - 20));
          yield* goTo(b, BED.x + fx, BED.y + fy);
          yield* wait(0.4);
          game.store.set(`f:${irnd(FLOWER_SLOTS)}`, encodeFlower(fx, fy, irnd(4), a.color));
          yield* wait(0.6);
        }
        break;
      }
    }
  }
}
