import { BoxGeometry, BufferAttribute, type BufferGeometry, Color, ConeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PartBuilder } from '../render/PartBuilder.js';
import { archRoot, rock, shade, trunkGeometry, type Rand } from './WildNature.js';

/**
 * THE PREHISTORIC WILD, in Roblox blocks: the plants, rocks and ground
 * features that make the valley and its thirty habitats - giant leaves and
 * bromeliads, reeds and lily pads, tall grass and mushrooms, great fallen
 * trees with their root plates, rock formations, basalt, ice, ruins, coral -
 * and the NATURAL TERRAIN WALL every area is closed in by.
 *
 * Layering rule: wherever one block sits on or wraps another, its faces are
 * kept a clear step away from the other's (a cap overhangs, a band is inset),
 * so no two faces ever lie in the same plane.
 */

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);
const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;

/** Leaf greens beyond the basic grass: emerald, teal, lime, yellow-green, deep jungle. */
export const FOLIAGE = [0x2fb45a, 0x2e9e6e, 0x6fd23e, 0x9ed83c, 0x23803a, 0x44c24a] as const;
/** The bright blooms of the wild. */
export const BLOOMS = [0xe84aa8, 0xff8a2a, 0xff4a3a, 0xffd23a, 0x9a5ae8, 0xffffff] as const;

// ------------------------------------------------------------------ plants

/** A clump of GIANT LEAVES: broad planks on stems, tilted up and out, a paler midrib on each. */
export const giantLeaves = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color: number = pick(r, FOLIAGE)): void => {
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    const stem = s * (1.1 + r() * 0.9);
    const lean = 0.35 + r() * 0.2;
    const tipX = x + fx * Math.sin(lean) * stem;
    const tipZ = z + fz * Math.sin(lean) * stem;
    const tipY = y + Math.cos(lean) * stem;
    b.add(box(s * 0.14, stem, s * 0.14), 0x3a8a2a, 'flat', { x: (x + tipX) / 2, y: (y + tipY) / 2, z: (z + tipZ) / 2, ry: a, rx: lean });
    const len = s * (1.7 + r() * 0.6);
    const tilt = 0.15 + r() * 0.3;
    const c = shade(color, 0.88 + r() * 0.24);
    const lx = tipX + fx * len * 0.45;
    const lz = tipZ + fz * len * 0.45;
    const ly = tipY - Math.sin(tilt) * len * 0.3;
    b.add(box(s * (1.1 + r() * 0.3), s * 0.08, len), c, 'leaf', { x: lx, y: ly, z: lz, ry: a, rx: tilt });
    b.add(box(s * 0.12, s * 0.1, len * 0.9), shade(c, 1.25), 'flat', { x: lx, y: ly + s * 0.04, z: lz, ry: a, rx: tilt });
  }
};

/** A BROMELIAD: a rosette of spiky green leaves round a bright spike of bloom. */
export const bromeliad = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, bloom: number = pick(r, BLOOMS)): void => {
  const n = 8;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const h = s * (1.0 + r() * 0.5);
    const lean = 0.7 + r() * 0.3;
    b.add(new ConeGeometry(s * 0.24, h, 3), shade(0x3fb44a, 0.85 + r() * 0.3), 'leaf', {
      x: x + Math.sin(a) * h * 0.3,
      y: y + h * 0.36,
      z: z + Math.cos(a) * h * 0.3,
      ry: a,
      rx: lean,
      sz: 0.35,
    });
  }
  for (let i = 0; i < 3; i += 1) {
    const h = s * (0.8 + r() * 0.5);
    b.add(new ConeGeometry(s * 0.2, h, 4), shade(bloom, 0.9 + r() * 0.2), 'flat', { x: x + (r() - 0.5) * s * 0.4, y: y + h / 2 + s * 0.2, z: z + (r() - 0.5) * s * 0.4, rx: (r() - 0.5) * 0.3 });
  }
};

