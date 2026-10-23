import { mutationsOf, seedById, type SeedDef } from '@greedy/shared';
import { PartBuilder, meshesFor, type PartKind } from '../render/PartBuilder.js';
import { ball, block, cone, cylinder, mix, shade, wedge } from './shapes.js';
import type { BufferGeometry, Group } from 'three';

/**
 * THE GREEDY GROWERS TREES. Every seed grows a tree of its family - the oak's
 * forked trunk under cube-cluster canopies (as in the reference), the pine's
 * stacked tiers, fruit trees hung with fruit, palms, the blossoming cherry,
 * and the rare ones: glowing, blooming, magic, pizza, diamond and void.
 *
 * A tree is built at a MODEL height of 10 units in one of five GROWTH STAGES
 * (sprout, sapling, young, mature, giant) and scaled to its multiplier, so it
 * visibly fills out as it grows: a sprout is a stalk and two leaves, a giant
 * has a thick trunk, extra limbs and a crown of canopy. A struck tree is the
 * same trunk turned grey and bare. Mutations re-tint and decorate it.
 *
 * Geometries are cached per (seed, stage, dead, look): fifteen saplings of
 * the same kind share one set of buffers.
 */

export type Stage = 0 | 1 | 2 | 3 | 4;

/** Multiplier thresholds of the stages. */
const STAGE_FROM = [0, 0.6, 2, 6, 25] as const;

export const stageOf = (mult: number): Stage => {
  let stage: Stage = 0;
  for (let i = 0; i < STAGE_FROM.length; i += 1) if (mult >= STAGE_FROM[i]!) stage = i as Stage;
  return stage;
};

/**
 * World height of a tree at a multiplier: a knee-high sprout at 0x, twice a
 * player at 4x (the reference's 3.97x Oak), a landmark at 65x (the reference shows a 65x tree towering
 * over the plots). Capped so a 9,999x tree still fits the sky.
 */
export const treeHeight = (mult: number): number => Math.min(58, 1.6 + 3 * Math.sqrt(Math.max(0, mult)));

/** How a mutation set paints a tree: the strongest mutation leads. */
interface Paint {
  leaf: number | null;
  trunk: number | null;
  glow: number | null;
  /** Small accent cubes sprinkled over the canopy. */
  speck: number | null;
  frost: boolean;
  bugs: boolean;
  drips: number | null;
}

const paintOf = (mut: number): Paint => {
  const out: Paint = { leaf: null, trunk: null, glow: null, speck: null, frost: false, bugs: false, drips: null };
  const list = mutationsOf(mut).sort((a, b) => a.multiplier - b.multiplier);
  for (const m of list) {
    switch (m.key) {
      case 'dewy':
        out.speck = 0x9fe8ff;
        break;
      case 'shocked':
        out.glow = 0xfff35a;
        break;
      case 'dusty':
        out.leaf = 0xc8a060;
        out.trunk = 0xa08050;
        break;
      case 'frosted':
        out.frost = true;
        out.leaf = 0xbfe6ff;
        break;
      case 'infested':
        out.bugs = true;
        out.leaf = 0x8a9a3a;
        break;
      case 'radioactive':
        out.leaf = 0x7dff4a;
        out.glow = 0x9aff5a;
        break;
      case 'charged':
        out.glow = 0x5ad8ff;
        out.speck = 0xb8f4ff;
        break;
      case 'slimy':
        out.drips = 0x4aff9a;
        break;
      case 'golden':
        out.leaf = 0xffc81e;
        out.trunk = 0xd8a020;
        out.speck = 0xfff2a0;
        break;
      case 'scaled':
        out.trunk = 0x3a7a3a;
        break;
      case 'cosmic':
        out.leaf = 0x8a4dff;
        out.trunk = 0x3a1a6a;
        out.glow = 0xff7ad9;
        out.speck = 0xffffff;
        break;
      case 'huge':
        break;
    }
  }
  return out;
};

/** The paint's cache key: only what changes the look. */
const paintKey = (p: Paint): string => [p.leaf, p.trunk, p.glow, p.speck, p.frost ? 1 : 0, p.bugs ? 1 : 0, p.drips].join(',');

