import { hashInts, rng, weightedPick } from '../util/random.js';
import { mutationBit, type MutationKey } from './mutations.js';
import { PLOT } from './map.js';
import { RARITY_ORDER, RIVER_SEEDS, type Rarity } from './seeds.js';

// ===================================================================== pets

/**
 * PETS. Hatched from eggs bought with Tickets at the Pet Shop (Rebirth 2);
 * three follow you at once. The eggs, their prices and their pets are the
 * original's (Common 100 ... Mythic 2,000 Tickets; the Majestic Egg's odds
 * are from the reference video's Shop). The guides describe each passive but
 * publish no numbers; the numbers here are this game's.
 */
export type PetEffect =
  | { kind: 'forage'; rarity: Rarity; seconds: number }
  | { kind: 'freeSeed'; rarities: readonly Rarity[]; seconds: number }
  | { kind: 'findEgg'; seconds: number }
  | { kind: 'mutationLuck'; factor: number }
  | { kind: 'growth'; bonus: number }
  | { kind: 'hatchLuck'; factor: number }
  | { kind: 'plantMutation'; mutation: MutationKey; chance: number }
  | { kind: 'fertilizerBoost'; factor: number }
  | { kind: 'sell'; bonus: number }
  | { kind: 'lightningBlock'; chance: number }
  | { kind: 'crash'; factor: number }
  | { kind: 'petTimers'; factor: number }
  | { kind: 'petPower'; factor: number };

export interface PetDef {
  readonly id: number;
  readonly name: string;
  readonly egg: number;
  readonly chance: number;
  readonly effect: PetEffect;
  readonly blurb: string;
  /** Body, belly/accent and detail colours for the blocky model. */
  readonly body: number;
  readonly accent: number;
  readonly detail: number;
  /** Body plan the model builder uses. */
  readonly shape: 'rodent' | 'bunny' | 'dog' | 'cat' | 'bird' | 'bug' | 'cow' | 'pig' | 'frog' | 'turtle' | 'monkey' | 'gator' | 'tall' | 'horse';
}

export interface EggDef {
  readonly id: number;
  readonly name: string;
  readonly tickets: number;
  readonly color: number;
  readonly spots: number;
  /** Only from the Shop, the Wheel or a Magpie. */
  readonly special?: boolean;
}

export const EGGS: readonly EggDef[] = [
  { id: 1, name: 'Common Egg', tickets: 100, color: 0xf2e6c8, spots: 0xc9b98f },
  { id: 2, name: 'Rare Egg', tickets: 200, color: 0x7fc4ff, spots: 0x3a86d8 },
  { id: 3, name: 'Epic Egg', tickets: 500, color: 0xd38cff, spots: 0x8a3fd6 },
  { id: 4, name: 'Legendary Egg', tickets: 1000, color: 0xff6a5a, spots: 0xb32a1e },
  { id: 5, name: 'Mythic Egg', tickets: 2000, color: 0xffe14a, spots: 0xd1a10f },
  { id: 6, name: 'Majestic Egg', tickets: 0, color: 0x5ad8ff, spots: 0xff7ad9, special: true },
];

export const eggById = (id: number): EggDef | undefined => EGGS.find((e) => e.id === id);

const pet = (
  id: number,
  name: string,
  egg: number,
  chance: number,
  shape: PetDef['shape'],
  colors: [number, number, number],
  effect: PetEffect,
  blurb: string,
): PetDef => ({ id, name, egg, chance, shape, body: colors[0], accent: colors[1], detail: colors[2], effect, blurb });

