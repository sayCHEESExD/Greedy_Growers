import type { Aabb } from '../types/math.js';
import { MAX_GARDEN_CAPACITY } from './economy.js';
import type { Unlock } from './economy.js';

/**
 * THE MAP, as the reference video lays it out: an orange studded baseplate cut
 * by a straight blue RIVER that carries seeds from its source (a waterfall
 * under a giant autumn tree, west) to a grate in the cliffs (east). North of
 * the river is the MARKET - the Sell stand by the water, the Fall Harvest
 * stand, a row of stalls each locked behind a rebirth, the glowing Greedy Tree
 * at the back. South of it, one row of seven big PLOTS facing the river.
 *
 * +X east, +Z north. Yaw 0 faces +Z (north), PI faces the river from the market.
 * Server collision and client scene read the same numbers.
 */

export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export const aabb = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): Aabb => ({ minX, maxX, minY, maxY, minZ, maxZ });

/** The playable rectangle; walls stand just outside it. */
export const BOUNDS = { minX: -186, maxX: 186, minZ: -104, maxZ: 150 } as const;

// ------------------------------------------------------------------- river

/**
 * The river: a shallow channel players can wade, seeds riding its middle
 * lanes. A seed is at `startX + speed * age` along it.
 */
export const RIVER = {
  z: 0,
  half: 7,
  /** Visual bed depth below the baseplate. */
  depth: 0.7,
  minX: -152,
  maxX: 172,
  startX: -146,
  endX: 168,
  /** World units per second. */
  speed: 4.2,
  /** Seed lanes, offsets from the river's middle. */
  lanes: [-3.6, -1.2, 1.2, 3.6] as readonly number[],
} as const;

/** Seconds a seed takes to float the length of the river. */
export const RIVER_SECONDS = (RIVER.endX - RIVER.startX) / RIVER.speed;

export const riverSeedX = (spawnAt: number, now: number): number => RIVER.startX + (Math.max(0, now - spawnAt) / 1000) * RIVER.speed;

/** The guaranteed-spawn timer board by the river's source. */
export const GUARANTEE_SIGN = { x: -124, z: 15 } as const;

/** Where the river comes from: the waterfall cliff and the giant autumn tree. */
export const SOURCE = { x: -168, z: 0 } as const;

// ------------------------------------------------------------------- plots

/** One plot per player: a room holds seven (`MAX_PLAYERS_PER_ROOM`). */
export const PLOT_COUNT = 7;

/** Plot middles: the soil bed's centre. */
export const PLOTS: readonly { readonly slot: number; readonly x: number; readonly z: number }[] = (() => {
  // One row along the south bank, as in the reference: each bed stands alone on
  // the sand with a lane between neighbours.
  const out: { slot: number; x: number; z: number }[] = [];
  for (let i = 0; i < PLOT_COUNT; i += 1) out.push({ slot: i, x: (i - (PLOT_COUNT - 1) / 2) * 50, z: -52 });
  return out;
})();

/**
 * One plot, in its LOCAL frame (world minus the plot middle, no rotation):
 * the soil bed where saplings grow, the garden row behind it where harvested
 * trees bear fruit, the owner's sign at the front corner, a lawn round it
 * for furniture.
 */
export const PLOT = {
  /** A 32 x 32 bed: room for a full orchard of grown trees (they reach ~25 units across). */
  soilHalf: 16,
  soilTop: 0.4,
  lawnHalfX: 22,
  lawnFront: 21,
  lawnBack: -32,
  gardenZ: -25,
  sign: { x: 19.5, z: 18.5 },
  stand: { x: -19.5, z: 18.5 },
  /** Saplings must stand this far apart. */
  spacing: 4.5,
} as const;

/** Garden spot `i` in plot-local coordinates. */
export const gardenSpot = (i: number): { x: number; z: number } => {
  const n = MAX_GARDEN_CAPACITY;
  const step = (PLOT.lawnHalfX * 2 - 6) / Math.max(1, n - 1);
  return { x: -PLOT.lawnHalfX + 3 + i * step, z: PLOT.gardenZ };
};