/** Reeds: a stand of thin stalks, some with brown seed heads. */
export const reeds = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0x9acd4a): void => {
  const n = 6 + Math.floor(r() * 5);
  for (let i = 0; i < n; i += 1) {
    const h = s * (1.4 + r() * 1.6);
    const px = x + (r() - 0.5) * s * 1.6;
    const pz = z + (r() - 0.5) * s * 1.6;
    const lean = (r() - 0.5) * 0.3;
    b.add(box(s * 0.12, h, s * 0.12), shade(color, 0.85 + r() * 0.3), 'flat', { x: px, y: y + h / 2, z: pz, rz: lean });
    if (r() < 0.45) b.add(box(s * 0.26, s * 0.55, s * 0.26), 0x7a4a26, 'flat', { x: px - Math.sin(lean) * h * 0.45, y: y + h - s * 0.1, z: pz, rz: lean });
  }
};

/** Lily pads floating on water at height y, one or two in flower. */
export const lilyPads = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const px = x + (r() - 0.5) * s * 3;
    const pz = z + (r() - 0.5) * s * 3;
    const size = s * (0.8 + r() * 0.5);
    b.add(box(size, 0.06, size), shade(0x3fae3a, 0.85 + r() * 0.3), 'flat', { x: px, y: y + 0.04, z: pz, ry: r() * 2 });
    if (r() < 0.35) {
      b.add(box(size * 0.34, s * 0.2, size * 0.34), 0xff8ac8, 'flat', { x: px, y: y + 0.17, z: pz, ry: r() });
      b.add(box(size * 0.14, s * 0.24, size * 0.14), 0xffe060, 'flat', { x: px, y: y + 0.19, z: pz });
    }
  }
};

/** Tall grass: a clump of long blades, head-high on a small monkey. */
export const tallGrass = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0x7ccf3f): void => {
  const n = 8 + Math.floor(r() * 5);
  for (let i = 0; i < n; i += 1) {
    const h = s * (1.6 + r() * 1.4);
    const a = r() * Math.PI * 2;
    const d = r() * s * 0.8;
    const lean = 0.1 + r() * 0.3;
    b.add(new ConeGeometry(s * 0.2, h, 3), shade(color, 0.82 + r() * 0.36), 'leaf', {
      x: x + Math.cos(a) * d,
      y: y + h * 0.45,
      z: z + Math.sin(a) * d,
      sz: 0.3,
      ry: -a,
      rx: Math.sin(a) * lean,
      rz: -Math.cos(a) * lean,
    });
  }
};

/** Mushrooms: pale stems, bright caps with a few spots. */
export const mushrooms = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0xe8423a): void => {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const h = s * (0.3 + r() * 0.6);
    const px = x + (r() - 0.5) * s * 1.2;
    const pz = z + (r() - 0.5) * s * 1.2;
    const cap = s * (0.45 + r() * 0.35);
    b.add(box(s * 0.16, h, s * 0.16), 0xf4ecd8, 'flat', { x: px, y: y + h / 2, z: pz });
    b.add(box(cap, cap * 0.4, cap), shade(color, 0.9 + r() * 0.2), 'flat', { x: px, y: y + h + cap * 0.2, z: pz, ry: r() });
    b.add(box(cap * 0.22, cap * 0.44, cap * 0.22), 0xffffff, 'flat', { x: px + cap * 0.2, y: y + h + cap * 0.2, z: pz - cap * 0.1 });
  }
};

/** A little scatter of pebbles on the ground. */
export const pebbles = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0x9a948a): void => {
  for (let i = 0; i < 4; i += 1) rock(b, r, x + (r() - 0.5) * s * 2, y, z + (r() - 0.5) * s * 2, s * (0.14 + r() * 0.14), color);
};

