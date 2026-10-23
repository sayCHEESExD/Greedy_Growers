import type { PartBuilder } from '../render/PartBuilder.js';
import { ball, block, brick, cylinder, shade } from './shapes.js';

/**
 * THE ISLAND'S GREENERY, built like a Roblox map: trees of angled block
 * trunks under stacked cube canopies, tall block tulips, grass planks, bushes,
 * rocks and palms. Every function takes a seeded random source so the island
 * is the same on every client.
 */
export type Rand = () => number;

const LEAVES = [0x6fcf4a, 0x62c43f, 0x7ad84f, 0x58b83a] as const;
const TRUNK = [0x9a6a42, 0x8a5e3a, 0xa87448] as const;
const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;

/**
 * A BLOCK TREE: a chunky trunk that leans and forks into two or three
 * branches, each crowned with a cluster of big studded leaf cubes.
 */
export const blockTree = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  const trunk = pick(r, TRUNK);
  const leaf = pick(r, LEAVES);
  const h = (5 + r() * 2.5) * s;
  const w = 1.1 * s;
  brick(b, w, h, w, trunk, { x, y: y + h / 2, z, ry: r() });
  const forks = 2 + Math.floor(r() * 2);
  for (let i = 0; i < forks; i += 1) {
    const a = (i / forks) * Math.PI * 2 + r() * 0.8;
    const len = (2.6 + r() * 1.6) * s;
    const lean = 0.55 + r() * 0.35;
    const bx = x + Math.sin(a) * Math.sin(lean) * len * 0.5;
    const bz = z + Math.cos(a) * Math.sin(lean) * len * 0.5;
    const by = y + h + Math.cos(lean) * len * 0.5 - 0.6 * s;
    b.box(w * 0.7, len, w * 0.7, shade(trunk, 0.95), 'stud', { x: bx, y: by, z: bz, ry: a, rx: lean });
    const tx = x + Math.sin(a) * Math.sin(lean) * len;
    const tz = z + Math.cos(a) * Math.sin(lean) * len;
    const ty = y + h + Math.cos(lean) * len - 0.4 * s;
    const size = (2.6 + r() * 1.2) * s;
    brick(b, size * 1.3, size * 0.55, size * 1.3, leaf, { x: tx, y: ty + size * 0.1, z: tz, ry: r() });
    brick(b, size, size * 0.55, size, shade(leaf, 1.08), { x: tx + (r() - 0.5) * s, y: ty + size * 0.55, z: tz + (r() - 0.5) * s, ry: r() });
    brick(b, size * 0.8, size * 0.5, size * 0.8, shade(leaf, 0.92), { x: tx + (r() - 0.5) * size * 0.8, y: ty - size * 0.25, z: tz + (r() - 0.5) * size * 0.8, ry: r() });
  }
  brick(b, 3 * s, 1.6 * s, 3 * s, leaf, { x, y: y + h + 0.6 * s, z, ry: r() });
};

/** A tall block tulip: a thin green stem and a cube bloom, the way the island's meadows grow them. */
export const tulip = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, color?: number, y = 0): void => {
  const h = (1.6 + r() * 1.4) * s;
  const bloom = color ?? pick(r, [0xff4a4a, 0x8ab8ff, 0xffd23a, 0xff8ad8, 0xffffff] as const);
  block(b, 0.16 * s, h, 0.16 * s, 0x3fa83a, { x, y: y + h / 2, z }, 'leaf');
  brick(b, 0.55 * s, 0.6 * s, 0.55 * s, bloom, { x, y: y + h + 0.2 * s, z, ry: r() });
};

/** Tall grass planks in a clump. */
export const grassClump = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, color = 0x5cc43a, y = 0): void => {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const h = (1 + r() * 1.6) * s;
    const a = r() * Math.PI * 2;
    block(b, 0.3 * s, h, 0.12 * s, shade(color, 0.85 + r() * 0.3), { x: x + Math.cos(a) * 0.3 * s, y: y + h / 2, z: z + Math.sin(a) * 0.3 * s, ry: a, rx: (r() - 0.5) * 0.4, rz: (r() - 0.5) * 0.4 }, 'leaf');
  }
};

/** A rounded bush of leaf balls, sometimes flowering. */
export const bush = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, flowers = 0, y = 0): void => {
  const leaf = pick(r, LEAVES);
  ball(b, 1.1 * s, shade(leaf, 0.9), { x, y: y + 0.8 * s, z, sy: 0.75 }, 'leaf', 0);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + r();
    ball(b, 0.75 * s, leaf, { x: x + Math.cos(a) * 0.7 * s, y: y + 0.7 * s, z: z + Math.sin(a) * 0.7 * s }, 'leaf', 0);
  }
  for (let i = 0; i < flowers; i += 1) {
    const a = r() * Math.PI * 2;
    block(b, 0.3 * s, 0.3 * s, 0.3 * s, pick(r, [0xff5a8a, 0xffffff, 0xffd23a] as const), { x: x + Math.cos(a) * 0.9 * s, y: y + 1.2 * s, z: z + Math.sin(a) * 0.9 * s, ry: a });
  }
};