export const plotToWorld = (slot: number, x: number, z: number): { x: number; z: number } => {
  const p = PLOTS[slot]!;
  return { x: p.x + x, z: p.z + z };
};

export const plotToLocal = (slot: number, x: number, z: number): { x: number; z: number } => {
  const p = PLOTS[slot]!;
  return { x: x - p.x, z: z - p.z };
};

export const insideSoil = (lx: number, lz: number, pad = 0): boolean =>
  Math.abs(lx) <= PLOT.soilHalf - pad && Math.abs(lz) <= PLOT.soilHalf - pad;

export const insideLawn = (lx: number, lz: number, pad = 0): boolean =>
  Math.abs(lx) <= PLOT.lawnHalfX + pad && lz <= PLOT.lawnFront + pad && lz >= PLOT.lawnBack - pad;

/** Where the PLOT button puts you: on the path in front of your bed, facing it. */
export const plotEntrance = (slot: number): Placement => {
  const p = PLOTS[slot]!;
  return { x: p.x, y: 0, z: p.z + PLOT.lawnFront + 3, yaw: Math.PI };
};

/** Which plot a world point stands on (its lawn), or -1. */
export const plotAt = (x: number, z: number, pad = 0): number => {
  for (const p of PLOTS) if (insideLawn(x - p.x, z - p.z, pad)) return p.slot;
  return -1;
};

// ------------------------------------------------------------------ market

export type StallId = 'sell' | 'fall' | 'pets' | 'farmers' | 'wheel' | 'furniture' | 'stands' | 'gear' | 'worms';

export interface StallSpot {
  readonly id: StallId;
  readonly title: string;
  readonly keeper: string;
  readonly x: number;
  readonly z: number;
  /** The way the counter faces. */
  readonly yaw: number;
  readonly unlock: Unlock | null;
  /** Half width (x) and depth (z) of the solid footprint. */
  readonly hx: number;
  readonly hz: number;
}

const STALL_Z = 58;

export const STALLS: readonly StallSpot[] = [
  { id: 'sell', title: 'SELL', keeper: 'Buck', x: 26, z: 20, yaw: Math.PI, unlock: null, hx: 8, hz: 4.5 },
  { id: 'fall', title: 'FALL HARVEST', keeper: 'Farmer Hank', x: -50, z: 26, yaw: Math.PI, unlock: 'fall', hx: 6.5, hz: 4.5 },
  // The stall row, west to east as the reference walks it.
  { id: 'wheel', title: 'LUCKY WHEEL', keeper: 'Mr. Spins', x: -102, z: STALL_Z, yaw: Math.PI, unlock: 'wheel', hx: 6, hz: 3.5 },
  { id: 'pets', title: 'PETS', keeper: 'Penny', x: -70, z: STALL_Z, yaw: Math.PI, unlock: 'pets', hx: 9, hz: 4.5 },
  { id: 'farmers', title: 'FARMERS MARKET', keeper: 'Martha', x: -36, z: STALL_Z, yaw: Math.PI, unlock: 'farmers', hx: 9, hz: 4.5 },
  { id: 'furniture', title: 'FURNITURE', keeper: 'Woody', x: -2, z: STALL_Z, yaw: Math.PI, unlock: 'furniture', hx: 9, hz: 4.5 },
  { id: 'stands', title: 'MARKET STANDS', keeper: 'Dee', x: 32, z: STALL_Z, yaw: Math.PI, unlock: 'stands', hx: 9, hz: 4.5 },
  { id: 'gear', title: 'GEAR SHOP', keeper: 'Gus', x: 66, z: STALL_Z, yaw: Math.PI, unlock: 'gear', hx: 9, hz: 4.5 },
  { id: 'worms', title: 'WORMS', keeper: 'Wiggles', x: 100, z: STALL_Z, yaw: Math.PI, unlock: 'worms', hx: 9, hz: 4.5 },
];

