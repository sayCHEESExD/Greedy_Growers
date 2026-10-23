import { BOXITY_STAT_CEILING, BOXITY_STATS, type BoxityStat } from '@greedy/shared';
import { serverConfig } from '../config/serverConfig.js';
import type { Farmer } from '../farm/Farmer.js';
import { logger } from '../util/logger.js';
import { boxityUserIdOf, liveFarmers } from './liveFarmers.js';
import { INERT_REPORTER, batches, postReport, reportingEnabled, type Reporter } from './report.js';

const SCOPE = 'bloxity/stats';

/** How often this pod reports everyone it holds. */
const INTERVAL_MS = 60_000;

/**
 * A stat's value for a farmer, read from their SERVER-OWNED progress - the
 * profile the room simulates and saves - never from anything a client sent.
 * Boxity keeps the high-water mark itself, so the CURRENT value goes every time.
 */
const valueOf = (f: Farmer, key: string): number => {
  const p = f.profile;
  switch (key) {
    case 'rebirths':
      return p.rebirths;
    case 'trees_harvested':
      return p.totalHarvested;
    case 'trees_planted':
      return p.totalPlanted;
    case 'lightning_strikes':
      return p.totalStruck;
    case 'pets_owned':
      return p.pets.length;
    case 'biggest_tree':
      return p.bestTree;
    case 'total_earned':
      return p.totalEarned;
    default:
      return Number.NaN;
  }
};

/** Finite, not negative, and under Boxity's ceiling for the type - or left out, never clamped. */
const valid = (value: number, stat: BoxityStat): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= BOXITY_STAT_CEILING[stat.type];

const rowsOf = (farmers: readonly Farmer[]): { userId: string; values: Record<string, number> }[] => {
  const byUser = new Map<string, Record<string, number>>();
  for (const f of farmers) {
    const userId = boxityUserIdOf(f);
    if (!userId) continue;
    const values: Record<string, number> = {};
    for (const stat of BOXITY_STATS) {
      const value = valueOf(f, stat.key);
      if (valid(value, stat)) values[stat.key] = Math.floor(value);
    }
    if (Object.keys(values).length) byUser.set(userId, values);
  }
  return [...byUser].map(([userId, values]) => ({ userId, values }));
};

/**
 * THE PROFILE STATS ("Only in this game" on a Boxity profile). Call once at
 * server start; a no-op without BLOXITY_REPORT_TOKEN and BLOXITY_GAME_ID, which
 * is what keeps local development silent. Flush once more on shutdown.
 */
export const installStatReporter = (): Reporter => {
  if (!reportingEnabled()) {
    logger.info(SCOPE, 'stat reporting off (BLOXITY_REPORT_TOKEN / BLOXITY_GAME_ID not set)');
    return INERT_REPORTER;
  }
  const path = `/v1/games/${encodeURIComponent(serverConfig.hostedGameId)}/stats`;
  const definitions = BOXITY_STATS.map(({ key, label, type, sortOrder }) => ({ key, label, type, sortOrder }));

  const flush = async (): Promise<void> => {
    try {
      const rows = rowsOf(liveFarmers());
      if (!rows.length) return;
      await Promise.all(batches(rows).map((players) => postReport(SCOPE, path, { definitions, players })));
    } catch (error) {
      logger.warn(SCOPE, `stat report skipped: ${String(error)}`);
    }
  };

  const interval = setInterval(() => void flush(), INTERVAL_MS);
  interval.unref?.();
  logger.info(SCOPE, `reporting ${definitions.length} stats every ${INTERVAL_MS / 1000}s to ${serverConfig.bloxity.apiUrl}`);
  return { flush, stop: () => clearInterval(interval) };
};
