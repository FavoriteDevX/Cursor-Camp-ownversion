import { drawEmote, drawPointer, drawSay, makeActor, updateTrail } from './actors';
import { Album, type Fig, type Save } from './album';
import { Sfx } from './audio';
import { Bots } from './bots';
import { COLORS, CX, CY, H, W } from './config';
import { Input, type InputMode } from './input';
import { cleanChat, ID_RE, sanitize } from './net/protocol';
import { LocalTransport, WsTransport, type Status, type Transport } from './net/transport';
import { K, Particles } from './particles';
import { SharedStore } from './store';
import { F_HIDDEN, type Activity, type Actor, type Ev } from './types';
import { clamp, dist, rnd, TAU } from './util';
import { Arcade } from './world/arcade';
import { Coreto } from './world/coreto';
import { Cowork } from './world/cowork';
import { Fountain } from './world/fountain';
import { Flowerbed, TilePanel } from './world/garden';
import { Pigeons } from './world/pigeons';
import { Pitch } from './world/pitch';
import { Hopscotch, Seesaw, Swings } from './world/playground';
import { Popcorn } from './world/popcorn';
import { Scenery } from './world/scenery';
import { Secrets } from './world/secrets';

/** O que o jogo avisa para a interface. */
export interface Hooks {
  count(real: number, sim: number): void;
  status(s: Status, kind: 'local' | 'ws'): void;
  award(f: Fig): void;
  /** O navegador soltou o mouse (Esc). */
  unlock(): void;
  /** O navegador recusou segurar o mouse. */
  lockFail(): void;
  arcade(on: boolean): void;
  chat(color: number, text: string, mine: boolean): void;
}

/** Até que distância se "ouve" o chat. */
const HEARING = 950;

export class Game {
  readonly g: CanvasRenderingContext2D;
  vw = 0;
  vh = 0;
  zoom = 1;
  private dpr = 1;
  /** Canto superior esquerdo da câmera, em unidades de mundo. */
  cam = { x: CX - 600, y: CY - 400 };
  time = 0;
  private lastT = 0;

  me: Actor;
  /** Todos menos você: outras pessoas e visitantes simulados. */
  actors = new Map<string, Actor>();
  /** Quem está na praça neste quadro (inclui você, depois de entrar). */
  list: Actor[] = [];
  joined = false;
  paused = true;
  /** Uma atração está segurando o ponteiro (balanço, fliperama). */
  held = false;

  /** Este cliente é quem simula o que precisa de uma única fonte (bola, visitantes simulados). */
  isHost = true;
  /** Anfitrião que já entrou: pode decidir e transmitir. */
  authority = false;
  private hostId = '';

  night = 0;
  hourOverride: number | null = null;
  /** Deslocamento do ponteiro neste quadro, em unidades de mundo e em px de tela. */
  mdx = 0;
  mdy = 0;
  rdx = 0;
  rdy = 0;
  keys = new Set<string>();
  keysHit = new Set<string>();
  /** Pipoca caída no chão. */
  kernels: { x: number; y: number; t: number }[] = [];
  chatOn = true;

  readonly input: Input;
  readonly sfx = new Sfx();
  readonly fx = new Particles();
  readonly store: SharedStore;
  readonly album: Album;
  net: Transport = new LocalTransport('-');
  readonly bots: Bots;
  readonly scenery: Scenery;
  readonly pitch: Pitch;
  readonly arcade: Arcade;
  private acts: Activity[];

