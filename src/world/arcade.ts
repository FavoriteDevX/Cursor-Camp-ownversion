import { CatchGame, RallyGame, SH, SW, WormGame, type MiniGame, type Pad } from '../arcade/minigames';
import { COLORS, FONT, INK } from '../config';
import type { Game } from '../game';
import { F_BUSY, type Activity, type Actor } from '../types';
import { circle, clamp, dist, mulberry32, rgba, rrect, TAU } from '../util';

/** Salão do fliperama. */
export const ARCADE = { x: 2760, y: 1620, w: 700, h: 540 };
const CAB_Y = 1790;
/** Onde o visitante fica para jogar em cada máquina. */
export const CAB_ZONES = [2900, 3110, 3320].map((x) => ({ x, y: 1892, r: 42 }));
/** Pista de dança: ladrilhos que acendem e tocam. */
export const FLOOR = { x: 2960, y: 1952, cols: 5, rows: 3, s: 60 };
const FLOOR_N = FLOOR.cols * FLOOR.rows;
// pentatônica menor, grave
const SEMIS = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34];
const NEON = ['#FF5DA2', '#3EE0D0', '#FFD23F'];
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Fliperama: três máquinas com minijogos e uma pista de dança.
 * O recorde de cada máquina é da praça inteira: fica no estado compartilhado.
 */
export class Arcade implements Activity {
  private games: MiniGame[] = [new CatchGame(), new WormGame(), new RallyGame()];
  /** Máquina em que o visitante local está jogando (-1 = nenhuma). */
  playing = -1;
  private overT = 0;
  private newRecord = false;
  private clicked = false;
  private busy = [false, false, false];
  private confetti: number[] = [];
  private glow = new Float32Array(FLOOR_N);
  private glowColor: string[] = new Array(FLOOR_N).fill('#fff');
  private where = new Map<string, number>();

  constructor(private game: Game) {
    const rng = mulberry32(1986);
    for (let i = 0; i < 150; i++) this.confetti.push(ARCADE.x + 20 + rng() * (ARCADE.w - 40), ARCADE.y + 20 + rng() * (ARCADE.h - 40), rng() * TAU, Math.floor(rng() * 4), Math.floor(rng() * 3));
  }

  private tileOf(x: number, y: number): number {
    const c = Math.floor((x - FLOOR.x) / FLOOR.s);
    const r = Math.floor((y - FLOOR.y) / FLOOR.s);
    if (c < 0 || c >= FLOOR.cols || r < 0 || r >= FLOOR.rows) return -1;
    return r * FLOOR.cols + c;
  }

  update(dt: number) {
    const game = this.game;
    const me = game.me;

    // pista de dança
    for (let i = 0; i < FLOOR_N; i++) this.glow[i] = Math.max(0, this.glow[i] - dt * 1.8);
    this.busy.fill(false);
    for (const a of game.list) {
      const w = this.tileOf(a.x, a.y);
      const prev = this.where.get(a.id) ?? -1;
      if (w !== prev) {
        this.where.set(a.id, w);
        if (w >= 0) this.step(a, w);
      }
      if (a.flags & F_BUSY) {
        for (let i = 0; i < 3; i++) if (dist(a.x, a.y, CAB_ZONES[i].x, CAB_ZONES[i].y) < CAB_ZONES[i].r + 6) this.busy[i] = true;
      }
    }
    if (this.where.size > game.list.length + 30) this.where.clear();

    if (this.playing < 0) return;
    const mg = this.games[this.playing];
    const z = CAB_ZONES[this.playing];
    me.x = z.x;
    me.y = z.y;
    if (game.keysHit.has('q') || game.keysHit.has('x') || game.keysHit.has('backspace')) {
      this.exit();
      return;
    }
    if (!mg.over) {
      const k = game.keys;
      const pad: Pad = {
        dx: game.rdx,
        dy: game.rdy,
        left: k.has('arrowleft') || k.has('a'),
        right: k.has('arrowright') || k.has('d'),
        up: k.has('arrowup') || k.has('w'),
        down: k.has('arrowdown') || k.has('s'),
      };
      const before = mg.score;
      mg.update(dt, pad);
      if (mg.score > before) game.sfx.blip(520 + (mg.score % 8) * 60);
      if (mg.over) this.finish(mg);
    } else {
      this.overT += dt;
      if (this.clicked && this.overT > 0.5) {
        mg.reset();
        this.overT = 0;
        this.newRecord = false;
        game.sfx.blip(660);
      } else if (this.overT > 12) {
        this.exit();
      }
    }
    this.clicked = false;
  }

