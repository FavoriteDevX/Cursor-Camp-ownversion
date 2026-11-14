import './style.css';
import { loadSave } from './album';
import { Game } from './game';
import { UI } from './ui';

const params = new URLSearchParams(location.search);
const save = loadSave();
const canvas = document.getElementById('c') as HTMLCanvasElement;

// O jogo avisa a interface por estes ganchos; a interface só existe depois do jogo.
let ui: UI | null = null;
const game = new Game(canvas, save, {
  count: (real, sim) => ui?.count(real, sim),
  status: (s, kind) => ui?.status(s, kind),
  award: (f) => ui?.award(f),
  unlock: () => ui?.unlock(),
  lockFail: () => ui?.lockFail(),
  arcade: (on) => ui?.arcade(on),
  chat: (color, text, mine) => ui?.chat(color, text, mine),
});
ui = new UI(game, save, params.get('mode') === 'free' || params.get('modo') === 'livre');

// ?hour=21 força a hora do dia (para ver a praça à noite); ?room=nome abre uma praça separada.
const hora = params.get('hour') ?? params.get('hora');
if (hora && Number.isFinite(+hora)) game.hourOverride = Math.min(24, Math.max(0, +hora));
const sala = params.get('room') ?? params.get('sala') ?? '';
const room = /^[a-z0-9-]{1,24}$/.test(sala) ? sala : 'praca';

if (params.has('debug')) (window as unknown as { __pracinha: Game }).__pracinha = game;

void document.fonts?.load('700 20px "Baloo 2"');
game.start();
void game.connect(import.meta.env.VITE_REALTIME_URL ?? '', room);
