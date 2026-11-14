import { TAU } from './util';

/** Tipos de partícula. */
export enum K {
  Dot,
  Ring,
  Confetti,
  Heart,
  Note,
  Star,
  Puff,
}

export interface Pt {
  k: K;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Gravidade aplicada à altura z. */
  grav: number;
  life: number;
  max: number;
  size: number;
  /** Para anéis: raio final. */
  size2: number;
  color: string;
  rot: number;
  vr: number;
  /** 0 = no chão (abaixo dos objetos), 1 = no ar. */
  layer: 0 | 1;
  drag: number;
}

const MAX = 500;

export class Particles {
  list: Pt[] = [];

  add(p: Partial<Pt> & { x: number; y: number }) {
    if (this.list.length >= MAX) this.list.shift();
    const life = p.life ?? 0.6;
    this.list.push({
      k: K.Dot,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      grav: 0,
      size: 3,
      size2: 0,
      color: '#fff',
      rot: 0,
      vr: 0,
      layer: 1,
      drag: 0,
      ...p,
      life,
      max: life,
    });
  }

  ring(x: number, y: number, color: string, r0: number, r1: number, life = 0.6, layer: 0 | 1 = 0) {
    this.add({ k: K.Ring, x, y, color, size: r0, size2: r1, life, layer });
  }

  /** Espalha n partículas a partir de um ponto. */
  burst(k: K, x: number, y: number, n: number, colors: readonly string[], o: { speed?: number; up?: number; size?: number; life?: number; grav?: number } = {}) {
    const speed = o.speed ?? 140;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.add({
        k,
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.7,
        vz: (o.up ?? 200) * (0.5 + Math.random() * 0.6),
        grav: o.grav ?? 520,
        size: (o.size ?? 4) * (0.7 + Math.random() * 0.6),
        color: colors[i % colors.length],
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 12,
        life: (o.life ?? 0.9) * (0.7 + Math.random() * 0.5),
        drag: 1.2,
      });
    }
  }

  update(dt: number) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        l.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= p.grav * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz = 0;
        p.vx *= 0.4;
        p.vy *= 0.4;
      }
      if (p.drag) {
        const f = Math.exp(-p.drag * dt);
        p.vx *= f;
        p.vy *= f;
      }
      p.rot += p.vr * dt;
    }
  }

  draw(g: CanvasRenderingContext2D, layer: 0 | 1) {
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      const t = p.life / p.max; // 1 → 0
      const y = p.y - p.z;
      switch (p.k) {
        case K.Dot:
          g.globalAlpha = Math.min(1, t * 3);
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(p.x, y, p.size, 0, TAU);
          g.fill();
          break;
        case K.Ring: {
          const r = p.size + (p.size2 - p.size) * (1 - t * t);
          g.globalAlpha = t * 0.8;
          g.strokeStyle = p.color;
          g.lineWidth = 2 + 2 * t;
          g.beginPath();
          g.arc(p.x, y, r, 0, TAU);
          g.stroke();
          break;
        }
        case K.Confetti:
          g.globalAlpha = Math.min(1, t * 3);
          g.fillStyle = p.color;
          g.save();
          g.translate(p.x, y);
          g.rotate(p.rot);
          g.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
          g.restore();
          break;
        case K.Heart: {
          const s = p.size * (0.6 + 0.4 * Math.min(1, (1 - t) * 4));
          g.globalAlpha = Math.min(1, t * 2.5);
          g.fillStyle = p.color;
          heart(g, p.x, y, s);
          break;
        }
        case K.Note:
          g.globalAlpha = Math.min(1, t * 2.5);
          g.fillStyle = p.color;
          note(g, p.x, y, p.size);
          break;
        case K.Star:
          g.globalAlpha = Math.min(1, t * 2);
          g.fillStyle = p.color;
          star(g, p.x, y, p.size * (0.5 + t * 0.5), p.rot);
          break;
        case K.Puff:
          g.globalAlpha = t * 0.5;
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(p.x, y, p.size * (1.6 - t), 0, TAU);
          g.fill();
          break;
      }
    }
    g.globalAlpha = 1;
  }
}

export function heart(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
  g.fill();
}

export function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * TAU) / 10;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
}

export function note(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.ellipse(x - s * 0.35, y + s * 0.55, s * 0.5, s * 0.36, -0.4, 0, TAU);
  g.fill();
  g.fillRect(x + s * 0.02, y - s * 0.9, s * 0.18, s * 1.5);
  g.beginPath();
  g.moveTo(x + s * 0.02, y - s * 0.9);
  g.quadraticCurveTo(x + s * 0.9, y - s * 0.7, x + s * 0.75, y - s * 0.05);
  g.quadraticCurveTo(x + s * 0.6, y - s * 0.5, x + s * 0.2, y - s * 0.5);
  g.closePath();
  g.fill();
}