export const stallById = (id: StallId): StallSpot => STALLS.find((s) => s.id === id)!;

/** Where a keeper is talked to from: in front of the counter. */
export const stallFront = (stall: StallSpot, distance = 7): { x: number; z: number } => ({
  x: stall.x + Math.sin(stall.yaw) * (stall.hz + distance - 4),
  z: stall.z + Math.cos(stall.yaw) * (stall.hz + distance - 4),
});

/** How close (to the counter's front) a keeper serves you. */
export const SERVE_RADIUS = 12;

/** The glowing Greedy Tree at the back of the market. */
export const GREEDY_TREE = { x: 0, z: 108, trunk: 5 } as const;

/** The leaderboards stand east of the Greedy Tree. */
export const BOARDS = { x: 56, z: 106 } as const;

/** The fenced palm and blossom garden along the north bank, behind the Sell stand (scenery). */
export const ORCHARD = { minX: 52, maxX: 168, minZ: 16, maxZ: 42 } as const;

// ------------------------------------------------------------ teleports

export const SPAWN: Placement = { x: 0, y: 0, z: 26, yaw: Math.PI };

export const PLACES = {
  spawn: SPAWN,
  market: { x: -2, y: 0, z: 42, yaw: 0 },
  sell: { x: 26, y: 0, z: 12, yaw: 0 },
} as const satisfies Record<string, Placement>;

export type PlaceId = keyof typeof PLACES;

// ---------------------------------------------------------------- solids

/** Every static solid: stall counters, the Greedy Tree, the source cliff, the boundary walls. */
export const buildStaticSolids = (): Aabb[] => {
  const out: Aabb[] = [];
  for (const s of STALLS) out.push(aabb(s.x - s.hx, s.x + s.hx, 0, 7, s.z - s.hz, s.z + s.hz));
  out.push(aabb(GREEDY_TREE.x - GREEDY_TREE.trunk, GREEDY_TREE.x + GREEDY_TREE.trunk, 0, 40, GREEDY_TREE.z - GREEDY_TREE.trunk, GREEDY_TREE.z + GREEDY_TREE.trunk));
  out.push(aabb(BOARDS.x - 9, BOARDS.x + 9, 0, 14, BOARDS.z - 1, BOARDS.z + 1));
  out.push(aabb(GUARANTEE_SIGN.x - 6, GUARANTEE_SIGN.x + 6, 0, 3, GUARANTEE_SIGN.z - 0.6, GUARANTEE_SIGN.z + 0.6));
  // The garden's fence: bank side, back and east; its gate is the west side, by the Sell stand.
  const o = ORCHARD;
  out.push(aabb(o.minX, o.maxX, 0, 2.2, o.minZ - 0.4, o.minZ + 0.4));
  out.push(aabb(o.minX, o.maxX, 0, 2.2, o.maxZ - 0.4, o.maxZ + 0.4));
  out.push(aabb(o.minX - 0.4, o.minX + 0.4, 0, 2.2, o.minZ + 12, o.maxZ));
  // The waterfall cliff the river springs from, and the cliff it drains into.
  out.push(aabb(BOUNDS.minX, RIVER.minX, 0, 26, -30, 30));
  out.push(aabb(RIVER.maxX, BOUNDS.maxX, 0, 20, -22, 22));
  // Boundary walls (beige, studded, like the stadium in the reference) all round.
  const t = 4;
  const h = 18;
  const b = BOUNDS;
  out.push(aabb(b.minX - t, b.maxX + t, 0, h, b.maxZ, b.maxZ + t));
  out.push(aabb(b.minX - t, b.maxX + t, 0, h, b.minZ - t, b.minZ));
  out.push(aabb(b.minX - t, b.minX, 0, h, b.minZ, b.maxZ));
  out.push(aabb(b.maxX, b.maxX + t, 0, h, b.minZ, b.maxZ));
  return out;
};

export const worldBounds = (): Aabb => aabb(BOUNDS.minX, BOUNDS.maxX, -10, 200, BOUNDS.minZ, BOUNDS.maxZ);