  private sent = { x: -1, y: -1, f: -1, c: -1, t: 0 };
  private lastPing = -10;
  private lastEmote = -10;
  private lastSay = -10;
  private countT = 0;
  private birdT = 4;
  private nightCanvas = document.createElement('canvas');
  private lights: number[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    save: Save,
    private hooks: Hooks,
  ) {
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('This browser cannot draw on a 2D canvas.');
    this.g = g;
    this.chatOn = save.chat;
    this.sfx.muted = save.muted;
    this.me = makeActor('eu', 'me', save.color, CX, CY + 300, 0);
    this.store = new SharedStore((m) => this.net.send(m));
    this.album = new Album(save);
    this.album.onAward = (f) => {
      this.sfx.jingle();
      this.fx.burst(K.Star, this.me.x + 8, this.me.y, 12, ['#F2C230', '#FFFDF6', COLORS[this.me.color]], { speed: 170, up: 260, size: 6, life: 1 });
      this.hooks.award(f);
    };

    this.scenery = new Scenery(this);
    this.pitch = new Pitch(this);
    this.arcade = new Arcade(this);
    // a ordem decide quem recebe o clique primeiro
    this.acts = [
      this.arcade,
      new Swings(this),
      new Cowork(this),
      new TilePanel(this),
      new Flowerbed(this),
      new Fountain(this),
      new Coreto(this),
      new Seesaw(this),
      new Hopscotch(this),
      this.pitch,
      new Popcorn(this),
      new Pigeons(this),
      new Secrets(this, this.scenery),
    ];
    this.bots = new Bots(this);

    this.input = new Input(canvas);
    this.input.onUnlock = () => {
      if (this.paused) return;
      this.arcade.exit();
      this.paused = true;
      this.input.active = false;
      this.hooks.unlock();
    };
    this.input.onLockFail = () => {
      if (this.input.mode !== 'lock' || this.input.locked) return;
      if (this.input.everLocked) {
        // o navegador exige um intervalo depois do Esc: volta ao menu para a pessoa clicar de novo
        if (this.paused) return;
        this.paused = true;
        this.input.active = false;
        this.hooks.unlock();
      } else {
        this.input.mode = 'free';
        this.hooks.lockFail();
      }
    };

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.keysHit.add(k);
      this.keys.add(k);
      if (!this.joined || this.paused) return;
      if (k.length === 1 && k >= '1' && k <= '5') this.emote(+k - 1);
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('resize', () => this.resize());
    this.resize();

    setInterval(() => this.netTick(), 66);
  }

  // ------------------------------------------------------------------ rede

  /** Liga ao servidor de tempo real, se houver um. Sem servidor (ou se ele não responder), usa o modo local. */
  async connect(url: string, room: string) {
    if (url) {
      const ws = new WsTransport(url, room);
      this.bind(ws);
      try {
        await ws.connect();
        return;
      } catch {
        ws.close();
      }
    }
    const local = new LocalTransport(room);
    this.bind(local);
    this.me.id = local.id;
    await local.connect();
  }

  private bind(t: Transport) {
    this.net = t;
    t.onmsg = (from, m) => this.onMsg(from, m);
    t.onsnap = (s) => this.store.load(s);
    t.onstatus = (s) => {
      if (t !== this.net) return;
      if (t.id) this.me.id = t.id;
      // ao cair ou voltar, a lista de quem está na praça recomeça
      if (s !== 'local') for (const [id, a] of this.actors) if (!a.sim) this.actors.delete(id);
      this.sent.t = 0;
      this.hooks.status(s, t.kind);
    };
  }