type Rand = () => number;
const seeded = (seed: number): Rand => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

interface Ctx {
  readonly b: PartBuilder;
  readonly seed: SeedDef;
  readonly stage: Stage;
  readonly r: Rand;
  readonly leaf: number;
  readonly trunk: number;
  readonly paint: Paint;
  /** Where the canopy blobs are, for fruit, specks and glow. */
  readonly blobs: { x: number; y: number; z: number; s: number }[];
}

// ------------------------------------------------------------------ parts

/** A leaf cube: studded, faceted, slightly turned - the reference's canopy blocks. */
const leafCube = (c: Ctx, x: number, y: number, z: number, s: number, tint = 1): void => {
  c.b.box(s, s * 0.82, s, shade(c.leaf, tint), 'flat', { x, y, z, ry: c.r() * 1.2, rx: (c.r() - 0.5) * 0.25, rz: (c.r() - 0.5) * 0.25 });
  c.blobs.push({ x, y, z, s });
};

/** A cluster of leaf cubes round a point. */
const canopy = (c: Ctx, x: number, y: number, z: number, s: number, count: number): void => {
  leafCube(c, x, y, z, s, 1);
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + c.r();
    const d = s * (0.42 + c.r() * 0.18);
    leafCube(c, x + Math.cos(a) * d, y + (c.r() - 0.35) * s * 0.5, z + Math.sin(a) * d, s * (0.62 + c.r() * 0.2), 0.88 + c.r() * 0.24);
  }
};

/** A trunk segment between two points, as a studded block. */
const limb = (c: Ctx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, color = c.trunk): void => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.acos(Math.max(-1, Math.min(1, dy / Math.max(1e-6, len))));
  c.b.box(w, len + w * 0.3, w, color, 'stud', { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, ry: yaw, rx: pitch });
};

/** Thickness and canopy size by stage. */
const STAGE_TRUNK = [0.35, 0.7, 1.0, 1.35, 1.8] as const;
const STAGE_LEAF = [1.6, 2.6, 3.4, 4.0, 4.6] as const;

// --------------------------------------------------------------- families

/** The sprout every seed starts as: a stalk and two leaves in the seed's green. */
const sprout = (c: Ctx): void => {
  block(c.b, 0.5, 5, 0.5, mix(c.leaf, 0x3fae3a, 0.5), { y: 2.5 }, 'leaf');
  for (const side of [-1, 1]) {
    c.b.box(2.6, 0.35, 1.5, c.leaf, 'flat', { x: side * 1.3, y: 4.6 + side * 0.3, rz: side * 0.35 });
    c.blobs.push({ x: side * 1.3, y: 4.6, z: 0, s: 1.4 });
  }
  c.b.box(1.6, 1.6, 1.6, shade(c.leaf, 1.1), 'flat', { y: 5.4, ry: 0.6 });
};

/** The oak (and every broadleaf): a forked trunk, cube-cluster crowns. */
const broadleaf = (c: Ctx, spread = 1): void => {
  const w = STAGE_TRUNK[c.stage];
  const s = STAGE_LEAF[c.stage];
  const h = 5.2;
  limb(c, 0, 0, 0, 0, h, 0, w);
  // Roots at the foot of the bigger trees.
  if (c.stage >= 3) for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    limb(c, Math.cos(a) * w * 1.2, 0.2, Math.sin(a) * w * 1.2, 0, 1.4, 0, w * 0.5);
  }
  const forks = c.stage <= 1 ? 2 : c.stage === 2 ? 3 : 4;
  for (let i = 0; i < forks; i += 1) {
    const a = (i / forks) * Math.PI * 2 + c.r() * 0.6;
    const out = (1.9 + c.r() * 0.8) * spread * (0.8 + c.stage * 0.08);
    const tx = Math.cos(a) * out;
    const tz = Math.sin(a) * out;
    const ty = h + 1.6 + c.r() * 1.1;
    limb(c, 0, h - 0.8, 0, tx, ty, tz, w * 0.62);
    canopy(c, tx, ty + s * 0.3, tz, s * (0.85 + c.r() * 0.2), c.stage >= 3 ? 4 : 2);
  }
  canopy(c, 0, h + 2.6 + s * 0.2, 0, s * 1.05, c.stage >= 3 ? 5 : 3);
  if (c.stage === 4) canopy(c, 0, h + 4.3 + s * 0.4, 0, s * 0.8, 4);
};

