import { COLORS, FONT, INK, P } from '../config';
import type { Game } from '../game';
import { K } from '../particles';
import type { Activity, Actor, Ev } from '../types';
import { circle, clamp, rgba, rrect, TAU } from '../util';

/** Campinho. gy0..gy1 é a boca dos gols; gd é a profundidade da rede. */
export const PITCH = { x: 2540, y: 970, w: 760, h: 460, gy0: 1130, gy1: 1270, gd: 46 };
const BR = 17;
const MID = { x: PITCH.x + PITCH.w / 2, y: PITCH.y + PITCH.h / 2 };

/**
 * Bola e gols. Todo navegador simula a bola para ela responder na hora,
 * mas quem manda é o anfitrião: ele decide os gols e corrige a posição dos outros.
 */
export class Pitch implements Activity {
  ball = { x: MID.x, y: MID.y, vx: 0, vy: 0 };
  sa = 0;
  sb = 0;
  private reset = 0;
  private last = '';
  private sendT = 0;
  private spin = 0;
  private flash = 0;

  constructor(private game: Game) {
    game.store.on((k, v) => {
      if (k === 'sa') this.sa = v;
      if (k === 'sb') this.sb = v;
    });
  }

  update(dt: number) {
    const game = this.game;
    const b = this.ball;
    const F = PITCH;
    this.flash = Math.max(0, this.flash - dt);

    if (this.reset > 0) {
      this.reset -= dt;
      b.vx *= Math.exp(-6 * dt);
      b.vy *= Math.exp(-6 * dt);
      if (this.reset <= 0) {
        b.x = MID.x;
        b.y = MID.y;
        b.vx = b.vy = 0;
        game.fx.ring(MID.x, MID.y, '#FFFFFF', 8, 50, 0.6, 0);
      }
    } else {
      for (const a of game.list) {
        if (a.x < F.x - 90 || a.x > F.x + F.w + 90 || a.y < F.y - 60 || a.y > F.y + F.h + 60) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const R = BR + 13;
        if (d >= R) continue;
        const nx = d > 0.01 ? dx / d : 1;
        const ny = d > 0.01 ? dy / d : 0;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const j = Math.min(rel * 1.05 + 30, 1300);
          b.vx += nx * j;
          b.vy += ny * j;
          if (j > 130) game.sfx.kick(b.x, b.y, clamp(j / 800, 0.2, 1));
        }
        b.x = a.x + nx * R;
        b.y = a.y + ny * R;
        this.last = a.id;
      }
    }