  private onMsg(from: string, raw: unknown) {
    if (!ID_RE.test(from) || from === this.me.id) return;
    const m = sanitize(raw, this.net.kind === 'local');
    if (!m) return;
    switch (m.t) {
      case 's': {
        let a = this.actors.get(from);
        if (!a) {
          if (this.actors.size > 150) return;
          a = makeActor(from, 'peer', m.c, m.x, m.y, this.time);
          this.actors.set(from, a);
        }
        a.color = m.c;
        a.flags = m.f;
        a.seen = this.time;
        a.buf.push(this.time, m.x, m.y);
        if (a.buf.length > 36) a.buf.splice(0, 3);
        break;
      }
      case 'e':
        this.handleEvent(this.actors.get(m.a ?? from) ?? null, m);
        break;
      case 'c': {
        if (!this.chatOn) break;
        const a = this.actors.get(from);
        if (!a || a.kind !== 'peer' || this.time - a.sayT < 0.8) break;
        const ox = this.joined ? this.me.x : this.cam.x + this.vw / this.zoom / 2;
        const oy = this.joined ? this.me.y : this.cam.y + this.vh / this.zoom / 2;
        if (dist(a.x, a.y, ox, oy) > HEARING) break;
        a.say = m.m;
        a.sayT = this.time;
        this.sfx.chat(a.x, a.y);
        this.hooks.chat(a.color, m.m, false);
        break;
      }
      case 'k':
        this.store.apply(m.k, m.o, m.v, 'remote');
        break;
      case 'b':
        if (from === this.hostId && !this.isHost) this.pitch.remote(m);
        break;
      case 'bs':
        if (this.bots.active) break;
        for (const [i, x, y, c, f] of m.l) {
          const id = 'bot-' + i;
          let a = this.actors.get(id);
          if (!a) {
            a = makeActor(id, 'bot', c, x, y, this.time);
            a.sim = false;
            this.actors.set(id, a);
          }
          a.color = c;
          a.flags = f;
          a.seen = this.time;
          a.buf.push(this.time, x, y);
          if (a.buf.length > 36) a.buf.splice(0, 3);
        }
        break;
      case 'h':
        // alguém abriu outra aba: conta quem está aqui e, se for o anfitrião, manda o estado da praça
        if (this.joined) {
          this.sent.t = 0;
          this.netTick();
          if (this.isHost) this.net.send({ t: 'snap', to: from, s: this.store.snapshot() });
        }
        break;
      case 'snap':
        if (m.to === this.me.id) this.store.load(m.s);
        break;
      case 'bye': {
        const a = this.actors.get(from);
        if (a) {
          this.fx.add({ k: K.Puff, x: a.x + 6, y: a.y + 8, size: 12, color: '#FFFFFF', life: 0.4 });
          this.actors.delete(from);
        }
        break;
      }
    }
  }

  /** Manda a posição 15 vezes por segundo, e só quando algo mudou (ou a cada segundo, para avisar que continua aqui). */
  private netTick() {
    if (!this.joined) return;
    const me = this.me;
    const s = this.sent;
    const x = Math.round(me.x);
    const y = Math.round(me.y);
    const f = (me.flags & ~F_HIDDEN) | (document.hidden ? F_HIDDEN : 0);
    const now = performance.now();
    if (x === s.x && y === s.y && f === s.f && me.color === s.c && now - s.t < 1000) return;
    this.net.send({ t: 's', x, y, c: me.color, f });
    s.x = x;
    s.y = y;
    s.f = f;
    s.c = me.color;
    s.t = now;
  }

  /**
   * Escolhe o anfitrião: o menor id entre quem está com a aba visível. Todos chegam à mesma resposta.
   * Os ids saem em ordem de chegada, então o anfitrião é quem está na praça há mais tempo.
   */
  private elect() {
    let min = '';
    for (const a of this.actors.values()) {
      if (a.kind !== 'peer' || a.flags & F_HIDDEN) continue;
      if (!min || a.id < min) min = a.id;
    }
    if (this.joined) {
      this.isHost = !min || this.me.id <= min;
      this.hostId = this.isHost ? this.me.id : min;
    } else {
      this.isHost = !min;
      this.hostId = min;
    }
    this.authority = this.joined && this.isHost;
  }

  // ------------------------------------------------------------------ ações

  /** Entra na praça (ou volta do menu). Tem de ser chamado dentro de um clique. */
  join(color: number, mode: InputMode) {
    const me = this.me;
    me.color = color;
    this.input.mode = mode;
    if (!this.joined) {
      this.joined = true;
      const a = rnd(TAU);
      me.x = me.px = CX + Math.cos(a) * rnd(250, 340);
      me.y = me.py = CY + Math.sin(a) * rnd(250, 340);
      me.born = this.time;
      me.trailInit = false;
      this.cam.x = me.x - this.vw / this.zoom / 2;
      this.cam.y = me.y - this.vh / this.zoom / 2;
      this.fx.ring(me.x + 6, me.y + 10, COLORS[color], 10, 90, 0.9, 1);
    }
    this.resume();
    this.album.award('chegou');
  }

  resume() {
    this.paused = false;
    this.input.active = true;
    this.input.consume();
    this.input.consumeClicks();
    this.sfx.init();
    if (this.input.mode === 'lock') {
      this.input.lock();
      // se o navegador ignorar o pedido sem avisar, a pessoa não pode ficar parada
      setTimeout(() => {
        if (!this.paused) this.input.onLockFail();
      }, 800);
    }
  }

