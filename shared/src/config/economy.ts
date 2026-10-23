import { mutationMultiplier } from './mutations.js';
import { RARITIES, type SeedDef } from './seeds.js';

/**
 * THE GREEDY PART. A planted seed grows a tree whose MULTIPLIER climbs with
 * time, and its value is the seed's base times that multiplier (times its
 * mutations). Every tree also has a hidden CRASH POINT, rolled by the server
 * when it is planted and never sent to anybody: the moment the multiplier
 * reaches it, lightning strikes and the tree dies. Harvest before that and
 * you bank the value; wait and it grows, until it doesn't.
 *
 * Calibration, against the reference video and the guides:
 *   - a Common tree climbs ~0.6x a second (0.43x -> 2.34x in three seconds);
 *   - strikes in the video came at 2.50x, 6.10x and 6.31x, while other
 *     players' trees stood at 11.9x, 65x and 107x - a long tail;
 *   - a dead tree still sells "for much less": the video's dead trees sold
 *     for ~40% of their live value at the strike ($12 for an Oak at 6.31x,
 *     $60 for a Pine at 6.10x);
 *   - fertilizers "multiply the crash point" (Update 6.0 notes) and speed
 *     growth; worms multiply it too.
 *
 * The crash point follows P(crash > m) = K / (K + m): half of all trees die
 * before K, one in ~16 passes 60x, one in ~27 passes 100x. The expected value
 * of waiting keeps rising but flattens - greed pays a little, and risks a lot.
 */
export const CRASH_K = 4;
/** No tree dies before this. */
export const MIN_CRASH = 0.35;
export const MAX_MULT = 99_999;
/** A dead tree is worth this share of its value at the strike. */
export const DEAD_SHARE = 0.4;
/** Harvest within this much of the crash point: lightning hits as you pick it - Shocked or Charged. */
export const NEAR_MISS = 1.0;
/** Under this the near miss gives Shocked, at or over it Charged. */
export const CHARGED_FROM = 25;

/** Roll a crash point from a uniform in (0, 1]. */
export const rollCrash = (u: number, factor = 1): number => {
  const safe = Math.min(1, Math.max(1e-6, u));
  const raw = (CRASH_K * (1 - safe)) / safe;
  return Math.min(MAX_MULT, Math.max(MIN_CRASH, raw * factor));
};

/** Multiplier per second for a seed, with every speed bonus (fertilizer, pets) as a fraction (+0.25 = 25% faster). */
export const growthRate = (seed: SeedDef, speedBonus: number): number => RARITIES[seed.rarity].growth * (1 + Math.max(0, speedBonus));

/** The multiplier of a tree planted at `plantedAt` growing at `rate`, at time `now`. */
export const multAt = (plantedAt: number, rate: number, now: number, boost = 0): number =>
  Math.min(MAX_MULT, Math.max(0, ((now - plantedAt) / 1000) * rate + boost));

/** Value of a tree: base x multiplier x mutations. */
export const treeValue = (seed: SeedDef, mult: number, mut: number): number => seed.base * mult * mutationMultiplier(mut);

/** Value of a dead tree, from its multiplier at the strike. */
export const deadValue = (seed: SeedDef, mult: number, mut: number): number => treeValue(seed, mult, mut) * DEAD_SHARE;

/**
 * A fruit from a garden tree: a tenth of the seed's base, grown with the
 * square root of the tree's size, times the tree's and the fruit's own
 * mutations. A garden tree pays back its sell value in well under an hour.
 */
export const fruitValue = (seed: SeedDef, treeMult: number, mut: number): number =>
  seed.base * 0.1 * Math.sqrt(Math.max(1, treeMult)) * mutationMultiplier(mut);

/** Fruits hanging on one garden tree at most. */
export const MAX_FRUIT_PER_TREE = 3;

// -------------------------------------------------------------- fertilizers

export interface FertilizerDef {
  readonly id: number;
  readonly name: string;
  /** Crash point multiplier: lets the tree grow bigger before lightning finds it. */
  readonly crash: number;
  /** Growth speed bonus. */
  readonly speed: number;
  /** Weather mutation chance multiplier. */
  readonly mutation: number;
  /** Rebirth that unlocks it. */
  readonly rebirth: number;
  /** Cost per planting, as a share of the seed's base value (at least $5). */
  readonly costShare: number;
  readonly color: number;
}

/** The original's fertilizer table (Basic 1.5x/+25%, Advanced 2.5x/+50%, Elite 4x/+75%, Rainbow 6x/+100%). */
export const FERTILIZERS: readonly FertilizerDef[] = [
  { id: 1, name: 'Basic Fertilizer', crash: 1.5, speed: 0.25, mutation: 1.1, rebirth: 1, costShare: 0.25, color: 0x8bc34a },
  { id: 2, name: 'Advanced Fertilizer', crash: 2.5, speed: 0.5, mutation: 1.25, rebirth: 3, costShare: 0.5, color: 0x2196f3 },
  { id: 3, name: 'Elite Fertilizer', crash: 4, speed: 0.75, mutation: 1.5, rebirth: 5, costShare: 1, color: 0x9c27b0 },
  { id: 4, name: 'Rainbow Fertilizer', crash: 6, speed: 1, mutation: 2, rebirth: 7, costShare: 2, color: 0xff4fd8 },
];