export const PETS: readonly PetDef[] = [
  pet(1, 'Squirrel', 1, 50, 'rodent', [0xc0682a, 0xf2d0a8, 0x5a2f12], { kind: 'forage', rarity: 'common', seconds: 120 }, 'Forages a Common fruit every 2:00.'),
  pet(2, 'Bunny', 1, 35, 'bunny', [0xf4f0ea, 0xffc4d6, 0x9a8a80], { kind: 'forage', rarity: 'rare', seconds: 150 }, 'Forages a Rare fruit every 2:30.'),
  pet(3, 'Mouse', 1, 15, 'rodent', [0xa8a8b0, 0xffc4d6, 0x4a4a52], { kind: 'forage', rarity: 'epic', seconds: 180 }, 'Forages an Epic fruit every 3:00.'),
  pet(4, 'Dog', 2, 45, 'dog', [0xc89a5a, 0xf4e2c4, 0x4a3018], { kind: 'mutationLuck', factor: 1.3 }, 'Weather mutations are 30% more likely.'),
  pet(5, 'Cat', 2, 40, 'cat', [0xf29a3a, 0xfff0dc, 0x6a3a12], { kind: 'growth', bonus: 0.2 }, 'Trees grow 20% faster.'),
  pet(6, 'Robin', 2, 15, 'bird', [0x7a5a3a, 0xff6a3a, 0x2a1a0a], { kind: 'freeSeed', rarities: ['common', 'rare'], seconds: 90 }, 'Finds a free Common or Rare seed every 1:30.'),
  pet(7, 'Chicken', 3, 45, 'bird', [0xfafafa, 0xff3a2a, 0xffb21a], { kind: 'hatchLuck', factor: 1.5 }, 'Rarer pets hatch 50% more often.'),
  pet(8, 'Roach', 3, 40, 'bug', [0x6a3a1a, 0x9a5a2a, 0x2a1a0a], { kind: 'plantMutation', mutation: 'infested', chance: 0.04 }, '4% of planted seeds become Infested (x5).'),
  pet(9, 'Woodpecker', 3, 15, 'bird', [0x2a2a2a, 0xfafafa, 0xe8201a], { kind: 'freeSeed', rarities: ['epic', 'legendary'], seconds: 300 }, 'Finds a free Epic or Legendary seed every 5:00.'),
  pet(10, 'Cow', 4, 40, 'cow', [0xfafafa, 0x2a2a2a, 0xffb0c0], { kind: 'fertilizerBoost', factor: 1.5 }, 'Fertilizer works 50% better, at no extra cost.'),
  pet(11, 'Sheep', 4, 30, 'cow', [0xf4f0e6, 0x3a3a3a, 0xffd0c0], { kind: 'sell', bonus: 0.1 }, 'Everything sells for 10% more.'),
  pet(12, 'Pig', 4, 20, 'pig', [0xffa8b8, 0xff8aa0, 0x6a2a3a], { kind: 'plantMutation', mutation: 'huge', chance: 0.03 }, '3% of planted seeds become Huge (x4).'),
  pet(13, 'Raccoon', 4, 10, 'dog', [0x8a8a92, 0x2a2a2e, 0xe8e8ea], { kind: 'forage', rarity: 'legendary', seconds: 300 }, 'Forages a Legendary fruit every 5:00.'),
  pet(14, 'Frog', 5, 40, 'frog', [0x4cc94a, 0xd8f27a, 0x1a3a12], { kind: 'plantMutation', mutation: 'slimy', chance: 0.02 }, '2% of planted seeds become Slimy (x10).'),
  pet(15, 'Magpie', 5, 30, 'bird', [0x1a1a2a, 0xfafafa, 0x3a6aff], { kind: 'findEgg', seconds: 600 }, 'Finds a pet egg every 10:00.'),
  pet(16, 'Turtle', 5, 20, 'turtle', [0x5aa83a, 0x8a5a2a, 0xd8e87a], { kind: 'lightningBlock', chance: 0.2 }, '20% chance to block a lightning strike.'),
  pet(17, 'Monkey', 5, 7, 'monkey', [0x8a5a2a, 0xf2d0a8, 0x3a2010], { kind: 'forage', rarity: 'mythic', seconds: 420 }, 'Forages a Mythic fruit every 7:00.'),
  pet(18, 'Alligator', 5, 3, 'gator', [0x3a7a3a, 0xd8e87a, 0xfafafa], { kind: 'plantMutation', mutation: 'scaled', chance: 0.01 }, '1% of planted seeds become Scaled (x25).'),
  pet(19, 'Flamingo', 6, 45, 'tall', [0xff8ab8, 0xffc4dc, 0x2a2a2a], { kind: 'sell', bonus: 0.15 }, 'Everything sells for 15% more.'),
  pet(20, 'Hedgehog', 6, 35, 'rodent', [0x8a5a3a, 0xf2e0c0, 0x3a2412], { kind: 'growth', bonus: 0.25 }, 'Trees grow 25% faster.'),
  pet(21, 'Elephant', 6, 15, 'cow', [0x9aa0aa, 0xc8ccd4, 0xfafafa], { kind: 'crash', factor: 1.25 }, 'Lightning comes 25% later for every tree.'),
  pet(22, 'Horse', 6, 4.5, 'horse', [0x8a4a22, 0x3a1a0a, 0xfafafa], { kind: 'petTimers', factor: 0.75 }, 'Other pets find things 25% faster.'),
  pet(23, 'Pegasus', 6, 0.5, 'horse', [0xfafafa, 0xd8f0ff, 0xffd23a], { kind: 'petPower', factor: 1.5 }, 'Every other pet is 50% stronger.'),
];

