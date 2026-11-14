import { rid } from '../util';
import type { Msg } from './protocol';

export type Status = 'connecting' | 'online' | 'local' | 'reconnecting';

/**
 * Canal que leva mensagens deste visitante para os outros.
 * Há dois: `local` (abas do mesmo navegador, sem servidor) e `ws` (servidor de tempo real).
 */
export interface Transport {
  readonly kind: 'local' | 'ws';
  id: string;
  onmsg: (from: string, m: unknown) => void;
  onsnap: (snap: Record<string, number>) => void;
  onstatus: (s: Status) => void;
  connect(): Promise<void>;
  send(m: Msg): void;
  close(): void;
}

const noop = () => {};

/** Liga as abas do mesmo navegador por BroadcastChannel. Não precisa de servidor. */
export class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  // o id começa pela hora de chegada: ordenar os ids é ordenar por antiguidade
  id = Date.now().toString(36) + rid(2);
  onmsg: Transport['onmsg'] = noop;
  onsnap: Transport['onsnap'] = noop;
  onstatus: Transport['onstatus'] = noop;
  private ch: BroadcastChannel | null = null;

  constructor(private room: string) {}

  async connect() {
    try {
      this.ch = new BroadcastChannel('pracinha:' + this.room);
      this.ch.onmessage = (e: MessageEvent) => {
        const d = e.data as { f?: unknown; m?: unknown } | null;
        if (d && typeof d.f === 'string' && d.f !== this.id) this.onmsg(d.f, d.m);
      };
    } catch {
      this.ch = null;
    }
    this.onstatus('local');
    this.send({ t: 'h' });
    addEventListener('pagehide', () => this.send({ t: 'bye' }));
  }

  send(m: Msg) {
    try {
      this.ch?.postMessage({ f: this.id, m });
    } catch {
      /* canal fechado */
    }
  }

  close() {
    this.send({ t: 'bye' });
    this.ch?.close();
    this.ch = null;
  }
}

/** Liga ao servidor de tempo real (server/relay.mjs). Reconecta sozinho se cair. */
export class WsTransport implements Transport {
  readonly kind = 'ws' as const;
  id = '';
  onmsg: Transport['onmsg'] = noop;
  onsnap: Transport['onsnap'] = noop;
  onstatus: Transport['onstatus'] = noop;
  private ws: WebSocket | null = null;
  private retry = 0;
  private closed = false;
  private everOpen = false;

  constructor(
    private url: string,
    private room: string,
  ) {}

  connect(): Promise<void> {
    this.onstatus('connecting');
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tempo esgotado')), 6000);
      this.open(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  private open(resolve?: () => void, reject?: (e: Error) => void) {
    let ws: WebSocket;
    try {
      const u = new URL(this.url);
      u.searchParams.set('room', this.room);
      ws = new WebSocket(u.toString());
    } catch (e) {
      reject?.(e as Error);
      return;
    }
    this.ws = ws;
    ws.onmessage = (e: MessageEvent) => {
      let d: unknown;
      try {
        d = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (Array.isArray(d)) {
        for (const it of d) {
          if (Array.isArray(it) && typeof it[0] === 'string') this.onmsg(it[0], it[1]);
        }
        return;
      }
      const hi = d as { t?: unknown; id?: unknown; snap?: unknown } | null;
      if (hi && hi.t === 'hi' && typeof hi.id === 'string') {
        this.id = hi.id;
        this.retry = 0;
        this.everOpen = true;
        this.onstatus('online');
        const snap: Record<string, number> = {};
        if (hi.snap && typeof hi.snap === 'object') {
          for (const [k, v] of Object.entries(hi.snap as Record<string, unknown>)) {
            if (typeof v === 'number' && Number.isInteger(v) && v >= 0) snap[k] = v;
          }
        }
        this.onsnap(snap);
        resolve?.();
        resolve = undefined;
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      if (!this.everOpen) {
        reject?.(new Error('conexão recusada'));
        reject = undefined;
        return;
      }
      this.onstatus('reconnecting');
      const wait = Math.min(15000, 1000 * 2 ** this.retry++);
      setTimeout(() => {
        if (!this.closed) this.open();
      }, wait);
    };
    ws.onerror = noop;
  }

  send(m: Msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}
