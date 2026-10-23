import { serverConfig } from '../config/serverConfig.js';
import { logger } from '../util/logger.js';

/** A report that has not answered by now is abandoned; the next one follows. */
const TIMEOUT_MS = 8_000;

/** Most rows Boxity takes in one request (players for stats, scores for boards). */
export const REPORT_BATCH = 200;

/** True when this pod may report: Boxity hosting injected the token and the game id. */
export const reportingEnabled = (): boolean => Boolean(serverConfig.reportToken && serverConfig.hostedGameId);

/**
 * POST one report to `{BLOXITY_API_URL}{path}` with the pod's report token.
 *
 * Catches EVERYTHING and never rethrows: these run from timers beside the
 * game loop, and a slow or failing Boxity must not be able to touch a frame.
 * The answer is logged, because it is the only visibility there is into why a
 * number did not arrive (its `dropped` counts).
 */
export const postReport = async (scope: string, path: string, body: unknown): Promise<void> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${serverConfig.bloxity.apiUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serverConfig.reportToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = (await response.text().catch(() => '')).slice(0, 600);
    if (response.ok) logger.info(scope, `report ok: ${text}`);
    else logger.warn(scope, `report refused (HTTP ${response.status}): ${text}`);
  } catch (error) {
    logger.warn(scope, `report failed: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
};

/** Split rows into Boxity-sized requests. */
export const batches = <T>(rows: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += REPORT_BATCH) out.push(rows.slice(i, i + REPORT_BATCH));
  return out;
};

export interface Reporter {
  /** Report now (shutdown, drain). Resolves when every batch has answered or timed out. */
  flush(): Promise<void>;
  stop(): void;
}

export const INERT_REPORTER: Reporter = { flush: async () => undefined, stop: () => undefined };