export const petById = (id: number): PetDef | undefined => PETS.find((p) => p.id === id);
export const petsOfEgg = (egg: number): PetDef[] => PETS.filter((p) => p.egg === egg);

export const MAX_EQUIPPED_PETS = 3;
export const MAX_PETS = 60;

/** Hatch an egg with a uniform roll; `luck` > 1 shifts weight toward the rarer pets (Chicken). */
export const hatch = (egg: number, random: () => number, luck = 1): PetDef => {
  const pool = petsOfEgg(egg);
  const sorted = [...pool].sort((a, b) => b.chance - a.chance);
  const entries = sorted.map((p, i) => [p, p.chance * (i === 0 ? 1 : luck)] as const);
  return weightedPick(random, entries);
};

export interface PetBonuses {
  /** Growth speed bonus (+0.2 = 20% faster). */
  growth: number;
  mutationLuck: number;
  hatchLuck: number;
  fertilizerBoost: number;
  sell: number;
  /** Chance each strike is blocked. */
  lightningBlock: number;
  crash: number;
  /** Timer multiplier for finders (< 1 is faster). */
  petTimers: number;
  plantMutations: { bit: number; chance: number }[];
}

/**
 * Everything the equipped pets add up to. A Pegasus makes every OTHER pet's
 * effect 50% stronger; two of the same pet stack.
 */
export const petBonuses = (petIds: readonly number[]): PetBonuses => {
  const pets = petIds.map((id) => petById(id)).filter((p): p is PetDef => p !== undefined);
  const out: PetBonuses = { growth: 0, mutationLuck: 1, hatchLuck: 1, fertilizerBoost: 1, sell: 0, lightningBlock: 0, crash: 1, petTimers: 1, plantMutations: [] };
  pets.forEach((p, i) => {
    let power = 1;
    pets.forEach((other, j) => {
      if (j !== i && other.effect.kind === 'petPower') power *= other.effect.factor;
    });
    const e = p.effect;
    switch (e.kind) {
      case 'growth':
        out.growth += e.bonus * power;
        break;
      case 'mutationLuck':
        out.mutationLuck *= 1 + (e.factor - 1) * power;
        break;
      case 'hatchLuck':
        out.hatchLuck *= 1 + (e.factor - 1) * power;
        break;
      case 'fertilizerBoost':
        out.fertilizerBoost *= 1 + (e.factor - 1) * power;
        break;
      case 'sell':
        out.sell += e.bonus * power;
        break;
      case 'lightningBlock':
        out.lightningBlock = 1 - (1 - out.lightningBlock) * (1 - Math.min(0.9, e.chance * power));
        break;
      case 'crash':
        out.crash *= 1 + (e.factor - 1) * power;
        break;
      case 'petTimers':
        out.petTimers *= 1 - (1 - e.factor) * power;
        break;
      case 'plantMutation':
        out.plantMutations.push({ bit: mutationBit(e.mutation), chance: Math.min(1, e.chance * power) });
        break;
      default:
        break;
    }
  });
  return out;
};