/** A fallen branch: a thin block limb, two twigs and a spray of leaves. */
export const branch = (b: PartBuilder, r: Rand, x: number, z: number, len: number, ry: number, s = 1, y = 0): void => {
  const t = s * 0.34;
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  b.add(box(t, t, len), shade(0x7a4e28, 0.9 + r() * 0.2), 'flat', { x, y: y + t / 2, z, ry });
  for (const k of [-0.25, 0.2]) {
    const side = r() < 0.5 ? -1 : 1;
    b.add(box(t * 0.6, t * 0.6, len * 0.35), 0x6a4020, 'flat', { x: x + fx * len * k + fz * side * len * 0.12, y: y + t * 0.35, z: z + fz * len * k - fx * side * len * 0.12, ry: ry + side * 0.7 });
  }
  b.add(box(s * 0.9, s * 0.5, s * 0.9), shade(pick(r, FOLIAGE), 0.9), 'flat', { x: x + fx * len * 0.5, y: y + s * 0.3, z: z + fz * len * 0.5, ry: r() });
};

/**
 * A GREAT FALLEN TREE: a thick square trunk ringed with bark bands, moss
 * along its back, orange shelf fungi on its flank and the torn-up root
 * plate standing at one end.
 */
export const bigFallenTree = (b: PartBuilder, r: Rand, x: number, z: number, len: number, ry: number, s = 1, y = 0): void => {
  const t = s * 1.6;
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  const bark = shade(0x8a5a2e, 0.9 + r() * 0.15);
  b.add(box(t, t, len), bark, 'flat', { x, y: y + t / 2, z, ry });
  for (let k = -1; k <= 1; k += 1) {
    const d = (k * len) / 3.2;
    b.add(box(t * 1.08, t * 1.08, s * 0.35), shade(bark, 0.82), 'flat', { x: x + fx * d, y: y + t / 2, z: z + fz * d, ry });
  }
  b.add(box(t * 0.8, s * 0.3, len * 0.75), 0x5cc43a, 'flat', { x: x - fx * len * 0.05, y: y + t + s * 0.12, z: z - fz * len * 0.05, ry });
  for (let i = 0; i < 3; i += 1) {
    const d = (r() - 0.5) * len * 0.7;
    const side = r() < 0.5 ? -1 : 1;
    b.add(box(s * 0.9, s * 0.16, s * 0.6), 0xff9a3a, 'flat', { x: x + fx * d + fz * side * t * 0.62, y: y + t * (0.4 + r() * 0.35), z: z + fz * d - fx * side * t * 0.62, ry });
  }
  // The root plate: a ring of root blocks and an earth disc, standing on end.
  const ex = x + fx * len * 0.5;
  const ez = z + fz * len * 0.5;
  b.add(box(t * 2.6, t * 2.6, s * 0.5), 0x7a5230, 'flat', { x: ex + fx * s * 0.2, y: y + t * 1.1, z: ez + fz * s * 0.2, ry });
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const reach = t * (1.4 + r() * 0.5);
    const px = Math.cos(a) * reach;
    const py = Math.sin(a) * reach;
    b.add(box(s * 0.4, s * 0.4, s * 1.2), 0x6a4424, 'flat', { x: ex + fz * px + fx * s * 0.5, y: Math.max(y + s * 0.2, y + t * 1.1 + py), z: ez - fx * px + fz * s * 0.5, ry: ry + (r() - 0.5) * 0.6 });
  }
};

/** A root tangle: arching roots thrown out in every direction from a gnarled stump. */
export const rootTangle = (b: PartBuilder, r: Rand, x: number, z: number, s = 1, y = 0): void => {
  b.add(trunkGeometry(s * 2.2, s * 1.0, s * 0.7, 0, 4, 3), 0x7a4e28, 'flat', { x, y, z, ry: r() });
  const n = 4;
  for (let i = 0; i < n; i += 1) archRoot(b, r, x, y, z, s * (0.55 + r() * 0.2), (i / n) * Math.PI * 2 + r() * 0.5);
};

