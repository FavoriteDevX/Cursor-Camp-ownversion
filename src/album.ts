/** Uma figurinha do álbum: uma lembrança de algo que o visitante fez na praça. */
export interface Fig {
  id: string;
  name: string;
  hint: string;
  secret?: boolean;
  /** Cor de fundo e desenho (SVG, caixa 48×48). */
  bg: string;
  art: string;
}

const INK = '#2D2A32';
const s = (d: string, extra = '') => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

export const FIGS: Fig[] = [
  {
    id: 'chegou',
    name: 'You made it!',
    hint: 'Step into the plaza.',
    bg: '#F2C230',
    art: `<path d="M16 9v27l7-6.5 5 11 5-2.2-5-10.6h9z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`,
  },
  {
    id: 'maestro',
    name: 'Maestro',
    hint: 'Play 8 notes on the bandstand.',
    bg: '#2A7F86',
    art: `<ellipse cx="17" cy="33" rx="6" ry="4.4" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4"/><ellipse cx="33" cy="29" rx="6" ry="4.4" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4"/>${s('M23 33V13l16-4v20')}${s('M23 19l16-4')}`,
  },
  {
    id: 'desejo',
    name: 'Make a wish',
    hint: 'Toss a coin into the fountain.',
    bg: '#62BBCB',
    art: `<circle cx="24" cy="24" r="12" fill="#F5C542" stroke="${INK}" stroke-width="2.6"/><path d="M24 16.5l2.2 4.9 5.3.5-4 3.6 1.2 5.2-4.7-2.8-4.7 2.8 1.2-5.2-4-3.6 5.3-.5z" fill="#FFFDF6" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`,
  },
  {
    id: 'banho',
    name: 'Fountain dip',
    hint: 'Take a dip.',
    bg: '#A9E2EA',
    art: `<path d="M24 9c6 8 10 13 10 19a10 10 0 0 1-20 0c0-6 4-11 10-19z" fill="#2E86DE" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>${s('M19 28a5 5 0 0 0 4 5', 'stroke="#FFFDF6"')}`,
  },
  {
    id: 'revoada',
    name: 'Scatter!',
    hint: 'Startle 10 pigeons.',
    bg: '#B8C4D6',
    art: `${s('M8 22c4-5 8-5 10 0 2-5 6-5 10 0')}${s('M22 34c3-4 6-4 8 0 2-4 5-4 8 0')}${s('M27 14c2-3 4-3 5.5 0 1.500-3 3.500-3 5.500 0')}`,
  },
  {
    id: 'pipoca',
    name: 'Popcorn time',
    hint: 'Wait for your popcorn at the cart.',
    bg: '#D8483A',
    art: `<path d="M15 22h18l-3 18H18z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M21 23l1 16M27 23l-1 16" stroke="#D8483A" stroke-width="2.6"/><circle cx="17" cy="18" r="5" fill="#FFF3C4" stroke="${INK}" stroke-width="2.2"/><circle cx="24" cy="14" r="5.500" fill="#FFF3C4" stroke="${INK}" stroke-width="2.2"/><circle cx="31" cy="18" r="5" fill="#FFF3C4" stroke="${INK}" stroke-width="2.2"/>`,
  },
  {
    id: 'pombos',
    name: 'Pigeon whisperer',
    hint: 'Gather 3 pigeons with your popcorn.',
    bg: '#97C876',
    art: `<ellipse cx="22" cy="27" rx="12" ry="8" fill="#8D97AB" stroke="${INK}" stroke-width="2.6"/><circle cx="33" cy="19" r="5.500" fill="#8D97AB" stroke="${INK}" stroke-width="2.6"/><path d="M38 18l5 1.500-5 1.500z" fill="#F2994A" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="34" cy="18" r="1.200" fill="${INK}"/>${s('M18 35v5M25 35v5')}`,
  },
  {
    id: 'gangorra',
    name: 'Seesaw',
    hint: 'Ride with someone on the other side.',
    bg: '#E9B44C',
    art: `<path d="M24 26l7 12H17z" fill="#2A7F86" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M7 31L41 17" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M7 31L41 17" stroke="#FFFDF6" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  {
    id: 'balanco',
    name: 'Sky high',
    hint: 'Swing really high.',
    bg: '#6C5CE7',
    art: `${s('M10 9h28')}${s('M17 9l-5 22M29 9l-5 24')}<rect x="8" y="30" width="19" height="6" rx="2.500" transform="rotate(8 17 33)" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4"/>${s('M33 22c3 2 5 5 5 9', 'stroke="#FFFDF6"')}`,
  },
  {
    id: 'amarelinha',
    name: 'Hopscotch',
    hint: 'Hop from 1 all the way to the sky.',
    bg: '#F48FB1',
    art: `<rect x="18" y="29" width="12" height="11" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4"/><rect x="12" y="18" width="12" height="11" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4"/><rect x="24" y="18" width="12" height="11" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4"/><path d="M14 18a10 10 0 0 1 20 0z" fill="#FFF3C4" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  },
  {
    id: 'gol',
    name: 'Goal!',
    hint: 'Score on the pitch.',
    bg: '#6FAE4A',
    art: `<circle cx="24" cy="24" r="13" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6"/><path d="M24 17l6 4.400-2.300 7h-7.400l-2.300-7z" fill="${INK}"/>${s('M24 11v6M36 21l-6 .4M31 35l-3.300-6.600M17 35l3.300-6.600M12 21l6 .4', 'stroke-width="2"')}`,
  },
  {
    id: 'azulejo',
    name: 'Tile painter',
    hint: 'Paint 5 tiles on the mural.',
    bg: '#2F5FA8',
    art: `<rect x="10" y="10" width="28" height="28" rx="3" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6"/><path d="M24 13l11 11-11 11-11-11z" fill="#2E86DE"/><circle cx="24" cy="24" r="4" fill="#FFFDF6"/>`,
  },
  {
    id: 'jardim',
    name: 'Gardener',
    hint: 'Plant 3 flowers in the flowerbed.',
    bg: '#8A6A4A',
    art: `${s('M24 40V25', 'stroke="#44804C" stroke-width="3.2"')}<path d="M24 34c-5 0-8-2-9-6 5 0 8 2 9 6z" fill="#7DBB6C" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><g fill="#F48FB1" stroke="${INK}" stroke-width="2"><circle cx="24" cy="11" r="4.600"/><circle cx="31" cy="16" r="4.600"/><circle cx="28.500" cy="24" r="4.600"/><circle cx="19.500" cy="24" r="4.600"/><circle cx="17" cy="16" r="4.600"/></g><circle cx="24" cy="18" r="4" fill="#F2C230" stroke="${INK}" stroke-width="2"/>`,
  },
  {
    id: 'commit',
    name: 'First commit',
    hint: 'Sit at a coworking laptop and code.',
    bg: '#1E2230',
    art: `<path d="M24 6v11M24 31v11" stroke="#7BD88F" stroke-width="3.2" stroke-linecap="round"/><circle cx="24" cy="24" r="7" fill="#1E2230" stroke="#7BD88F" stroke-width="3.2"/><circle cx="24" cy="24" r="2.400" fill="#7BD88F"/>`,
  },
  {
    id: 'par',
    name: 'Pair programming',
    hint: 'Share a laptop with another visitor.',
    bg: '#78DCE8',
    art: `<path d="M9 12v19l5-4.600 3.500 7.800 3.600-1.600-3.500-7.600h6.400z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M26 16v19l5-4.600 3.500 7.800 3.600-1.600-3.500-7.600H41z" fill="#F2C230" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  },
  {
    id: 'cafe',
    name: 'Coffee break',
    hint: 'Grab a coffee at the coworking deck.',
    bg: '#C9A27A',
    art: `<path d="M12 20h20l-2 16a3 3 0 0 1-3 2.500H17a3 3 0 0 1-3-2.500z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>${s('M32 23c5 0 7 2 7 5s-3 5-8 5')}${s('M18 8c-2 3 2 4 0 7M26 8c-2 3 2 4 0 7')}`,
  },
  {
    id: 'deploy',
    name: 'Shipped!',
    hint: 'Hit the deploy button.',
    bg: '#E4352B',
    art: `<path d="M24 6c7 5 9 13 7 24H17c-2-11 0-19 7-24z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="24" cy="18" r="3.600" fill="#62BBCB" stroke="${INK}" stroke-width="2"/><path d="M17 26l-6 8h7zM31 26l6 8h-7z" fill="#F2C230" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M20 31l4 11 4-11z" fill="#F2994A" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
  },
  {
    id: 'lousa',
    name: 'Doodler',
    hint: 'Draw on the coworking whiteboard.',
    bg: '#C9CED6',
    art: `<rect x="7" y="10" width="34" height="24" rx="3" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6"/>${s('M12 27c3-9 6-9 8-3s4 6 6 0 4-8 9-6', 'stroke="#6C5CE7" stroke-width="3"')}${s('M18 34l-4 7M30 34l4 7')}`,
  },
  {
    id: 'ficha',
    name: 'Insert coin',
    hint: 'Play a machine at the arcade.',
    bg: '#2A2350',
    art: `<rect x="9" y="26" width="30" height="13" rx="4" fill="#FF5DA2" stroke="${INK}" stroke-width="2.6"/><path d="M19 27V16" stroke="#FFFDF6" stroke-width="3.400" stroke-linecap="round"/><circle cx="19" cy="13" r="5.500" fill="#E4352B" stroke="${INK}" stroke-width="2.4"/><circle cx="30" cy="32" r="3" fill="#FFD23F" stroke="${INK}" stroke-width="2"/>`,
  },
  {
    id: 'recorde',
    name: 'High scorer',
    hint: 'Beat the plaza high score on any game.',
    bg: '#FFD23F',
    art: `<path d="M15 9h18v9a9 9 0 0 1-18 0z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>${s('M15 12H9c0 6 3 8 7 9M33 12h6c0 6-3 8-7 9')}${s('M24 27v6')}<path d="M16 33h16v6H16z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`,
  },
  {
    id: 'papo',
    name: 'Small talk',
    hint: 'Say something in the chat.',
    bg: '#6FAE4A',
    art: `<path d="M8 10h32v22H22l-9 8v-8H8z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="17" cy="21" r="2.200" fill="${INK}"/><circle cx="24" cy="21" r="2.200" fill="${INK}"/><circle cx="31" cy="21" r="2.200" fill="${INK}"/>`,
  },
  {
    id: 'sossego',
    name: 'Peace and quiet',
    hint: 'Sit on a bench and stay still for a while.',
    secret: true,
    bg: '#B9824F',
    art: `<rect x="8" y="24" width="32" height="7" rx="2.500" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4"/><rect x="8" y="14" width="32" height="6" rx="2.500" fill="#FFFDF6" stroke="${INK}" stroke-width="2.4"/>${s('M12 31v8M36 31v8M12 20v4M36 20v4')}`,
  },
  {
    id: 'gato',
    name: 'Plaza cat',
    hint: 'Find the cat and keep it company.',
    secret: true,
    bg: '#E8963A',
    art: `<path d="M12 12l7 6h10l7-6v16a12 11 0 0 1-24 0z" fill="#FFFDF6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>${s('M18 26c1.500 1.500 3 1.500 4 0M26 26c1.500 1.500 3 1.500 4.500 0')}<path d="M22.500 30h3l-1.500 2z" fill="#D9705F" stroke="${INK}" stroke-width="1.400" stroke-linejoin="round"/>`,
  },
  {
    id: 'vagalume',
    name: 'Firefly',
    hint: 'Come back at night and touch one.',
    secret: true,
    bg: '#2B3160',
    art: `<circle cx="24" cy="24" r="11" fill="#EFFFA0" opacity=".35"/><circle cx="24" cy="24" r="5.500" fill="#F6FFB8" stroke="${INK}" stroke-width="2.2"/>${s('M24 7v4M24 37v4M7 24h4M37 24h4M12 12l3 3M33 33l3 3M36 12l-3 3M15 33l-3 3', 'stroke="#F6FFB8" stroke-width="2.2"')}`,
  },
];

