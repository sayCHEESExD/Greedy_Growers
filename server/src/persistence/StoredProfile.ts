import {
  ALL_MUTATION_BITS,
  MAX_EQUIPPED_PETS,
  MAX_FURNITURE,
  MAX_GARDEN_CAPACITY,
  MAX_ITEMS,
  MAX_MULT,
  MAX_PETS,
  MAX_REBIRTH,
  MIN_CRASH,
  STARTING_CASH,
  TUTORIAL,
  eggById,
  fertilizerById,
  furnitureById,
  gearById,
  petById,
  seedById,
  wormById,
  type FruitItem,
  type PetItem,
  type SeedStack,
  type Stack,
  type TreeItem,
} from '@greedy/shared';

/**
 * THE SAVED FARMER: everything a session is rebuilt from.
 *
 * Saplings keep ABSOLUTE wall-clock timestamps and their hidden CRASH POINT,
 * so a plot keeps growing (and can be struck) while its owner is away, and a
 * rejoin never re-rolls the lightning. Positions are PLOT-LOCAL, so a
 * returning player's plot is the same whichever of the fifteen they are given.
 */
export interface SaplingRecord {
  seed: number;
  mut: number;
  x: number;
  z: number;
  plantedAt: number;
  /** Multiplier per second, every bonus included. */
  rate: number;
  /** Multiplier added on top of growth (Miracle Grow). */
  boost: number;
  /** The hidden crash point. NEVER sent to a client. */
  crash: number;
  fert: number;
  dead: boolean;
  /** Multiplier at the strike. */
  deadMult: number;
  deadAt: number;
  /** Mutations this sapling has already rolled for, by weather start time. */
  rolledAt: number;
  /** A Prediction Potion reading (0 = none). */
  predicted: number;
}

export interface GardenTreeRecord {
  spot: number;
  seed: number;
  mut: number;
  mult: number;
  /** Mutation bits of each fruit hanging on it. */
  fruits: number[];
  /** Wall clock the next fruit appears. */
  nextAt: number;
}

export interface FurnitureRecord {
  kind: number;
  x: number;
  z: number;
  rot: number;
}

export interface StandRecord {
  slot: number;
  seed: number;
  mut: number;
  mult: number;
  price: number;
}

export interface PlotRecord {
  saplings: SaplingRecord[];
  garden: GardenTreeRecord[];
  furniture: FurnitureRecord[];
  stand: StandRecord[];
}

export interface ProgressFields {
  cash: number;
  tickets: number;
  tokens: number;
  rebirths: number;
  totalEarned: number;
  totalHarvested: number;
  totalPlanted: number;
  totalStruck: number;
  bestTree: number;
  playSeconds: number;
  likes: number;
  tutorial: number;

  seeds: SeedStack[];
  trees: TreeItem[];
  fruits: FruitItem[];
  pets: PetItem[];
  equippedPets: number[];
  eggs: Stack[];
  gear: Stack[];
  worms: Stack[];
  furniture: Stack[];
  nextUid: number;
  equipped: string;
  fertilizer: number;
  worm: number;

  plot: PlotRecord;

  discoveredSeeds: number;
  discoveredMutations: number;
  claimedSeeds: number;
  claimedMutations: number;

  requestDay: number;
  farmersDone: boolean[];
  fallDone: boolean[];

  codes: string[];
  likedDay: number;
  likedKeys: string[];
  /** A watched rewarded ad's "2x next sale", not yet spent. */
  saleBoost: boolean;
  /** Wall clock (ms) the last "2x next sale" was granted, for its cooldown. */
  adSaleAt: number;
}

/** What one save writes. */
export interface ProfileFields extends ProgressFields {
  /** The portal's display name and portrait as last seen. Cleared when empty. */
  displayName: string;
  avatarUrl: string;
  /** Wall clock of the save. */
  updatedAt: number;
}

/**
 * The first-login migration's bookkeeping: an ACCOUNT profile created from a
 * browser's guest progress carries `migratedFrom`; that GUEST profile is then
 * retired with `migratedTo`, `migratedAt` and a recovery `migratedSnapshot`.
 */