/** Hanging vines down a face: a strand of blocks with leaves either side, from yTop down `len`. */
export const hangingVine = (b: PartBuilder, r: Rand, x: number, yTop: number, z: number, len: number, s = 1): void => {
  const segs = Math.max(2, Math.round(len / (s * 0.9)));
  const seg = len / segs;
  const green = pick(r, FOLIAGE);
  for (let i = 0; i < segs; i += 1) {
    const y = yTop - seg * (i + 0.5);
    const sway = Math.sin(i * 0.9 + r()) * s * 0.12;
    b.add(box(s * 0.16, seg * 1.02, s * 0.16), 0x3a8a2a, 'flat', { x: x + sway, y, z: z + sway });
    if (i % 2 === 0) b.add(box(s * 0.6, s * 0.1, s * 0.34), shade(green, 0.9 + r() * 0.2), 'leaf', { x: x + sway, y: y - seg * 0.2, z: z + sway, ry: r() * Math.PI, rz: 0.35 });
  }
};

/** Coral: branching blocks of pink, orange and violet, standing in a lagoon's shallows. */
export const coral = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const color = pick(r, [0xff6a8a, 0xff9a4a, 0xb86aff, 0xff4a6a] as const);
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const h = s * (0.8 + r() * 1.1);
    const px = x + (r() - 0.5) * s * 1.2;
    const pz = z + (r() - 0.5) * s * 1.2;
    b.add(box(s * 0.3, h, s * 0.3), shade(color, 0.9 + r() * 0.2), 'flat', { x: px, y: y + h / 2, z: pz, rz: (r() - 0.5) * 0.4 });
    b.add(box(s * 0.44, s * 0.3, s * 0.44), shade(color, 1.15), 'flat', { x: px, y: y + h, z: pz, ry: r() });
  }
};

// ------------------------------------------------------------ formations

export interface Top {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
}

/**
 * A ROCK FORMATION filling a footprint: a broad base block, a smaller one
 * stepped on it and a crown stone, each with alternating strata and (where
 * things grow) a turf cap that overhangs its edges. Returns the tops to
 * plant on, highest first.
 */
export const rockFormation = (b: PartBuilder, r: Rand, cx: number, cz: number, w: number, d: number, h: number, color: number, cap: number | null, y = 0): Top[] => {
  const tops: Top[] = [];
  const h1 = h * (0.5 + r() * 0.1);
  const h2 = h * 0.32;
  const h3 = h - h1 - h2;
  const w2 = w * (0.58 + r() * 0.12);
  const d2 = d * (0.55 + r() * 0.12);
  const ox = (r() < 0.5 ? -1 : 1) * (w - w2) * (0.3 + r() * 0.15);
  const oz = (r() < 0.5 ? -1 : 1) * (d - d2) * (0.3 + r() * 0.15);
  const w3 = w2 * 0.55;
  const d3 = d2 * 0.6;
  const ox3 = ox + (r() - 0.5) * (w2 - w3) * 0.8;
  const oz3 = oz + (r() - 0.5) * (d2 - d3) * 0.8;
  const blocks: readonly (readonly [number, number, number, number, number, number, number])[] = [
    [cx, cz, w, d, y - 0.2, y + h1, 0],
    [cx + ox, cz + oz, w2, d2, y + h1, y + h1 + h2, (r() - 0.5) * 0.5],
    [cx + ox3, cz + oz3, w3, d3, y + h1 + h2, y + h, (r() - 0.5) * 0.7],
  ];
  blocks.forEach(([bx, bz, bw, bd, y0, y1, ry], i) => {
    const tone = shade(color, i % 2 ? 0.88 : 1 + r() * 0.06);
    b.box(bw, y1 - y0, bd, tone, 'flat', { x: bx, y: (y0 + y1) / 2, z: bz, ry });
    // A darker stratum band, standing a step proud of the block's faces.
    if (y1 - y0 > 2.2) b.box(bw + 0.12, 0.4, bd + 0.12, shade(color, 0.72), 'flat', { x: bx, y: y0 + (y1 - y0) * 0.42, z: bz, ry });
    let top = y1;
    if (cap !== null) {
      b.box(bw + 0.3, 0.36, bd + 0.3, shade(cap, 0.95 + r() * 0.1), 'flat', { x: bx, y: y1 + 0.18 - 0.01, z: bz, ry });
      // Moss dripping over one edge.
      const edge = r() < 0.5 ? 1 : -1;
      b.box(0.3, 0.5 + r() * 0.5, bd * 0.5, shade(cap, 0.88), 'flat', { x: bx + Math.cos(ry) * edge * (bw / 2 + 0.1), y: y1 - 0.3, z: bz - Math.sin(ry) * edge * (bw / 2 + 0.1), ry });
      top = y1 + 0.35;
    }
    tops.unshift({ x: bx, z: bz, y: top, w: bw, d: bd });
  });
  // A boulder heaped against the upper stone on the base's open side.
  rock(b, r, cx - ox * 0.9, y + h1 - 0.3, cz - oz * 0.9, Math.min(w, d) * 0.22, shade(color, 0.95));
  // Loose stones at its foot.
  for (let i = 0; i < 3; i += 1) {
    const a = r() * Math.PI * 2;
    rock(b, r, cx + Math.cos(a) * (w / 2 + 0.5), y, cz + Math.sin(a) * (d / 2 + 0.5), 0.35 + r() * 0.3, color);
  }
  return tops;
};

