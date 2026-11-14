import type { Ev } from './net/protocol';

export type { Ev };

/** Um visitante da praça: você, outra pessoa ou um visitante simulado. */
export interface Actor {
  id: string;
  kind: 'me' | 'peer' | 'bot';
  /** true quando a posição é calculada aqui (você, ou os simulados quando este cliente é o anfitrião). */
  sim: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  speed: number;
  color: number;
  flags: number;
  /** Altura acima do chão, só para desenho (gangorra, balanço). */
  z: number;
  /** Fitinha: pares x,y. */
  trail: Float32Array;
  trailInit: boolean;
  emote: number;
  emoteT: number;
  wet: number;
  /** Última fala no chat e quando foi dita. */
  say: string;
  sayT: number;
  seen: number;
  /** Amostras de rede: trios t,x,y. */
  buf: number[];
  born: number;
}

export const TRAIL_N = 10;

/** Está com saquinho de pipoca. */
export const F_POP = 1;
/** Bits 1-2: em qual balanço está sentado (0 = nenhum). */
export const F_SWING = 6;
/** Aba em segundo plano: não pode ser anfitrião. */
export const F_HIDDEN = 8;
/** Jogando no fliperama. */
export const F_BUSY = 16;
/** Com um cafezinho na mão. */
export const F_COFFEE = 32;

/** Uma atração da praça. */
export interface Activity {
  update(dt: number): void;
  /** Camada do chão. */
  drawGround?(g: CanvasRenderingContext2D): void;
  /** Objetos em pé, abaixo dos ponteiros. */
  drawMid?(g: CanvasRenderingContext2D): void;
  /** Acima dos ponteiros. */
  drawTop?(g: CanvasRenderingContext2D): void;
  /** Clique do visitante local. Devolve true se a atração usou o clique. */
  click?(): boolean;
  event?(a: Actor | null, ev: Ev): void;
  /** Pontos de luz à noite: lista de [x, y, raio, força]. */
  lights?(out: number[]): void;
}