/** The pine: a tall trunk under stacked, shrinking square tiers. */
const pine = (c: Ctx): void => {
  const w = STAGE_TRUNK[c.stage] * 0.8;
  limb(c, 0, 0, 0, 0, 9.4, 0, w);
  const tiers = 2 + c.stage;
  for (let i = 0; i < tiers; i += 1) {
    const t = i / Math.max(1, tiers - 1);
    const size = (5.8 - t * 4.2) * (0.75 + c.stage * 0.07);
    const y = 2.6 + t * 7;
    c.b.box(size, 1.3, size, shade(c.leaf, 0.9 + (i % 2) * 0.12), 'flat', { y, ry: i * 0.4 });
    c.b.box(size * 0.7, 0.9, size * 0.7, shade(c.leaf, 1.05), 'flat', { y: y + 0.9, ry: i * 0.4 + 0.4 });
    c.blobs.push({ x: 0, y, z: 0, s: size * 0.6 });
  }
  cone(c.b, 0.9, 1.6, c.leaf, { y: 11 }, 'flat', 4);
};

/** A palm: a leaning, segmented trunk and a crown of plank fronds. */
const palm = (c: Ctx): void => {
  const w = STAGE_TRUNK[c.stage] * 0.75;
  const n = 6;
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i += 1) {
    const nx = Math.sin((i + 1) / n) * 1.6;
    const ny = ((i + 1) / n) * 9.2;
    limb(c, px, py, 0, nx, ny, 0, w * (1 - i * 0.05), shade(c.trunk, i % 2 ? 0.9 : 1.05));
    px = nx;
    py = ny;
  }
  const fronds = 5 + c.stage;
  for (let i = 0; i < fronds; i += 1) {
    const a = (i / fronds) * Math.PI * 2 + c.r() * 0.3;
    for (let k = 0; k < 3; k += 1) {
      const d = 1.2 + k * 1.5;
      c.b.box(1.6 - k * 0.3, 0.25, 1.9, shade(c.leaf, 1 - k * 0.06), 'leaf', {
        x: px + Math.cos(a) * d,
        y: py + 0.4 - k * k * 0.45,
        z: Math.sin(a) * d,
        ry: -a + Math.PI / 2,
        rx: 0.2 + k * 0.35,
      });
    }
    c.blobs.push({ x: px + Math.cos(a) * 1.4, y: py - 0.4, z: Math.sin(a) * 1.4, s: 1.2 });
  }
};

/** A star-crowned tree: points of leaf radiating like a starfruit. */
const star = (c: Ctx): void => {
  broadleaf(c, 0.8);
  const y = 13;
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    c.b.box(1, 1, 3.2, c.paint.leaf ?? c.seed.accent, 'glow', { x: Math.cos(a) * 1.6, y, z: Math.sin(a) * 1.6, ry: -a + Math.PI / 2 });
  }
};

/** A glowing tree: a dark trunk under neon cubes. */
const glowing = (c: Ctx): void => {
  const w = STAGE_TRUNK[c.stage];
  limb(c, 0, 0, 0, 0, 6, 0, w);
  for (let i = 0; i < 3 + c.stage; i += 1) {
    const a = (i / (3 + c.stage)) * Math.PI * 2;
    const x = Math.cos(a) * 2.6;
    const z = Math.sin(a) * 2.6;
    limb(c, 0, 4.5, 0, x, 8, z, w * 0.5);
    c.b.box(2.6, 2.2, 2.6, c.paint.leaf ?? c.leaf, 'glow', { x, y: 9.2, z, ry: a });
    c.blobs.push({ x, y: 9.2, z, s: 2 });
  }
  c.b.box(3.4, 3, 3.4, c.seed.accent, 'glow', { y: 10.6, ry: 0.7 });
};