/** A finder pet's interval in ms, with the Horse's speed-up (and its own Pegasus power). */
export const petFinderMs = (pet: PetDef, bonuses: PetBonuses): number => {
  const e = pet.effect;
  const seconds = e.kind === 'forage' || e.kind === 'freeSeed' || e.kind === 'findEgg' ? e.seconds : 0;
  return seconds * 1000 * bonuses.petTimers;
};

// =============================================================== gear & co

export interface GearDef {
  readonly id: number;
  readonly name: string;
  readonly tickets: number;
  /** Owned once and always on. */
  readonly permanent: boolean;
  readonly blurb: string;
  readonly color: number;
}

/** The Gear Shop (Rebirth 6). Prediction Potion 50 and Miracle Grow 100 Tickets are the original's prices. */
export const GEAR: readonly GearDef[] = [
  { id: 1, name: 'Prediction Potion', tickets: 50, permanent: false, blurb: 'Use on a growing tree: shows a multiplier it will safely reach.', color: 0x5ad8ff },
  { id: 2, name: 'Miracle Grow', tickets: 100, permanent: false, blurb: 'Use on a growing tree: it jumps ahead by half its size - never into lightning.', color: 0x7dff4a },
  { id: 3, name: 'Auto Collector', tickets: 500, permanent: true, blurb: 'Garden fruit and pet finds go straight to your inventory.', color: 0xffb21a },
  { id: 4, name: 'Seed Notifier', tickets: 300, permanent: true, blurb: 'Tells you when a Legendary or rarer seed is on the river.', color: 0xff5a5a },
  { id: 5, name: 'Weather Machine', tickets: 400, permanent: true, blurb: 'Shows the next weather event and when it starts.', color: 0x9b6bff },
];

export const gearById = (id: number): GearDef | undefined => GEAR.find((g) => g.id === id);

export interface WormDef {
  readonly id: number;
  readonly name: string;
  readonly mutation: MutationKey | null;
  /** Weight in a Can of Worms. */
  readonly weight: number;
  /** Crash point multiplier when planted with the seed. */
  readonly crash: number;
  readonly color: number;
}

/** Worms (Rebirth 7): planted with a seed, each gives its mutation and pushes lightning back. Table from the worm database. */
export const WORMS: readonly WormDef[] = [
  { id: 1, name: 'Normal Worm', mutation: null, weight: 40, crash: 1.25, color: 0xe88aa0 },
  { id: 2, name: 'Dewy Worm', mutation: 'dewy', weight: 20, crash: 1.25, color: 0x8fe3ff },
  { id: 3, name: 'Shocked Worm', mutation: 'shocked', weight: 12, crash: 1.25, color: 0xfff35a },
  { id: 4, name: 'Dusty Worm', mutation: 'dusty', weight: 8, crash: 1.25, color: 0xe0b46a },
  { id: 5, name: 'Frosted Worm', mutation: 'frosted', weight: 8, crash: 1.25, color: 0xcfefff },
  { id: 6, name: 'Infested Worm', mutation: 'infested', weight: 4, crash: 1.25, color: 0x9aa33a },
  { id: 7, name: 'Radioactive Worm', mutation: 'radioactive', weight: 3, crash: 1.25, color: 0x7dff4a },
  { id: 8, name: 'Charged Worm', mutation: 'charged', weight: 2, crash: 1.25, color: 0x5ad8ff },
  { id: 9, name: 'Slimy Worm', mutation: 'slimy', weight: 1.3, crash: 1.25, color: 0x4aff9a },
  { id: 10, name: 'Golden Worm', mutation: 'golden', weight: 1, crash: 1.25, color: 0xffd23a },
  { id: 11, name: 'Scaled Worm', mutation: 'scaled', weight: 0.5, crash: 1.25, color: 0x5aa85a },
  { id: 12, name: 'Cosmic Worm', mutation: 'cosmic', weight: 0.2, crash: 1.25, color: 0xc77dff },
];