export const fertilizerById = (id: number): FertilizerDef | undefined => FERTILIZERS.find((f) => f.id === id);

export const fertilizerCost = (fert: FertilizerDef, seed: SeedDef): number => Math.max(5, Math.ceil(seed.base * fert.costShare));

// ----------------------------------------------------------------- rebirth

export type Unlock =
  | 'fertilizer'
  | 'plot'
  | 'index'
  | 'pets'
  | 'farmers'
  | 'fall'
  | 'furniture'
  | 'stands'
  | 'wheel'
  | 'gear'
  | 'worms'
  | 'garden';

export interface RebirthDef {
  readonly level: number;
  /** Cash needed (and spent) to reach this level. */
  readonly cost: number;
  /** What it unlocks, for the panel. */
  readonly unlocks: readonly { readonly key: Unlock; readonly name: string }[];
}

/**
 * Rebirth costs: Rebirth 1 is $500 (the video), Rebirth 2 $250K (the guides'
 * screenshot), Rebirth 6 $100Qi and Rebirth 7 $100Sp (Update 4.0/4.2 notes).
 * 3-5 are not published and sit between, tracking the seed ladder. Unlock
 * levels follow the video's locked stalls: Pets, Farmers Market and Fall
 * Harvest at 2, Furniture and Market Stands at 4, the Lucky Wheel at 5, the
 * Gear Shop at 6, Worms at 7; fertilizers per the fertilizer table.
 */
export const REBIRTHS: readonly RebirthDef[] = [
  { level: 1, cost: 500, unlocks: [{ key: 'fertilizer', name: 'Basic Fertilizer' }, { key: 'plot', name: 'Plot Upgrade' }, { key: 'index', name: 'Index' }] },
  { level: 2, cost: 250_000, unlocks: [{ key: 'pets', name: 'Pet Shop' }, { key: 'farmers', name: 'Farmers Market' }, { key: 'fall', name: 'Fall Harvest' }] },
  { level: 3, cost: 1e9, unlocks: [{ key: 'fertilizer', name: 'Advanced Fertilizer' }, { key: 'plot', name: 'Plot Upgrade' }, { key: 'garden', name: 'Bigger Garden' }] },
  { level: 4, cost: 5e12, unlocks: [{ key: 'furniture', name: 'Furniture' }, { key: 'stands', name: 'Market Stands' }, { key: 'garden', name: 'Bigger Garden' }] },
  { level: 5, cost: 1e16, unlocks: [{ key: 'fertilizer', name: 'Elite Fertilizer' }, { key: 'wheel', name: 'Lucky Wheel' }, { key: 'plot', name: 'Plot Upgrade' }] },
  { level: 6, cost: 1e20, unlocks: [{ key: 'gear', name: 'Gear Shop' }, { key: 'garden', name: 'Bigger Garden' }] },
  { level: 7, cost: 1e26, unlocks: [{ key: 'fertilizer', name: 'Rainbow Fertilizer' }, { key: 'worms', name: 'Worms' }, { key: 'plot', name: 'Plot Upgrade' }] },
];

export const MAX_REBIRTH = REBIRTHS.length;

/** The next rebirth for a player at `rebirths`, or null at the top. */
export const nextRebirth = (rebirths: number): RebirthDef | null => REBIRTHS[rebirths] ?? null;

/** The rebirth level an unlock first appears at. */
export const unlockLevel = (key: Unlock): number => REBIRTHS.find((r) => r.unlocks.some((u) => u.key === key))?.level ?? 0;

export const unlocked = (rebirths: number, key: Unlock): boolean => {
  const level = unlockLevel(key);
  return level === 0 || rebirths >= level;
};

/** Saplings growing at once on the plot: one, plus one per Plot Upgrade reached. */
export const plotCapacity = (rebirths: number): number =>
  1 + REBIRTHS.filter((r) => r.level <= rebirths && r.unlocks.some((u) => u.key === 'plot')).length;

/** Garden spots for fruit trees: three, plus one per Bigger Garden reached, plus one per Plot Upgrade. */
export const gardenCapacity = (rebirths: number): number =>
  3 + REBIRTHS.filter((r) => r.level <= rebirths && r.unlocks.some((u) => u.key === 'garden')).length * 1 + Math.min(1, rebirths);

export const MAX_PLOT_CAPACITY = plotCapacity(MAX_REBIRTH);
export const MAX_GARDEN_CAPACITY = gardenCapacity(MAX_REBIRTH);

// ------------------------------------------------------------------- purse

export const STARTING_CASH = 10;
export const MAX_CASH = 1e300;
export const MAX_ITEMS = 400;
