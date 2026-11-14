import { COLORS, FONT, INK, P } from '../config';
import type { Game } from '../game';
import { K } from '../particles';
import { LAPTOPS } from '../net/protocol';
import { F_COFFEE, type Activity, type Actor, type Ev } from '../types';
import { circle, clamp, dist, rgba, rnd, rrect, TAU } from '../util';

/** Deque do coworking. */
export const DECK = { x: 600, y: 170, w: 760, h: 480 };
const TABLES = [
  { x: 650, y: 300, w: 340, h: 72 },
  { x: 650, y: 480, w: 340, h: 72 },
];
/** Onde o visitante fica para usar cada notebook (o banquinho). */
export const LAPTOP_SPOTS: { x: number; y: number; ty: number }[] = [];
for (const t of TABLES) for (let k = 0; k < 4; k++) LAPTOP_SPOTS.push({ x: 700 + k * 80, y: t.y + t.h + 26, ty: t.y });

export const BOARD = { x: 1040, y: 285, w: 280, h: 150 };
export const COFFEE_ZONE = { x: 1180, y: 598, r: 34 };
const COUNTER = { x: 1105, y: 505, w: 150, h: 50 };
export const DEPLOY = { x: 1310, y: 512 };
const SCREEN = { x: 830, y: 184, w: 300, h: 58 };
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SPOT_R = 30;
const CODE = ['#7BD88F', '#FFD866', '#78DCE8', '#FF6188', '#AB9DF2'];

interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  c: number;
  t: number;
}

/**
 * Coworking: mesas com notebooks, lousa coletiva, cafezinho e o botão de deploy.
 * Sentar num notebook "programa" sozinho; clicar digita mais rápido. Cada barra cheia é um commit,
 * e o telão soma os commits de todo mundo.
 */
export class Cowork implements Activity {
  private occ: Actor[][] = Array.from({ length: LAPTOPS }, () => []);
  private check = new Float32Array(LAPTOPS);
  private myLaptop = -1;
  private myProg = 0;
  private pairT = 0;
  private recent: number[] = [];

  private segs: Seg[] = [];
  private last: [number, number] | null = null;
  private lastSend = 0;
  private mySegs = 0;

  private coffeeDwell = 0;
  private coffeeUntil = 0;

  private lastDeploy = -100;
  private rocket = -1;

  constructor(private game: Game) {}

