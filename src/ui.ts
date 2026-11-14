import { drawGlyph } from './actors';
import { FIGS, figSvg, writeSave, type Fig, type Save } from './album';
import { COLORS } from './config';
import type { Game } from './game';
import type { InputMode } from './input';
import type { Status } from './net/transport';

type Screen = 'start' | 'play' | 'pause' | 'album' | 'help';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} is missing from the HTML.`);
  return el as T;
};

/** Tudo o que é HTML: tela de entrada, menu, álbum, chat e avisos. O jogo em si é desenhado no canvas. */
export class UI {
  private screen: Screen = 'start';
  /** O último toque na tela veio de um dedo. */
  private touch = false;
  private arcadeOn = false;
  private chatForm = $<HTMLFormElement>('chat');
  private chatIn = $<HTMLInputElement>('chat-in');

  constructor(
    private game: Game,
    private save: Save,
    private forceFree: boolean,
  ) {
    addEventListener('pointerdown', (e) => (this.touch = e.pointerType === 'touch'), true);

    this.swatches($('sw-start'));
    this.swatches($('sw-pause'));
    this.emotes();

    $('b-entrar').onclick = () => this.enter();
    $('b-voltar').onclick = () => this.resume();
    $('b-menu').onclick = () => this.pause();
    $('b-album').onclick = () => this.openAlbum();
    $('p-album').onclick = () => this.openAlbum();
    $('p-ajuda').onclick = () => this.openHelp();
    $('album-fechar').onclick = () => this.resume();
    $('ajuda-fechar').onclick = () => this.resume();
    $('b-som').onclick = () => this.toggleMute();
    $('p-som').onclick = () => this.toggleMute();
    $('p-chat').onclick = () => this.toggleChat();
    $('b-chat').onclick = () => this.openChat();
    $('b-sair-jogo').onclick = () => this.game.arcade.exit();

    // o botão de enviar não pode roubar o foco do campo, senão o campo fecha antes do envio
    $('chat-send').addEventListener('pointerdown', (e) => e.preventDefault());
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = this.game.say(this.chatIn.value);
      if (r === 'wait') return;
      this.closeChat();
    });
    this.chatIn.addEventListener('blur', () => this.closeChat());

    addEventListener('keydown', (e) => this.key(e));

    if (matchMedia('(pointer: coarse)').matches) {
      $('start-hint').textContent = 'Drag your finger like a trackpad to move around. A quick tap is a click.';
    }
    this.labels();
    this.figCount();
  }

  // ------------------------------------------------------------ telas

  private show(s: Screen) {
    this.screen = s;
    $('start').hidden = s !== 'start';
    $('pause').hidden = s !== 'pause';
    $('album').hidden = s !== 'album';
    $('ajuda').hidden = s !== 'help';
    $('hud').hidden = s === 'start';
    if (s !== 'play') this.closeChat();
    this.chrome();
  }

  /** Mostra ou esconde o que depende do modo de controle e do que está aberto. */
  private chrome() {
    const play = this.screen === 'play';
    const mode = this.game.input.mode;
    const typing = !this.chatForm.hidden;
    const hint = $('hint');
    hint.hidden = !play || mode === 'touch' || typing || this.arcadeOn;
    hint.textContent =
      mode === 'lock'
        ? 'Esc menu · Enter chat · 1–5 emotes · F stickers · M sound'
        : 'push the cursor to the edge to move · Enter chat · 1–5 emotes';
    $('emotes').hidden = !play || mode === 'lock' || typing || this.arcadeOn;
    $('b-chat').hidden = !this.game.chatOn;
    $('b-sair-jogo').hidden = !(play && this.arcadeOn && mode !== 'lock');
  }

  private enter() {
    const mode: InputMode = this.touch ? 'touch' : this.forceFree ? 'free' : 'lock';
    this.game.join(this.save.color, mode);
    this.show('play');
  }

  private resume() {
    this.game.resume();
    this.show('play');
  }

  private pause() {
    this.game.pause();
    this.show('pause');
  }

  private openAlbum() {
    if (this.screen === 'start') return;
    this.game.pause();
    const grid = $('album-grid');
    grid.textContent = '';
    for (const f of FIGS) {
      const has = this.game.album.owned.has(f.id);
      const card = document.createElement('div');
      card.className = has ? 'fig' : 'fig missing';
      const art = document.createElement('div');
      art.className = 'art';
      if (has) {
        art.style.background = f.bg;
        art.innerHTML = figSvg(f, 44);
      } else {
        art.textContent = '?';
      }
      const name = document.createElement('b');
      name.textContent = has || !f.secret ? f.name : '???';
      const hint = document.createElement('span');
      hint.textContent = has || !f.secret ? f.hint : 'secret';
      card.append(art, name, hint);
      grid.append(card);
    }
    $('album-n').textContent = `${this.game.album.owned.size}/${FIGS.length}`;
    this.show('album');
  }

  private openHelp() {
    if (this.screen === 'start') return;
    this.game.pause();
    this.show('help');
  }

  // ------------------------------------------------------------ teclado

  private key(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (e.target instanceof HTMLInputElement) {
      if (k === 'escape') this.closeChat();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.screen === 'play') {
      // dentro de um minijogo as teclas são do jogo
      if (this.arcadeOn && k !== 'escape') return;
      if (k === 'enter' || k === 't') {
        if (this.game.chatOn) {
          e.preventDefault();
          this.openChat();
        }
      } else if (k === 'f') this.openAlbum();
      else if (k === 'm') this.toggleMute();
      else if (k === 'h' || k === '?') this.openHelp();
      else if (k === 'escape' && this.game.input.mode !== 'lock') this.pause();
    } else if ((this.screen === 'album' || this.screen === 'help') && k === 'escape') {
      this.show('pause');
    }
  }

  // ------------------------------------------------------------ chat

  private openChat() {
    if (this.screen !== 'play' || !this.game.chatOn) return;
    this.chatForm.hidden = false;
    this.chatIn.value = '';
    this.chrome();
    this.chatIn.focus();
  }

  private closeChat() {
    if (this.chatForm.hidden) return;
    this.chatForm.hidden = true;
    this.chatIn.blur();
    this.chrome();
  }

  /** Acrescenta uma fala ao histórico curto do canto. O texto entra como texto puro, nunca como HTML. */
  chat(color: number, text: string, mine: boolean) {
    const log = $('chatlog');
    const line = document.createElement('div');
    line.className = mine ? 'line mine' : 'line';
    const dot = document.createElement('i');
    dot.style.background = COLORS[color] ?? COLORS[0];
    const span = document.createElement('span');
    span.textContent = text;
    line.append(dot, span);
    log.append(line);
    while (log.children.length > 6) log.firstElementChild?.remove();
    setTimeout(() => line.classList.add('old'), 13000);
    setTimeout(() => line.remove(), 14000);
  }

  // ------------------------------------------------------------ preferências

  private swatches(box: HTMLElement) {
    COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = c;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Color ${i + 1}`);
      b.dataset.color = String(i);
      b.onclick = () => {
        this.save.color = i;
        writeSave(this.save);
        this.game.me.color = i;
        this.labels();
      };
      box.append(b);
    });
  }

  private emotes() {
    const box = $('emotes');
    for (let n = 0; n < 5; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', ['Smile', 'Heart', 'Star', 'Music', 'Sleepy'][n]);
      const c = document.createElement('canvas');
      c.width = c.height = 56;
      const g = c.getContext('2d');
      if (g) drawGlyph(g, n, 28, 28, 20);
      b.append(c);
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.onclick = () => this.game.emote(n);
      box.append(b);
    }
  }

  private toggleMute() {
    this.save.muted = !this.save.muted;
    writeSave(this.save);
    this.game.sfx.setMuted(this.save.muted);
    this.labels();
  }

  private toggleChat() {
    this.save.chat = !this.save.chat;
    writeSave(this.save);
    this.game.chatOn = this.save.chat;
    if (!this.save.chat) $('chatlog').textContent = '';
    this.labels();
    this.chrome();
  }

  private labels() {
    $('b-som').textContent = this.save.muted ? 'Muted' : 'Sound';
    $('p-som').textContent = this.save.muted ? 'Sound: off' : 'Sound: on';
    $('p-chat').textContent = this.save.chat ? 'Chat: on' : 'Chat: off';
    for (const b of document.querySelectorAll<HTMLElement>('.swatches button')) {
      b.setAttribute('aria-checked', String(b.dataset.color === String(this.save.color)));
    }
  }

  private figCount() {
    $('fig-n').textContent = `${this.game.album.owned.size}/${FIGS.length}`;
  }

  // ------------------------------------------------------------ avisos vindos do jogo

  count(real: number, sim: number) {
    $('count').textContent = `${real} in the plaza` + (sim ? ` + ${sim} simulated` : '');
  }

  status(s: Status, kind: 'local' | 'ws') {
    const dot = $('dot');
    dot.className = s === 'online' ? 'online' : s === 'reconnecting' ? 'off' : '';
    const note =
      kind === 'local'
        ? 'Demo mode: this site is not connected to a real-time server yet. You will only meet other tabs of this same browser; the other cursors are simulated and do not answer the chat.'
        : s === 'online'
          ? 'You are connected to the real-time server: the other cursors are real people.'
          : 'Lost the connection to the real-time server. Trying again…';
    $('count-chip').title = note;
    $('mode-note').textContent = note;
  }

  award(f: Fig) {
    this.figCount();
    const t = document.createElement('div');
    t.className = 'toast';
    const art = document.createElement('div');
    art.className = 'art';
    art.style.background = f.bg;
    art.innerHTML = figSvg(f, 28);
    const text = document.createElement('span');
    const small = document.createElement('small');
    small.textContent = 'New sticker';
    text.append(small, f.name);
    t.append(art, text);
    this.pushToast(t, 3400);
  }

  private toast(msg: string) {
    const t = document.createElement('div');
    t.className = 'toast plain';
    t.textContent = msg;
    this.pushToast(t, 6000);
  }

  private pushToast(t: HTMLElement, ms: number) {
    $('toasts').append(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 450);
  }

  /** O navegador soltou o mouse (Esc): abre o menu. */
  unlock() {
    if (this.screen === 'play') this.show('pause');
  }

  /** O navegador não deixou segurar o mouse: segue com o mouse solto. */
  lockFail() {
    this.toast('Your browser did not let the site capture the mouse. No problem: push the cursor to the edge of the screen to move around.');
    this.chrome();
  }

  arcade(on: boolean) {
    this.arcadeOn = on;
    this.chrome();
  }
}
