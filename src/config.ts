import { H, W } from '../shared/protocol.js';

/** Dimensões do mundo, em unidades de mundo (1 unidade = 1 px com zoom 1). */
export { H, W };
/** Centro da praça (o chafariz fica aqui). */
export const CX = 1800;
export const CY = 1200;

export const INK = '#2D2A32';
export const CREAM = '#FFF7E6';
export const FONT = '"Baloo 2", "Trebuchet MS", system-ui, sans-serif';

/** Cores que um visitante pode escolher para o ponteiro. */
export const COLORS = [
  '#E4572E', // telha
  '#F2994A', // laranja
  '#F2C230', // ipê
  '#6FAE4A', // folha
  '#17A7A4', // piscina
  '#2E86DE', // céu
  '#6C5CE7', // jabuticaba
  '#D6336C', // pitanga
  '#F48FB1', // algodão-doce
  '#8D6E63', // café
] as const;

/** Paleta do cenário. */
export const P = {
  grass: '#97C876',
  grassDark: '#86BA66',
  grassLight: '#A8D488',
  hedge: '#4F8A52',
  hedgeLight: '#62A062',
  stone: '#F4EBD9',
  stoneEdge: '#D9CBB0',
  path: '#EADCBC',
  pathEdge: '#D2BE95',
  sand: '#F0DDAC',
  sandDark: '#E0C88E',
  water: '#62BBCB',
  waterLight: '#A9E2EA',
  waterDeep: '#3F9BB0',
  terracotta: '#D8664A',
  terracottaDark: '#B54F37',
  mustard: '#E9B44C',
  teal: '#2A7F86',
  tealDark: '#1F6368',
  leaf: '#5E9E57',
  leafDark: '#44804C',
  leafLight: '#7DBB6C',
  ipeY: '#F2C230',
  ipeYDark: '#DDA91C',
  ipeP: '#E88BB3',
  ipePDark: '#D06A98',
  wood: '#B9824F',
  woodDark: '#94643A',
  pink: '#EE8FA5',
  white: '#FFFDF6',
  azul: '#2F5FA8',
} as const;
