import {
  MAX_CASH,
  MAX_ITEMS,
  MAX_PETS,
  gearById,
  petById,
  seedById,
  type FruitItem,
  type HeldRef,
  type SeedStack,
  type Stack,
  type TreeItem,
} from '@greedy/shared';
import type { ProgressFields } from '../persistence/index.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { PlotState } from '../rooms/state/PlotState.js';

/**
 * ONE CONNECTED FARMER, as the server holds them: their public schema, the
 * plot they were given, and their PROFILE - a plain object that is the
 * authoritative copy of their cash and inventory while they play. (Their
 * saplings and garden live in the plot's schema while they are here, and are
 * folded back into the profile on every save.)
 */
export interface Farmer {
  readonly sessionId: string;
  /** The profile key: a guest id or an account key. Empty for a probe with no id. */
  key: string;
  accountId: string | null;
  profile: ProgressFields;
  readonly player: PlayerState;
  plot: PlotState | null;
  /** The owner's Self snapshot is out of date. */
  dirty: boolean;
  lastSelfAt: number;
  lastActionAt: number;
  /** Per equipped pet uid: when its next find is due. */
  petTimers: Map<number, number>;
  /** Prediction Potion readings, by sapling id. */
  predictions: Map<number, number>;
  ranks: { cash: number; earned: number; rebirths: number; best: number };
  /** A rewarded-ad token is being verified with Boxity: a second one waits its turn. */
  adPending?: boolean;
}

// ------------------------------------------------------------------ purse

export const addCash = (f: Farmer, amount: number, earned: boolean): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const before = f.profile.cash;
  f.profile.cash = Math.min(MAX_CASH, Math.floor(before + amount));
  const granted = f.profile.cash - before;
  if (earned) f.profile.totalEarned = Math.min(MAX_CASH, f.profile.totalEarned + granted);
  f.dirty = true;
  return granted;
};

/** Deduct cash. False and unchanged when the player cannot afford it. */
export const spendCash = (f: Farmer, cost: number): boolean => {
  const price = Math.floor(Number.isFinite(cost) ? Math.max(0, cost) : 0);
  if (f.profile.cash < price) return false;
  f.profile.cash -= price;
  f.dirty = true;
  return true;
};

export const spendTickets = (f: Farmer, cost: number): boolean => {
  if (f.profile.tickets < cost) return false;
  f.profile.tickets -= cost;
  f.dirty = true;
  return true;
};

export const addTickets = (f: Farmer, count: number): void => {
  if (count <= 0) return;
  f.profile.tickets = Math.min(1e9, f.profile.tickets + Math.floor(count));
  f.dirty = true;
};

// ----------------------------------------------------------------- stacks

export const countOf = (stacks: readonly Stack[], id: number): number => stacks.find((s) => s.id === id)?.count ?? 0;

export const addStack = (stacks: Stack[], id: number, count: number): void => {
  if (count <= 0) return;
  const at = stacks.findIndex((s) => s.id === id);
  if (at >= 0) stacks[at] = { id, count: Math.min(1_000_000, stacks[at]!.count + count) };
  else stacks.push({ id, count });
};

export const takeStack = (stacks: Stack[], id: number, count = 1): boolean => {
  const at = stacks.findIndex((s) => s.id === id);
  if (at < 0 || stacks[at]!.count < count) return false;
  const left = stacks[at]!.count - count;
  if (left > 0) stacks[at] = { id, count: left };
  else stacks.splice(at, 1);
  return true;
};

export const seedCount = (f: Farmer, seed: number, mut: number): number => f.profile.seeds.find((s) => s.seed === seed && s.mut === mut)?.count ?? 0;

export const addSeeds = (f: Farmer, seed: number, mut: number, count: number): void => {
  if (count <= 0 || !seedById(seed)) return;
  const list = f.profile.seeds;
  const at = list.findIndex((s) => s.seed === seed && s.mut === mut);
  if (at >= 0) list[at] = { seed, mut, count: Math.min(1_000_000, list[at]!.count + count) };
  else list.push({ seed, mut, count });
  f.dirty = true;
};

export const takeSeed = (f: Farmer, seed: number, mut: number): boolean => {
  const list = f.profile.seeds;
  const at = list.findIndex((s) => s.seed === seed && s.mut === mut);
  if (at < 0) return false;
  const left = list[at]!.count - 1;
  if (left > 0) list[at] = { seed, mut, count: left };
  else list.splice(at, 1);
  f.dirty = true;
  return true;
};

// ------------------------------------------------------------------ items

export const itemCount = (f: Farmer): number => f.profile.trees.length + f.profile.fruits.length;
export const inventoryFull = (f: Farmer, adding = 1): boolean => itemCount(f) + adding > MAX_ITEMS;

const nextUid = (f: Farmer): number => {
  const uid = f.profile.nextUid;
  f.profile.nextUid += 1;
  return uid;
};

