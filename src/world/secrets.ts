import { H, INK, W } from '../config';
import type { Game } from '../game';
import { K } from '../particles';
import type { Activity } from '../types';
import { circle, dist, rgba, rnd, rrect, TAU } from '../util';
import { BENCHES, CAT, type Scenery } from './scenery';

interface Firefly {
  x: number;
  y: number;
  hx: number;
  hy: number;
  ph: number;
}

/**
 * Coisas que ninguém anuncia: o gato que dorme no canto, os vaga-lumes da noite
 * e o sossego de quem senta num banco e fica quieto.
 */
export class Secrets implements Activity {
  private catT = 0;
  private catAwake = 0;
  private benchT = 0;
  private flies: Firefly[] = [];

  constructor(
    private game: Game,
    scenery: Scenery,
  ) {
    // os vaga-lumes moram perto das árvores
    const trees = scenery.trees;
    for (let i = 0; i < 30; i++) {
      const t = trees[(i * 7) % trees.length];
      const hx = Math.min(W - 40, Math.max(40, t.x + rnd(-110, 110)));
      const hy = Math.min(H - 40, Math.max(40, t.y + rnd(-90, 110)));
      this.flies.push({ x: hx, y: hy, hx, hy, ph: rnd(TAU) });
    }
  }

  update(dt: number) {
    const game = this.game;
    const me = game.me;
    const time = game.time;

    // gato
    let close = false;
    for (const a of game.list) if (dist(a.x, a.y, CAT.x, CAT.y) < 130) close = true;
    this.catAwake += ((close ? 1 : 0) - this.catAwake) * Math.min(1, dt * 5);
    if (game.joined && dist(me.x, me.y, CAT.x, CAT.y) < 62 && me.speed < 70) {
      this.catT += dt;
      if (this.catT > 1.4) {
        game.sfx.purr(CAT.x, CAT.y);
        if (Math.random() < dt * 3) game.fx.add({ k: K.Heart, x: CAT.x + rnd(-18, 18), y: CAT.y - 14, vy: -34, size: 7, color: '#E4476B', life: 1.1 });
        game.album.award('gato');
      }
    } else {
      this.catT = 0;
    }

    // banco
    if (game.joined) {
      let seated = false;
      for (const b of BENCHES) if (dist(me.x, me.y, b.x, b.y) < 44) seated = true;
      if (seated && me.speed < 26) {
        this.benchT += dt;
        if (this.benchT > 8) game.album.award('sossego');
      } else {
        this.benchT = 0;
      }
    }

    // vaga-lumes
    if (game.night > 0.5) {
      for (const f of this.flies) {
        f.x = f.hx + Math.sin(time * 0.5 + f.ph) * 46 + Math.sin(time * 1.3 + f.ph * 2) * 14;
        f.y = f.hy + Math.cos(time * 0.4 + f.ph * 1.7) * 34;
        if (game.joined && dist(me.x + 6, me.y + 10, f.x, f.y) < 20) {
          game.sfx.sparkle(f.x, f.y);
          game.fx.burst(K.Star, f.x, f.y, 10, ['#EFFFA0', '#FFF7C0'], { speed: 120, up: 160, size: 5, life: 0.8, grav: 200 });
          game.album.award('vagalume');
          f.hx = Math.min(W - 40, Math.max(40, f.hx + rnd(-320, 320)));
          f.hy = Math.min(H - 40, Math.max(40, f.hy + rnd(-260, 260)));
        }
      }
    }
  }

  drawMid(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (!game.inView(CAT.x, CAT.y, 120)) return;
    const { x, y } = CAT;
    const time = game.time;
    // muro baixo de pedra
    g.fillStyle = rgba(INK, 0.16);
    rrect(g, x - 58, y - 4, 124, 40, 12);
    g.fill();
    rrect(g, x - 64, y - 12, 124, 40, 12);
    g.fillStyle = '#CFC6B4';
    g.fill();
    g.strokeStyle = '#B4AA95';
    g.lineWidth = 3;
    g.stroke();
    // gato enrolado
    const breath = 1 + Math.sin(time * 1.6) * 0.035;
    g.save();
    g.translate(x, y + 4);
    g.scale(1, breath);
    g.fillStyle = '#E8963A';
    g.beginPath();
    g.ellipse(0, 0, 30, 20, 0, 0, TAU);
    g.fill();
    // rabo
    g.strokeStyle = '#E8963A';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(4, 4, 25, 0.25, 2.3);
    g.stroke();
    // listras
    g.strokeStyle = '#C97722';
    g.lineWidth = 3;
    for (const sx of [-6, 4, 14]) {
      g.beginPath();
      g.moveTo(sx, -17);
      g.lineTo(sx + 2, -6);
      g.stroke();
    }
    // cabeça
    circle(g, -17, -1, 13);
    g.fillStyle = '#EFA24A';
    g.fill();
    g.beginPath();
    g.moveTo(-28, -8);
    g.lineTo(-27, -21);
    g.lineTo(-18, -13);
    g.closePath();
    g.moveTo(-15, -13);
    g.lineTo(-8, -21);
    g.lineTo(-6, -8);
    g.closePath();
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.8;
    if (this.catAwake > 0.5) {
      g.fillStyle = '#8BC34A';
      circle(g, -22, -2, 2.8);
      g.fill();
      circle(g, -13, -2, 2.8);
      g.fill();
      g.fillStyle = INK;
      circle(g, -22, -2, 1.1);
      g.fill();
      circle(g, -13, -2, 1.1);
      g.fill();
    } else {
      g.beginPath();
      g.arc(-22, -2, 3, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      g.beginPath();
      g.arc(-13, -2, 3, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    }
    g.fillStyle = '#D9705F';
    circle(g, -17.5, 3, 1.6);
    g.fill();
    g.restore();
  }

  drawTop(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (game.night <= 0.5) return;
    const time = game.time;
    for (const f of this.flies) {
      if (!game.inView(f.x, f.y, 30)) continue;
      const blink = 0.5 + 0.5 * Math.sin(time * 3 + f.ph * 3);
      g.fillStyle = rgba('#EFFFA0', 0.18 * blink * game.night);
      circle(g, f.x, f.y, 13);
      g.fill();
      g.fillStyle = rgba('#F6FFB8', (0.5 + 0.5 * blink) * game.night);
      circle(g, f.x, f.y, 3.2);
      g.fill();
    }
  }

  lights(out: number[]) {
    if (this.game.night <= 0.5) return;
    for (const f of this.flies) out.push(f.x, f.y, 46, 0.5);
  }
}
