import { LEADERBOARD_SIZE, handleFor } from '@greedy/shared';
import type { Farmer } from '../farm/Farmer.js';
import type { LeaderEntry, LeaderboardState } from '../rooms/state/GameState.js';
import { profileStore } from './ProfileStore.js';

/** Seconds between rebuilds. A board is not a thing that needs 20 Hz. */
const REFRESH_SECONDS = 3;

type Board = 'cash' | 'earned' | 'rebirths' | 'best';
const BOARDS: readonly Board[] = ['cash', 'earned', 'rebirths', 'best'];

interface Candidate {
  readonly handle: string;
  readonly name: string;
  readonly avatarUrl: string;
  readonly cash: number;
  readonly earned: number;
  readonly rebirths: number;
  readonly best: number;
}

/**
 * The boards - Cash, Total Earned, Rebirths, Biggest Tree - and every live
 * player's own place on each.
 *
 * Every figure is the SERVER's, merged from stored profiles and live
 * farmers, the live figure winning wherever both exist. Rebuilt on a timer.
 */
export class LeaderboardService {
  private timer = 0;

  update(delta: number, board: LeaderboardState, live: Iterable<Farmer>): void {
    this.timer -= delta;
    if (this.timer > 0) return;
    this.timer = REFRESH_SECONDS;
    this.rebuild(board, live);
  }

  rebuild(board: LeaderboardState, live: Iterable<Farmer>): void {
    const byHandle = new Map<string, Candidate>();
    for (const [id, profile] of profileStore.entries()) {
      if (profile.migratedTo) continue;
      const handle = handleFor(id);
      byHandle.set(handle, {
        handle,
        name: profile.displayName ?? '',
        avatarUrl: profile.avatarUrl ?? '',
        cash: profile.cash ?? 0,
        earned: profile.totalEarned ?? 0,
        rebirths: profile.rebirths ?? 0,
        best: profile.bestTree ?? 0,
      });
    }
    const gardeners = [...live];
    for (const g of gardeners) {
      if (!g.key) continue;
      const handle = handleFor(g.key);
      byHandle.set(handle, {
        handle,
        name: g.player.displayName,
        avatarUrl: g.player.avatarUrl,
        cash: g.profile.cash,
        earned: g.profile.totalEarned,
        rebirths: g.profile.rebirths,
        best: g.profile.bestTree,
      });
    }
    const all = [...byHandle.values()];
    for (const name of BOARDS) {
      const ranked = all.filter((c) => c[name] > 0).sort((a, b) => b[name] - a[name]);
      fill(board[name], ranked, name);
      // Each live player's own place.
      for (const g of gardeners) {
        if (!g.key) continue;
        const handle = handleFor(g.key);
        const at = ranked.findIndex((c) => c.handle === handle);
        const rank = at >= 0 ? at + 1 : 0;
        if (g.ranks[name] !== rank) {
          g.ranks[name] = rank;
          g.dirty = true;
        }
      }
    }
  }
}

/** Write the top N into a replicated array, in place. */
const fill = (into: LeaderEntry[], ranked: readonly Candidate[], board: Board): void => {
  for (let i = 0; i < LEADERBOARD_SIZE; i += 1) {
    const entry = into[i];
    if (!entry) continue;
    const candidate = ranked[i];
    const handle = candidate ? candidate.handle : '';
    const name = candidate ? candidate.name : '';
    const avatarUrl = candidate ? candidate.avatarUrl : '';
    const value = candidate ? Math.floor(candidate[board]) : 0;
    if (entry.handle !== handle) entry.handle = handle;
    if (entry.name !== name) entry.name = name;
    if (entry.avatarUrl !== avatarUrl) entry.avatarUrl = avatarUrl;
    if (entry.value !== value) entry.value = value;
  }
};

export const leaderboardService = new LeaderboardService();
