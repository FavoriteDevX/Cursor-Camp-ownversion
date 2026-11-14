// As regras da rede moram em shared/protocol.js, porque o servidor de tempo real usa o mesmo arquivo.
export {
  applyOp,
  CHAT_MAX,
  cleanChat,
  FLOWER_SLOTS,
  ID_RE,
  KEY_RE,
  LAPTOPS,
  sanitize,
  TILE_COUNT,
  validOp,
} from '../../shared/protocol.js';
export type { Ev, Msg, Op } from '../../shared/protocol.js';
