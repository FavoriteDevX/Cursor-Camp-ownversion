import { CX, CY, INK } from '../config';
import type { Game } from '../game';
import { K } from '../particles';
import { F_POP, type Activity, type Actor } from '../types';
import { circle, clamp, dist, rgba, rnd, TAU } from '../util';
import { F_RO } from './fountain';
import { PLAZA_R } from './scenery';

interface Pigeon {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  /** 0 parado ciscando, 1 andando, 2 voando */
  st: 0 | 1 | 2;
  t: number;
  dir: number;
  ph: number;
  fx: number;
  fy: number;
  ft: number;
  fd: number;
  tone: number;
}

const N = 14;

/** Sorteia um ponto na praça, fora do chafariz. */
function plazaSpot(): [number, number] {
  const a = rnd(TAU);
  const r = rnd(F_RO + 50, PLAZA_R - 30);
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
}

/**
 * Pombos da praça. Voam quando um ponteiro passa correndo e seguem quem tem pipoca.
 * Cada navegador simula os seus: é só enfeite, não precisa bater igual para todos.
 */
export class Pigeons implements Activity {
  private list: Pigeon[] = [];
  private scared = 0;

  constructor(private game: Game) {
    for (let i = 0; i < N; i++) {
      const [x, y] = plazaSpot();
      this.list.push({ x, y, z: 0, tx: x, ty: y, st: 0, t: rnd(0.5, 3), dir: rnd(TAU), ph: rnd(TAU), fx: x, fy: y, ft: 0, fd: 1, tone: rnd(-0.08, 0.08) });
    }
  }

  update(dt: number) {
    const game = this.game;
    const me = game.me;
    let nearMe = 0;

    for (const p of this.list) {
      if (p.st === 2) {
        p.ft += dt / p.fd;
        const u = clamp(p.ft, 0, 1);
        const e = u * u * (3 - 2 * u);
        p.x = p.fx + (p.tx - p.fx) * e;
        p.y = p.fy + (p.ty - p.fy) * e;
        p.z = Math.sin(u * Math.PI) * 74;
        if (u >= 1) {
          p.st = 0;
          p.z = 0;
          p.t = rnd(0.6, 2);
        }
        continue;
      }

      // susto: alguém perto demais ou passando correndo
      let fright: Actor | null = null;
      let feeder: Actor | null = null;
      let feederD = 430;
      for (const a of game.list) {
        const d = dist(a.x, a.y, p.x, p.y);
        if (d < 30 || (d < 86 && a.speed > 190)) fright = a;
        if (a.flags & F_POP && d < feederD) {
          feeder = a;
          feederD = d;
        }
      }
      if (fright) {
        this.fly(p, fright);
        continue;
      }

      // comida: primeiro a pipoca no chão, depois quem está com o saquinho
      let goal: [number, number] | null = null;
      let best = 340;
      let bestI = -1;
      for (let i = 0; i < game.kernels.length; i++) {
        const k = game.kernels[i];
        const d = dist(k.x, k.y, p.x, p.y);
        if (d < best) {
          best = d;
          bestI = i;
        }
      }
      if (bestI >= 0) {
        const k = game.kernels[bestI];
        if (best < 9) {
          game.kernels.splice(bestI, 1);
          p.st = 0;
          p.t = 0.5;
        } else {
          goal = [k.x, k.y];
        }
      } else if (feeder && feederD > 62) {
        goal = [feeder.x + Math.cos(p.ph) * 52, feeder.y + Math.sin(p.ph) * 44];
      }
      if (feeder === me && feederD < 96) nearMe++;

      if (goal) {
        p.st = 1;
        p.tx = goal[0];
        p.ty = goal[1];
        p.t = 0.4;
      }

      if (p.st === 0) {
        p.t -= dt;
        if (p.t <= 0) {
          p.st = 1;
          p.t = rnd(1, 2.4);
          [p.tx, p.ty] = [p.x + rnd(-90, 90), p.y + rnd(-70, 70)];
          const d = dist(p.tx, p.ty, CX, CY);
          if (d < F_RO + 30 || d > PLAZA_R + 40) [p.tx, p.ty] = plazaSpot();
        }
      } else {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        p.t -= dt;
        if (d < 5 || p.t <= 0) {
          p.st = 0;
          p.t = rnd(0.8, 3);
        } else {
          const sp = goal ? 96 : 44;
          p.x += (dx / d) * sp * dt;
          p.y += (dy / d) * sp * dt;
          p.dir = Math.atan2(dy, dx);
        }
      }
    }

    if (game.joined && me.flags & F_POP && nearMe >= 3) game.album.award('pombos');
  }

