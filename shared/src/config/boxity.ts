/**
 * WHAT THIS GAME TELLS BOXITY: its leaderboards and its profile stats.
 *
 * Shared because the browser DECLARES the boards (that is what shows Boxity's
 * trophy button) while the server SUBMITS the scores, and both must name the
 * same boards. The developer chose these (BLOXITY_CODE_METADATA.md): they
 * mirror the in-game boards, all-time, higher wins.
 *
 * Ids are permanent - Boxity creates a board on its FIRST declaration and
 * ignores later edits here - so never rename one.
 */
export interface BoxityBoard {
  readonly id: string;
  readonly label: string;
  readonly order: 'desc' | 'asc';
  readonly mode: 'best' | 'sum' | 'latest';
  readonly format: 'number' | 'compact' | 'time';
  readonly reset: 'none' | 'daily' | 'weekly' | 'monthly';
}

export const BOXITY_LEADERBOARDS: readonly BoxityBoard[] = [
  { id: 'cash', label: 'Cash', order: 'desc', mode: 'latest', format: 'compact', reset: 'none' },
  { id: 'earned', label: 'Total Earned', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'best_tree', label: 'Biggest Tree', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
];

/**
 * THE REWARDED AD: watch one at the Sell stand and the next sale pays double.
 * The developer chose this one reward (BLOXITY_CODE_METADATA.md: rewards: true).
 * The placement name is Boxity's: lowercase letters, digits and hyphens.
 */
export const AD_SALE_PLACEMENT = 'double-sale';
/** How long after one is granted another "2x next sale" may be earned. */
export const AD_SALE_COOLDOWN_MS = 10 * 60_000;
/** What the boosted sale pays, times the usual. */
export const AD_SALE_MULTIPLIER = 2;

/** One "Only in this game" stat on a Boxity profile. */
export interface BoxityStat {
  readonly key: string;
  readonly label: string;
  readonly type: 'number' | 'seconds' | 'currency' | 'percent';
  readonly sortOrder: number;
}

export const BOXITY_STATS: readonly BoxityStat[] = [
  { key: 'rebirths', label: 'Rebirths', type: 'number', sortOrder: 1 },
  { key: 'trees_harvested', label: 'Trees Harvested', type: 'number', sortOrder: 2 },
  { key: 'trees_planted', label: 'Trees Planted', type: 'number', sortOrder: 3 },
  { key: 'lightning_strikes', label: 'Lightning Strikes', type: 'number', sortOrder: 4 },
  { key: 'pets_hatched', label: 'Pets Hatched', type: 'number', sortOrder: 5 },
  { key: 'biggest_tree', label: 'Biggest Tree', type: 'currency', sortOrder: 6 },
  { key: 'total_earned', label: 'Total Earned', type: 'currency', sortOrder: 7 },
];

/**
 * Boxity's ceilings per stat type. A value above is REJECTED by Boxity, and a
 * high-water mark can never be lowered, so the reporter omits it instead.
 */
export const BOXITY_STAT_CEILING: Readonly<Record<BoxityStat['type'], number>> = {
  number: 1_000_000_000,
  seconds: 31_536_000_000,
  currency: 1_000_000_000_000,
  percent: 100,
};
