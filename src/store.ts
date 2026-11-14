import { applyOp, KEY_RE, validOp, type Msg, type Op } from './net/protocol';

export type Origin = 'local' | 'remote' | 'snap';
type Listener = (key: string, val: number, prev: number, origin: Origin) => void;

/**
 * Estado compartilhado da praça: azulejos pintados, flores, moedas, placar, commits, recordes.
 * São só números inteiros, guardados por chave. Quem muda avisa os outros.
 */
export class SharedStore {
  private data = new Map<string, number>();
  private listeners: Listener[] = [];

  constructor(private send: (m: Msg) => void) {}

  get(k: string): number {
    return this.data.get(k) ?? 0;
  }

  on(fn: Listener) {
    this.listeners.push(fn);
  }

  /** Aplica uma operação. As inválidas são ignoradas. */
  apply(k: string, o: Op, v: number, origin: Origin) {
    if (!validOp(k, o, v)) return;
    const prev = this.get(k);
    const next = applyOp(prev, o, v);
    if (next === prev) return;
    this.data.set(k, next);
    for (const fn of this.listeners) fn(k, next, prev, origin);
  }

  private op(k: string, o: Op, v: number) {
    if (!validOp(k, o, v)) return;
    this.apply(k, o, v, 'local');
    this.send({ t: 'k', k, o, v });
  }

  set(k: string, v: number) {
    this.op(k, 's', v);
  }

  inc(k: string) {
    this.op(k, 'i', 1);
  }

  /** Guarda o valor só se for maior que o atual (recordes). */
  max(k: string, v: number) {
    this.op(k, 'm', v);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.data);
  }

  /** Carrega o estado de quem já estava na praça. */
  load(snap: Record<string, number>) {
    for (const [k, v] of Object.entries(snap)) {
      if (!KEY_RE.test(k) || !Number.isInteger(v) || v < 0) continue;
      const prev = this.get(k);
      if (prev === v) continue;
      this.data.set(k, v);
      for (const fn of this.listeners) fn(k, v, prev, 'snap');
    }
  }
}