  private fly(p: Pigeon, from: Actor) {
    const game = this.game;
    const away = Math.atan2(p.y - from.y, p.x - from.x) + rnd(-0.7, 0.7);
    const r = rnd(240, 420);
    let tx = p.x + Math.cos(away) * r;
    let ty = p.y + Math.sin(away) * r;
    const d = dist(tx, ty, CX, CY);
    if (d > PLAZA_R + 150 || d < F_RO + 30) [tx, ty] = plazaSpot();
    p.st = 2;
    p.fx = p.x;
    p.fy = p.y;
    p.tx = tx;
    p.ty = ty;
    p.ft = 0;
    p.fd = rnd(0.9, 1.4);
    p.dir = Math.atan2(ty - p.y, tx - p.x);
    game.sfx.flap(p.x, p.y);
    game.fx.add({ k: K.Puff, x: p.x, y: p.y, size: 7, color: '#FFFFFF', life: 0.4, layer: 0 });
    if (from === game.me && ++this.scared >= 10) game.album.award('revoada');
  }

  drawMid(g: CanvasRenderingContext2D) {
    const game = this.game;
    const time = game.time;
    for (const p of this.list) {
      if (!game.inView(p.x, p.y, 120)) continue;
      const flying = p.st === 2;
      // sombra
      g.fillStyle = rgba(INK, flying ? 0.12 : 0.2);
      g.beginPath();
      g.ellipse(p.x + 2 + p.z * 0.3, p.y + 3 + p.z * 0.15, 10, 6, 0, 0, TAU);
      g.fill();

      g.save();
      g.translate(p.x, p.y - p.z);
      g.rotate(p.dir);
      const bob = p.st === 0 ? Math.max(0, Math.sin(time * 9 + p.ph)) * 2.6 : p.st === 1 ? Math.sin(time * 16 + p.ph) * 1.2 : 0;
      const body = `hsl(218, 14%, ${Math.round((0.56 + p.tone) * 100)}%)`;
      if (flying) {
        const flap = Math.sin(time * 30 + p.ph);
        g.fillStyle = `hsl(218, 12%, ${Math.round((0.68 + p.tone) * 100)}%)`;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(2, s * 3);
          g.lineTo(-7, s * (13 + flap * 7));
          g.lineTo(7, s * (11 + flap * 5));
          g.closePath();
          g.fill();
        }
      }
      // rabo
      g.fillStyle = '#4A5568';
      g.beginPath();
      g.moveTo(-7, -4);
      g.lineTo(-15, 0);
      g.lineTo(-7, 4);
      g.closePath();
      g.fill();
      // corpo
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, 0, 10, 6.6, 0, 0, TAU);
      g.fill();
      // pescoço furta-cor e cabeça
      g.fillStyle = '#5B8A7A';
      circle(g, 6.5 + bob, 0, 4.6);
      g.fill();
      g.fillStyle = body;
      circle(g, 9 + bob, 0, 3.8);
      g.fill();
      g.fillStyle = '#F2994A';
      g.beginPath();
      g.moveTo(12.2 + bob, -1.4);
      g.lineTo(15.6 + bob, 0);
      g.lineTo(12.2 + bob, 1.4);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
}
