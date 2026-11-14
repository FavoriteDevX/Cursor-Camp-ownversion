import { clamp, rnd, TAU } from '../util';

/** Tela lógica de todo minijogo. O fliperama amplia para caber na janela. */
export const SW = 320;
export const SH = 240;

/** O que o jogador fez neste quadro. */
export interface Pad {
  /** Deslocamento do mouse ou do dedo, em px de tela. */
  dx: number;
  dy: number;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface MiniGame {
  readonly title: string;
  readonly help: string;
  readonly color: string;
  score: number;
  over: boolean;
  reset(): void;
  update(dt: number, pad: Pad): void;
  draw(g: CanvasRenderingContext2D, t: number): void;
}

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') {
  g.font = `700 ${size}px ${MONO}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(s, x, y);
}

// ------------------------------------------------------------ Pega-Pipoca

interface Drop {
  x: number;
  y: number;
  vy: number;
  bad: boolean;
  rot: number;
}

/** Apare a pipoca que cai e desvie do milho queimado. */
export class CatchGame implements MiniGame {
  readonly title = 'POPCORN CATCH';
  readonly help = 'move left and right';
  readonly color = '#FF5DA2';
  score = 0;
  over = false;
  private x = SW / 2;
  private lives = 3;
  private t = 0;
  private spawn = 0;
  private drops: Drop[] = [];
  private hurt = 0;

  reset() {
    this.score = 0;
    this.over = false;
    this.x = SW / 2;
    this.lives = 3;
    this.t = 0;
    this.spawn = 0.4;
    this.drops = [];
    this.hurt = 0;
  }

  update(dt: number, pad: Pad) {
    if (this.over) return;
    this.t += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.x = clamp(this.x + pad.dx * 0.9 + ((pad.right ? 1 : 0) - (pad.left ? 1 : 0)) * 280 * dt, 24, SW - 24);
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.3, 0.9 - this.t * 0.011);
      this.drops.push({ x: rnd(18, SW - 18), y: -10, vy: 70 + this.t * 2 + rnd(30), bad: Math.random() < Math.min(0.34, 0.1 + this.t * 0.004), rot: rnd(TAU) });
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += d.vy * dt;
      d.rot += dt * 3;
      if (d.y > 200 && d.y < 222 && Math.abs(d.x - this.x) < 27) {
        if (d.bad) this.miss();
        else this.score++;
        this.drops.splice(i, 1);
      } else if (d.y > SH + 10) {
        if (!d.bad) this.miss();
        this.drops.splice(i, 1);
      }
    }
  }

  private miss() {
    this.lives--;
    this.hurt = 0.3;
    if (this.lives <= 0) this.over = true;
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    g.fillStyle = this.hurt > 0 ? '#3A1530' : '#17132E';
    g.fillRect(0, 0, SW, SH);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 24; i++) g.fillRect((i * 97) % SW, (i * 53 + Math.floor(t * 6) * (i % 3)) % 190, 2, 2);
    g.fillStyle = '#2B2350';
    g.fillRect(0, 224, SW, 16);
    for (const d of this.drops) {
      if (d.bad) {
        g.fillStyle = '#5A3418';
        g.beginPath();
        g.arc(d.x, d.y, 7, 0, TAU);
        g.fill();
        g.strokeStyle = '#FF5D5D';
        g.lineWidth = 1.5;
        g.stroke();
      } else {
        g.fillStyle = '#FFF3C4';
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.arc(d.x + Math.cos(d.rot + k * 2.1) * 4, d.y + Math.sin(d.rot + k * 2.1) * 4, 5, 0, TAU);
          g.fill();
        }
      }
    }
    // saquinho
    g.fillStyle = '#FFFDF6';
    g.beginPath();
    g.moveTo(this.x - 26, 202);
    g.lineTo(this.x + 26, 202);
    g.lineTo(this.x + 19, 226);
    g.lineTo(this.x - 19, 226);
    g.closePath();
    g.fill();
    g.fillStyle = '#E4352B';
    for (const o of [-15, -3, 9]) g.fillRect(this.x + o, 204, 6, 21);
    txt(g, String(this.score), 10, 14, 16, '#FFD23F');
    for (let i = 0; i < this.lives; i++) txt(g, '♥', SW - 14 - i * 16, 14, 16, '#FF5DA2', 'center');
  }
}

// ------------------------------------------------------------ Minhoca

const COLS = 20;
const ROWS = 13;
const CELL = 16;
const TOP = SH - ROWS * CELL;

/** A minhoca come flores e cresce. Não pode bater na cerca nem em si mesma. */
export class WormGame implements MiniGame {
  readonly title = 'WORM';
  readonly help = 'arrows, WASD or a flick of the mouse';
  readonly color = '#3EE0D0';
  score = 0;
  over = false;
  private body: number[] = [];
  private dx = 1;
  private dy = 0;
  private wantX = 1;
  private wantY = 0;
  private food = 0;
  private timer = 0;
  private step = 0.17;
  private ax = 0;
  private ay = 0;

  reset() {
    this.score = 0;
    this.over = false;
    this.body = [6 + 6 * COLS, 5 + 6 * COLS, 4 + 6 * COLS];
    this.dx = this.wantX = 1;
    this.dy = this.wantY = 0;
    this.timer = 0;
    this.step = 0.17;
    this.ax = this.ay = 0;
    this.placeFood();
  }

  private placeFood() {
    for (let i = 0; i < 400; i++) {
      const c = Math.floor(Math.random() * COLS * ROWS);
      if (!this.body.includes(c)) {
        this.food = c;
        return;
      }
    }
  }

  private want(x: number, y: number) {
    // não deixa dar meia-volta
    if (x === -this.dx && y === -this.dy) return;
    this.wantX = x;
    this.wantY = y;
  }

  update(dt: number, pad: Pad) {
    if (this.over) return;
    if (pad.left) this.want(-1, 0);
    else if (pad.right) this.want(1, 0);
    else if (pad.up) this.want(0, -1);
    else if (pad.down) this.want(0, 1);
    this.ax += pad.dx;
    this.ay += pad.dy;
    if (Math.abs(this.ax) > 22 || Math.abs(this.ay) > 22) {
      if (Math.abs(this.ax) > Math.abs(this.ay)) this.want(Math.sign(this.ax), 0);
      else this.want(0, Math.sign(this.ay));
      this.ax = this.ay = 0;
    }
    this.timer += dt;
    while (this.timer >= this.step && !this.over) {
      this.timer -= this.step;
      this.dx = this.wantX;
      this.dy = this.wantY;
      const hx = (this.body[0] % COLS) + this.dx;
      const hy = Math.floor(this.body[0] / COLS) + this.dy;
      const head = hx + hy * COLS;
      const eat = head === this.food;
      const hit = this.body.indexOf(head);
      if (hx < 0 || hx >= COLS || hy < 0 || hy >= ROWS || (hit >= 0 && (eat || hit < this.body.length - 1))) {
        this.over = true;
        return;
      }
      this.body.unshift(head);
      if (eat) {
        this.score++;
        this.step = Math.max(0.07, 0.17 - this.score * 0.004);
        this.placeFood();
      } else {
        this.body.pop();
      }
    }
  }

  draw(g: CanvasRenderingContext2D, t: number) {
    g.fillStyle = '#14261B';
    g.fillRect(0, 0, SW, SH);
    g.fillStyle = '#1C3324';
    g.fillRect(0, TOP, SW, ROWS * CELL);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < COLS * ROWS; i++) if ((i + Math.floor(i / COLS)) % 2 === 0) g.fillRect((i % COLS) * CELL, TOP + Math.floor(i / COLS) * CELL, CELL, CELL);
    // flor
    const fx = (this.food % COLS) * CELL + CELL / 2;
    const fy = TOP + Math.floor(this.food / COLS) * CELL + CELL / 2;
    g.fillStyle = '#FF8FAB';
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(fx + Math.cos(k * 1.257 + t) * 4, fy + Math.sin(k * 1.257 + t) * 4, 3.2, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#FFD23F';
    g.beginPath();
    g.arc(fx, fy, 2.6, 0, TAU);
    g.fill();
    // minhoca
    for (let i = this.body.length - 1; i >= 0; i--) {
      const x = (this.body[i] % COLS) * CELL;
      const y = TOP + Math.floor(this.body[i] / COLS) * CELL;
      g.fillStyle = i === 0 ? '#3EE0D0' : i % 2 ? '#2FBFB1' : '#35CFC0';
      g.beginPath();
      g.arc(x + CELL / 2, y + CELL / 2, CELL / 2 - 1, 0, TAU);
      g.fill();
    }
    const hx = (this.body[0] % COLS) * CELL + CELL / 2;
    const hy = TOP + Math.floor(this.body[0] / COLS) * CELL + CELL / 2;
    g.fillStyle = '#14261B';
    g.beginPath();
    g.arc(hx + this.dx * 3 - this.dy * 3, hy + this.dy * 3 - this.dx * 3, 1.7, 0, TAU);
    g.arc(hx + this.dx * 3 + this.dy * 3, hy + this.dy * 3 + this.dx * 3, 1.7, 0, TAU);
    g.fill();
    txt(g, `flowers ${this.score}`, 10, TOP / 2, 14, '#FFD23F');
  }
}

// ------------------------------------------------------------ Rebate

/** Rebate a bola contra a máquina. Acaba quando a máquina faz 3 pontos. */
export class RallyGame implements MiniGame {
  readonly title = 'RALLY';
  readonly help = 'move up and down';
  readonly color = '#FFD23F';
  score = 0;
  over = false;
  private py = SH / 2;
  private cy = SH / 2;
  private cpu = 0;
  private bx = SW / 2;
  private by = SH / 2;
  private vx = 0;
  private vy = 0;
  private serve = 0;
  private dir = 1;

  reset() {
    this.score = 0;
    this.cpu = 0;
    this.over = false;
    this.py = this.cy = SH / 2;
    this.start(1);
  }

  private start(dir: number) {
    this.bx = SW / 2;
    this.by = SH / 2;
    this.vx = this.vy = 0;
    this.serve = 0.8;
    this.dir = dir;
  }

  update(dt: number, pad: Pad) {
    if (this.over) return;
    this.py = clamp(this.py + pad.dy * 0.85 + ((pad.down ? 1 : 0) - (pad.up ? 1 : 0)) * 260 * dt, 28, SH - 28);
    const target = this.vx > 0 ? this.by : SH / 2;
    const maxv = (118 + this.score * 13) * dt;
    this.cy = clamp(this.cy + clamp(target - this.cy, -maxv, maxv), 28, SH - 28);

    if (this.serve > 0) {
      this.serve -= dt;
      if (this.serve <= 0) {
        this.vx = this.dir * 150;
        this.vy = rnd(-70, 70);
      }
      return;
    }
    this.bx += this.vx * dt;
    this.by += this.vy * dt;
    if (this.by < 6) {
      this.by = 6;
      this.vy = Math.abs(this.vy);
    } else if (this.by > SH - 6) {
      this.by = SH - 6;
      this.vy = -Math.abs(this.vy);
    }
    if (this.vx < 0 && this.bx < 22 && this.bx > 8 && Math.abs(this.by - this.py) < 29) {
      this.bx = 22;
      this.vx = Math.min(430, -this.vx * 1.06);
      this.vy = clamp(this.vy + (this.by - this.py) * 5, -330, 330);
    } else if (this.vx > 0 && this.bx > SW - 22 && this.bx < SW - 8 && Math.abs(this.by - this.cy) < 29) {
      this.bx = SW - 22;
      this.vx = -Math.min(430, this.vx * 1.06);
      this.vy = clamp(this.vy + (this.by - this.cy) * 5, -330, 330);
    }
    if (this.bx < -10) {
      if (++this.cpu >= 3) this.over = true;
      else this.start(-1);
    } else if (this.bx > SW + 10) {
      this.score++;
      this.start(1);
    }
  }

  draw(g: CanvasRenderingContext2D) {
    g.fillStyle = '#101426';
    g.fillRect(0, 0, SW, SH);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let y = 6; y < SH; y += 18) g.fillRect(SW / 2 - 1.5, y, 3, 9);
    txt(g, String(this.score), SW / 2 - 34, 26, 30, '#FF5DA2', 'center');
    txt(g, String(this.cpu), SW / 2 + 34, 26, 30, '#3EE0D0', 'center');
    txt(g, 'you', SW / 2 - 34, 50, 10, 'rgba(255,255,255,0.5)', 'center');
    txt(g, 'cpu', SW / 2 + 34, 50, 10, 'rgba(255,255,255,0.5)', 'center');
    g.fillStyle = '#FF5DA2';
    g.fillRect(10, this.py - 24, 7, 48);
    g.fillStyle = '#3EE0D0';
    g.fillRect(SW - 17, this.cy - 24, 7, 48);
    g.fillStyle = '#FFFDF6';
    g.beginPath();
    g.arc(this.bx, this.by, 5, 0, TAU);
    g.fill();
  }
}
