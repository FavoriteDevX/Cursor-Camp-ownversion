export type InputMode = 'lock' | 'free' | 'touch';

/**
 * Lê o mouse ou o dedo e entrega deslocamentos.
 *  - lock:  o site segura o mouse (Pointer Lock). O ponteiro anda pelo mundo e Esc devolve o mouse.
 *  - free:  o mouse fica solto e a câmera anda quando ele encosta na borda. Usado se o navegador recusar o lock.
 *  - touch: o dedo funciona como um touchpad; um toque rápido é um clique.
 */
export class Input {
  mode: InputMode = 'lock';
  /** O jogo está recebendo movimento (não está em pausa nem em menu). */
  active = false;
  locked = false;
  /** O navegador já aceitou segurar o mouse pelo menos uma vez. */
  everLocked = false;
  /** Deslocamento acumulado desde a última leitura, em px de tela. */
  private dx = 0;
  private dy = 0;
  /** Posição do mouse na tela (modo free). */
  sx = 0;
  sy = 0;
  private clicks = 0;
  /** Botão do mouse apertado (ou dedo arrastando). Usado para desenhar na lousa. */
  down = false;
  private touchId: number | null = null;
  private tx = 0;
  private ty = 0;
  private tMoved = 0;
  private tStart = 0;

  /** Chamado quando o navegador solta o mouse (Esc). */
  onUnlock: () => void = () => {};
  /** Chamado se o navegador recusar o Pointer Lock. */
  onLockFail: () => void = () => {};

  constructor(private el: HTMLElement) {
    this.sx = innerWidth / 2;
    this.sy = innerHeight / 2;

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.el;
      if (this.locked) this.everLocked = true;
      if (was && !this.locked) this.onUnlock();
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.mode === 'lock') this.onLockFail();
    });

    addEventListener('mousemove', (e) => {
      if (this.mode === 'lock') {
        if (!this.locked) return;
        // alguns navegadores soltam um salto enorme de vez em quando com o mouse preso: corta o exagero
        this.dx += Math.max(-250, Math.min(250, e.movementX));
        this.dy += Math.max(-250, Math.min(250, e.movementY));
      } else if (this.mode === 'free') {
        if (this.active) {
          this.dx += e.clientX - this.sx;
          this.dy += e.clientY - this.sy;
        }
        this.sx = e.clientX;
        this.sy = e.clientY;
      }
    });

    this.el.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.active || this.mode === 'touch') return;
      if (this.mode === 'lock' && !this.locked) return;
      this.clicks++;
      this.down = true;
    });
    addEventListener('mouseup', () => {
      this.down = false;
    });

    this.el.addEventListener(
      'touchstart',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        if (this.touchId !== null) return;
        const t = e.changedTouches[0];
        this.touchId = t.identifier;
        this.tx = t.clientX;
        this.ty = t.clientY;
        this.tMoved = 0;
        this.tStart = performance.now();
        this.down = true;
      },
      { passive: false },
    );
    this.el.addEventListener(
      'touchmove',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== this.touchId) continue;
          const ddx = t.clientX - this.tx;
          const ddy = t.clientY - this.ty;
          this.tx = t.clientX;
          this.ty = t.clientY;
          this.tMoved += Math.abs(ddx) + Math.abs(ddy);
          this.dx += ddx * 1.8;
          this.dy += ddy * 1.8;
        }
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.touchId) continue;
        this.touchId = null;
        this.down = false;
        if (this.active && this.tMoved < 12 && performance.now() - this.tStart < 300) this.clicks++;
      }
    };
    this.el.addEventListener('touchend', end);
    this.el.addEventListener('touchcancel', end);
  }

  /** Pede ao navegador para segurar o mouse. Tem de ser chamado dentro de um clique. */
  lock() {
    if (this.mode !== 'lock') return;
    try {
      const r = this.el.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => this.onLockFail());
    } catch {
      this.onLockFail();
    }
  }

  unlock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /** Devolve e zera o deslocamento acumulado. */
  consume(): [number, number] {
    const r: [number, number] = [this.dx, this.dy];
    this.dx = 0;
    this.dy = 0;
    return r;
  }

  consumeClicks(): number {
    const c = this.clicks;
    this.clicks = 0;
    return c;
  }
}
