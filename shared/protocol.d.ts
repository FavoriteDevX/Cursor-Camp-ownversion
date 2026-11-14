export declare const W: number;
export declare const H: number;
export declare const ID_RE: RegExp;
export declare const KEY_RE: RegExp;
export declare const TILE_COUNT: number;
export declare const FLOWER_SLOTS: number;
export declare const LAPTOPS: number;
export declare const CHAT_MAX: number;
export declare const FLAG_MAX: number;

/** Evento pontual (clique, expressão, moeda, gol, commit, deploy, risco na lousa). */
export interface Ev {
  k: 'ping' | 'emo' | 'coin' | 'goal' | 'commit' | 'deploy' | 'draw';
  x?: number;
  y?: number;
  tx?: number;
  ty?: number;
  n?: number;
  s?: number;
  sa?: number;
  sb?: number;
  by?: string;
}

export type Op = 's' | 'i' | 'm';

/** Mensagens trocadas entre visitantes. */
export type Msg =
  | { t: 's'; x: number; y: number; c: number; f: number }
  | ({ t: 'e'; a?: string } & Ev)
  | { t: 'c'; m: string }
  | { t: 'k'; k: string; o: Op; v: number }
  | { t: 'b'; x: number; y: number; vx: number; vy: number; sa: number; sb: number; r: number }
  | { t: 'bs'; l: number[][] }
  | { t: 'h' }
  | { t: 'snap'; to: string; s: Record<string, number> }
  | { t: 'bye' };

export declare function validOp(k: unknown, o: unknown, v: unknown): boolean;
export declare function applyOp(prev: number, o: Op, v: number): number;
export declare function cleanChat(raw: unknown): string | null;
export declare function sanitize(raw: unknown, local: boolean): Msg | null;