export interface MigrationFields {
  migratedFrom?: string;
  migratedTo?: string;
  migratedAt?: number;
  migratedSnapshot?: ProgressFields;
}

/** A profile as READ from storage, keeping any field another build wrote. */
export type StoredProfile = ProfileFields & MigrationFields & { [field: string]: unknown };

/** Optional string fields a save may CLEAR. The only fields ever $unset. */
export const CLEARABLE_FIELDS = ['displayName', 'avatarUrl'] as const;

// ------------------------------------------------------------- coercion

const numeric = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

const signed = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

const int = (value: unknown, fallback = 0): number => Math.floor(numeric(value, fallback));

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const list = (value: unknown, limit: number): unknown[] => (Array.isArray(value) ? value.slice(0, limit) : []);

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});

const mutBits = (value: unknown): number => int(value) & ALL_MUTATION_BITS;

const mult = (value: unknown): number => Math.min(MAX_MULT, numeric(value));

/** Stacks keyed by id, merged, only ids that exist, counts positive. */
const stacks = (value: unknown, exists: (id: number) => boolean, limit = 100): Stack[] => {
  const byId = new Map<number, number>();
  for (const entry of list(value, limit)) {
    const r = record(entry);
    const id = int(r['id']);
    const count = int(r['count']);
    if (id <= 0 || count <= 0 || !exists(id)) continue;
    byId.set(id, Math.min(1_000_000, (byId.get(id) ?? 0) + count));
  }
  return [...byId.entries()].map(([id, count]) => ({ id, count }));
};

const seedStacks = (value: unknown): SeedStack[] => {
  const byKey = new Map<string, SeedStack>();
  for (const entry of list(value, 200)) {
    const r = record(entry);
    const seed = int(r['seed']);
    const mut = mutBits(r['mut']);
    const count = int(r['count']);
    if (!seedById(seed) || count <= 0) continue;
    const key = `${seed}:${mut}`;
    const before = byKey.get(key)?.count ?? 0;
    byKey.set(key, { seed, mut, count: Math.min(1_000_000, before + count) });
  }
  return [...byKey.values()];
};

const uniqueUids = <T extends { uid: number }>(items: T[]): T[] => {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (item.uid <= 0 || seen.has(item.uid)) return false;
    seen.add(item.uid);
    return true;
  });
};

const treeItems = (value: unknown): TreeItem[] =>
  uniqueUids(
    list(value, MAX_ITEMS)
      .map((entry) => record(entry))
      .filter((r) => seedById(int(r['seed'])) !== undefined)
      .map((r) => ({ uid: int(r['uid']), seed: int(r['seed']), mult: mult(r['mult']), mut: mutBits(r['mut']), dead: r['dead'] === true, fav: r['fav'] === true })),
  );

const fruitItems = (value: unknown): FruitItem[] =>
  uniqueUids(
    list(value, MAX_ITEMS)
      .map((entry) => record(entry))
      .filter((r) => seedById(int(r['seed'])) !== undefined)
      .map((r) => ({ uid: int(r['uid']), seed: int(r['seed']), mut: mutBits(r['mut']), mult: Math.max(1, mult(r['mult'])), fav: r['fav'] === true })),
  );

const petItems = (value: unknown): PetItem[] =>
  uniqueUids(
    list(value, MAX_PETS)
      .map((entry) => record(entry))
      .filter((r) => petById(int(r['pet'])) !== undefined)
      .map((r) => ({ uid: int(r['uid']), pet: int(r['pet']) })),
  );