  update(dt: number) {
    const game = this.game;
    const me = game.me;
    const time = game.time;

    for (let i = 0; i < LAPTOPS; i++) {
      this.occ[i].length = 0;
      this.check[i] = Math.max(0, this.check[i] - dt);
    }
    for (const a of game.list) {
      if (a.x < DECK.x || a.x > DECK.x + DECK.w || a.y < DECK.y || a.y > DECK.y + DECK.h) continue;
      for (let i = 0; i < LAPTOPS; i++) {
        if (dist(a.x, a.y, LAPTOP_SPOTS[i].x, LAPTOP_SPOTS[i].y) < SPOT_R) {
          this.occ[i].push(a);
          break;
        }
      }
      // fumacinha de quem está com café
      if (a.flags & F_COFFEE && Math.random() < dt * 5) {
        game.fx.add({ k: K.Puff, x: a.x + 27, y: a.y - a.z - 4, vy: -22, vx: rnd(-6, 6), size: 3.4, color: '#FFFFFF', life: 0.8 });
      }
    }
    while (this.recent.length && time - this.recent[0] > 30) this.recent.shift();
    while (this.segs.length && time - this.segs[0].t > 45) this.segs.shift();

    if (this.rocket >= 0) {
      this.rocket += dt / 2.1;
      const [rx, ry] = this.rocketPos(this.rocket);
      if (Math.random() < dt * 40) game.fx.add({ k: K.Puff, x: rx, y: ry + 10, size: 8, color: '#FFFFFF', life: 0.7 });
      if (this.rocket >= 1) {
        this.rocket = -1;
        game.fx.burst(K.Confetti, rx, ry, 46, COLORS, { speed: 300, up: 260, size: 5, life: 1.6 });
        game.fx.burst(K.Star, rx, ry, 10, ['#FFD866', '#FFFDF6'], { speed: 200, up: 200, size: 7, life: 1.1 });
        game.sfx.sparkle(rx, ry);
      }
    }

    if (!game.joined) return;

    // notebook
    let at = -1;
    for (let i = 0; i < LAPTOPS; i++) if (this.occ[i].includes(me)) at = i;
    if (at !== this.myLaptop) {
      this.myLaptop = at;
      this.myProg = 0;
    }
    if (at >= 0) {
      const pair = this.occ[at].length > 1;
      this.myProg += dt * 0.075 * (pair ? 2 : 1) * (me.flags & F_COFFEE ? 1.6 : 1);
      this.pairT = pair ? this.pairT + dt : 0;
      if (this.pairT > 2) game.album.award('par');
      if (this.myProg >= 1) this.commit(at);
    } else {
      this.pairT = 0;
    }

    // lousa: desenha enquanto o botão estiver apertado
    const B = BOARD;
    const inside = me.x > B.x + 4 && me.x < B.x + B.w - 4 && me.y > B.y + 4 && me.y < B.y + B.h - 4;
    if (game.input.down && inside && !game.held) {
      const cx = Math.round(me.x - B.x);
      const cy = Math.round(me.y - B.y);
      if (!this.last) {
        this.last = [cx, cy];
      } else if (Math.hypot(cx - this.last[0], cy - this.last[1]) >= 4 && time - this.lastSend > 0.045) {
        game.emit({ k: 'draw', x: this.last[0], y: this.last[1], tx: cx, ty: cy });
        this.last = [cx, cy];
        this.lastSend = time;
        if (++this.mySegs >= 40) game.album.award('lousa');
      }
    } else {
      this.last = null;
    }

    // cafezinho
    const has = (me.flags & F_COFFEE) !== 0;
    if (!has && dist(me.x, me.y, COFFEE_ZONE.x, COFFEE_ZONE.y) < COFFEE_ZONE.r) {
      this.coffeeDwell += dt;
      if (this.coffeeDwell > 0.9) {
        this.coffeeDwell = 0;
        me.flags |= F_COFFEE;
        this.coffeeUntil = time + 45;
        game.sfx.sip(me.x, me.y);
        game.album.award('cafe');
      }
    } else {
      this.coffeeDwell = Math.max(0, this.coffeeDwell - dt * 2);
    }
    if (has && time > this.coffeeUntil) me.flags &= ~F_COFFEE;
  }

  private commit(i: number) {
    const game = this.game;
    this.myProg = 0;
    game.emit({ k: 'commit', n: i });
    game.store.inc('commits');
    game.album.award('commit');
  }

  private rocketPos(u: number): [number, number] {
    return [DEPLOY.x - 520 * u, DEPLOY.y - 30 - 4 * 190 * u * (1 - u) - 60 * u];
  }

  click(): boolean {
    const game = this.game;
    const me = game.me;
    if (this.myLaptop >= 0) {
      this.myProg += 0.09 * (me.flags & F_COFFEE ? 1.5 : 1);
      const s = LAPTOP_SPOTS[this.myLaptop];
      game.sfx.key(s.x, s.y);
      game.fx.add({ k: K.Dot, x: s.x + rnd(-16, 16), y: s.ty + 20, vz: 90, grav: 300, vx: rnd(-20, 20), size: 2.2, color: CODE[Math.floor(rnd(CODE.length))], life: 0.45 });
      if (this.myProg >= 1) this.commit(this.myLaptop);
      return true;
    }
    const B = BOARD;
    if (me.x > B.x && me.x < B.x + B.w && me.y > B.y && me.y < B.y + B.h) return true;
    if (dist(me.x, me.y, DEPLOY.x, DEPLOY.y) < 50) {
      if (game.time - this.lastDeploy > 6) {
        game.emit({ k: 'deploy' });
        game.album.award('deploy');
      }
      return true;
    }
    return false;
  }

