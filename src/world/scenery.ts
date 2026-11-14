import { CX, CY, FONT, H, INK, P, W } from '../config';
import type { Game } from '../game';
import { circle, dist, mulberry32, rgba, rrect, segDist, TAU } from '../util';

export const PLAZA_R = 440;
export const CORETO = { x: 1800, y: 470, base: 270 };
/** Caixa de areia do parquinho. */
export const SAND = { x: 380, y: 760, w: 520, h: 880 };
/** Calçadão do lado sul. */
export const PROM = { x: 700, y: 1900, w: 2000, h: 220 };
/** Onde o gato dorme. */
export const CAT = { x: 268, y: 252 };

interface Path {
  pts: [number, number][];
  w: number;
}

const PATHS: Path[] = [
  { pts: [[CX, CY - PLAZA_R + 20], [CX, CORETO.y + CORETO.base - 20]], w: 130 },
  { pts: [[CX - PLAZA_R + 20, CY], [SAND.x + SAND.w - 20, CY]], w: 120 },
  { pts: [[CX + PLAZA_R - 20, CY], [2500, CY]], w: 120 },
  { pts: [[CX, CY + PLAZA_R - 20], [CX, PROM.y + 20]], w: 130 },
  { pts: [[2110, 890], [2520, 640]], w: 100 },
  { pts: [[1490, 890], [1090, 664]], w: 100 },
  { pts: [[2690, 2010], [2790, 2010]], w: 110 },
];

export interface Bench {
  x: number;
  y: number;
  a: number;
}

const ring = (deg: number, r: number): [number, number] => [
  CX + Math.cos((deg * Math.PI) / 180) * r,
  CY + Math.sin((deg * Math.PI) / 180) * r,
];

export const BENCHES: Bench[] = [
  ...[24, 156, 204, 336].map((d) => {
    const [x, y] = ring(d, PLAZA_R + 56);
    return { x, y, a: (d * Math.PI) / 180 + Math.PI / 2 };
  }),
  { x: 2920, y: 900, a: 0 },
  { x: 962, y: 1440, a: Math.PI / 2 },
  { x: 1960, y: 2168, a: 0 },
  { x: 2380, y: 2168, a: 0 },
];

export const LAMPS: [number, number][] = [
  ...[45, 135, 225, 315].map((d) => ring(d, PLAZA_R + 34)),
  [1490, 470],
  [2110, 470],
  [936, 1090],
  [2470, 1090],
  [2500, 920],
  [3340, 920],
  [1080, 1876],
  [1930, 1876],
  [2640, 1876],
  [2444, 708],
  [340, 1200],
  [1420, 700],
  [560, 400],
  [2726, 1890],
  [3490, 1700],
];

const LABELS: { t: string; x: number; y: number; r: number }[] = [
  { t: 'BANDSTAND', x: CX, y: CY - PLAZA_R + 64, r: 0 },
  { t: 'PLAYGROUND', x: 1130, y: CY, r: 0 },
  { t: 'PITCH', x: 2360, y: CY, r: 0 },
  { t: 'TILES', x: 2300, y: 772, r: Math.atan2(640 - 890, 2520 - 2110) },
  { t: 'POPCORN', x: CX, y: 1770, r: Math.PI / 2 },
  { t: 'COWORKING', x: 1290, y: 777, r: Math.atan2(890 - 664, 1490 - 1090) },
];

const inRect = (x: number, y: number, rx: number, ry: number, rw: number, rh: number, m: number) =>
  x > rx - m && x < rx + rw + m && y > ry - m && y < ry + rh + m;

/** Diz se um ponto cai em cima de calçada ou atração (árvores e tufos não nascem ali). */
export function blocked(x: number, y: number, m: number): boolean {
  if (dist(x, y, CX, CY) < PLAZA_R + m) return true;
  if (dist(x, y, CORETO.x, CORETO.y) < CORETO.base + m) return true;
  if (inRect(x, y, SAND.x, SAND.y, SAND.w, SAND.h, m)) return true;
  if (inRect(x, y, 2480, 900, 880, 580, m)) return true; // campinho e placar
  if (inRect(x, y, PROM.x, PROM.y, PROM.w, PROM.h, m)) return true;
  if (inRect(x, y, 2100, 1660, 440, 210, m)) return true; // canteiro
  if (inRect(x, y, 2440, 290, 640, 400, m)) return true; // painel de azulejos
  if (inRect(x, y, 1450, 1790, 180, 120, m)) return true; // carrinho de pipoca
  if (inRect(x, y, 600, 170, 760, 480, m)) return true; // coworking
  if (inRect(x, y, 2760, 1620, 700, 540, m)) return true; // fliperama
  if (dist(x, y, CAT.x, CAT.y) < 96 + m * 0.3) return true;
  for (const p of PATHS) {
    for (let i = 1; i < p.pts.length; i++) {
      if (segDist(x, y, p.pts[i - 1][0], p.pts[i - 1][1], p.pts[i][0], p.pts[i][1]) < p.w / 2 + m) return true;
    }
  }
  return false;
}