    let sp = Math.hypot(b.vx, b.vy);
    if (sp > 1500) {
      b.vx *= 1500 / sp;
      b.vy *= 1500 / sp;
      sp = 1500;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const f = Math.exp(-1.15 * dt);
    b.vx *= f;
    b.vy *= f;
    if (sp < 5) b.vx = b.vy = 0;
    this.spin += (b.vx * dt) / BR;

    // laterais
    if (b.y < F.y + BR) {
      b.y = F.y + BR;
      b.vy = Math.abs(b.vy) * 0.72;
    } else if (b.y > F.y + F.h - BR) {
      b.y = F.y + F.h - BR;
      b.vy = -Math.abs(b.vy) * 0.72;
    }
    // linhas de fundo e gols
    const mouth = b.y > F.gy0 + BR * 0.5 && b.y < F.gy1 - BR * 0.5;
    for (const side of [0, 1]) {
      // side 0 = gol da direita, side 1 = gol da esquerda
      const line = side === 0 ? F.x + F.w : F.x;
      const dir = side === 0 ? 1 : -1;
      const over = (b.x - line) * dir; // quanto passou da linha
      if (over <= -BR) continue;
      if (!mouth) {
        b.x = line - dir * BR;
        b.vx = -dir * Math.abs(b.vx) * 0.72;
        continue;
      }
      if (over > 2) {
        if (b.y < F.gy0 + BR) {
          b.y = F.gy0 + BR;
          b.vy = Math.abs(b.vy) * 0.4;
        } else if (b.y > F.gy1 - BR) {
          b.y = F.gy1 - BR;
          b.vy = -Math.abs(b.vy) * 0.4;
        }
      }
      if (over > F.gd - BR) {
        b.x = line + dir * (F.gd - BR);
        b.vx = -dir * Math.abs(b.vx) * 0.3;
      }
      if (over > BR && this.reset <= 0 && game.authority) this.goal(side);
    }

    if (game.authority) {
      // bola em movimento não espera o intervalo longo de quando está parada
      if (sp > 1 || this.reset > 0) this.sendT = Math.min(this.sendT, 0.08);
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = sp > 1 || this.reset > 0 ? 0.08 : 1.5;
        game.net.send({
          t: 'b',
          x: Math.round(b.x),
          y: Math.round(b.y),
          vx: Math.round(b.vx),
          vy: Math.round(b.vy),
          sa: this.sa,
          sb: this.sb,
          r: Math.round(Math.max(0, this.reset) * 1000),
        });
      }
    }
  }

  /** O anfitrião decide o gol e avisa todo mundo. */
  private goal(side: number) {
    const game = this.game;
    const sa = this.sa + (side === 0 ? 1 : 0);
    const sb = this.sb + (side === 1 ? 1 : 0);
    game.store.set(side === 0 ? 'sa' : 'sb', side === 0 ? sa : sb);
    game.emit({ k: 'goal', s: side, sa, sb, by: this.last });
  }

  event(_a: Actor | null, ev: Ev) {
    if (ev.k !== 'goal') return;
    const game = this.game;
    this.sa = ev.sa ?? this.sa;
    this.sb = ev.sb ?? this.sb;
    this.reset = 1.8;
    this.flash = 1.8;
    const gx = ev.s === 0 ? PITCH.x + PITCH.w + 20 : PITCH.x - 20;
    game.sfx.whistle(gx, MID.y);
    game.fx.burst(K.Confetti, gx, MID.y, 40, COLORS, { speed: 260, up: 380, size: 5, life: 1.5 });
    if (ev.by && ev.by === game.me.id && game.joined) game.album.award('gol');
  }

  /** Estado vindo do anfitrião: corrige a bola daqui sem dar tranco. */
  remote(m: { x: number; y: number; vx: number; vy: number; sa: number; sb: number; r: number }) {
    const b = this.ball;
    const ex = m.x - b.x;
    const ey = m.y - b.y;
    if (Math.hypot(ex, ey) > 130) {
      b.x = m.x;
      b.y = m.y;
    } else {
      b.x += ex * 0.5;
      b.y += ey * 0.5;
    }
    b.vx = m.vx;
    b.vy = m.vy;
    this.sa = m.sa;
    this.sb = m.sb;
    if (m.r === 0 && this.reset > 0.3) this.reset = 0;
  }

  drawGround(g: CanvasRenderingContext2D) {
    const F = PITCH;
    if (!this.game.inView(MID.x, MID.y, 520)) return;
    // gramado listrado
    rrect(g, F.x - 16, F.y - 16, F.w + 32, F.h + 32, 22);
    g.fillStyle = '#6FAE5C';
    g.fill();
    g.save();
    g.beginPath();
    g.rect(F.x, F.y, F.w, F.h);
    g.clip();
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? '#7CBB68' : '#72B25F';
      g.fillRect(F.x + (i * F.w) / 8, F.y, F.w / 8 + 1, F.h);
    }
    g.restore();
    // linhas
    g.strokeStyle = rgba('#FFFFFF', 0.9);
    g.lineWidth = 4;
    g.strokeRect(F.x, F.y, F.w, F.h);
    g.beginPath();
    g.moveTo(MID.x, F.y);
    g.lineTo(MID.x, F.y + F.h);
    g.stroke();
    circle(g, MID.x, MID.y, 64);
    g.stroke();
    g.strokeRect(F.x, MID.y - 120, 96, 240);
    g.strokeRect(F.x + F.w - 96, MID.y - 120, 96, 240);
    circle(g, MID.x, MID.y, 5);
    g.fillStyle = rgba('#FFFFFF', 0.9);
    g.fill();
    // redes
    for (const side of [0, 1]) {
      const x0 = side === 0 ? F.x + F.w : F.x - F.gd;
      g.fillStyle = rgba('#FFFFFF', 0.4);
      g.fillRect(x0, F.gy0, F.gd, F.gy1 - F.gy0);
      g.strokeStyle = rgba('#FFFFFF', 0.75);
      g.lineWidth = 1.4;
      g.beginPath();
      for (let x = x0; x <= x0 + F.gd + 0.1; x += F.gd / 4) {
        g.moveTo(x, F.gy0);
        g.lineTo(x, F.gy1);
      }
      for (let y = F.gy0; y <= F.gy1 + 0.1; y += 14) {
        g.moveTo(x0, y);
        g.lineTo(x0 + F.gd, y);
      }
      g.stroke();
    }
  }

  drawMid(g: CanvasRenderingContext2D) {
    const F = PITCH;
    const game = this.game;
    if (!game.inView(MID.x, MID.y, 520)) return;
    // traves
    for (const x of [F.x, F.x + F.w]) {
      for (const y of [F.gy0, F.gy1]) {
        g.fillStyle = rgba(INK, 0.2);
        circle(g, x + 3, y + 4, 8);
        g.fill();
        circle(g, x, y, 8);
        g.fillStyle = '#FFFDF6';
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 2.4;
        g.stroke();
      }
    }
    // bola
    const b = this.ball;
    g.fillStyle = rgba(INK, 0.2);
    g.beginPath();
    g.ellipse(b.x + 4, b.y + 6, BR, BR * 0.8, 0, 0, TAU);
    g.fill();
    g.save();
    g.translate(b.x, b.y);
    circle(g, 0, 0, BR);
    g.fillStyle = '#FFFDF6';
    g.fill();
    g.clip();
    g.rotate(this.spin);
    g.fillStyle = INK;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      circle(g, Math.cos(a) * BR * 0.78, Math.sin(a) * BR * 0.78, BR * 0.3);
      g.fill();
    }
    circle(g, 0, 0, BR * 0.3);
    g.fill();
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 2.4;
    circle(g, b.x, b.y, BR);
    g.stroke();

    // placar
    const px = MID.x;
    const py = F.y - 74;
    g.fillStyle = rgba(INK, 0.17);
    rrect(g, px - 104, py - 24, 220, 60, 12);
    g.fill();
    rrect(g, px - 110, py - 30, 220, 60, 12);
    g.fillStyle = this.flash > 0 && Math.sin(game.time * 24) > 0 ? P.mustard : P.woodDark;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#FFFDF6';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 34px ${FONT}`;
    g.fillText(`${this.sa}  ×  ${this.sb}`, px, py + 2);
  }

  lights(out: number[]) {
    out.push(PITCH.x + 120, MID.y, 330, 0.7, PITCH.x + PITCH.w - 120, MID.y, 330, 0.7, MID.x, MID.y, 330, 0.7);
  }
}