export const addTree = (f: Farmer, seed: number, mult: number, mut: number, dead: boolean): TreeItem | null => {
  if (inventoryFull(f)) return null;
  const item: TreeItem = { uid: nextUid(f), seed, mult, mut, dead, fav: false };
  f.profile.trees.push(item);
  f.dirty = true;
  return item;
};

export const addFruit = (f: Farmer, seed: number, mut: number, mult: number): FruitItem | null => {
  if (inventoryFull(f)) return null;
  const item: FruitItem = { uid: nextUid(f), seed, mut, mult, fav: false };
  f.profile.fruits.push(item);
  f.dirty = true;
  return item;
};

export const addPet = (f: Farmer, pet: number): number => {
  if (f.profile.pets.length >= MAX_PETS || !petById(pet)) return 0;
  const uid = nextUid(f);
  f.profile.pets.push({ uid, pet });
  f.dirty = true;
  return uid;
};

export const removeItems = (f: Farmer, uids: ReadonlySet<number>): void => {
  f.profile.trees = f.profile.trees.filter((t) => !uids.has(t.uid));
  f.profile.fruits = f.profile.fruits.filter((t) => !uids.has(t.uid));
  f.dirty = true;
  refreshHeld(f);
};

export const addGear = (f: Farmer, id: number, count: number): void => {
  const def = gearById(id);
  if (!def) return;
  if (def.permanent) {
    if (countOf(f.profile.gear, id) === 0) addStack(f.profile.gear, id, 1);
  } else addStack(f.profile.gear, id, count);
  f.dirty = true;
};

export const hasGear = (f: Farmer, id: number): boolean => countOf(f.profile.gear, id) > 0;

// ------------------------------------------------------------------- hand

export type Held =
  | { kind: 'none' }
  | { kind: 'seed'; stack: SeedStack }
  | { kind: 'tree'; item: TreeItem }
  | { kind: 'fruit'; item: FruitItem }
  | { kind: 'gear'; id: number };

/** What a reference names, if the player really has it. */
export const resolveHeld = (f: Farmer, ref: HeldRef): Held => {
  const seed = /^seed:(\d{1,4}):(\d{1,6})$/.exec(ref);
  if (seed) {
    const stack = f.profile.seeds.find((s) => s.seed === Number(seed[1]) && s.mut === Number(seed[2]));
    return stack ? { kind: 'seed', stack } : { kind: 'none' };
  }
  const match = /^(tree|fruit|gear):(\d{1,9})$/.exec(ref);
  if (!match) return { kind: 'none' };
  const id = Number(match[2]);
  if (match[1] === 'tree') {
    const item = f.profile.trees.find((t) => t.uid === id);
    return item ? { kind: 'tree', item } : { kind: 'none' };
  }
  if (match[1] === 'fruit') {
    const item = f.profile.fruits.find((t) => t.uid === id);
    return item ? { kind: 'fruit', item } : { kind: 'none' };
  }
  return hasGear(f, id) && !gearById(id)?.permanent ? { kind: 'gear', id } : { kind: 'none' };
};

export const held = (f: Farmer): Held => resolveHeld(f, f.profile.equipped);

/** Take something in hand (or nothing), and show it to everyone. */
export const equip = (f: Farmer, ref: HeldRef): void => {
  const next = resolveHeld(f, ref);
  f.profile.equipped = next.kind === 'none' ? '' : ref;
  const p = f.player;
  let kind = 0;
  let id = 0;
  let mut = 0;
  let mult = 0;
  let dead = false;
  switch (next.kind) {
    case 'seed':
      kind = 1;
      id = next.stack.seed;
      mut = next.stack.mut;
      break;
    case 'tree':
      kind = 2;
      id = next.item.seed;
      mut = next.item.mut;
      mult = next.item.mult;
      dead = next.item.dead;
      break;
    case 'fruit':
      kind = 3;
      id = next.item.seed;
      mut = next.item.mut;
      mult = next.item.mult;
      break;
    case 'gear':
      kind = 4;
      id = next.id;
      break;
    default:
      break;
  }
  if (p.heldKind !== kind) p.heldKind = kind;
  if (p.heldId !== id) p.heldId = id;
  if (p.heldMut !== mut) p.heldMut = mut;
  if (p.heldMult !== mult) p.heldMult = mult;
  if (p.heldDead !== dead) p.heldDead = dead;
  f.dirty = true;
};

/** Re-check the hand after the inventory changed under it. */
export const refreshHeld = (f: Farmer): void => {
  if (held(f).kind === 'none' && f.profile.equipped !== '') equip(f, '');
};

/** Show the equipped pets on the public schema. */
export const syncPets = (f: Farmer): void => {
  const ids = f.profile.equippedPets.map((uid) => f.profile.pets.find((p) => p.uid === uid)?.pet ?? 0);
  f.player.pet0 = ids[0] ?? 0;
  f.player.pet1 = ids[1] ?? 0;
  f.player.pet2 = ids[2] ?? 0;
};