interface Tree {
  x: number;
  y: number;
  s: number;
  /** 0 = verde, 1 = ipê-amarelo, 2 = ipê-rosa */
  kind: number;
  ph: number;
  lobes: number[];
  dots: number[];
  petals: number[];
}

interface Tuft {
  x: number;
  y: number;
  rx: number;
  ry: number;
  kind: number;
}

export class Scenery {
  trees: Tree[] = [];
  private tufts: Tuft[] = [];
  private pattern: CanvasPattern | null = null;

  constructor(private game: Game) {
    const rng = mulberry32(20261113);

    const addTree = (x: number, y: number, s: number, kind: number) => {
      const lobes: number[] = [];
      const n = 4 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rng() * 0.7;
        lobes.push(Math.cos(a) * s * 0.58, Math.sin(a) * s * 0.5, s * (0.5 + rng() * 0.2));
      }
      const dots: number[] = [];
      for (let i = 0; i < (kind ? 16 : 6); i++) {
        const a = rng() * TAU;
        const r = Math.sqrt(rng()) * s * 0.95;
        dots.push(Math.cos(a) * r, Math.sin(a) * r * 0.9, 3 + rng() * 4);
      }
      const petals: number[] = [];
      if (kind) {
        for (let i = 0; i < 14; i++) {
          const a = rng() * TAU;
          const r = s * (0.9 + rng() * 1.1);
          petals.push(Math.cos(a) * r + 8, Math.sin(a) * r * 0.8 + 12, 2 + rng() * 2);
        }
      }
      this.trees.push({ x, y, s, kind, ph: rng() * TAU, lobes, dots, petals });
    };

    // um arvoredo fechado esconde o canto do gato
    for (const [x, y, s, k] of [
      [120, 150, 64, 0],
      [250, 96, 60, 2],
      [400, 150, 66, 0],
      [452, 290, 62, 0],
      [404, 420, 58, 1],
      [120, 330, 60, 0],
    ]) {
      addTree(x, y, s, k);
    }

    for (let i = 0; i < 1400 && this.trees.length < 92; i++) {
      const x = 70 + rng() * (W - 140);
      const y = 70 + rng() * (H - 140);
      if (blocked(x, y, 74)) continue;
      if (this.trees.some((t) => dist(t.x, t.y, x, y) < 128)) continue;
      const r = rng();
      addTree(x, y, 46 + rng() * 24, r < 0.62 ? 0 : r < 0.84 ? 1 : 2);
    }
    this.trees.sort((a, b) => a.y - b.y);

