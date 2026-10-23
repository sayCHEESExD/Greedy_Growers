import type { LegionEnvironment } from './legionTypes.js';

/**
 * WHICH BOXITY THIS PAGE RUNS UNDER - as the PLATFORM tells it, never worked
 * out from our own hostname, the referrer, a build flag or a URL.
 *
 * The SDK answers `Legion.SDK.environment()` from `window.BLOXITY_ENV` (which
 * Boxity injects into the pages it serves, and the dev server sets for local
 * work) or from the portal's handshake when embedded. Code that runs before the
 * SDK is there reads `window.BLOXITY_ENV` through this same helper. Told
 * nothing (a page Boxity neither serves nor embeds), it is prod.
 *
 * EVERY Boxity URL in the client is built from these values: the API, the
 * matchmaker, the asset CDN. No other file may write a bloxity.io host.
 */
const PROD: LegionEnvironment = {
  env: 'prod',
  apiUrl: 'https://api.bloxity.io',
  playUrl: 'https://play.bloxity.io',
  portalUrl: 'https://bloxity.io',
  staticUrl: 'https://static.bloxity.io',
};

const trim = (url: string | undefined, fallback: string): string => (url && url.trim() ? url.trim().replace(/\/+$/, '') : fallback);

const normalise = (told: Partial<LegionEnvironment> | null | undefined): LegionEnvironment => ({
  env: told?.env === 'stage' || told?.env === 'local' ? told.env : 'prod',
  apiUrl: trim(told?.apiUrl, PROD.apiUrl),
  playUrl: trim(told?.playUrl, PROD.playUrl),
  portalUrl: trim(told?.portalUrl, PROD.portalUrl),
  staticUrl: trim(told?.staticUrl, PROD.staticUrl),
});

/** The told environment, now. Cheap: call it where the URL is needed rather than caching it. */
export const bloxityEnvironment = (): LegionEnvironment => {
  try {
    const sdk = window.Legion?.SDK;
    if (sdk?.environment) return normalise(sdk.environment());
  } catch {
    // An SDK that throws here is treated like an SDK that is not there.
  }
  return normalise(typeof window === 'undefined' ? null : window.BLOXITY_ENV);
};

/** Called when the portal's handshake tells the environment after init. */
export const onBloxityEnvironmentChanged = (callback: (environment: LegionEnvironment) => void): (() => void) => {
  try {
    const off = window.Legion?.SDK?.onEnvironmentChanged?.((told) => callback(normalise(told)));
    return typeof off === 'function' ? off : () => undefined;
  } catch {
    return () => undefined;
  }
};