/** A blooming tree: green crowns dotted with big flower blocks. */
const blooming = (c: Ctx): void => {
  broadleaf(c, 0.95);
  for (const blob of c.blobs.slice(0, 8)) {
    for (let k = 0; k < 2; k += 1) {
      const x = blob.x + (c.r() - 0.5) * blob.s;
      const z = blob.z + (c.r() - 0.5) * blob.s;
      c.b.box(0.9, 0.5, 0.9, c.seed.fruit, 'smooth', { x, y: blob.y + blob.s * 0.45, z, ry: c.r() });
      c.b.box(0.4, 0.55, 0.4, c.seed.accent, 'glow', { x, y: blob.y + blob.s * 0.5, z });
    }
  }
};

/** A magic tree: a twisting violet trunk, floating crystal clusters. */
const magic = (c: Ctx): void => {
  const w = STAGE_TRUNK[c.stage];
  let x = 0;
  for (let i = 0; i < 5; i += 1) {
    const nx = Math.sin(i * 1.3) * 0.9;
    limb(c, x, i * 1.8, 0, nx, (i + 1) * 1.8, 0, w * (1 - i * 0.1));
    x = nx;
  }
  canopy(c, x, 10, 0, STAGE_LEAF[c.stage] * 1.05, 4);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    cone(c.b, 0.6, 2.2, c.seed.accent, { x: Math.cos(a) * 3.5, y: 12 + (i % 2) * 1.2, z: Math.sin(a) * 3.5, rx: (c.r() - 0.5) * 0.4 }, 'glow', 4);
  }
};

/** A pizza tree: a crust trunk with a canopy of pizza slices. */
const pizza = (c: Ctx): void => {
  const w = STAGE_TRUNK[c.stage];
  limb(c, 0, 0, 0, 0, 6.5, 0, w, 0xc98a3a);
  const slices = 6;
  for (let i = 0; i < slices; i += 1) {
    const a = (i / slices) * Math.PI * 2;
    wedge(c.b, 2.6, 0.5, 3.4, c.seed.leaf, { x: Math.cos(a) * 1.7, y: 8.6, z: Math.sin(a) * 1.7, ry: -a - Math.PI / 2 }, 'flat');
    block(c.b, 2.8, 0.6, 0.6, 0xd8913a, { x: Math.cos(a) * 3.4, y: 8.7, z: Math.sin(a) * 3.4, ry: -a + Math.PI / 2 }, 'smooth');
    cylinder(c.b, 0.45, 0.45, 0.2, c.seed.fruit, { x: Math.cos(a) * 2, y: 9.05, z: Math.sin(a) * 2 }, 'smooth', 8);
    c.blobs.push({ x: Math.cos(a) * 2, y: 9, z: Math.sin(a) * 2, s: 1.5 });
  }
  wedge(c.b, 3, 0.5, 3, shade(c.seed.leaf, 1.08), { y: 10.4, ry: 0.5 }, 'flat');
};

/** A diamond tree: a pale trunk branching into faceted crystals. */
const crystal = (c: Ctx): void => {
  const w = STAGE_TRUNK[c.stage];
  limb(c, 0, 0, 0, 0, 6, 0, w);
  for (let i = 0; i < 4 + c.stage; i += 1) {
    const a = (i / (4 + c.stage)) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 2.8;
    const z = Math.sin(a) * 2.8;
    limb(c, 0, 5, 0, x, 8.5, z, w * 0.5);
    const color = c.paint.leaf ?? (i % 2 ? c.leaf : c.seed.accent);
    cone(c.b, 1.2, 2.4, color, { x, y: 10.4, z }, 'glow', 4);
    cone(c.b, 1.2, 1.2, shade(color, 0.85), { x, y: 8.6, z, rx: Math.PI }, 'glow', 4);
    c.blobs.push({ x, y: 9.6, z, s: 1.8 });
  }
  cone(c.b, 1.6, 3.4, c.seed.fruit, { y: 12.5 }, 'glow', 4);
};