  private step(a: Actor, i: number) {
    this.glow[i] = 1;
    this.glowColor[i] = COLORS[a.color];
    const x = FLOOR.x + ((i % FLOOR.cols) + 0.5) * FLOOR.s;
    const y = FLOOR.y + (Math.floor(i / FLOOR.cols) + 0.5) * FLOOR.s;
    this.game.sfx.synth(110 * Math.pow(2, SEMIS[i] / 12), x, y);
  }

  private finish(mg: MiniGame) {
    const game = this.game;
    this.overT = 0;
    const key = `hs${this.playing}`;
    const score = Math.min(9999, mg.score);
    if (score > 0 && score > game.store.get(key)) {
      game.store.max(key, score);
      this.newRecord = true;
      game.album.award('recorde');
      game.sfx.jingle();
    } else {
      this.newRecord = false;
      game.sfx.gameOver();
    }
  }

  private start(i: number) {
    const game = this.game;
    this.playing = i;
    this.overT = 0;
    this.newRecord = false;
    this.clicked = false;
    this.games[i].reset();
    game.held = true;
    game.me.flags |= F_BUSY;
    game.sfx.blip(660);
    game.album.award('ficha');
    game.onArcade(true);
  }

  exit() {
    const game = this.game;
    if (this.playing < 0) return;
    this.playing = -1;
    game.held = false;
    game.me.flags &= ~F_BUSY;
    game.me.y += 34;
    game.onArcade(false);
  }

  click(): boolean {
    const game = this.game;
    if (this.playing >= 0) {
      this.clicked = true;
      return true;
    }
    for (let i = 0; i < 3; i++) {
      const z = CAB_ZONES[i];
      if (dist(game.me.x, game.me.y, z.x, z.y) >= z.r) continue;
      if (!this.busy[i]) this.start(i);
      return true;
    }
    return false;
  }

  drawGround(g: CanvasRenderingContext2D) {
    const game = this.game;
    const A = ARCADE;
    if (!game.inView(A.x + A.w / 2, A.y + A.h / 2, 520)) return;
    g.fillStyle = rgba(INK, 0.18);
    rrect(g, A.x + 4, A.y + 8, A.w + 8, A.h + 8, 34);
    g.fill();
    rrect(g, A.x, A.y, A.w, A.h, 30);
    g.fillStyle = '#2A2350';
    g.fill();
    // carpete de fliperama
    const c = this.confetti;
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < c.length; i += 5) {
      const col = NEON[c[i + 4]];
      g.save();
      g.translate(c[i], c[i + 1]);
      g.rotate(c[i + 2]);
      g.globalAlpha = 0.55;
      g.fillStyle = col;
      g.strokeStyle = col;
      if (c[i + 3] === 0) {
        g.beginPath();
        g.moveTo(-7, 6);
        g.lineTo(7, 6);
        g.lineTo(0, -7);
        g.closePath();
        g.fill();
      } else if (c[i + 3] === 1) {
        g.beginPath();
        g.moveTo(-10, 0);
        g.lineTo(-4, -6);
        g.lineTo(2, 0);
        g.lineTo(8, -6);
        g.stroke();
      } else if (c[i + 3] === 2) {
        g.beginPath();
        g.arc(0, 0, 4, 0, TAU);
        g.fill();
      } else {
        g.fillRect(-6, -1.5, 12, 3);
        g.fillRect(-1.5, -6, 3, 12);
      }
      g.restore();
    }
    g.globalAlpha = 1;
    rrect(g, A.x, A.y, A.w, A.h, 30);
    g.strokeStyle = '#FF5DA2';
    g.lineWidth = 5;
    g.stroke();

