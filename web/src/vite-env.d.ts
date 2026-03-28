/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IDENTITY_PROXY: string;
  readonly VITE_REPUTATION_PROXY: string;
  readonly VITE_INK_RPC: string;
  readonly VITE_LOBSTER_COUNT: string;
  /** Comma-separated tag1 keys (e.g. hotOrNot,shellGleam,clawGame) */
  readonly VITE_LOBSTER_CATEGORIES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