  event(a: Actor | null, ev: Ev) {
    const game = this.game;
    if (ev.k === 'commit' && ev.n !== undefined && ev.n < LAPTOPS) {
      const s = LAPTOP_SPOTS[ev.n];
      this.check[ev.n] = 1.5;
      this.recent.push(game.time);
      if (this.recent.length > 40) this.recent.shift();
      game.sfx.commit(s.x, s.ty);
      game.fx.burst(K.Star, s.x, s.ty + 10, 5, [a ? COLORS[a.color] : '#7BD88F', '#FFFDF6'], { speed: 90, up: 190, size: 5, life: 0.8 });
    } else if (ev.k === 'deploy') {
      this.lastDeploy = game.time;
      this.rocket = 0;
      game.sfx.launch(DEPLOY.x, DEPLOY.y);
    } else if (ev.k === 'draw' && ev.x !== undefined && ev.y !== undefined && ev.tx !== undefined && ev.ty !== undefined) {
      if (this.segs.length > 700) this.segs.shift();
      this.segs.push({
        x0: clamp(ev.x, 2, BOARD.w - 2),
        y0: clamp(ev.y, 2, BOARD.h - 2),
        x1: clamp(ev.tx, 2, BOARD.w - 2),
        y1: clamp(ev.ty, 2, BOARD.h - 2),
        c: a ? a.color : 0,
        t: game.time,
      });
    }
  }