export const CAN_OF_WORMS_TICKETS = 150;

export const wormById = (id: number): WormDef | undefined => WORMS.find((w) => w.id === id);
export const wormMutationBit = (worm: WormDef): number => (worm.mutation ? mutationBit(worm.mutation) : 0);

export const rollWorm = (random: () => number): WormDef => weightedPick(random, WORMS.map((w) => [w, w.weight] as const));

// ============================================================== lucky wheel

export type WheelPrize =
  | { kind: 'gear'; id: number; count: number }
  | { kind: 'tickets'; count: number }
  | { kind: 'egg'; id: number }
  | { kind: 'basket'; count: number };

export interface WheelSlice {
  readonly label: string;
  readonly weight: number;
  readonly prize: WheelPrize;
  readonly color: string;
}

/** The Lucky Wheel (Rebirth 5): spun with Tickets. Slices from the video's wheel. */
export const WHEEL_SPIN_TICKETS = 100;
export const WHEEL: readonly WheelSlice[] = [
  { label: 'Prediction Potion', weight: 30, prize: { kind: 'gear', id: 1, count: 1 }, color: '#5ad8ff' },
  { label: 'Miracle Grow', weight: 20, prize: { kind: 'gear', id: 2, count: 1 }, color: '#7dff4a' },
  { label: 'Fruit Basket', weight: 25, prize: { kind: 'basket', count: 3 }, color: '#ff9a3a' },
  { label: '250 Tickets', weight: 15, prize: { kind: 'tickets', count: 250 }, color: '#ffd23a' },
  { label: 'Mythic Egg', weight: 7.5, prize: { kind: 'egg', id: 5 }, color: '#ff5a8a' },
  { label: 'Majestic Egg', weight: 2.5, prize: { kind: 'egg', id: 6 }, color: '#c77dff' },
];

// ===================================================================== codes

/** Redeemable codes and their Tickets (the original's active codes). */
export const CODES: Readonly<Record<string, { tickets: number; tokens?: number }>> = {
  IMSOGREEDY: { tickets: 250, tokens: 50 },
  '1MIL': { tickets: 250 },
  ILOVECATS: { tickets: 100 },
};

// ============================================================ daily requests

export interface RequestDef {
  /** The seed whose fruit (or tree) is wanted. */
  readonly seed: number;
  readonly count: number;
  /** Fruit or a whole live tree. */
  readonly kind: 'fruit' | 'tree';
  /** A tree must be at least this big. */
  readonly minMult: number;
  readonly reward: number;
}

export const dayNumber = (now: number): number => Math.floor(now / 86_400_000);

const pickSeed = (random: () => number, maxRarity: Rarity): number => {
  const cap = RARITY_ORDER.indexOf(maxRarity);
  const pool = RIVER_SEEDS.filter((s) => RARITY_ORDER.indexOf(s.rarity) <= cap);
  return pool[Math.floor(random() * pool.length) % pool.length]!.id;
};

/**
 * The Farmers Market's three requests for a day (Rebirth 2): fruit from your
 * garden, refreshed every 24 hours, up to 200 Tickets a set (the original's
 * figures). Everyone gets the same set on the same day.
 */
export const farmersRequests = (day: number): RequestDef[] => {
  const random = rng(hashInts(day, 0xfa12));
  return [
    { seed: pickSeed(random, 'common'), count: 3, kind: 'fruit', minMult: 0, reward: 40 },
    { seed: pickSeed(random, 'rare'), count: 2, kind: 'fruit', minMult: 0, reward: 60 },
    { seed: pickSeed(random, 'epic'), count: 1, kind: 'fruit', minMult: 0, reward: 100 },
  ];
};