/** A void tree: a black trunk round a pulsing violet core. */
const voidTree = (c: Ctx): void => {
  const w = STAGE_TRUNK[c.stage];
  limb(c, 0, 0, 0, 0, 6.5, 0, w);
  canopy(c, 0, 9.5, 0, STAGE_LEAF[c.stage] * 1.1, 5);
  c.b.box(2.4, 2.4, 2.4, c.seed.fruit, 'glow', { y: 9.6, ry: 0.8, rx: 0.6 });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    c.b.box(0.5, 0.5, 0.5, c.seed.accent, 'glow', { x: Math.cos(a) * 4.4, y: 11 + (i % 2), z: Math.sin(a) * 4.4 });
  }
};

/** A pumpkin vine: a squat leafy bush with pumpkins at its feet. */
const pumpkin = (c: Ctx): void => {
  for (let i = 0; i < 4 + c.stage; i += 1) {
    const a = (i / (4 + c.stage)) * Math.PI * 2;
    leafCube(c, Math.cos(a) * 3, 2.2 + c.r(), Math.sin(a) * 3, 2.6);
  }
  leafCube(c, 0, 4.2, 0, 3.4);
  limb(c, 0, 0, 0, 0, 3.6, 0, 0.6, c.seed.trunk);
};

/** A sunflower: a tall stalk, leaves, and a great yellow face. */
const sunflower = (c: Ctx): void => {
  limb(c, 0, 0, 0, 0, 9.6, 0, STAGE_TRUNK[c.stage] * 0.6, c.seed.trunk);
  for (const [y, side] of [[3.5, 1], [6, -1]] as const) c.b.box(2.8, 0.3, 1.4, c.leaf, 'leaf', { x: side * 1.4, y, rz: side * 0.4 });
  cylinder(c.b, 2.2, 2.2, 0.5, c.seed.fruit, { y: 10.6, z: 0.3, rx: Math.PI / 2 }, 'smooth', 12);
  cylinder(c.b, 1.1, 1.1, 0.55, c.seed.accent, { y: 10.6, z: 0.36, rx: Math.PI / 2 }, 'smooth', 10);
  c.blobs.push({ x: 0, y: 10.6, z: 0, s: 2.2 });
};

/** A struck tree: the trunk and bare limbs, grey and splintered. */
const deadTree = (c: Ctx): void => {
  const grey = c.seed.look === 'pine' ? 0x5a4636 : 0x7e7e80;
  const w = STAGE_TRUNK[Math.max(1, c.stage) as Stage];
  limb(c, 0, 0, 0, 0, 8.5, 0, w, grey);
  const branches = 3 + c.stage;
  for (let i = 0; i < branches; i += 1) {
    const a = (i / branches) * Math.PI * 2 + c.r();
    const y = 3.5 + (i / branches) * 4.5;
    const out = 1.6 + c.r() * 1.4;
    limb(c, 0, y, 0, Math.cos(a) * out, y + 2 + c.r(), Math.sin(a) * out, w * 0.42, shade(grey, 0.92));
    // A forked twig at the end.
    limb(c, Math.cos(a) * out, y + 2, Math.sin(a) * out, Math.cos(a) * (out + 0.8), y + 3.4, Math.sin(a) * (out + 0.8), w * 0.26, shade(grey, 0.85));
  }
  // Scorch at the foot and a splintered top.
  block(c.b, w * 1.6, 0.3, w * 1.6, 0x2a2420, { y: 0.15 }, 'flat');
  cone(c.b, w * 0.5, 1.2, shade(grey, 0.8), { y: 9.2 }, 'flat', 4);
};

/** Fruit on the canopy blobs (fruit trees, palms, blossoms). */
const hangFruit = (c: Ctx, count: number, color: number, r = 0.55): void => {
  const blobs = c.blobs;
  if (blobs.length === 0) return;
  for (let i = 0; i < count; i += 1) {
    const blob = blobs[(i * 7) % blobs.length]!;
    const a = c.r() * Math.PI * 2;
    ball(c.b, r, color, { x: blob.x + Math.cos(a) * blob.s * 0.45, y: blob.y - blob.s * 0.3, z: blob.z + Math.sin(a) * blob.s * 0.45 }, 'smooth', 0);
  }
};