  drawGround(g: CanvasRenderingContext2D) {
    const game = this.game;
    const D = DECK;
    if (!game.inView(D.x + D.w / 2, D.y + D.h / 2, 520)) return;
    // deque de madeira clara com moldura de aço
    g.fillStyle = rgba(INK, 0.16);
    rrect(g, D.x + 4, D.y + 8, D.w + 8, D.h + 8, 30);
    g.fill();
    rrect(g, D.x, D.y, D.w, D.h, 26);
    g.fillStyle = '#EAD9BC';
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = rgba(INK, 0.07);
    g.lineWidth = 2;
    g.beginPath();
    for (let y = D.y + 40, r = 0; y < D.y + D.h; y += 40, r++) {
      g.moveTo(D.x, y);
      g.lineTo(D.x + D.w, y);
      for (let x = D.x + (r % 2 ? 70 : 150); x < D.x + D.w; x += 160) {
        g.moveTo(x, y - 40);
        g.lineTo(x, y);
      }
    }
    g.stroke();
    // parede de vidro ao norte e a oeste
    g.fillStyle = 'rgba(150,205,225,0.5)';
    g.fillRect(D.x, D.y, D.w, 10);
    g.fillRect(D.x, D.y, 10, D.h);
    g.restore();
    rrect(g, D.x, D.y, D.w, D.h, 26);
    g.strokeStyle = '#3A3F4B';
    g.lineWidth = 6;
    g.stroke();

    // lousa
    const B = BOARD;
    g.fillStyle = rgba(INK, 0.14);
    rrect(g, B.x - 4, B.y, B.w + 14, B.h + 14, 8);
    g.fill();
    rrect(g, B.x - 8, B.y - 8, B.w + 16, B.h + 16, 8);
    g.fillStyle = '#C9CED6';
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.fillRect(B.x, B.y, B.w, B.h);
    if (!this.segs.length) {
      g.font = `600 15px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = rgba(INK, 0.28);
      g.fillText('hold click to draw', B.x + B.w / 2, B.y + B.h / 2);
    }
    g.lineCap = 'round';
    g.lineWidth = 4;
    for (const s of this.segs) {
      const age = game.time - s.t;
      g.globalAlpha = clamp((45 - age) / 8, 0, 1);
      g.strokeStyle = COLORS[s.c];
      g.beginPath();
      g.moveTo(B.x + s.x0, B.y + s.y0);
      g.lineTo(B.x + s.x1, B.y + s.y1);
      g.stroke();
    }
    g.globalAlpha = 1;
    // canetas
    for (let i = 0; i < 3; i++) {
      g.fillStyle = [P.terracotta, P.teal, '#6C5CE7'][i];
      rrect(g, B.x + 14 + i * 34, B.y + B.h + 1, 26, 6, 3);
      g.fill();
    }

    // marca do cafezinho
    g.setLineDash([8, 8]);
    g.strokeStyle = rgba(INK, 0.32);
    g.lineWidth = 3;
    circle(g, COFFEE_ZONE.x, COFFEE_ZONE.y, COFFEE_ZONE.r);
    g.stroke();
    g.setLineDash([]);
    if (this.coffeeDwell > 0) {
      g.strokeStyle = '#8A5A3C';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(COFFEE_ZONE.x, COFFEE_ZONE.y, COFFEE_ZONE.r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(this.coffeeDwell / 0.9, 0, 1));
      g.stroke();
    }
  }

  drawMid(g: CanvasRenderingContext2D) {
    const game = this.game;
    const D = DECK;
    if (!game.inView(D.x + D.w / 2, D.y + D.h / 2, 520)) return;
    const time = game.time;

    // pufes e vasos
    for (const [x, y, r, c] of [
      [1052, 512, 30, P.pink],
      [1044, 596, 27, P.teal],
    ] as [number, number, number, string][]) {
      g.fillStyle = rgba(INK, 0.15);
      circle(g, x + 4, y + 6, r);
      g.fill();
      circle(g, x, y, r);
      g.fillStyle = c;
      g.fill();
      circle(g, x - r * 0.2, y - r * 0.25, r * 0.5);
      g.fillStyle = rgba('#FFFFFF', 0.18);
      g.fill();
    }
    for (const [x, y] of [
      [630, 200],
      [1330, 200],
      [630, 620],
      [1330, 620],
    ]) {
      g.fillStyle = rgba(INK, 0.15);
      circle(g, x + 4, y + 6, 17);
      g.fill();
      circle(g, x, y, 16);
      g.fillStyle = '#F4F1EA';
      g.fill();
      g.fillStyle = P.leaf;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + Math.sin(time * 0.8 + x) * 0.08;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * 11, y - 6 + Math.sin(a) * 9, 11, 5, a, 0, TAU);
        g.fill();
      }
    }

    // telão
    const S = SCREEN;
    rrect(g, S.x, S.y, S.w, S.h, 10);
    g.fillStyle = '#1E2230';
    g.fill();
    g.strokeStyle = '#3A3F4B';
    g.lineWidth = 4;
    g.stroke();
    g.textBaseline = 'middle';
    const deploying = time - this.lastDeploy < 4;
    if (deploying) {
      g.textAlign = 'center';
      g.font = `700 20px ${MONO}`;
      g.fillStyle = '#7BD88F';
      const friday = new Date().getDay() === 5;
      g.fillText(friday ? 'deploy on a Friday? bold.' : 'deploy ✓ live', S.x + S.w / 2, S.y + S.h / 2);
    } else {
      g.textAlign = 'left';
      g.font = `600 14px ${MONO}`;
      g.fillStyle = '#8B93A7';
      g.fillText('commits', S.x + 16, S.y + 19);
      g.font = `700 24px ${MONO}`;
      g.fillStyle = '#7BD88F';
      g.fillText(String(game.store.get('commits')), S.x + 16, S.y + 41);
      // cada commit recente acende um quadradinho
      for (let i = 0; i < 12; i++) {
        const t = this.recent[this.recent.length - 1 - i];
        const lit = t !== undefined ? clamp(1 - (time - t) / 30, 0.15, 1) : 0.08;
        g.fillStyle = rgba('#7BD88F', lit);
        rrect(g, S.x + S.w - 30 - i * 15, S.y + 20, 11, 18, 2.5);
        g.fill();
      }
    }

    // mesas, banquinhos e notebooks
    for (const t of TABLES) {
      g.fillStyle = rgba(INK, 0.15);
      rrect(g, t.x + 5, t.y + 8, t.w, t.h, 14);
      g.fill();
      rrect(g, t.x, t.y, t.w, t.h, 14);
      g.fillStyle = '#FBF8F1';
      g.fill();
      g.strokeStyle = '#D8D2C4';
      g.lineWidth = 3;
      g.stroke();
    }
    for (let i = 0; i < LAPTOPS; i++) {
      const s = LAPTOP_SPOTS[i];
      const users = this.occ[i];
      const mine = i === this.myLaptop;
      // banquinho
      g.fillStyle = rgba(INK, 0.15);
      circle(g, s.x + 3, s.y + 5, 15);
      g.fill();
      circle(g, s.x, s.y, 15);
      g.fillStyle = users.length ? COLORS[users[0].color] : '#B9824F';
      g.fill();
      g.strokeStyle = rgba(INK, 0.5);
      g.lineWidth = 2;
      g.stroke();

      const bx = s.x - 23;
      const by = s.ty + 36;
      // tela
      rrect(g, bx, by - 34, 46, 32, 4);
      g.fillStyle = '#3A3F4B';
      g.fill();
      g.fillStyle = users.length ? '#1E2230' : '#2A2D3A';
      g.fillRect(bx + 3, by - 31, 40, 26);
      if (this.check[i] > 0) {
        g.strokeStyle = '#7BD88F';
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(bx + 14, by - 18);
        g.lineTo(bx + 21, by - 11);
        g.lineTo(bx + 33, by - 25);
        g.stroke();
      } else if (users.length) {
        // linhas de código aparecendo
        const prog = mine ? this.myProg * 5 : (time * 1.3 + i * 0.7) % 5;
        for (let l = 0; l < 5; l++) {
          if (l > prog) break;
          const full = l + 1 <= prog ? 1 : prog - l;
          const w = (12 + ((l * 7 + i * 3) % 4) * 6) * full;
          g.fillStyle = CODE[(l + i) % CODE.length];
          g.fillRect(bx + 6 + (l % 3) * 4, by - 29 + l * 5, w, 2.6);
        }
      }
      // base com teclado
      rrect(g, bx - 2, by, 50, 22, 5);
      g.fillStyle = '#D5D8DE';
      g.fill();
      g.strokeStyle = '#A9AEB8';
      g.lineWidth = 1.6;
      g.stroke();
      g.fillStyle = '#B4B9C3';
      g.fillRect(bx + 4, by + 4, 38, 8);
      rrect(g, bx + 15, by + 14, 16, 5, 2);
      g.fill();
      if (mine) {
        // barra de progresso do commit
        g.fillStyle = rgba(INK, 0.25);
        rrect(g, bx - 2, by + 27, 50, 6, 3);
        g.fill();
        g.fillStyle = '#7BD88F';
        rrect(g, bx - 2, by + 27, 50 * clamp(this.myProg, 0.04, 1), 6, 3);
        g.fill();
      }
    }

    // balcão do café
    const C = COUNTER;
    g.fillStyle = rgba(INK, 0.15);
    rrect(g, C.x + 5, C.y + 8, C.w, C.h, 10);
    g.fill();
    rrect(g, C.x, C.y, C.w, C.h, 10);
    g.fillStyle = '#3A3F4B';
    g.fill();
    rrect(g, C.x + 14, C.y - 14, 54, 52, 8);
    g.fillStyle = '#C9CED6';
    g.fill();
    g.strokeStyle = '#8B93A7';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#1E2230';
    g.fillRect(C.x + 24, C.y + 10, 34, 16);
    circle(g, C.x + 41, C.y - 2, 5);
    g.fillStyle = '#E4572E';
    g.fill();
    for (let i = 0; i < 3; i++) {
      circle(g, C.x + 92 + i * 20, C.y + 24, 8);
      g.fillStyle = '#FFFDF6';
      g.fill();
      g.strokeStyle = '#8A5A3C';
      g.lineWidth = 2.5;
      g.stroke();
    }
    g.font = `700 13px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = rgba(INK, 0.5);
    g.fillText('coffee', COFFEE_ZONE.x, COFFEE_ZONE.y);

    // botão de deploy
    const armed = time - this.lastDeploy > 6;
    const press = clamp(1 - (time - this.lastDeploy) / 0.4, 0, 1);
    g.fillStyle = rgba(INK, 0.16);
    circle(g, DEPLOY.x + 4, DEPLOY.y + 6, 38);
    g.fill();
    g.save();
    circle(g, DEPLOY.x, DEPLOY.y, 38);
    g.clip();
    for (let i = -5; i < 6; i++) {
      g.fillStyle = i % 2 === 0 ? '#F2C230' : INK;
      g.beginPath();
      g.moveTo(DEPLOY.x + i * 16 - 40, DEPLOY.y + 40);
      g.lineTo(DEPLOY.x + i * 16 - 24, DEPLOY.y + 40);
      g.lineTo(DEPLOY.x + i * 16 + 56, DEPLOY.y - 40);
      g.lineTo(DEPLOY.x + i * 16 + 40, DEPLOY.y - 40);
      g.closePath();
      g.fill();
    }
    g.restore();
    circle(g, DEPLOY.x, DEPLOY.y - 6 + press * 5, 25);
    g.fillStyle = armed ? '#E4352B' : '#9B2A24';
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.stroke();
    circle(g, DEPLOY.x - 7, DEPLOY.y - 14 + press * 5, 8);
    g.fillStyle = rgba('#FFFFFF', 0.3);
    g.fill();
    g.font = `800 12px ${FONT}`;
    g.fillStyle = INK;
    g.fillText('DEPLOY', DEPLOY.x, DEPLOY.y + 52);
  }

  drawTop(g: CanvasRenderingContext2D) {
    const game = this.game;
    if (!game.inView(DECK.x + DECK.w / 2, DECK.y + DECK.h / 2, 620)) return;
    // foguete do deploy
    if (this.rocket >= 0) {
      const [x, y] = this.rocketPos(this.rocket);
      const [nx, ny] = this.rocketPos(this.rocket + 0.02);
      g.save();
      g.translate(x, y);
      g.rotate(Math.atan2(ny - y, nx - x) + Math.PI / 2);
      g.fillStyle = '#F2994A';
      g.beginPath();
      g.moveTo(-6, 16);
      g.lineTo(0, 30 + Math.sin(game.time * 40) * 5);
      g.lineTo(6, 16);
      g.closePath();
      g.fill();
      g.fillStyle = '#E4352B';
      g.beginPath();
      g.moveTo(-9, 16);
      g.lineTo(-16, 22);
      g.lineTo(-9, 4);
      g.closePath();
      g.moveTo(9, 16);
      g.lineTo(16, 22);
      g.lineTo(9, 4);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(0, -22);
      g.quadraticCurveTo(11, -8, 9, 16);
      g.lineTo(-9, 16);
      g.quadraticCurveTo(-11, -8, 0, -22);
      g.fillStyle = '#FFFDF6';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2.4;
      g.stroke();
      circle(g, 0, -2, 4.5);
      g.fillStyle = '#62BBCB';
      g.fill();
      g.stroke();
      g.restore();
    }
  }

  lights(out: number[]) {
    for (const t of TABLES) out.push(t.x + t.w / 2, t.y + t.h / 2, 300, 0.85);
    out.push(BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h / 2, 240, 0.8, COFFEE_ZONE.x, COFFEE_ZONE.y - 40, 190, 0.7);
  }
}
