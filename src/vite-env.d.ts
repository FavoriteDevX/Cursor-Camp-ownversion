/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço do servidor de tempo real, por exemplo wss://pracinha-relay.exemplo.com. Vazio = modo de demonstração. */
  readonly VITE_REALTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