/** The mutation's decoration: specks, frost caps, bugs, drips, a glow core. */
const decorate = (c: Ctx): void => {
  const p = c.paint;
  const blobs = c.blobs.slice(0, 10);
  if (p.speck !== null) for (const blob of blobs) for (let k = 0; k < 2; k += 1) {
    c.b.box(0.35, 0.35, 0.35, p.speck, 'glow', { x: blob.x + (c.r() - 0.5) * blob.s * 1.1, y: blob.y + (c.r() - 0.2) * blob.s * 0.6, z: blob.z + (c.r() - 0.5) * blob.s * 1.1 });
  }
  if (p.frost) for (const blob of blobs) c.b.box(blob.s * 0.9, 0.3, blob.s * 0.9, 0xffffff, 'flat', { x: blob.x, y: blob.y + blob.s * 0.42, z: blob.z, ry: c.r() });
  if (p.bugs) for (const blob of blobs.slice(0, 5)) c.b.box(0.4, 0.25, 0.6, 0x2a1a0a, 'smooth', { x: blob.x + blob.s * 0.5, y: blob.y, z: blob.z, ry: c.r() * 3 });
  if (p.drips !== null) for (const blob of blobs.slice(0, 6)) c.b.box(0.3, 0.9, 0.3, p.drips, 'glow', { x: blob.x, y: blob.y - blob.s * 0.5, z: blob.z + blob.s * 0.3 });
  if (p.glow !== null) for (const blob of blobs.slice(0, 4)) c.b.box(blob.s * 0.4, blob.s * 0.4, blob.s * 0.4, p.glow, 'glow', { x: blob.x, y: blob.y, z: blob.z, ry: 0.78, rx: 0.6 });
};

// ------------------------------------------------------------------ build

const cache = new Map<string, Partial<Record<PartKind, BufferGeometry>>>();

/** The parts of a tree of one seed, stage, life and mutation look, at model height 10. */
const treeGeometry = (seedId: number, stage: Stage, dead: boolean, mut: number): Partial<Record<PartKind, BufferGeometry>> => {
  const paint = paintOf(dead ? 0 : mut);
  const key = `${seedId}:${stage}:${dead ? 1 : 0}:${paintKey(paint)}`;
  const known = cache.get(key);
  if (known) return known;
  const seed = seedById(seedId) ?? seedById(1)!;
  const b = new PartBuilder();
  const c: Ctx = {
    b,
    seed,
    stage,
    r: seeded(seedId * 131 + stage * 7),
    leaf: paint.leaf ?? seed.leaf,
    trunk: paint.trunk ?? seed.trunk,
    paint,
    blobs: [],
  };
  if (dead) deadTree(c);
  else if (stage === 0) sprout(c);
  else {
    switch (seed.look) {
      case 'oak':
        broadleaf(c);
        break;
      case 'pine':
        pine(c);
        break;
      case 'fruit':
        broadleaf(c, 1.05);
        if (stage >= 2) hangFruit(c, 4 + stage * 3, seed.fruit);
        break;
      case 'blossom':
        broadleaf(c, 1.1);
        if (stage >= 2) hangFruit(c, 6 + stage * 2, seed.fruit, 0.4);
        break;
      case 'maple':
        broadleaf(c, 1.1);
        break;
      case 'palm':
        palm(c);
        if (stage >= 2) hangFruit(c, 3 + stage, seed.fruit, seed.key === 'banana' ? 0.7 : 0.6);
        break;
      case 'star':
        star(c);
        if (stage >= 2) hangFruit(c, 4 + stage * 2, seed.fruit);
        break;
      case 'glow':
        glowing(c);
        break;
      case 'bloom':
        blooming(c);
        break;
      case 'magic':
        magic(c);
        break;
      case 'pizza':
        pizza(c);
        break;
      case 'crystal':
        crystal(c);
        break;
      case 'void':
        voidTree(c);
        break;
      case 'pumpkin':
        pumpkin(c);
        if (stage >= 1) for (let i = 0; i < 2 + stage; i += 1) {
          const a = (i / (2 + stage)) * Math.PI * 2 + 0.4;
          ball(b, 1.1, seed.fruit, { x: Math.cos(a) * 3.6, y: 1, z: Math.sin(a) * 3.6, sy: 0.75 }, 'smooth', 1);
          block(b, 0.2, 0.6, 0.2, 0x4f7a2a, { x: Math.cos(a) * 3.6, y: 1.9, z: Math.sin(a) * 3.6 });
        }
        break;
      case 'sunflower':
        sunflower(c);
        break;
    }
    decorate(c);
  }
  const geometries = b.geometries();
  cache.set(key, geometries);
  return geometries;
};