/** Basalt columns: a cluster of dark square columns, the tallest in the middle, hot seams glowing on their tops. */
export const basaltColumns = (b: PartBuilder, r: Rand, cx: number, cz: number, w: number, d: number, h: number, color: number, glow: number | null): void => {
  const size = 1.4;
  const nx = Math.max(1, Math.floor(w / size));
  const nz = Math.max(1, Math.floor(d / size));
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const px = cx - w / 2 + (i + 0.5) * (w / nx);
      const pz = cz - d / 2 + (j + 0.5) * (d / nz);
      const centre = 1 - Math.hypot((i + 0.5) / nx - 0.5, (j + 0.5) / nz - 0.5) * 1.2;
      const ch = h * Math.max(0.35, centre) * (0.8 + r() * 0.35);
      // Each column a hair narrower than its cell: neighbours never share a face.
      b.box(w / nx - 0.08, ch, d / nz - 0.08, shade(color, 0.85 + r() * 0.3), 'flat', { x: px, y: ch / 2 - 0.2, z: pz });
      if (glow !== null && r() < 0.4) b.box((w / nx) * 0.5, 0.12, (d / nz) * 0.5, glow, 'glow', { x: px, y: ch - 0.2 + 0.06, z: pz });
    }
  }
};

/** Ice blocks: a pile of pale blue blocks with snow slabs over their tops. */
export const iceBlocks = (b: PartBuilder, r: Rand, cx: number, cz: number, w: number, d: number, h: number): void => {
  for (let i = 0; i < 4; i += 1) {
    const bw = w * (0.45 + r() * 0.3);
    const bd = d * (0.4 + r() * 0.3);
    const bh = h * (0.4 + r() * 0.6);
    const bx = cx + (r() - 0.5) * (w - bw);
    const bz = cz + (r() - 0.5) * (d - bd);
    const ry = (r() - 0.5) * 0.4;
    b.box(bw, bh, bd, shade(0xa8dcff, 0.9 + r() * 0.15), 'smooth', { x: bx, y: bh / 2 - 0.2, z: bz, ry });
    b.box(bw + 0.24, 0.4, bd + 0.24, 0xf8fcff, 'flat', { x: bx, y: bh - 0.2 + 0.19, z: bz, ry });
  }
};