    // pista de dança
    for (let i = 0; i < FLOOR_N; i++) {
      const x = FLOOR.x + (i % FLOOR.cols) * FLOOR.s;
      const y = FLOOR.y + Math.floor(i / FLOOR.cols) * FLOOR.s;
      rrect(g, x + 3, y + 3, FLOOR.s - 6, FLOOR.s - 6, 8);
      const idle = 0.12 + 0.08 * Math.sin(game.time * 2 + i * 1.9);
      g.fillStyle = rgba(NEON[i % 3], idle);
      g.fill();
      if (this.glow[i] > 0) {
        g.fillStyle = rgba(this.glowColor[i], this.glow[i] * 0.9);
        g.fill();
      }
      g.strokeStyle = rgba('#FFFFFF', 0.25);
      g.lineWidth = 2;
      g.stroke();
    }

    // marcas de "jogar"
    g.font = `700 14px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const z = CAB_ZONES[i];
      const here = game.joined && this.playing < 0 && dist(game.me.x, game.me.y, z.x, z.y) < z.r;
      g.setLineDash([8, 8]);
      g.strokeStyle = rgba(NEON[i], here ? 1 : 0.6);
      g.lineWidth = here ? 4 : 3;
      circle(g, z.x, z.y, z.r);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = rgba('#FFFFFF', here ? 0.95 : 0.6);
      g.fillText(this.busy[i] ? 'busy' : here ? 'click!' : 'play', z.x, z.y);
    }
  }

  drawMid(g: CanvasRenderingContext2D) {
    const game = this.game;
    const A = ARCADE;
    if (!game.inView(A.x + A.w / 2, A.y + A.h / 2, 520)) return;
    const time = game.time;

    // letreiro de neon
    g.save();
    g.font = `800 46px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#FF5DA2';
    g.shadowBlur = 22;
    g.globalAlpha = Math.sin(time * 31) > 0.96 ? 0.6 : 1;
    g.fillStyle = '#FFD8EA';
    g.fillText('ARCADE', A.x + A.w / 2, A.y + 62);
    g.restore();

