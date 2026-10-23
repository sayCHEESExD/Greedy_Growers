import type { PartBuilder } from '../render/PartBuilder.js';
import { seededRandom, shade } from './shapes.js';
import { palm } from './nature.js';

/**
 * THE ISLAND'S TREES, one builder per species, each at scale 1 around the
 * origin (trunk base at y = 0). The island draws every tree of a species and
 * variant as ONE instanced mesh, so these are built once each and never per
 * tree: a thousand oaks cost what one does, plus a matrix apiece.
 *
 * Roblox block trees throughout: studded bark, big studded leaf cubes, no
 * spheres - chunky enough to read from across the island.
 */

type Rand = () => number;

const BARK = [0x8a5a36, 0x7e5232, 0x96643c] as const;
const OAK_LEAVES = [0x5cc23c, 0x66cc40, 0x52b638, 0x6fd048] as const;
const PINE_LEAVES = [0x2f8a3e, 0x2a7e3a, 0x359446] as const;
const BIRCH_LEAVES = [0x9ad84e, 0x8ed048, 0xa6e056] as const;
const BLOSSOM = [0xffa6d2, 0xff96c8, 0xffb8dc] as const;
const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;

/**
 * A TALL OAK, the island's signature tree: a thick straight trunk of studded
 * bark, a branch or two, and a crown of big square leaf slabs stacked and
 * offset like a Roblox builder's - about 14 tall.
 */
const oak = (b: PartBuilder, r: Rand): void => {
  const bark = pick(r, BARK);
  const leaf = pick(r, OAK_LEAVES);
  const h = 7.5 + r() * 2;
  const w = 1.5;
  b.box(w, h, w, bark, 'stud', { y: h / 2 });
  b.box(w + 0.5, 0.8, w + 0.5, shade(bark, 0.9), 'stud', { y: 0.4 });
  // Branches reaching out to side crowns.
  const branches = 1 + Math.floor(r() * 2);
  for (let i = 0; i < branches; i += 1) {
    const a = r() * Math.PI * 2;
    const len = 3 + r() * 1.5;
    const y = h * (0.55 + r() * 0.25);
    b.box(0.8, len, 0.8, shade(bark, 0.95), 'stud', { x: Math.sin(a) * len * 0.35, y: y + len * 0.3, z: Math.cos(a) * len * 0.35, ry: a, rx: 0.8 });
    const cx = Math.sin(a) * len * 0.75;
    const cz = Math.cos(a) * len * 0.75;
    const size = 3.4 + r() * 1.2;
    b.box(size, size * 0.62, size, shade(leaf, 0.94), 'stud', { x: cx, y: y + len * 0.62 + size * 0.2, z: cz, ry: r() * 0.6 });
  }
  // The crown: a wide slab, a smaller one on top, offset blocks round it.
  const top = h;
  const crown = 6.2 + r() * 1.6;
  b.box(crown, 2.8, crown, leaf, 'stud', { y: top + 0.6, ry: r() * 0.5 });
  b.box(crown * 0.72, 2.4, crown * 0.72, shade(leaf, 1.07), 'stud', { x: (r() - 0.5) * 1.2, y: top + 3, z: (r() - 0.5) * 1.2, ry: r() * 0.7 });
  b.box(crown * 0.42, 1.6, crown * 0.42, shade(leaf, 1.12), 'stud', { x: (r() - 0.5) * 1.4, y: top + 4.8, z: (r() - 0.5) * 1.4, ry: r() });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + r();
    const s = 2.4 + r() * 1.2;
    b.box(s, s * 0.8, s, shade(leaf, 0.9 + r() * 0.15), 'stud', { x: Math.sin(a) * crown * 0.45, y: top - 0.4 + r() * 1.2, z: Math.cos(a) * crown * 0.45, ry: r() });
  }
};

/** A PINE: a tall trunk under tiers of square studded slabs, each turned and smaller than the last - about 16 tall. */
const pine = (b: PartBuilder, r: Rand): void => {
  const bark = shade(pick(r, BARK), 0.85);
  const leaf = pick(r, PINE_LEAVES);
  const h = 4 + r() * 1.5;
  b.box(1.1, h + 6, 1.1, bark, 'stud', { y: (h + 6) / 2 });
  const tiers = 4 + Math.floor(r() * 2);
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers;
    const size = 7.2 * (1 - t * 0.78);
    const y = h + i * 2.3;
    b.box(size, 1.9, size, shade(leaf, 0.92 + t * 0.2), 'stud', { y: y + 0.95, ry: (i % 2) * (Math.PI / 4) + r() * 0.2 });
  }
  b.box(0.9, 1.6, 0.9, shade(leaf, 1.2), 'stud', { y: h + tiers * 2.3 + 0.8 });
};