/** Ruins: a broken column or two, a fallen drum, and a stretch of cut-block wall, all moss-topped. */
export const ruins = (b: PartBuilder, r: Rand, cx: number, cz: number, w: number, d: number, h: number, stone = 0xb8b0a0): void => {
  const moss = 0x5cc43a;
  // The wall stretch: cut blocks with a clear gap between each.
  const courses = 3;
  const per = Math.max(2, Math.floor(d / 1.9));
  for (let c = 0; c < courses; c += 1) {
    for (let k = 0; k < per; k += 1) {
      if (c === courses - 1 && r() < 0.45) continue;
      const bz = cz - d / 2 + (k + 0.5 + (c % 2) * 0.25) * (d / per);
      if (Math.abs(bz - cz) > d / 2 - 0.4) continue;
      b.box(w * 0.3, 1.2, d / per - 0.12, shade(stone, 0.88 + r() * 0.2), 'flat', { x: cx + w * 0.25, y: 0.6 + c * 1.26, z: bz });
    }
  }
  // Columns: stacked drums, the top one knocked askew.
  for (const k of [-1, 1]) {
    const px = cx - w * 0.18;
    const pz = cz + k * d * 0.3;
    const drums = 2 + Math.floor(r() * 3);
    for (let i = 0; i < drums; i += 1) {
      const dw = 1.5 - i * 0.04;
      b.box(dw, 1.3, dw, shade(stone, 0.9 + (i % 2) * 0.1), 'flat', { x: px + (i === drums - 1 ? 0.15 : 0), y: 0.65 + i * 1.36, z: pz, ry: i === drums - 1 ? 0.3 : 0 });
    }
    b.box(1.9, 0.34, 1.9, moss, 'flat', { x: px + 0.15, y: drums * 1.36 + 0.05, z: pz, ry: 0.3 });
  }
  b.box(1.4, 1.4, 3, shade(stone, 0.85), 'flat', { x: cx - w * 0.05, y: 0.7, z: cz, ry: 0.4 });
  void h;
};

// --------------------------------------------------------------- waterfall

const FALL = new Color();
const MIX = new Color();
const MIX_B = new Color();
const mix = (a: number, b: number, t: number): number => MIX.setHex(a).lerp(MIX_B.setHex(b), t).getHex();

/**
 * A WATERFALL pouring down a face: strips of water side by side (each a little
 * nearer or further than its neighbour), for the flowing waterfall material.
 * `nx, nz` is the way the face looks; the water hangs `gap` in front of it.
 */
