import { clamp } from './util';

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  x?: number;
  y?: number;
  /** Frequência final (desliza até ela). */
  to?: number;
  attack?: number;
  delay?: number;
}

interface NoiseOpts {
  vol?: number;
  x?: number;
  y?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  delay?: number;
}

/**
 * Todos os sons são sintetizados na hora com WebAudio: não há arquivo de áudio.
 * Sons com posição (x, y) ficam mais baixos conforme a distância do visitante.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private last: Record<string, number> = {};
  muted = false;
  /** Posição de quem ouve. */
  lx = 0;
  ly = 0;

  /** Precisa ser chamado dentro de um gesto do usuário (clique/toque). */
  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.04);
  }

  /** Volume e panorâmica conforme a posição. null = longe demais para ouvir. */
  private at(x?: number, y?: number): [number, number] | null {
    if (x === undefined || y === undefined) return [1, 0];
    const dx = x - this.lx;
    const d = Math.hypot(dx, y - this.ly);
    if (d > 1200) return null;
    return [Math.pow(1 - d / 1200, 2), clamp(dx / 700, -0.8, 0.8)];
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? -1e9) < ms) return false;
    this.last[key] = now;
    return true;
  }

  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (typeof ctx.createStereoPanner !== 'function') return this.master;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.master);
    return p;
  }

  tone(freq: number, dur: number, o: ToneOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const sp = this.at(o.x, o.y);
    if (!sp) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    const g = ctx.createGain();
    const vol = (o.vol ?? 0.3) * sp[0];
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + (o.attack ?? 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.out(sp[1]));
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(dur: number, o: NoiseOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const sp = this.at(o.x, o.y);
    if (!sp) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
    f.Q.value = o.q ?? 0.7;
    const g = ctx.createGain();
    const vol = (o.vol ?? 0.3) * sp[0];
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(sp[1]));
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ---- sons da praça ----

  /** Nota do coreto: timbre de marimba (fundamental + harmônico curto). */
  note(freq: number, x: number, y: number) {
    this.tone(freq, 0.9, { type: 'sine', vol: 0.34, x, y });
    this.tone(freq * 4, 0.18, { type: 'sine', vol: 0.09, x, y });
    this.tone(freq * 2, 0.4, { type: 'triangle', vol: 0.06, x, y });
  }

  drum(x: number, y: number) {
    this.tone(120, 0.32, { type: 'sine', vol: 0.5, to: 46, x, y });
    this.noise(0.08, { vol: 0.12, freq: 900, x, y });
  }

  splash(x: number, y: number) {
    if (!this.throttle('splash', 90)) return;
    this.noise(0.38, { vol: 0.3, filter: 'bandpass', freq: 1800, to: 500, q: 0.6, x, y });
  }

  coin(x: number, y: number) {
    this.tone(1320, 0.5, { vol: 0.16, x, y });
    this.tone(1980, 0.6, { vol: 0.12, x, y, delay: 0.06 });
  }

  pop(x: number, y: number, vol = 0.22) {
    this.noise(0.05, { vol, filter: 'bandpass', freq: 1400 + Math.random() * 1600, q: 3, x, y });
  }

  flap(x: number, y: number) {
    if (!this.throttle('flap', 110)) return;
    for (let i = 0; i < 4; i++) this.noise(0.06, { vol: 0.13, filter: 'lowpass', freq: 800, x, y, delay: i * 0.07 });
  }

  boing(x: number, y: number) {
    if (!this.throttle('boing', 160)) return;
    this.tone(170, 0.28, { type: 'triangle', vol: 0.3, to: 330, x, y });
    this.noise(0.06, { vol: 0.12, freq: 500, x, y });
  }

  /** Passo da amarelinha: sobe de tom a cada casa. */
  tick(n: number, x: number, y: number) {
    this.tone(392 * Math.pow(2, n / 12), 0.16, { type: 'triangle', vol: 0.26, x, y });
  }

  oops(x: number, y: number) {
    this.tone(260, 0.3, { type: 'triangle', vol: 0.22, to: 150, x, y });
  }

  kick(x: number, y: number, v: number) {
    if (!this.throttle('kick', 70)) return;
    this.tone(150, 0.14, { type: 'sine', vol: 0.4 * v, to: 60, x, y });
    this.noise(0.04, { vol: 0.14 * v, freq: 1600, x, y });
  }

  whistle(x: number, y: number) {
    this.tone(2100, 0.16, { type: 'square', vol: 0.07, x, y });
    this.tone(2100, 0.5, { type: 'square', vol: 0.07, to: 1900, x, y, delay: 0.22 });
  }

  /** Figurinha nova. */
  jingle() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.22, delay: i * 0.09 }));
  }

  plant(x: number, y: number) {
    this.tone(330, 0.2, { type: 'sine', vol: 0.22, to: 660, x, y });
  }

  tile(x: number, y: number) {
    this.noise(0.03, { vol: 0.2, filter: 'highpass', freq: 3000, x, y });
    this.tone(880 + Math.random() * 300, 0.12, { type: 'sine', vol: 0.1, x, y });
  }

  purr(x: number, y: number) {
    if (!this.throttle('purr', 1500)) return;
    for (let i = 0; i < 9; i++) this.noise(0.09, { vol: 0.14, filter: 'lowpass', freq: 180, x, y, delay: i * 0.11 });
  }

  sparkle(x: number, y: number) {
    [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.3, { vol: 0.1, x, y, delay: i * 0.06 }));
  }

  ping(x: number, y: number) {
    this.tone(880, 0.22, { type: 'sine', vol: 0.12, to: 1175, x, y });
  }

  emote(x: number, y: number) {
    this.tone(660, 0.12, { type: 'triangle', vol: 0.14, to: 990, x, y });
  }

  creak(x: number, y: number) {
    this.tone(220, 0.12, { type: 'sawtooth', vol: 0.05, to: 260, x, y });
  }

  /** Tecla do notebook. */
  key(x: number, y: number) {
    this.noise(0.025, { vol: 0.13, filter: 'highpass', freq: 2200 + Math.random() * 900, x, y });
  }

  commit(x: number, y: number) {
    this.tone(660, 0.14, { type: 'triangle', vol: 0.15, x, y });
    this.tone(990, 0.24, { type: 'triangle', vol: 0.15, x, y, delay: 0.09 });
  }

  /** Foguete do deploy. */
  launch(x: number, y: number) {
    this.noise(1.7, { vol: 0.2, filter: 'bandpass', freq: 300, to: 2600, q: 0.8, x, y });
    this.tone(160, 1.6, { type: 'sawtooth', vol: 0.05, to: 900, x, y });
  }

  sip(x: number, y: number) {
    this.tone(520, 0.18, { vol: 0.14, to: 300, x, y });
    this.tone(420, 0.2, { vol: 0.12, to: 260, x, y, delay: 0.16 });
  }

  /** Bip do fliperama (sem posição: só quem joga ouve). */
  blip(freq: number) {
    this.tone(freq, 0.09, { type: 'square', vol: 0.05 });
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.05, delay: i * 0.14 }));
  }

  /** Ladrilho da pista de dança. */
  synth(freq: number, x: number, y: number) {
    this.tone(freq, 0.5, { type: 'sawtooth', vol: 0.07, x, y });
    this.tone(freq * 2, 0.28, { type: 'square', vol: 0.025, x, y });
  }

  /** Alguém falou por perto. */
  chat(x: number, y: number) {
    this.tone(740, 0.08, { vol: 0.07, x, y });
    this.tone(988, 0.1, { vol: 0.06, x, y, delay: 0.07 });
  }

  /** Passarinho de fundo. */
  chirp() {
    const f = 2400 + Math.random() * 1200;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone(f, 0.07, { vol: 0.035, to: f * 1.25, delay: i * 0.1 });
  }

  /** Grilo de fundo, à noite. */
  cricket() {
    for (let i = 0; i < 3; i++) this.tone(4200, 0.04, { type: 'square', vol: 0.012, delay: i * 0.07 });
  }
}