  pause() {
    this.arcade.exit();
    this.paused = true;
    this.input.active = false;
    this.input.unlock();
  }

  /** Dispara um evento: vale aqui na hora e segue para os outros. */
  emit(ev: Ev) {
    this.handleEvent(this.me, ev);
    if (this.joined) this.net.send({ t: 'e', ...ev });
  }

  handleEvent(a: Actor | null, ev: Ev) {
    if (ev.k === 'ping') {
      if (ev.x === undefined || ev.y === undefined) return;
      this.fx.ring(ev.x, ev.y, a ? COLORS[a.color] : '#FFFFFF', 6, 56, 0.7, 1);
      this.sfx.ping(ev.x, ev.y);
    } else if (ev.k === 'emo') {
      if (!a || ev.n === undefined) return;
      a.emote = ev.n;
      a.emoteT = this.time;
      this.sfx.emote(a.x, a.y);
    } else {
      for (const act of this.acts) act.event?.(a, ev);
    }
  }

  private click() {
    for (const act of this.acts) if (act.click?.()) return;
    if (this.time - this.lastPing < 0.22) return;
    this.lastPing = this.time;
    this.emit({ k: 'ping', x: Math.round(this.me.x + 6), y: Math.round(this.me.y + 10) });
  }

  emote(n: number) {
    if (!this.joined || this.time - this.lastEmote < 0.4) return;
    this.lastEmote = this.time;
    this.emit({ k: 'emo', n });
  }

  /** Fala no chat. 'wait' = cedo demais depois da última fala; 'empty' = não sobrou nada para dizer. */
  say(raw: string): 'ok' | 'wait' | 'empty' {
    if (!this.joined || !this.chatOn) return 'empty';
    const text = cleanChat(raw);
    if (!text) return 'empty';
    if (this.time - this.lastSay < 1.2) return 'wait';
    this.lastSay = this.time;
    this.me.say = text;
    this.me.sayT = this.time;
    this.net.send({ t: 'c', m: text });
    this.hooks.chat(this.me.color, text, true);
    this.album.award('papo');
    return 'ok';
  }

  onArcade(on: boolean) {
    this.hooks.arcade(on);
  }

  /** Para testes: leva o visitante a um ponto do mapa. */
  tp(x: number, y: number) {
    this.me.x = this.me.px = x;
    this.me.y = this.me.py = y;
    this.me.trailInit = false;
    this.cam.x = x - this.input.sx / this.zoom;
    this.cam.y = y - this.input.sy / this.zoom;
    this.clampCam();
  }

  // ------------------------------------------------------------------ quadro