const saplings = (value: unknown): SaplingRecord[] => {
  const out: SaplingRecord[] = [];
  for (const entry of list(value, 12)) {
    const r = record(entry);
    const seed = int(r['seed']);
    if (!seedById(seed)) continue;
    out.push({
      seed,
      mut: mutBits(r['mut']),
      x: signed(r['x']),
      z: signed(r['z']),
      plantedAt: numeric(r['plantedAt']),
      rate: Math.min(10, numeric(r['rate'], 0.6)),
      boost: mult(r['boost']),
      crash: Math.max(MIN_CRASH, mult(r['crash'])),
      fert: fertilizerById(int(r['fert'])) ? int(r['fert']) : 0,
      dead: r['dead'] === true,
      deadMult: mult(r['deadMult']),
      deadAt: numeric(r['deadAt']),
      rolledAt: numeric(r['rolledAt']),
      predicted: mult(r['predicted']),
    });
  }
  return out;
};

const gardenTrees = (value: unknown): GardenTreeRecord[] => {
  const out: GardenTreeRecord[] = [];
  const spots = new Set<number>();
  for (const entry of list(value, MAX_GARDEN_CAPACITY)) {
    const r = record(entry);
    const seed = int(r['seed']);
    const spot = int(r['spot']);
    if (!seedById(seed) || spot >= MAX_GARDEN_CAPACITY || spots.has(spot)) continue;
    spots.add(spot);
    out.push({ spot, seed, mut: mutBits(r['mut']), mult: Math.max(1, mult(r['mult'])), fruits: list(r['fruits'], 3).map(mutBits), nextAt: numeric(r['nextAt']) });
  }
  return out;
};

const furnitureRecords = (value: unknown): FurnitureRecord[] =>
  list(value, MAX_FURNITURE)
    .map((entry) => record(entry))
    .filter((r) => furnitureById(int(r['kind'])) !== undefined)
    .map((r) => ({ kind: int(r['kind']), x: signed(r['x']), z: signed(r['z']), rot: int(r['rot']) & 3 }));

const standRecords = (value: unknown): StandRecord[] =>
  list(value, 3)
    .map((entry) => record(entry))
    .filter((r) => seedById(int(r['seed'])) !== undefined)
    .map((r) => ({ slot: Math.min(2, int(r['slot'])), seed: int(r['seed']), mut: mutBits(r['mut']), mult: Math.max(1, mult(r['mult'])), price: Math.max(1, numeric(r['price'], 1)) }));

const bools = (value: unknown, n: number): boolean[] => {
  const out = list(value, n).map((v) => v === true);
  while (out.length < n) out.push(false);
  return out;
};

export const emptyPlot = (): PlotRecord => ({ saplings: [], garden: [], furniture: [], stand: [] });

export const emptyProgress = (): ProgressFields => ({
  cash: STARTING_CASH,
  tickets: 0,
  tokens: 0,
  rebirths: 0,
  totalEarned: 0,
  totalHarvested: 0,
  totalPlanted: 0,
  totalStruck: 0,
  bestTree: 0,
  playSeconds: 0,
  likes: 0,
  tutorial: TUTORIAL.buy,
  seeds: [],
  trees: [],
  fruits: [],
  pets: [],
  equippedPets: [],
  eggs: [],
  gear: [],
  worms: [],
  furniture: [],
  nextUid: 1,
  equipped: '',
  fertilizer: 0,
  worm: 0,
  plot: emptyPlot(),
  discoveredSeeds: 0,
  discoveredMutations: 0,
  claimedSeeds: 0,
  claimedMutations: 0,
  requestDay: 0,
  farmersDone: [false, false, false],
  fallDone: [false, false, false],
  codes: [],
  likedDay: 0,
  likedKeys: [],
  saleBoost: false,
  adSaleAt: 0,
});