export function figSvg(f: Fig, size = 56): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${f.art}</svg>`;
}

const KEY = 'little-plaza:v1';

export interface Save {
  figs: string[];
  color: number;
  muted: boolean;
  /** Chat ligado. */
  chat: boolean;
}

/** Lê o que este navegador guardou. Se o armazenamento estiver bloqueado, começa do zero. */
export function loadSave(): Save {
  const base: Save = { figs: [], color: Math.floor(Math.random() * 10), muted: false, chat: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const d = JSON.parse(raw) as Partial<Save>;
    return {
      figs: Array.isArray(d.figs) ? d.figs.filter((x): x is string => typeof x === 'string' && FIGS.some((f) => f.id === x)) : [],
      color: typeof d.color === 'number' && d.color >= 0 && d.color <= 9 ? Math.floor(d.color) : base.color,
      muted: d.muted === true,
      chat: d.chat !== false,
    };
  } catch {
    return base;
  }
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* navegação privada ou armazenamento cheio: segue sem guardar */
  }
}

/** O álbum de figurinhas do visitante. */
export class Album {
  owned: Set<string>;
  /** Chamado quando uma figurinha nova é conquistada. */
  onAward: (f: Fig) => void = () => {};

  constructor(private save: Save) {
    this.owned = new Set(save.figs);
  }

  award(id: string) {
    if (this.owned.has(id)) return;
    const f = FIGS.find((x) => x.id === id);
    if (!f) return;
    this.owned.add(id);
    this.save.figs = [...this.owned];
    writeSave(this.save);
    this.onAward(f);
  }
}