/** A low hedge run, for garden edges. */
export const hedge = (b: PartBuilder, x: number, z: number, w: number, d: number, h = 1.4, color = 0x4cb83a): void => {
  brick(b, w, h, d, color, { x, y: h / 2, z });
};

/** A grey rock, a chunky tapering block. */
export const rock = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, color = 0x9a9ea8, y = 0): void => {
  const h = (0.8 + r() * 1.2) * s;
  b.box(2 * s, h, 1.7 * s, color, 'flat', { x, y: y + h / 2 - 0.1, z, ry: r() * 3, rx: (r() - 0.5) * 0.2 });
  b.box(1.2 * s, h * 0.7, 1.1 * s, shade(color, 1.08), 'flat', { x: x + 0.5 * s, y: y + h * 0.35 + h * 0.4, z: z + 0.3 * s, ry: r() * 3 });
};

/** A big grey cliff block, for the shoreline and the dock's rock walls. */
export const cliff = (b: PartBuilder, x: number, z: number, w: number, d: number, h: number, color = 0x8e929c): void => {
  brick(b, w, h, d, color, { x, y: h / 2 - 0.2, z });
  brick(b, w * 0.8, h * 0.4, d * 0.7, shade(color, 1.06), { x: x + w * 0.05, y: h + h * 0.2 - 0.2, z: z - d * 0.05 });
};

/** A palm for the Forgotten Isle. */
export const palm = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  const h = (6 + r() * 3) * s;
  const lean = (r() - 0.5) * 0.5;
  const segments = 5;
  for (let i = 0; i < segments; i += 1) {
    const t = (i + 0.5) / segments;
    brick(b, 0.7 * s, h / segments + 0.05, 0.7 * s, shade(0x9a7446, i % 2 ? 1 : 0.9), { x: x + Math.sin(lean) * h * t * t, y: y + h * t, z });
  }
  const tx = x + Math.sin(lean) * h;
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.3;
    b.box(0.8 * s, 0.12 * s, 3.2 * s, shade(0x4cc43a, 0.85 + r() * 0.25), 'leaf', { x: tx + Math.sin(a) * 1.4 * s, y: y + h - 0.4 * s, z: z + Math.cos(a) * 1.4 * s, ry: a, rx: 0.35 });
  }
  for (let i = 0; i < 3; i += 1) ball(b, 0.3 * s, 0x6a4420, { x: tx + (r() - 0.5) * 0.6, y: y + h - 0.5 * s, z: z + (r() - 0.5) * 0.6 }, 'smooth', 0);
};

/** Reeds by the pond. */
export const reeds = (b: PartBuilder, r: Rand, x: number, z: number, s = 1): void => {
  for (let i = 0; i < 5; i += 1) {
    const h = (1.8 + r() * 1.2) * s;
    const ox = (r() - 0.5) * 1.2 * s;
    const oz = (r() - 0.5) * 1.2 * s;
    block(b, 0.12 * s, h, 0.12 * s, 0x6aa83a, { x: x + ox, y: h / 2, z: z + oz, rz: (r() - 0.5) * 0.2 }, 'leaf');
    if (i % 2 === 0) cylinder(b, 0.16 * s, 0.16 * s, 0.5 * s, 0x7a4a2a, { x: x + ox, y: h, z: z + oz }, 'smooth', 6);
  }
};

/** Lily pads floating on water at height y. */
export const lilyPads = (b: PartBuilder, r: Rand, x: number, z: number, y: number): void => {
  for (let i = 0; i < 3; i += 1) {
    const a = r() * Math.PI * 2;
    cylinder(b, 0.7, 0.7, 0.06, 0x4cb83a, { x: x + Math.cos(a) * 1.5, y, z: z + Math.sin(a) * 1.5 }, 'leaf', 8);
    if (i === 0) block(b, 0.3, 0.2, 0.3, 0xff9ad0, { x: x + Math.cos(a) * 1.5, y: y + 0.12, z: z + Math.sin(a) * 1.5, ry: a });
  }
};

// ------------------------------------------------------------- scatter

/** A leafy block bush: two or three studded cubes, sometimes flowering - cheap enough to plant by the thousand. */
export const blockBush = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0, flowers = 0): void => {
  const leaf = pick(r, LEAVES);
  const size = (1.6 + r() * 0.8) * s;
  brick(b, size, size * 0.8, size, shade(leaf, 0.88), { x, y: y + size * 0.4, z, ry: r() });
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i += 1) {
    const a = r() * Math.PI * 2;
    const k = size * (0.55 + r() * 0.25);
    brick(b, k, k * 0.8, k, shade(leaf, 0.95 + r() * 0.15), { x: x + Math.cos(a) * size * 0.45, y: y + k * 0.4 + r() * 0.3 * s, z: z + Math.sin(a) * size * 0.45, ry: r() });
  }
  for (let i = 0; i < flowers; i += 1) {
    const a = r() * Math.PI * 2;
    block(b, 0.3 * s, 0.3 * s, 0.3 * s, pick(r, [0xff5a8a, 0xffffff, 0xffd23a, 0xb07aff] as const), { x: x + Math.cos(a) * size * 0.5, y: y + size * 0.8, z: z + Math.sin(a) * size * 0.5, ry: a });
  }
};