/** Just the progression of a profile, coerced. A missing field is the fresh player's. */
export const progressOf = (raw: Partial<ProgressFields> | Record<string, unknown>): ProgressFields => {
  const source = record(raw);
  const fresh = emptyProgress();
  const plot = record(source['plot']);
  const trees = treeItems(source['trees']);
  const fruits = fruitItems(source['fruits']);
  const pets = petItems(source['pets']);
  let nextUid = int(source['nextUid'], 1);
  for (const item of [...trees, ...fruits, ...pets]) if (item.uid >= nextUid) nextUid = item.uid + 1;
  const petUids = new Set(pets.map((p) => p.uid));
  return {
    cash: 'cash' in source ? numeric(source['cash']) : fresh.cash,
    tickets: int(source['tickets']),
    tokens: int(source['tokens']),
    rebirths: Math.min(MAX_REBIRTH, int(source['rebirths'])),
    totalEarned: numeric(source['totalEarned']),
    totalHarvested: int(source['totalHarvested']),
    totalPlanted: int(source['totalPlanted']),
    totalStruck: int(source['totalStruck']),
    bestTree: numeric(source['bestTree']),
    playSeconds: numeric(source['playSeconds']),
    likes: int(source['likes']),
    tutorial: Math.min(TUTORIAL.done, int(source['tutorial'], fresh.tutorial)),
    seeds: seedStacks(source['seeds']),
    trees,
    fruits,
    pets,
    equippedPets: [...new Set(list(source['equippedPets'], MAX_EQUIPPED_PETS).map((v) => int(v)))].filter((uid) => petUids.has(uid)),
    eggs: stacks(source['eggs'], (id) => eggById(id) !== undefined),
    gear: stacks(source['gear'], (id) => gearById(id) !== undefined),
    worms: stacks(source['worms'], (id) => wormById(id) !== undefined),
    furniture: stacks(source['furniture'], (id) => furnitureById(id) !== undefined),
    nextUid: Math.max(1, nextUid),
    equipped: text(source['equipped']).slice(0, 32),
    fertilizer: fertilizerById(int(source['fertilizer'])) ? int(source['fertilizer']) : 0,
    worm: wormById(int(source['worm'])) ? int(source['worm']) : 0,
    plot: {
      saplings: saplings(plot['saplings']),
      garden: gardenTrees(plot['garden']),
      furniture: furnitureRecords(plot['furniture']),
      stand: standRecords(plot['stand']),
    },
    discoveredSeeds: int(source['discoveredSeeds']) >>> 0,
    discoveredMutations: mutBits(source['discoveredMutations']),
    claimedSeeds: int(source['claimedSeeds']) >>> 0,
    claimedMutations: mutBits(source['claimedMutations']),
    requestDay: int(source['requestDay']),
    farmersDone: bools(source['farmersDone'], 3),
    fallDone: bools(source['fallDone'], 3),
    codes: list(source['codes'], 50).filter((c): c is string => typeof c === 'string').map((c) => c.slice(0, 24)),
    likedDay: int(source['likedDay']),
    likedKeys: list(source['likedKeys'], 100).filter((key): key is string => typeof key === 'string').map((key) => key.slice(0, 96)),
    saleBoost: source['saleBoost'] === true,
    adSaleAt: int(source['adSaleAt']),
  };
};

/** Coerce whatever storage held into a profile, KEEPING every unknown field. */
export const coerceProfile = (raw: unknown): StoredProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const profile: StoredProfile = {
    ...source,
    ...progressOf(source),
    displayName: text(source['displayName']),
    avatarUrl: text(source['avatarUrl']),
    updatedAt: numeric(source['updatedAt']),
  };
  if (typeof source['migratedFrom'] !== 'string') delete profile.migratedFrom;
  if (typeof source['migratedTo'] !== 'string') delete profile.migratedTo;
  if (typeof source['migratedAt'] !== 'number') delete profile.migratedAt;
  if (source['migratedSnapshot'] && typeof source['migratedSnapshot'] === 'object') {
    profile.migratedSnapshot = progressOf(source['migratedSnapshot'] as Record<string, unknown>);
  } else {
    delete profile.migratedSnapshot;
  }
  return profile;
};

/** Whether a profile holds anything worth carrying into an account. */
export const hasProgress = (p: ProgressFields): boolean =>
  p.totalEarned > 0 ||
  p.totalPlanted > 0 ||
  p.rebirths > 0 ||
  p.tickets > 0 ||
  p.cash !== STARTING_CASH ||
  p.seeds.length > 0 ||
  p.trees.length > 0 ||
  p.fruits.length > 0 ||
  p.pets.length > 0 ||
  p.plot.saplings.length > 0 ||
  p.plot.garden.length > 0;