    for (let i = 0; i < 3; i++) {
      const cx = CAB_ZONES[i].x;
      const cy = CAB_Y;
      const col = NEON[i];
      const mg = this.games[i];
      const on = this.busy[i] || this.playing === i;
      g.fillStyle = rgba(INK, 0.22);
      rrect(g, cx - 48, cy - 42, 108, 100, 12);
      g.fill();
      rrect(g, cx - 54, cy - 52, 108, 100, 12);
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.stroke();
      // nome do jogo
      rrect(g, cx - 46, cy - 46, 92, 16, 5);
      g.fillStyle = '#17132E';
      g.fill();
      g.font = `700 10.5px ${MONO}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = col;
      g.fillText(mg.title, cx, cy - 37.5);
      // tela com uma demonstração
      rrect(g, cx - 42, cy - 26, 84, 46, 5);
      g.fillStyle = on ? '#241C52' : '#17132E';
      g.fill();
      g.save();
      g.beginPath();
      g.rect(cx - 40, cy - 24, 80, 42);
      g.clip();
      if (i === 0) {
        g.fillStyle = '#FFF3C4';
        for (let k = 0; k < 5; k++) {
          circle(g, cx - 32 + k * 16, cy - 24 + ((time * 26 + k * 19) % 46), 3);
          g.fill();
        }
        g.fillStyle = '#FFFDF6';
        g.fillRect(cx - 9 + Math.sin(time * 1.6) * 24, cy + 11, 18, 6);
      } else if (i === 1) {
        g.fillStyle = '#3EE0D0';
        for (let k = 0; k < 7; k++) {
          circle(g, cx + Math.cos(time * 1.4 - k * 0.32) * 26, cy - 3 + Math.sin(time * 2.8 - k * 0.64) * 12, 3.6);
          g.fill();
        }
      } else {
        const bx = cx + Math.sin(time * 2.2) * 30;
        const by = cy - 3 + Math.sin(time * 3.1) * 15;
        g.fillStyle = '#FFFDF6';
        circle(g, bx, by, 3);
        g.fill();
        g.fillStyle = '#FF5DA2';
        g.fillRect(cx - 38, by - 8, 3, 16);
        g.fillStyle = '#3EE0D0';
        g.fillRect(cx + 35, by - 8, 3, 16);
      }
      g.restore();
      if (on) {
        g.fillStyle = rgba('#FFFFFF', 0.06 + 0.05 * Math.sin(time * 40));
        g.fillRect(cx - 40, cy - 24, 80, 42);
      }
      // painel de controle
      rrect(g, cx - 46, cy + 24, 92, 18, 5);
      g.fillStyle = rgba(INK, 0.35);
      g.fill();
      circle(g, cx - 22, cy + 31, 6);
      g.fillStyle = '#E4352B';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1.6;
      g.stroke();
      for (const [o, c] of [
        [8, '#FFFDF6'],
        [26, '#17132E'],
      ] as [number, string][]) {
        circle(g, cx + o, cy + 33, 5);
        g.fillStyle = c;
        g.fill();
        g.stroke();
      }
      // recorde da praça
      g.font = `700 13px ${MONO}`;
      g.fillStyle = rgba('#FFFFFF', 0.82);
      g.fillText(`best ${game.store.get(`hs${i}`)}`, cx, cy - 66);
    }
  }

  /** O minijogo aberto, desenhado por cima de tudo, em coordenadas de tela. */
  drawOverlay(g: CanvasRenderingContext2D, vw: number, vh: number) {
    if (this.playing < 0) return;
    const game = this.game;
    const mg = this.games[this.playing];
    const s = clamp(Math.min((vw - 36) / SW, (vh - 200) / SH), 0.8, 3.4);
    const w = SW * s;
    const h = SH * s;
    const x = Math.round((vw - w) / 2);
    const y = Math.round((vh - h) / 2 - 4);
    g.fillStyle = 'rgba(18,14,40,0.74)';
    g.fillRect(0, 0, vw, vh);
    rrect(g, x - 16, y - 50, w + 32, h + 104, 22);
    g.fillStyle = '#241C46';
    g.fill();
    g.strokeStyle = mg.color;
    g.lineWidth = 4;
    g.stroke();
    g.textBaseline = 'middle';
    g.font = `800 24px ${FONT}`;
    g.textAlign = 'left';
    g.fillStyle = mg.color;
    g.fillText(mg.title, x, y - 23);
    g.font = `700 14px ${MONO}`;
    g.textAlign = 'right';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText(`plaza high score ${game.store.get(`hs${this.playing}`)}`, x + w, y - 22);

    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.beginPath();
    g.rect(0, 0, SW, SH);
    g.clip();
    mg.draw(g, game.time);
    if (mg.over) {
      g.fillStyle = 'rgba(10,8,26,0.78)';
      g.fillRect(0, 0, SW, SH);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 22px ${MONO}`;
      g.fillStyle = '#FFFDF6';
      g.fillText('GAME OVER', SW / 2, SH / 2 - 34);
      g.font = `700 40px ${MONO}`;
      g.fillStyle = mg.color;
      g.fillText(String(mg.score), SW / 2, SH / 2 + 6);
      if (this.newRecord && Math.sin(game.time * 10) > -0.3) {
        g.font = `700 14px ${MONO}`;
        g.fillStyle = '#FFD23F';
        g.fillText('NEW PLAZA HIGH SCORE!', SW / 2, SH / 2 + 46);
      }
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);

    g.font = `600 15px ${FONT}`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.86)';
    const exit = game.input.mode === 'touch' ? 'Quit button to leave' : 'Q to quit';
    g.fillText(mg.over ? `click to play again  ·  ${exit}` : `${mg.help}  ·  ${exit}`, vw / 2, y + h + 28);
  }

  lights(out: number[]) {
    const A = ARCADE;
    out.push(A.x + A.w / 2, A.y + 70, 330, 0.8);
    for (const z of CAB_ZONES) out.push(z.x, CAB_Y, 200, 0.85);
    out.push(FLOOR.x + 150, FLOOR.y + 90, 260, 0.75);
  }
}