  start() {
    this.lastT = performance.now();
    const loop = (now: number) => {
      const dt = clamp((now - this.lastT) / 1000, 0.001, 0.05);
      this.lastT = now;
      this.time += dt;
      this.update(dt);
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.vw = innerWidth;
    this.vh = innerHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.zoom = clamp(Math.sqrt(this.vw * this.vh) / 1150, 0.6, 1.6);
    this.clampCam();
  }

  inView(x: number, y: number, r: number): boolean {
    return x + r > this.cam.x && x - r < this.cam.x + this.vw / this.zoom && y + r > this.cam.y && y - r < this.cam.y + this.vh / this.zoom;
  }

  private clampCam() {
    const vw = this.vw / this.zoom;
    const vh = this.vh / this.zoom;
    const m = 60;
    this.cam.x = vw >= W + m * 2 ? (W - vw) / 2 : clamp(this.cam.x, -m, W + m - vw);
    this.cam.y = vh >= H + m * 2 ? (H - vh) / 2 : clamp(this.cam.y, -m, H + m - vh);
  }

  private update(dt: number) {
    const me = this.me;
    const time = this.time;
    const live = this.joined && !this.paused;

    const [dx, dy] = this.input.consume();
    this.rdx = live ? dx : 0;
    this.rdy = live ? dy : 0;
    this.mdx = this.rdx / this.zoom;
    this.mdy = this.rdy / this.zoom;

    const vw = this.vw / this.zoom;
    const vh = this.vh / this.zoom;
    if (!this.joined) {
      // antes de entrar, a câmera passeia devagar pela praça
      const k = 1 - Math.exp(-dt * 0.8);
      this.cam.x += (CX + Math.cos(time * 0.05) * 700 - vw / 2 - this.cam.x) * k;
      this.cam.y += (CY + Math.sin(time * 0.08) * 380 - vh / 2 - this.cam.y) * k;
      this.clampCam();
    } else if (this.input.mode === 'free') {
      // mouse solto: a câmera anda quando o ponteiro encosta na borda
      if (live) {
        const m = 110;
        const sp = 1150 * dt;
        const { sx, sy } = this.input;
        if (sx < m) this.cam.x -= sp * (1 - sx / m);
        else if (sx > this.vw - m) this.cam.x += sp * (1 - (this.vw - sx) / m);
        if (sy < m) this.cam.y -= sp * (1 - sy / m);
        else if (sy > this.vh - m) this.cam.y += sp * (1 - (this.vh - sy) / m);
        this.clampCam();
        if (!this.held) {
          me.x = this.cam.x + this.input.sx / this.zoom;
          me.y = this.cam.y + this.input.sy / this.zoom;
        }
      }
    } else if (live && !this.held) {
      me.x += this.mdx;
      me.y += this.mdy;
    }
    me.x = clamp(me.x, 14, W - 14);
    me.y = clamp(me.y, 14, H - 14);

    // os outros: posição suavizada entre as amostras da rede, com um pequeno atraso
    const rt = time - 0.12;
    for (const [id, a] of this.actors) {
      if (a.sim) continue;
      if (time - a.seen > (a.kind === 'bot' ? 3 : 6)) {
        this.actors.delete(id);
        continue;
      }
      const b = a.buf;
      while (b.length >= 6 && b[3] <= rt) b.splice(0, 3);
      if (b.length >= 6 && b[0] <= rt) {
        const u = clamp((rt - b[0]) / (b[3] - b[0] || 1), 0, 1);
        a.x = b[1] + (b[4] - b[1]) * u;
        a.y = b[2] + (b[5] - b[2]) * u;
      } else if (b.length >= 3) {
        const k = Math.min(1, dt * 12);
        a.x += (b[b.length - 2] - a.x) * k;
        a.y += (b[b.length - 1] - a.y) * k;
      }
    }

    this.elect();
    this.bots.update(dt);

    this.list.length = 0;
    if (this.joined) this.list.push(me);
    for (const a of this.actors.values()) this.list.push(a);

    for (const a of this.list) {
      a.vx += ((a.x - a.px) / dt - a.vx) * 0.5;
      a.vy += ((a.y - a.py) / dt - a.vy) * 0.5;
      a.speed = Math.hypot(a.vx, a.vy);
      a.px = a.x;
      a.py = a.y;
      a.z = 0;
      if (a.wet > 0) {
        a.wet -= dt;
        if (Math.random() < dt * 7) this.fx.add({ k: K.Dot, x: a.x + rnd(0, 14), y: a.y + rnd(8, 22), vz: 20, grav: 300, size: 2.2, color: '#A9E2EA', life: 0.5 });
      }
    }

    let clicks = this.input.consumeClicks();
    if (!live) clicks = 0;
    while (clicks-- > 0) this.click();

    for (const act of this.acts) act.update(dt);
    me.x = clamp(me.x, 14, W - 14);
    me.y = clamp(me.y, 14, H - 14);

    for (const a of this.list) updateTrail(a, dt, time);

    if (this.joined && this.input.mode !== 'free') {
      const k = 1 - Math.exp(-dt * 7);
      this.cam.x += (me.x - vw / 2 - this.cam.x) * k;
      this.cam.y += (me.y - vh / 2 - this.cam.y) * k;
      this.clampCam();
    }

    this.fx.update(dt);
    this.sfx.lx = this.joined ? me.x : this.cam.x + vw / 2;
    this.sfx.ly = this.joined ? me.y : this.cam.y + vh / 2;

    // noite conforme o relógio de quem visita
    const d = new Date();
    const h = this.hourOverride ?? d.getHours() + d.getMinutes() / 60;
    this.night = h >= 19 || h < 5 ? 1 : h >= 17.5 ? (h - 17.5) / 1.5 : h < 6.5 ? 1 - (h - 5) / 1.5 : 0;

    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = rnd(3, 9);
      if (this.joined) {
        if (this.night > 0.6) this.sfx.cricket();
        else this.sfx.chirp();
      }
    }

    this.countT -= dt;
    if (this.countT <= 0) {
      this.countT = 0.5;
      let real = this.joined ? 1 : 0;
      let sim = 0;
      for (const a of this.actors.values()) {
        if (a.kind === 'bot') sim++;
        else real++;
      }
      this.hooks.count(real, sim);
    }

    this.keysHit.clear();
  }