/**
 * A tree, built and sized: model height 10 scaled to `treeHeight(mult)` (a
 * Huge tree a size bigger). Returns a group of shared-geometry meshes.
 */
export const buildTree = (seedId: number, mult: number, dead: boolean, mut: number): Group => {
  const stage = stageOf(mult);
  const group = meshesFor(treeGeometry(seedId, stage, dead, mut), `tree-${seedId}`, true);
  const huge = (mut & (1 << 11)) !== 0 ? 1.18 : 1;
  group.scale.setScalar((treeHeight(mult) / 10) * huge);
  return group;
};

/** The key that decides whether a tree's model must be rebuilt. */
export const treeKey = (seedId: number, mult: number, dead: boolean, mut: number): string => `${seedId}:${stageOf(mult)}:${dead ? 1 : 0}:${paintKey(paintOf(dead ? 0 : mut))}`;

/** A seed: the little block bought off the river and carried in hand. */
export const buildSeed = (b: PartBuilder, seedId: number, scale = 1): void => {
  const seed = seedById(seedId) ?? seedById(1)!;
  b.box(0.8 * scale, 1 * scale, 0.8 * scale, seed.seedColor, 'flat', { y: 0.5 * scale, ry: 0.3 });
  b.box(0.5 * scale, 0.3 * scale, 0.5 * scale, shade(seed.seedColor, 1.25), 'flat', { y: 1.1 * scale, ry: 0.3 });
  if (seed.rarity !== 'common' && seed.rarity !== 'rare') b.box(0.3 * scale, 0.3 * scale, 0.3 * scale, seed.accent, 'glow', { y: 1.35 * scale });
};

/** A fruit, as it hangs, sits in a basket or is held. */
export const buildFruit = (b: PartBuilder, seedId: number, scale = 1, color?: number): void => {
  const seed = seedById(seedId) ?? seedById(1)!;
  const c = color ?? seed.fruit;
  switch (seed.look) {
    case 'pine':
    case 'oak':
      // A cone or an acorn.
      ball(b, 0.5 * scale, c, { y: 0.5 * scale, sy: 1.2 }, 'smooth', 0);
      block(b, 0.7 * scale, 0.3 * scale, 0.7 * scale, shade(c, 0.7), { y: 1 * scale });
      break;
    case 'palm':
      if (seed.key === 'banana') {
        for (let i = 0; i < 3; i += 1) block(b, 0.3 * scale, 1.3 * scale, 0.3 * scale, c, { x: (i - 1) * 0.3 * scale, y: 0.7 * scale, rz: (i - 1) * 0.35 });
      } else ball(b, 0.6 * scale, c, { y: 0.6 * scale }, 'smooth', 1);
      break;
    case 'star':
      for (let i = 0; i < 5; i += 1) block(b, 0.32 * scale, 0.5 * scale, 0.9 * scale, c, { y: 0.5 * scale, ry: (i / 5) * Math.PI * 2 });
      break;
    case 'pizza':
      wedge(b, 1 * scale, 0.25 * scale, 1.2 * scale, 0xffcf4a, { y: 0.2 * scale });
      cylinder(b, 0.2 * scale, 0.2 * scale, 0.1 * scale, c, { y: 0.35 * scale }, 'smooth', 6);
      break;
    case 'crystal':
    case 'magic':
    case 'glow':
    case 'void':
      cone(b, 0.5 * scale, 1.2 * scale, c, { y: 0.6 * scale }, 'glow', 4);
      break;
    default:
      ball(b, 0.55 * scale, c, { y: 0.55 * scale }, 'smooth', 1);
      block(b, 0.12 * scale, 0.3 * scale, 0.12 * scale, 0x5a3a1a, { y: 1.15 * scale });
      block(b, 0.35 * scale, 0.08 * scale, 0.2 * scale, 0x4cb83a, { x: 0.18 * scale, y: 1.18 * scale });
  }
};