/** A patch of little block flowers in one colour, low to the ground. */
export const flowerPatch = (b: PartBuilder, r: Rand, x: number, z: number, color: number, s = 1, y = 0): void => {
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const px = x + (r() - 0.5) * 3.2 * s;
    const pz = z + (r() - 0.5) * 3.2 * s;
    const h = (0.5 + r() * 0.5) * s;
    block(b, 0.1, h, 0.1, 0x3fa83a, { x: px, y: y + h / 2, z: pz }, 'leaf');
    block(b, 0.32 * s, 0.22 * s, 0.32 * s, shade(color, 0.9 + r() * 0.2), { x: px, y: y + h + 0.08, z: pz, ry: r() });
  }
};

/** A fern: flat fronds fanned from the ground. */
export const fern = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  const n = 5 + Math.floor(r() * 3);
  const color = shade(0x4aa83a, 0.85 + r() * 0.25);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4;
    b.box(0.5 * s, 0.08 * s, 1.8 * s, shade(color, 0.9 + r() * 0.2), 'leaf', { x: x + Math.sin(a) * 0.8 * s, y: y + 0.4 * s, z: z + Math.cos(a) * 0.8 * s, ry: a, rx: -0.5 });
  }
};

/** A cluster of toadstools: red with white spots, or brown. */
export const mushrooms = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  const red = r() < 0.6;
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const px = x + (r() - 0.5) * 1.6 * s;
    const pz = z + (r() - 0.5) * 1.6 * s;
    const h = (0.4 + r() * 0.5) * s;
    const cap = (0.45 + r() * 0.3) * s;
    block(b, 0.22 * s, h, 0.22 * s, 0xf6ecd8, { x: px, y: y + h / 2, z: pz });
    b.box(cap, cap * 0.45, cap, red ? 0xe0343a : 0xa8743a, 'smooth', { x: px, y: y + h + cap * 0.18, z: pz, ry: r() });
    if (red) block(b, cap * 0.22, 0.06, cap * 0.22, 0xffffff, { x: px + cap * 0.2, y: y + h + cap * 0.42, z: pz - cap * 0.1 });
  }
};

/** A fallen log, mossy on top, lying along a bearing. */
export const log = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  const len = (3.5 + r() * 2.5) * s;
  const ry = r() * Math.PI;
  cylinder(b, 0.55 * s, 0.6 * s, len, 0x7a4e2c, { x, y: y + 0.5 * s, z, ry, rz: Math.PI / 2 }, 'flat', 8);
  block(b, len * 0.6, 0.14 * s, 0.7 * s, 0x5aa83a, { x, y: y + 1.02 * s, z, ry }, 'leaf');
  cylinder(b, 0.42 * s, 0.42 * s, 0.05, 0xd8b07a, { x: x + Math.cos(ry) * len * 0.5, y: y + 0.5 * s, z: z - Math.sin(ry) * len * 0.5, ry, rz: Math.PI / 2 }, 'smooth', 8);
};

/** A tree stump with its rings showing. */
export const stump = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  const h = (0.7 + r() * 0.6) * s;
  cylinder(b, 0.75 * s, 0.9 * s, h, 0x7a4e2c, { x, y: y + h / 2, z }, 'flat', 8);
  cylinder(b, 0.66 * s, 0.66 * s, 0.05, 0xd8b07a, { x, y: y + h + 0.02, z }, 'smooth', 8);
  if (r() < 0.5) mushrooms(b, r, x + 0.9 * s, z, 0.6 * s, y);
};

/** A scatter of pebbles. */
export const pebbles = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  for (let i = 0; i < 5; i += 1) {
    const k = (0.25 + r() * 0.35) * s;
    b.box(k, k * 0.6, k * 0.8, shade(0xa6a8b0, 0.85 + r() * 0.3), 'flat', { x: x + (r() - 0.5) * 2 * s, y: y + k * 0.25, z: z + (r() - 0.5) * 2 * s, ry: r() * 3 });
  }
};

/** A big mossy boulder. */
export const boulder = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  const h = (2 + r() * 1.5) * s;
  b.box(4 * s, h, 3.4 * s, 0x9a9ea8, 'flat', { x, y: y + h / 2 - 0.2, z, ry: r() * 3 });
  b.box(2.8 * s, h * 0.6, 2.6 * s, 0xa8acb6, 'flat', { x: x + 0.6 * s, y: y + h * 0.9, z: z + 0.3 * s, ry: r() * 3 });
  b.box(2.2 * s, 0.3 * s, 2 * s, 0x5aa83a, 'leaf', { x: x + 0.4 * s, y: y + h * 1.2 + 0.1, z: z + 0.2 * s, ry: r() * 3 });
};
