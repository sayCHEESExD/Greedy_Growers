import { BOXITY_LEADERBOARDS } from '@greedy/shared';
import { serverConfig } from '../config/serverConfig.js';
import type { Farmer } from '../farm/Farmer.js';
import { logger } from '../util/logger.js';
import { boxityUserIdOf, liveFarmers } from './liveFarmers.js';
import { INERT_REPORTER, batches, postReport, reportingEnabled, type Reporter } from './report.js';

const SCOPE = 'bloxity/boards';

/** Batched, as Boxity asks: every 20 s, and once more on shutdown. */
const INTERVAL_MS = 20_000;

/** A board's score for a farmer, from the SERVER's own progress, never a packet. */
const scoreOf = (f: Farmer, board: string): number => {
  const p = f.profile;
  switch (board) {
    case 'cash':
      return p.cash;
    case 'earned':
      return p.totalEarned;
    case 'rebirths':
      return p.rebirths;
    case 'best_tree':
      return p.bestTree;
    default:
      return Number.NaN;
  }
};

/**
 * THE BOXITY LEADERBOARDS, submitted from the server
 * (`{BLOXITY_API_URL}/v1/leaderboards/hosted/{BLOXITY_GAME_ID}/report`).
 *
 * Only scores that changed since the last report are sent - a player standing
 * still costs nothing - and only `legion_` identities: a guest has no Boxity row.
 */
export const installScoreReporter = (): Reporter => {
  if (!reportingEnabled()) {
    logger.info(SCOPE, 'leaderboard reporting off (BLOXITY_REPORT_TOKEN / BLOXITY_GAME_ID not set)');
    return INERT_REPORTER;
  }
  const path = `/v1/leaderboards/hosted/${encodeURIComponent(serverConfig.hostedGameId)}/report`;
  const boards = BOXITY_LEADERBOARDS.map((board) => ({ ...board }));
  const sent = new Map<string, number>();

  const flush = async (): Promise<void> => {
    try {
      const scores: { board: string; userId: string; score: number }[] = [];
      for (const f of liveFarmers()) {
        const userId = boxityUserIdOf(f);
        if (!userId) continue;
        for (const board of BOXITY_LEADERBOARDS) {
          const score = Math.floor(scoreOf(f, board.id));
          if (!Number.isFinite(score) || score < 0) continue;
          const key = `${board.id}|${userId}`;
          if (sent.get(key) === score) continue;
          sent.set(key, score);
          scores.push({ board: board.id, userId, score });
        }
      }
      if (sent.size > 20_000) sent.clear();
      if (!scores.length) return;
      await Promise.all(batches(scores).map((chunk) => postReport(SCOPE, path, { boards, scores: chunk })));
    } catch (error) {
      logger.warn(SCOPE, `leaderboard report skipped: ${String(error)}`);
    }
  };

  const interval = setInterval(() => void flush(), INTERVAL_MS);
  interval.unref?.();
  logger.info(SCOPE, `reporting ${boards.length} boards every ${INTERVAL_MS / 1000}s to ${serverConfig.bloxity.apiUrl}`);
  return { flush, stop: () => clearInterval(interval) };
};