/** The Fall Harvest stand's three requests for a day: whole live trees, paid in Harvest Tokens. */
export const fallRequests = (day: number): RequestDef[] => {
  const random = rng(hashInts(day, 0xfa11));
  return [
    { seed: pickSeed(random, 'common'), count: 1, kind: 'tree', minMult: 3, reward: 10 },
    { seed: pickSeed(random, 'rare'), count: 1, kind: 'tree', minMult: 5, reward: 20 },
    { seed: pickSeed(random, 'epic'), count: 1, kind: 'tree', minMult: 8, reward: 40 },
  ];
};

// ================================================================ furniture

export interface FurnitureDef {
  readonly id: number;
  readonly name: string;
  readonly tickets: number;
  /** Footprint half-sizes, for placement. */
  readonly hx: number;
  readonly hz: number;
}

/** Furniture (Rebirth 4): bought with Tickets, placed on your plot's lawn. */
export const FURNITURE: readonly FurnitureDef[] = [
  { id: 1, name: 'Hay Bale', tickets: 20, hx: 1.6, hz: 1.1 },
  { id: 2, name: 'Wooden Bench', tickets: 40, hx: 2.2, hz: 0.9 },
  { id: 3, name: 'Scarecrow', tickets: 60, hx: 1.2, hz: 1.2 },
  { id: 4, name: 'Pumpkin Pile', tickets: 50, hx: 1.4, hz: 1.4 },
  { id: 5, name: 'Lamp Post', tickets: 45, hx: 0.6, hz: 0.6 },
  { id: 6, name: 'Wheelbarrow', tickets: 70, hx: 1.8, hz: 1 },
  { id: 7, name: 'Picnic Table', tickets: 90, hx: 2.4, hz: 1.8 },
  { id: 8, name: 'Flower Bed', tickets: 35, hx: 1.6, hz: 0.9 },
  { id: 9, name: 'Windmill', tickets: 400, hx: 2.4, hz: 2.4 },
  { id: 10, name: 'Old Tractor', tickets: 600, hx: 3, hz: 1.8 },
  { id: 11, name: 'Gazebo', tickets: 500, hx: 3, hz: 3 },
  { id: 12, name: 'Custom Sign', tickets: 30, hx: 1.2, hz: 0.5 },
];

export const furnitureById = (id: number): FurnitureDef | undefined => FURNITURE.find((f) => f.id === id);
export const MAX_FURNITURE = 24;

/**
 * Why a piece of furniture cannot go here (plot-local), or null. The server
 * enforces it and the client's green/red preview uses it, so a preview that
 * fits is never refused.
 */
export const furnitureProblem = (
  existing: Iterable<{ readonly kind: number; readonly x: number; readonly z: number; readonly rot: number }>,
  kind: number,
  x: number,
  z: number,
  rot: number,
): string | null => {
  const def = furnitureById(kind);
  if (!def) return 'Unknown furniture.';
  const hx = rot % 2 === 0 ? def.hx : def.hz;
  const hz = rot % 2 === 0 ? def.hz : def.hx;
  if (Math.abs(x) + hx > PLOT.lawnHalfX || z + hz > PLOT.lawnFront || z - hz < PLOT.lawnBack) return 'Place furniture on your own lawn.';
  if (Math.abs(x) - hx < PLOT.soilHalf + 0.5 && Math.abs(z) - hz < PLOT.soilHalf + 0.5) return 'Keep the soil clear for your saplings.';
  if (Math.abs(z - PLOT.gardenZ) - hz < 2.5) return 'Keep the garden row clear.';
  if (Math.hypot(x - PLOT.sign.x, z - PLOT.sign.z) < hx + 2 || Math.hypot(x - PLOT.stand.x, z - PLOT.stand.z) < hx + 3) return 'Keep the sign and the stand clear.';
  for (const d of existing) {
    const other = furnitureById(d.kind);
    if (!other) continue;
    const ohx = d.rot % 2 === 0 ? other.hx : other.hz;
    const ohz = d.rot % 2 === 0 ? other.hz : other.hx;
    if (Math.abs(d.x - x) < hx + ohx && Math.abs(d.z - z) < hz + ohz) return 'Something is already there.';
  }
  return null;
};