/** A BIRCH: a slender white trunk flecked black, small bright crowns high up - about 15 tall. */
const birch = (b: PartBuilder, r: Rand): void => {
  const leaf = pick(r, BIRCH_LEAVES);
  const h = 10 + r() * 2.5;
  b.box(0.8, h, 0.8, 0xf2efe6, 'stud', { y: h / 2, rz: (r() - 0.5) * 0.06 });
  for (let i = 0; i < 7; i += 1) {
    const y = 1 + r() * (h - 2);
    const side = Math.floor(r() * 4);
    const dx = side === 0 ? 0.41 : side === 1 ? -0.41 : 0;
    const dz = side === 2 ? 0.41 : side === 3 ? -0.41 : 0;
    b.box(dx ? 0.05 : 0.5, 0.18, dz ? 0.05 : 0.5, 0x2a2a2a, 'smooth', { x: dx, y, z: dz });
  }
  const crowns = 3 + Math.floor(r() * 2);
  for (let i = 0; i < crowns; i += 1) {
    const a = r() * Math.PI * 2;
    const d = i === 0 ? 0 : 1.2 + r() * 1.2;
    const s = 2.6 + r() * 1.4;
    b.box(s, s * 1.1, s, shade(leaf, 0.9 + r() * 0.2), 'stud', { x: Math.sin(a) * d, y: h - 1.5 + r() * 3.5, z: Math.cos(a) * d, ry: r() });
  }
};

/** A ROUND TREE: a trunk forking into two or three branches, each crowned with a cluster of leaf cubes - about 11 tall. */
export const round = (b: PartBuilder, r: Rand, leaves: readonly number[] = OAK_LEAVES, extra = 0): void => {
  const bark = pick(r, BARK);
  const leaf = pick(r, leaves);
  const h = 5 + r() * 2;
  const w = 1.2;
  b.box(w, h, w, bark, 'stud', { y: h / 2, ry: r() });
  const forks = 2 + Math.floor(r() * 2);
  for (let i = 0; i < forks; i += 1) {
    const a = (i / forks) * Math.PI * 2 + r() * 0.8;
    const len = 2.8 + r() * 1.6;
    const lean = 0.55 + r() * 0.35;
    b.box(w * 0.7, len, w * 0.7, shade(bark, 0.95), 'stud', { x: Math.sin(a) * Math.sin(lean) * len * 0.5, y: h + Math.cos(lean) * len * 0.5 - 0.6, z: Math.cos(a) * Math.sin(lean) * len * 0.5, ry: a, rx: lean });
    const tx = Math.sin(a) * Math.sin(lean) * len;
    const tz = Math.cos(a) * Math.sin(lean) * len;
    const ty = h + Math.cos(lean) * len - 0.4;
    const size = 3 + r() * 1.3;
    b.box(size * 1.3, size * 0.6, size * 1.3, leaf, 'stud', { x: tx, y: ty + size * 0.1, z: tz, ry: r() });
    b.box(size, size * 0.6, size, shade(leaf, 1.08), 'stud', { x: tx + (r() - 0.5), y: ty + size * 0.6, z: tz + (r() - 0.5), ry: r() });
    b.box(size * 0.8, size * 0.5, size * 0.8, shade(leaf, 0.92), 'stud', { x: tx + (r() - 0.5) * size * 0.8, y: ty - size * 0.3, z: tz + (r() - 0.5) * size * 0.8, ry: r() });
  }
  b.box(3.4, 1.8, 3.4, leaf, 'stud', { y: h + 0.7, ry: r() });
  // Blossom petals drifting under the crown.
  for (let i = 0; i < extra; i += 1) {
    const a = r() * Math.PI * 2;
    const d = 1.5 + r() * 3.5;
    b.box(0.35, 0.08, 0.35, 0xffd6ea, 'smooth', { x: Math.sin(a) * d, y: 0.05, z: Math.cos(a) * d, ry: r() });
  }
};

/** A POPLAR: tall and narrow, a column of leaf blocks up a thin trunk - about 18 tall. */
const poplar = (b: PartBuilder, r: Rand): void => {
  const bark = pick(r, BARK);
  const leaf = shade(pick(r, OAK_LEAVES), 0.9);
  b.box(0.9, 5, 0.9, bark, 'stud', { y: 2.5 });
  const blocks = 5;
  for (let i = 0; i < blocks; i += 1) {
    const t = i / (blocks - 1);
    const s = 3.6 * (1 - Math.abs(t - 0.35) * 0.9);
    b.box(s, 3, s, shade(leaf, 0.92 + t * 0.18), 'stud', { x: (r() - 0.5) * 0.4, y: 5 + i * 2.6 + 1, z: (r() - 0.5) * 0.4, ry: r() * 0.5 });
  }
};

/** Build one prototype tree of a species (the index in `TREE_KINDS`) and variant. */
export const buildTree = (b: PartBuilder, kind: number, variant: number): void => {
  const r = seededRandom(kind * 7919 + variant * 104729 + 17);
  switch (kind) {
    case 0:
      oak(b, r);
      break;
    case 1:
      pine(b, r);
      break;
    case 2:
      birch(b, r);
      break;
    case 3:
      round(b, r);
      break;
    case 4:
      round(b, r, BLOSSOM, 10);
      break;
    case 5:
      poplar(b, r);
      break;
    default:
      palm(b, r, 0, 0, 1.3);
      break;
  }
};

/** How many shape variants each species has. */
export const TREE_VARIANTS = 4;