export const waterfallGeometry = (x: number, z: number, width: number, top: number, bottom: number, nx: number, nz: number, color = 0x6ad0ff): BufferGeometry | null => {
  const parts: BufferGeometry[] = [];
  const strips = Math.max(2, Math.round(width / 1.1));
  const along = { x: Math.abs(nz), z: Math.abs(nx) };
  for (let i = 0; i < strips; i += 1) {
    const t = (i + 0.5) / strips - 0.5;
    const proud = 0.25 + (i % 2) * 0.12;
    const g = box(along.x ? width / strips + 0.02 : 0.2, top - bottom, along.z ? width / strips + 0.02 : 0.2).toNonIndexed();
    g.translate(x + along.x * t * width + nx * proud, (top + bottom) / 2, z + along.z * t * width + nz * proud);
    FALL.setHex(color).multiplyScalar(i % 2 ? 1 : 0.9);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let k = 0; k < count; k += 1) colors.set([FALL.r, FALL.g, FALL.b], k * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
};

/** White foam blocks churning where a waterfall lands, at the water's height. */
export const foam = (b: PartBuilder, r: Rand, x: number, y: number, z: number, width: number, nx: number, nz: number): void => {
  const along = { x: Math.abs(nz), z: Math.abs(nx) };
  const n = Math.max(3, Math.round(width / 0.9));
  for (let i = 0; i < n; i += 1) {
    const t = ((i + 0.5) / n - 0.5) * width;
    const size = 0.6 + r() * 0.5;
    b.box(size, 0.3 + r() * 0.35, size, shade(0xf4fbff, 0.95 + r() * 0.05), 'flat', { x: x + along.x * t + nx * (0.6 + r() * 1.2), y: y + 0.1, z: z + along.z * t + nz * (0.6 + r() * 1.2), ry: r() });
  }
};

/**
 * A waterfall CASCADING down a terrain wall at `at` along its run: from the
 * top tier's lip down each tier's face onto the one in front of it, and from
 * the bank into the water at `bottom`, with foam where each step lands.
 * `ledges` are the ones that wall returned; `face`/`out` are the wall's own.
 */
export const cascade = (b: PartBuilder, r: Rand, ledges: readonly Ledge[], face: number, out: 1 | -1, at: number, width: number, bottom: number, color: number): BufferGeometry[] => {
  const seg = ledges.find((l) => at >= l.s0 && at <= l.s1);
  if (!seg) return [];
  // Fit the fall inside its segment (a fall across a step between segments would hang in the air).
  const w = Math.min(width, seg.s1 - seg.s0 - 0.6);
  if (w < 1.6) return [];
  const centre = Math.max(seg.s0 + w / 2 + 0.3, Math.min(seg.s1 - w / 2 - 0.3, at));
  const here = ledges.filter((l) => l.s0 === seg.s0 && l.s1 === seg.s1).sort((a, c) => a.tier - c.tier);
  const parts: BufferGeometry[] = [];
  for (let k = here.length - 1; k >= 0; k -= 1) {
    const tier = here[k]!;
    const low = k === 0 ? bottom : here[k - 1]!.y;
    const across = face + out * tier.front;
    const alongZ = tier.run === 'z';
    const nx = alongZ ? -out : 0;
    const nz = alongZ ? 0 : -out;
    const x = alongZ ? across : centre;
    const z = alongZ ? centre : across;
    const g = waterfallGeometry(x, z, w, tier.y + 0.05, low, nx, nz, color);
    if (g) parts.push(g);
    foam(b, r, x + nx * 0.4, low, z + nz * 0.4, w, nx, nz);
  }
  return parts;
};

// ------------------------------------------------------------ terrain wall

export interface WallTier {
  /** How deep the tier runs back from its own front face. */
  readonly depth: number;
  readonly height: readonly [number, number];
  readonly color: number;
  /** The colour of alternate strata (a darker shade of the rock when not given). */
  readonly band?: number;
}

export interface WallSpec {
  /** The axis the wall runs along; its inner face is `face` on the other axis. */
  readonly run: 'x' | 'z';
  readonly face: number;
  /** Which way is outward, away from the walkable side. */
  readonly out: 1 | -1;
  readonly from: number;
  readonly to: number;
  /** Front to back: each rises behind the one before it. */
  readonly tiers: readonly WallTier[];
  readonly cap: number | null;
  /** Segment length range along the run. */
  readonly segment?: readonly [number, number];
  /** How far the front face may wander in (negative) and out, per segment. */
  readonly stagger?: readonly [number, number];
  /** Chance of vines hanging from each tier's lip. */
  readonly vines?: number;
}

export interface Ledge extends Top {
  readonly tier: number;
  /** The axis the wall runs along: plant along it. */
  readonly run: 'x' | 'z';
  /** The segment's extent along the run, and this tier's bottom face (across, from the wall's face). */
  readonly s0: number;
  readonly s1: number;
  readonly front: number;
  /** The tier's rock height (under its turf). */
  readonly h: number;
}

/**
 * A NATURAL TERRAIN WALL: segments of rock along a line, each a stack of tiers
 * stepping back and up - a low bank in front, a taller shelf behind it, a
 * cliff at the back - every tier split into strata that step back as they
 * rise, a turf cap lipping over its edge with grass drips, vines hanging here
 * and there. Segment heights always differ from their neighbours', so no two
 * tops ever meet in one plane. Returns the visible tops to plant on.
 */
export const terrainWall = (b: PartBuilder, r: Rand, spec: WallSpec): Ledge[] => {
  const ledges: Ledge[] = [];
  const [segMin, segMax] = spec.segment ?? [5, 11];
  const [inMost, outMost] = spec.stagger ?? [-0.3, 0.5];
  const previous: number[] = spec.tiers.map(() => -1);
  const place = (along: number, across: number, y: number): { x: number; y: number; z: number } =>
    spec.run === 'z' ? { x: spec.face + spec.out * across, y, z: along } : { x: along, y, z: spec.face + spec.out * across };
  const size = (alongLen: number, acrossLen: number, h: number): readonly [number, number, number] => (spec.run === 'z' ? [acrossLen, h, alongLen] : [alongLen, h, acrossLen]);
  let s0 = spec.from;
  while (s0 < spec.to - 0.01) {
    let len = segMin + r() * (segMax - segMin);
    if (spec.to - (s0 + len) < segMin * 0.6) len = spec.to - s0;
    const s1 = Math.min(spec.to, s0 + len);
    const mid = (s0 + s1) / 2;
    const segLen = s1 - s0;
    let front = inMost + r() * (outMost - inMost);
    let below = 0;
    // Each stretch of cliff its own: a little warmer, a little mossier, or as it is.
    const tint = r();
    const tone = (c: number): number => (tint < 0.3 ? mix(c, 0x8a5a36, 0.14) : tint < 0.5 && spec.cap !== null ? mix(c, 0x5a9a3a, 0.12) : c);
    spec.tiers.forEach((tier, k) => {
      let h = tier.height[0] + r() * (tier.height[1] - tier.height[0]);
      if (Math.abs(h - previous[k]!) < 0.35) h += h > previous[k]! ? 0.4 : -0.4;
      previous[k] = h;
      const advance = tier.depth * (0.55 + r() * 0.1);
      const layers = h < 4 ? 1 : h < 11 ? 2 : 3;
      const inset = 0.2;
      let y0 = -0.3;
      for (let m = 0; m < layers; m += 1) {
        const y1 = m === layers - 1 ? h : h * ((m + 1) / layers) * (0.9 + r() * 0.12);
        const faceAt = front + m * inset;
        const depth = tier.depth - m * inset;
        const p = place(mid, faceAt + depth / 2, (y0 + y1) / 2);
        // Each tier runs a step further along than the one in front of it, so the
        // tiers' end faces never share a plane where a lower neighbour leaves them bare.
        const [sx, sy, sz] = size(segLen + k * 0.2, depth, y1 - y0);
        b.box(sx, sy, sz, tone(m % 2 ? (tier.band ?? shade(tier.color, 0.86)) : shade(tier.color, 0.97 + r() * 0.08)), 'flat', p);
        y0 = y1;
      }
      const topFace = front + (layers - 1) * inset;
      const topDepth = tier.depth - (layers - 1) * inset;
      let top = h;
      if (spec.cap !== null) {
        const capDepth = topDepth + 0.3;
        const p = place(mid, topFace - 0.15 + capDepth / 2, h + 0.22);
        const [sx, sy, sz] = size(segLen, capDepth, 0.44);
        b.box(sx, sy, sz, shade(spec.cap, 0.94 + r() * 0.12), 'flat', p);
        top = h + 0.44;
        // Grass drips over the lip.
        const drips = Math.floor(segLen / 3.5);
        for (let i = 0; i < drips; i += 1) {
          const at = s0 + (i + 0.3 + r() * 0.4) * (segLen / drips);
          const dh = 0.4 + r() * 0.8;
          const dp = place(at, topFace - 0.17, h - dh / 2);
          const [dx, dy, dz] = size(0.6 + r() * 0.6, 0.4, dh);
          b.box(dx, dy, dz, shade(spec.cap, 0.9), 'flat', dp);
        }
      }
      // Vines hang from the lip down this tier's face, never as far as the tier in front.
      const fall = h - below - 0.6;
      if (spec.vines && fall > 1.5 && r() < spec.vines) {
        const vp = place(s0 + (0.2 + r() * 0.6) * segLen, front - 0.3, top);
        hangingVine(b, r, vp.x, top, vp.z, fall * (0.45 + r() * 0.4), 1);
      }
      // The visible top: from this tier's front to the next tier's.
      const nextFront = k < spec.tiers.length - 1 ? front + advance : front + tier.depth;
      const visible = Math.max(0.6, nextFront - topFace);
      const c = place(mid, topFace + visible / 2, top);
      const [w, , d] = size(segLen, visible, 0);
      ledges.push({ x: c.x, y: top, z: c.z, w, d, tier: k, run: spec.run, s0, s1, front, h });
      below = top;
      front += advance;
    });
    s0 = s1;
  }
  return ledges;
};