    for (let i = 0; i < 900 && this.tufts.length < 420; i++) {
      const x = rng() * W;
      const y = rng() * H;
      if (blocked(x, y, 6)) continue;
      const r = rng();
      this.tufts.push({ x, y, rx: 14 + rng() * 34, ry: 6 + rng() * 12, kind: r < 0.45 ? 0 : r < 0.86 ? 1 : r < 0.93 ? 2 : 3 });
    }
  }

  /** Calçada de pedra portuguesa: faixas onduladas claras e escuras. */
  private stone(g: CanvasRenderingContext2D): CanvasPattern | string {
    if (this.pattern) return this.pattern;
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 96;
    const p = c.getContext('2d');
    if (!p) return P.stone;
    p.fillStyle = P.stone;
    p.fillRect(0, 0, 192, 96);
    p.strokeStyle = 'rgba(92,102,118,0.36)';
    p.lineWidth = 40;
    p.beginPath();
    for (let x = -16; x <= 208; x += 4) {
      const y = 48 + Math.sin((x / 192) * TAU) * 17;
      if (x === -16) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.stroke();
    // pedrinhas
    p.fillStyle = 'rgba(255,255,255,0.3)';
    const rng = mulberry32(7);
    for (let i = 0; i < 60; i++) p.fillRect(rng() * 192, rng() * 96, 3, 3);
    const pat = g.createPattern(c, 'repeat');
    if (!pat) return P.stone;
    try {
      pat.setTransform(new DOMMatrix().scale(0.5));
    } catch {
      /* navegador antigo: fica em escala 1 */
    }
    this.pattern = pat;
    return pat;
  }

  drawGround(g: CanvasRenderingContext2D) {
    const game = this.game;
    // fora do mundo: cerca-viva
    g.fillStyle = P.hedge;
    g.fillRect(game.cam.x - 4, game.cam.y - 4, game.vw / game.zoom + 8, game.vh / game.zoom + 8);
    g.fillStyle = P.grass;
    g.fillRect(0, 0, W, H);

    for (const t of this.tufts) {
      if (!game.inView(t.x, t.y, 50)) continue;
      if (t.kind < 2) {
        g.fillStyle = t.kind === 0 ? P.grassDark : P.grassLight;
        g.beginPath();
        g.ellipse(t.x, t.y, t.rx, t.ry, 0, 0, TAU);
        g.fill();
      } else {
        // florzinha do mato
        g.fillStyle = t.kind === 2 ? '#FFFDF6' : '#F7D154';
        for (let i = 0; i < 3; i++) {
          circle(g, t.x + i * 9 - 9, t.y + (i % 2) * 6, 2.6);
          g.fill();
        }
      }
    }

    // pétalas caídas dos ipês
    for (const t of this.trees) {
      if (!t.kind || !game.inView(t.x, t.y, t.s * 2.4)) continue;
      g.fillStyle = t.kind === 1 ? rgba(P.ipeY, 0.85) : rgba(P.ipeP, 0.85);
      for (let i = 0; i < t.petals.length; i += 3) {
        circle(g, t.x + t.petals[i], t.y + t.petals[i + 1], t.petals[i + 2]);
        g.fill();
      }
    }

    // areia do parquinho
    rrect(g, SAND.x - 8, SAND.y - 8, SAND.w + 16, SAND.h + 16, 68);
    g.fillStyle = P.sandDark;
    g.fill();
    rrect(g, SAND.x, SAND.y, SAND.w, SAND.h, 60);
    g.fillStyle = P.sand;
    g.fill();

    // caminhos de terra batida
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const p of PATHS) {
        g.beginPath();
        g.moveTo(p.pts[0][0], p.pts[0][1]);
        for (let i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i][0], p.pts[i][1]);
        g.strokeStyle = pass === 0 ? P.pathEdge : P.path;
        g.lineWidth = pass === 0 ? p.w + 14 : p.w;
        g.stroke();
      }
    }

    // base do coreto
    circle(g, CORETO.x, CORETO.y, CORETO.base + 7);
    g.fillStyle = P.pathEdge;
    g.fill();
    circle(g, CORETO.x, CORETO.y, CORETO.base);
    g.fillStyle = P.path;
    g.fill();

    // piso em volta do painel de azulejos
    rrect(g, 2440, 290, 640, 400, 40);
    g.fillStyle = P.pathEdge;
    g.fill();
    rrect(g, 2447, 297, 626, 386, 34);
    g.fillStyle = P.path;
    g.fill();

    // calçadão e praça em pedra portuguesa
    const stone = this.stone(g);
    rrect(g, PROM.x - 7, PROM.y - 7, PROM.w + 14, PROM.h + 14, 50);
    g.fillStyle = P.stoneEdge;
    g.fill();
    rrect(g, PROM.x, PROM.y, PROM.w, PROM.h, 44);
    g.fillStyle = stone;
    g.fill();

    circle(g, CX, CY, PLAZA_R + 8);
    g.fillStyle = P.stoneEdge;
    g.fill();
    circle(g, CX, CY, PLAZA_R);
    g.fillStyle = stone;
    g.fill();
    g.strokeStyle = rgba(P.stoneEdge, 0.9);
    g.lineWidth = 6;
    circle(g, CX, CY, 262);
    g.stroke();

    // nomes pintados no chão
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 30px ${FONT}`;
    g.fillStyle = rgba(INK, 0.3);
    for (const l of LABELS) {
      if (!game.inView(l.x, l.y, 160)) continue;
      g.save();
      g.translate(l.x, l.y);
      g.rotate(l.r);
      g.fillText(l.t, 0, 2);
      g.restore();
    }

    this.hedge(g);
  }

  private hedge(g: CanvasRenderingContext2D) {
    const game = this.game;
    const step = 56;
    for (const pass of [0, 1]) {
      g.fillStyle = pass === 0 ? P.hedge : P.hedgeLight;
      const r = pass === 0 ? 40 : 15;
      const off = pass === 0 ? 0 : -10;
      for (let x = 0; x <= W; x += step) {
        for (const y of [-8, H + 8]) {
          if (!game.inView(x, y, 50)) continue;
          circle(g, x + off, y + off, r);
          g.fill();
        }
      }
      for (let y = 0; y <= H; y += step) {
        for (const x of [-8, W + 8]) {
          if (!game.inView(x, y, 50)) continue;
          circle(g, x + off, y + off, r);
          g.fill();
        }
      }
    }
  }

  drawMid(g: CanvasRenderingContext2D) {
    const game = this.game;
    const time = game.time;

    for (const b of BENCHES) {
      if (!game.inView(b.x, b.y, 80)) continue;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.a);
      g.fillStyle = rgba(INK, 0.16);
      rrect(g, -52, -14, 112, 40, 8);
      g.fill();
      rrect(g, -56, -20, 112, 40, 8);
      g.fillStyle = P.wood;
      g.fill();
      g.fillStyle = P.woodDark;
      rrect(g, -56, -20, 112, 12, 6);
      g.fill();
      g.fillRect(-52, -1, 104, 3);
      g.fillRect(-52, 9, 104, 3);
      g.fillStyle = INK;
      g.fillRect(-48, -20, 5, 40);
      g.fillRect(43, -20, 5, 40);
      g.restore();
    }

    for (const [x, y] of LAMPS) {
      if (!game.inView(x, y, 60)) continue;
      g.strokeStyle = rgba(INK, 0.16);
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x + 3, y + 4);
      g.lineTo(x + 20, y + 16);
      g.stroke();
      g.strokeStyle = P.tealDark;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - 26);
      g.stroke();
      circle(g, x, y, 7);
      g.fillStyle = P.tealDark;
      g.fill();
      circle(g, x, y - 30, 12);
      g.fillStyle = game.night > 0.3 ? '#FFE9A8' : '#FFF7E0';
      g.fill();
      g.strokeStyle = P.tealDark;
      g.lineWidth = 3;
      g.stroke();
    }

    for (const t of this.trees) {
      if (!game.inView(t.x, t.y, t.s * 2)) continue;
      const sway = Math.sin(time * 0.9 + t.ph) * 1.6;
      // sombra
      g.fillStyle = rgba(INK, 0.15);
      g.beginPath();
      g.ellipse(t.x + 12, t.y + 16, t.s * 1.02, t.s * 0.86, 0, 0, TAU);
      g.fill();
      const base = t.kind === 0 ? P.leaf : t.kind === 1 ? P.ipeYDark : P.ipePDark;
      const top = t.kind === 0 ? P.leafLight : t.kind === 1 ? P.ipeY : P.ipeP;
      g.fillStyle = t.kind === 0 ? P.leafDark : base;
      for (let i = 0; i < t.lobes.length; i += 3) {
        circle(g, t.x + t.lobes[i] + sway, t.y + t.lobes[i + 1], t.lobes[i + 2]);
        g.fill();
      }
      g.fillStyle = t.kind === 0 ? base : top;
      circle(g, t.x + sway * 0.6, t.y, t.s * 0.78);
      g.fill();
      g.fillStyle = t.kind === 0 ? top : '#FFFFFF';
      g.globalAlpha = t.kind === 0 ? 0.7 : 0.38;
      for (let i = 0; i < t.dots.length; i += 3) {
        circle(g, t.x + t.dots[i] * 0.7 + sway * 0.6 - t.s * 0.12, t.y + t.dots[i + 1] * 0.7 - t.s * 0.14, t.dots[i + 2] * (t.kind ? 1 : 2.2));
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }

  lights(out: number[]) {
    for (const [x, y] of LAMPS) out.push(x, y - 20, 250, 0.9);
  }
}