  private draw() {
    const g = this.g;
    const s = this.dpr * this.zoom;
    const time = this.time;
    g.setTransform(s, 0, 0, s, -this.cam.x * s, -this.cam.y * s);
    g.globalAlpha = 1;

    this.scenery.drawGround(g);
    for (const a of this.acts) a.drawGround?.(g);
    this.fx.draw(g, 0);
    this.scenery.drawMid(g);
    for (const a of this.acts) a.drawMid?.(g);
    this.fx.draw(g, 1);

    // ponteiros: os de baixo por cima, e o seu sempre por último
    const me = this.me;
    const others = this.list.filter((a) => a !== me).sort((a, b) => a.y - b.y);
    for (const a of others) if (this.inView(a.x, a.y, 90)) drawPointer(g, a, time, false);
    if (this.joined) drawPointer(g, me, time, true);

    for (const a of this.acts) a.drawTop?.(g);

    for (const a of this.list) {
      if (!this.inView(a.x, a.y, 260)) continue;
      drawEmote(g, a, time);
      drawSay(g, a, time);
    }

    this.drawNight(g, s);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.arcade.drawOverlay(g, this.vw, this.vh);
  }

  /** Escurece a praça à noite e abre clarões em volta de postes, telas e ponteiros. */
  private drawNight(g: CanvasRenderingContext2D, s: number) {
    const n = this.night;
    if (n <= 0.01) return;
    const c = this.nightCanvas;
    const q = 0.5;
    const w = Math.ceil(this.vw * q);
    const h = Math.ceil(this.vh * q);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ng = c.getContext('2d');
    if (!ng) return;
    ng.setTransform(1, 0, 0, 1, 0, 0);
    ng.globalCompositeOperation = 'source-over';
    ng.clearRect(0, 0, w, h);
    ng.fillStyle = `rgba(16,20,58,${0.68 * n})`;
    ng.fillRect(0, 0, w, h);
    ng.globalCompositeOperation = 'destination-out';
    const k = q * this.zoom;
    ng.setTransform(k, 0, 0, k, -this.cam.x * k, -this.cam.y * k);

    const L = this.lights;
    L.length = 0;
    this.scenery.lights(L);
    for (const a of this.acts) a.lights?.(L);
    const fixed = L.length;
    for (const a of this.list) L.push(a.x + 6, a.y - a.z + 10, 76, 0.55);
    for (let i = 0; i < L.length; i += 4) {
      const x = L[i];
      const y = L[i + 1];
      const r = L[i + 2];
      if (!this.inView(x, y, r)) continue;
      const grad = ng.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(0,0,0,${L[i + 3]})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ng.fillStyle = grad;
      ng.beginPath();
      ng.arc(x, y, r, 0, TAU);
      ng.fill();
    }

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.drawImage(c, 0, 0, this.vw, this.vh);

    // luz quente dos postes
    g.setTransform(s, 0, 0, s, -this.cam.x * s, -this.cam.y * s);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fixed; i += 4) {
      const x = L[i];
      const y = L[i + 1];
      const r = L[i + 2] * 0.7;
      if (r < 60 || !this.inView(x, y, r)) continue;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,196,110,${0.2 * n})`);
      grad.addColorStop(1, 'rgba(255,196,110,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
}

