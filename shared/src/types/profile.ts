/**
 * WHAT A PLAYER OWNS, as the server keeps it and tells the owner. Plots,
 * river seeds and where everyone stands are public (the Colyseus schema); a
 * player's cash and inventory travel to their own client only, as `Self`.
 */

/** A stack of seeds of one kind and one set of mutations. */
export interface SeedStack {
  readonly seed: number;
  readonly mut: number;
  readonly count: number;
}

/** A harvested tree, carried: sold, handed in, or planted in the garden. */
export interface TreeItem {
  readonly uid: number;
  readonly seed: number;
  /** Its multiplier when picked (or at the strike, when dead). */
  readonly mult: number;
  readonly mut: number;
  readonly dead: boolean;
  readonly fav: boolean;
}

/** A fruit from a garden tree or a pet's foraging. */
export interface FruitItem {
  readonly uid: number;
  readonly seed: number;
  readonly mut: number;
  /** The tree's size it grew on (fruit value grows with it). */
  readonly mult: number;
  readonly fav: boolean;
}

export interface PetItem {
  readonly uid: number;
  readonly pet: number;
}

/** A counted stack: eggs by egg id, gear by gear id, worms by worm id, furniture by id. */
export interface Stack {
  readonly id: number;
  readonly count: number;
}

/**
 * WHAT A HAND CAN HOLD, as a reference string:
 *
 *   ''              empty-handed
 *   'seed:3:0'      Apple Seeds, no mutation
 *   'tree:12'       a harvested tree, by uid
 *   'fruit:40'      a fruit, by uid
 *   'gear:1'        a Prediction Potion
 */
export type HeldRef = string;

export interface SelfState {
  readonly cash: number;
  readonly tickets: number;
  readonly tokens: number;
  readonly rebirths: number;
  readonly totalEarned: number;
  readonly bestTree: number;
  readonly playSeconds: number;
  readonly likes: number;
  readonly tutorial: number;

  readonly seeds: readonly SeedStack[];
  readonly trees: readonly TreeItem[];
  readonly fruits: readonly FruitItem[];
  readonly pets: readonly PetItem[];
  readonly equippedPets: readonly number[];
  readonly eggs: readonly Stack[];
  readonly gear: readonly Stack[];
  readonly worms: readonly Stack[];
  readonly furniture: readonly Stack[];
  readonly equipped: HeldRef;

  /** The fertilizer and worm the next planting uses (0 = none). */
  readonly fertilizer: number;
  readonly worm: number;

  /** Index: seeds by id bit, mutations by bit; and what has been claimed. */
  readonly discoveredSeeds: number;
  readonly discoveredMutations: number;
  readonly claimedSeeds: number;
  readonly claimedMutations: number;

  /** Today's request boards: which were handed in. */
  readonly requestDay: number;
  readonly farmersDone: readonly boolean[];
  readonly fallDone: readonly boolean[];

  readonly codes: readonly string[];
  readonly likedSlots: readonly number[];
  /** Prediction Potion readings: tree id -> a multiplier it will safely reach. */
  readonly predictions: Readonly<Record<number, number>>;
  /** The next sale pays double (a rewarded ad was watched). */
  readonly saleBoost: boolean;
  /** Server clock (ms) from which another "2x next sale" ad may be watched. */
  readonly adSaleReadyAt: number;
}

/** Tutorial steps, in the reference's words. */
export const TUTORIAL = {
  buy: 0,
  plant: 1,
  harvest: 2,
  sell: 3,
  done: 4,
} as const;

export const TUTORIAL_TEXT: readonly string[] = [
  'Buy an Oak Seed from the river',
  'Plant the seed',
  'Be careful, lightning can strike at any moment!',
  'Sell the tree',
];
