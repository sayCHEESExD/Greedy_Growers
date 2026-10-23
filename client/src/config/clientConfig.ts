import { DEFAULT_SERVER_PORT } from '@greedy/shared';

/** Runtime client configuration. */
export interface ClientConfig {
  /**
   * The local game server a DEV build talks to directly (`npm run dev`), or ''.
   *
   * A production build has none and never will: it reaches its server through
   * Boxity's matchmaker (`Legion.SDK.net.resolveEndpoint`), never through a
   * baked-in address - least of all the game's own <id>.host one.
   */
  readonly devServerUrl: string;
  /** Verbose console diagnostics. */
  readonly debug: boolean;
  /** Cap on devicePixelRatio, to protect mobile GPUs. */
  readonly maxPixelRatio: number;
}

/**
 * The dev server beside the page: the same host the page came from (so a
 * phone on the LAN reaches it too), on the dev server's port.
 */
const resolveDevServerUrl = (): string => {
  if (!import.meta.env.DEV) return '';
  const { protocol, hostname } = window.location;
  return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${hostname}:${DEFAULT_SERVER_PORT}`;
};

export const clientConfig: ClientConfig = {
  devServerUrl: resolveDevServerUrl(),
  debug: import.meta.env.DEV || import.meta.env['VITE_DEBUG'] === '1',
  maxPixelRatio: 2,
};
