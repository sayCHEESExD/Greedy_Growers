import { BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, Vector3 } from 'three';
import type { PartBuilder } from '../render/PartBuilder.js';

/**
 * PREHISTORIC NATURE, BUILT LIKE A ROBLOX MAP: every tree, fern, cycad, palm,
 * conifer, rock and cliff is a stack of chunky blocks and planks in bright,
 * clean colours - layered-slab conifers, cube-cluster canopies, plank fronds,
 * block boulders, grass-topped dirt terraces. The studs are drawn on by the
 * shared plastic material, so everything here is geometry and colour only.
 *
 * Every function takes a seeded random source, so a scene is the same every
 * time it is built and on every client.
 */
export type Rand = () => number;

export const seeded = (seed: number): Rand => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;

/** Shade a hex colour by a factor, for per-part variation. */
export const shade = (hex: number, k: number): number => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
};

// --------------------------------------------------------------- geometry

const box = (w: number, h: number, d: number): BoxGeometry => new BoxGeometry(w, h, d);

/**
 * A chunky irregular block: a box whose eight corners are nudged, so a pile
 * of them reads as hewn rock rather than crates. Sits on y = 0.
 */
export const rockGeometry = (r: Rand, _detail = 1): BufferGeometry => {
  const g = new BoxGeometry(2, 1.4, 2).toNonIndexed();
  const pos = g.getAttribute('position') as BufferAttribute;
  const corners = new Map<string, [number, number, number]>();
  const v = new Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const key = `${Math.sign(v.x)},${Math.sign(v.y)},${Math.sign(v.z)}`;
    let n = corners.get(key);
    if (!n) {
      // The top corners draw in, so the block tapers like weathered stone.
      const top = v.y > 0;
      n = [(r() - 0.5) * 0.35 - (top ? Math.sign(v.x) * 0.22 : 0), top ? (r() - 0.3) * 0.35 : 0, (r() - 0.5) * 0.35 - (top ? Math.sign(v.z) * 0.22 : 0)];
      corners.set(key, n);
    }
    pos.setXYZ(i, v.x + n[0], v.y + n[1], v.z + n[2]);
  }
  g.translate(0, 0.7, 0);
  g.computeVertexNormals();
  return g;
};

/** A trunk: a stack of square blocks stepping along a gentle bend, sat on y = 0. */
export const trunkGeometry = (height: number, r0: number, r1: number, bend: number, _segments = 4, rings = 4): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  const steps = Math.max(2, Math.min(6, rings));
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const rr = r0 + (r1 - r0) * t;
    const g = box(rr * 2, height / steps + 0.05, rr * 2);
    g.translate(Math.sin(t * Math.PI * 0.5) * bend, height * t, 0);
    parts.push(g.toNonIndexed());
  }
  return merge(parts);
};

const merge = (parts: BufferGeometry[]): BufferGeometry => {
  let count = 0;
  for (const p of parts) count += p.getAttribute('position').count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    const pos = p.getAttribute('position') as BufferAttribute;
    const nor = p.getAttribute('normal') as BufferAttribute;
    positions.set(pos.array as Float32Array, o * 3);
    normals.set(nor.array as Float32Array, o * 3);
    o += pos.count;
    p.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  return g;
};

/**
 * A FROND made of planks: a flat leaf that rises then droops in three
 * straight segments, pointing +Z from the origin.
 */
export const frondGeometry = (length: number, width: number, droop: number, segments = 3, _serrate = 0.5): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  const n = Math.max(2, Math.min(4, segments));
  let y = 0;
  let z = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const seg = length / n;
    const angle = 0.35 - (droop * 1.4 * (i + 0.5)) / n;
    const w = width * (1 - t * 0.45);
    const g = box(w, width * 0.12, seg * 1.08);
    g.rotateX(-angle);
    const dy = Math.sin(angle) * seg;
    const dz = Math.cos(angle) * seg;
    g.translate(0, y + dy / 2, z + dz / 2);
    parts.push(g.toNonIndexed());
    y += dy;
    z += dz;
  }
  return merge(parts);
};

// ------------------------------------------------------------------ flora

const LEAF = [0x3cc234, 0x4fd23e, 0x34ad2c, 0x5ee048, 0x2e9e28] as const;
const PINE = [0x2fa84a, 0x28964a, 0x38b850, 0x23883e] as const;
const BARK = [0x8a5a2e, 0x7a4e28, 0x9a6634] as const;

/** A fern clump: plank fronds arching out from one crown. */
export const fern = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, tint = 1): void => {
  const count = 5 + Math.floor(r() * 3);
  const base = pick(r, LEAF);
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2 + r() * 0.4;
    const g = frondGeometry(s * (1.2 + r() * 0.6), s * 0.34, 0.45 + r() * 0.3, 3);
    b.add(g, shade(base, (0.85 + r() * 0.3) * tint), 'flat', { x, y: y + 0.05, z, ry: yaw });
  }
};

/** A tree fern: a block trunk and a crown of long plank fronds. */
export const treeFern = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const h = s * (3.4 + r() * 2.2);
  const bend = (r() - 0.5) * s * 0.8;
  b.add(trunkGeometry(h, s * 0.34, s * 0.28, bend), pick(r, BARK), 'flat', { x, y, z, ry: r() * 6 });
  b.add(box(s * 0.9, s * 0.5, s * 0.9), 0x5a3a1e, 'flat', { x: x + bend, y: y + h, z });
  const count = 8;
  const green = pick(r, LEAF);
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2 + r() * 0.2;
    const g = frondGeometry(s * (2.6 + r() * 0.8), s * 0.55, 0.8, 3);
    b.add(g, shade(green, 0.85 + r() * 0.25), 'flat', { x: x + bend, y: y + h, z, ry: yaw });
  }
};

/** A cycad: a stout stack of scaly blocks and a crown of stiff plank fronds. */
export const cycad = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const h = s * (0.9 + r() * 1.3);
  const bark = pick(r, BARK);
  for (let i = 0; i < 3; i += 1) {
    const t = i / 3;
    b.add(box(s * (0.95 - t * 0.15), h / 3 + 0.04, s * (0.95 - t * 0.15)), shade(bark, i % 2 ? 1 : 0.82), 'flat', { x, y: y + h * t + h / 6, z, ry: i * 0.4 });
  }
  const count = 9;
  const green = pick(r, LEAF);
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2 + r() * 0.2;
    const g = frondGeometry(s * (1.6 + r() * 0.5), s * 0.32, 0.3, 3);
    b.add(g, shade(green, 0.8 + r() * 0.3), 'flat', { x, y: y + h, z, ry: yaw });
  }
};

/** A palm: a bent stack of trunk blocks, a head of drooping plank fronds and coconut cubes. */
export const palm = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const h = s * (6 + r() * 3);
  const bend = s * (0.8 + r() * 1.4);
  const yaw = r() * Math.PI * 2;
  b.add(trunkGeometry(h, s * 0.38, s * 0.28, bend, 4, 6), shade(0x9a7446, 0.9 + r() * 0.2), 'flat', { x, y, z, ry: yaw });
  const top = new Vector3(bend, h, 0).applyAxisAngle(new Vector3(0, 1, 0), yaw);
  const count = 7;
  const green = pick(r, LEAF);
  for (let i = 0; i < count; i += 1) {
    const fy = (i / count) * Math.PI * 2 + r() * 0.3;
    const g = frondGeometry(s * (3.2 + r() * 0.8), s * 0.7, 1.0, 3);
    b.add(g, shade(green, 0.85 + r() * 0.25), 'flat', { x: x + top.x, y: y + h, z: z + top.z, ry: fy });
  }
  for (let i = 0; i < 3; i += 1) b.add(box(s * 0.36, s * 0.36, s * 0.36), 0x6a4420, 'flat', { x: x + top.x + (r() - 0.5) * 0.6, y: y + h - s * 0.35, z: z + top.z + (r() - 0.5) * 0.6, ry: r() });
};

/** A conifer (Araucaria): a tall block trunk and stacked square slabs near the top. */
export const araucaria = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const h = s * (11 + r() * 5);
  b.add(trunkGeometry(h, s * 0.55, s * 0.4, 0, 4, 4), pick(r, BARK), 'flat', { x, y, z });
  layeredCanopy(b, r, x, y + h * 0.55, z, s * 4.4, h * 0.5, 5, pick(r, PINE));
};

/**
 * THE ROBLOX CONIFER: square slabs of green, stacked and shrinking toward the
 * top, each turned a little from the one below.
 */
const layeredCanopy = (b: PartBuilder, r: Rand, x: number, y: number, z: number, width: number, height: number, layers: number, green: number): void => {
  const step = height / layers;
  for (let i = 0; i < layers; i += 1) {
    const t = i / Math.max(1, layers - 1);
    const w = width * (1 - t * 0.62);
    b.add(box(w, step * 0.72, w), shade(green, 0.92 + (i % 2) * 0.14), 'flat', { x, y: y + step * (i + 0.5), z, ry: r() * 0.9 });
  }
  b.add(box(width * 0.2, step * 0.8, width * 0.2), shade(green, 1.1), 'flat', { x, y: y + height + step * 0.3, z, ry: r() });
};

/** A giant redwood: a massive red block trunk and stacked dark slabs. */
export const redwood = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const h = s * (22 + r() * 10);
  b.add(trunkGeometry(h * 0.8, s * 1.5, s * 0.95, 0, 4, 5), shade(0xa04a2c, 0.9 + r() * 0.2), 'flat', { x, y, z, ry: r() });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.5;
    b.add(box(s * 1.1, s * 2.4, s * 1.1), 0x8a3e24, 'flat', { x: x + Math.cos(a) * s * 1.5, y: y + s * 1.2, z: z + Math.sin(a) * s * 1.5, ry: a });
  }
  layeredCanopy(b, r, x, y + h * 0.42, z, s * 10, h * 0.62, 6, shade(pick(r, PINE), 0.8));
};

/** A stand of horsetails: thin segmented block stems. */
export const horsetails = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const count = 5 + Math.floor(r() * 4);
  for (let i = 0; i < count; i += 1) {
    const h = s * (1.5 + r() * 2.2);
    const px = x + (r() - 0.5) * s * 1.6;
    const pz = z + (r() - 0.5) * s * 1.6;
    b.add(box(s * 0.16, h, s * 0.16), shade(0x6ac83a, 0.85 + r() * 0.3), 'flat', { x: px, y: y + h / 2, z: pz });
    for (let k = 1; k < 4; k += 1) b.add(box(s * 0.24, s * 0.08, s * 0.24), 0x2e5a1e, 'flat', { x: px, y: y + h * (k / 4), z: pz });
  }
};

/** A leafy bush: a cluster of turned green cubes, sometimes flowering. */
export const bush = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, flowers = 0): void => {
  const green = pick(r, LEAF);
  const lumps = 3 + Math.floor(r() * 2);
  for (let i = 0; i < lumps; i += 1) {
    const rr = s * (0.8 + r() * 0.5);
    b.add(box(rr * 1.5, rr * 1.2, rr * 1.5), shade(green, 0.85 + r() * 0.3), 'flat', {
      x: x + (r() - 0.5) * s * 1.4,
      y: y + rr * 0.6,
      z: z + (r() - 0.5) * s * 1.4,
      ry: r() * 1.5,
    });
  }
  const bloom = pick(r, [0xffffff, 0xff8ac8, 0xffe04a, 0xff5a4a] as const);
  for (let i = 0; i < flowers; i += 1) {
    b.add(box(s * 0.26, s * 0.26, s * 0.26), bloom, 'flat', { x: x + (r() - 0.5) * s * 1.8, y: y + s * (1.0 + r() * 0.5), z: z + (r() - 0.5) * s * 1.8, ry: r() });
  }
};

/** Grass: a tuft of spiky low-poly blades, leaning out from the middle. */
export const grassTuft = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0x7ad03a): void => {
  const blades = 4 + Math.floor(r() * 3);
  for (let i = 0; i < blades; i += 1) {
    const h = s * (0.8 + r() * 0.8);
    const a = (i / blades) * Math.PI * 2 + r();
    const lean = 0.25 + r() * 0.35;
    b.add(new ConeGeometry(s * 0.16, h, 3), shade(color, 0.85 + r() * 0.35), 'leaf', {
      x: x + Math.cos(a) * s * 0.18,
      y: y + h * 0.45,
      z: z + Math.sin(a) * s * 0.18,
      sz: 0.35,
      ry: -a,
      rx: Math.sin(a) * lean,
      rz: -Math.cos(a) * lean,
    });
  }
};

/** A dead tree: a pale block trunk and crooked block branches. */
export const deadTree = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0x9a8a74): void => {
  const h = s * (5 + r() * 4);
  b.add(trunkGeometry(h, s * 0.42, s * 0.22, (r() - 0.5) * s, 4, 4), color, 'flat', { x, y, z });
  for (let i = 0; i < 4; i += 1) {
    const a = r() * Math.PI * 2;
    const len = s * (1.5 + r() * 2);
    b.add(box(s * 0.24, len, s * 0.24), shade(color, 0.9), 'flat', { x: x + Math.cos(a) * len * 0.35, y: y + h * (0.5 + r() * 0.4), z: z + Math.sin(a) * len * 0.35, ry: -a, rz: 0.9 });
  }
};

/** A mangrove: a cube canopy on a cage of block stilt roots. */
export const mangrove = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const h = s * (5 + r() * 2);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    b.add(box(s * 0.26, s * 2.8, s * 0.26), 0x6a4e34, 'flat', { x: x + Math.cos(a) * s * 1.1, y: y + s * 1.2, z: z + Math.sin(a) * s * 1.1, ry: -a, rz: 0.45 });
  }
  b.add(trunkGeometry(h - s * 2, s * 0.4, s * 0.32, 0, 4, 3), 0x6a4e34, 'flat', { x, y: y + s * 2, z });
  cubeCanopy(b, r, x, y + h, z, s * 2.4, pick(r, LEAF));
};

/** THE ROBLOX BROADLEAF CANOPY: a cluster of turned cubes. */
const cubeCanopy = (b: PartBuilder, r: Rand, x: number, y: number, z: number, size: number, green: number): void => {
  b.add(box(size * 1.6, size * 1.1, size * 1.6), green, 'flat', { x, y, z, ry: r() });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.6;
    const c = size * (0.7 + r() * 0.3);
    b.add(box(c, c * 0.8, c), shade(green, 0.85 + r() * 0.3), 'flat', { x: x + Math.cos(a) * size * 0.75, y: y + (r() - 0.3) * size * 0.5, z: z + Math.sin(a) * size * 0.75, ry: r() });
  }
  b.add(box(size * 0.9, size * 0.7, size * 0.9), shade(green, 1.1), 'flat', { x, y: y + size * 0.75, z, ry: r() });
};

/** A broadleaf tree: block trunk and a cube-cluster canopy (the park's staple). */
export const broadleaf = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const h = s * (4.5 + r() * 2.5);
  b.add(trunkGeometry(h, s * 0.45, s * 0.36, (r() - 0.5) * s * 0.6, 4, 3), pick(r, BARK), 'flat', { x, y, z });
  cubeCanopy(b, r, x, y + h + s * 0.6, z, s * 2.2, pick(r, LEAF));
};

/** Glowing fungi for the moonlit jungle: block stems and glowing caps. */
export const glowShrooms = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0x6affd8): void => {
  const count = 3 + Math.floor(r() * 3);
  for (let i = 0; i < count; i += 1) {
    const h = s * (0.4 + r() * 0.9);
    const px = x + (r() - 0.5) * s * 1.4;
    const pz = z + (r() - 0.5) * s * 1.4;
    b.add(box(s * 0.16, h, s * 0.16), 0xe8eee0, 'flat', { x: px, y: y + h / 2, z: pz });
    const cap = s * (0.5 + r() * 0.35);
    b.add(box(cap, cap * 0.35, cap), color, 'glow', { x: px, y: y + h, z: pz, ry: r() });
  }
};

// ------------------------------------------------------------------ rocks

const STONE = 0x9a9aa2;

/** A single chunky rock. */
export const rock = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = STONE): void => {
  b.add(rockGeometry(r), shade(color, 0.9 + r() * 0.25), 'flat', { x, y, z, sx: s * (0.7 + r() * 0.4), sy: s * (0.7 + r() * 0.5), sz: s * (0.7 + r() * 0.4), ry: r() * 6 });
};

/** A cluster of block boulders with smaller stones at their feet. */
export const boulders = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = STONE): void => {
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i += 1) rock(b, r, x + (r() - 0.5) * s * 2, y, z + (r() - 0.5) * s * 2, s * (0.8 + r() * 0.6), color);
  for (let i = 0; i < 3; i += 1) rock(b, r, x + (r() - 0.5) * s * 3.2, y, z + (r() - 0.5) * s * 3.2, s * (0.25 + r() * 0.2), shade(color, 0.92));
};

/** A flat-topped mesa of layered blocks, for canyons and badlands. */
export const mesa = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, colors: readonly number[] = [0xd8763a, 0xe8945a, 0xc0602e]): void => {
  const layers = 4;
  for (let i = 0; i < layers; i += 1) {
    const rr = s * (9.5 - i * 1.1) * (0.95 + r() * 0.1);
    b.add(box(rr, s * 2.2, rr * (0.8 + r() * 0.3)), shade(colors[i % colors.length]!, 0.95 + r() * 0.1), 'flat', { x, y: y + s * 1.1 + i * s * 2.2, z, ry: r() * 0.4 });
  }
};

/** A rock spire: tapering stacked blocks. */
export const spire = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0xb08a64): void => {
  const h = s * (8 + r() * 6);
  const n = 4;
  for (let i = 0; i < n; i += 1) {
    const w = s * 2.8 * (1 - i * 0.2);
    b.add(box(w, h / n + 0.1, w), shade(color, 0.9 + (i % 2) * 0.1), 'flat', { x: x + (r() - 0.5) * 0.4, y: y + (h / n) * (i + 0.5), z: z + (r() - 0.5) * 0.4, ry: r() * 0.6 });
  }
};

/** A crystal cluster: tall four-sided prisms. */
export const crystals = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color = 0x8ad8ff, glow = false): void => {
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const h = s * (1 + r() * 2.2);
    b.add(new ConeGeometry(s * 0.42, h, 4), shade(color, 0.85 + r() * 0.3), glow ? 'glow' : 'flat', {
      x: x + (r() - 0.5) * s * 1.4,
      y: y + h * 0.4,
      z: z + (r() - 0.5) * s * 1.4,
      rx: (r() - 0.5) * 0.6,
      rz: (r() - 0.5) * 0.6,
    });
  }
};

// --------------------------------------------------------------- jungle

/** Cattails: a few tall yellow-green stalks, each topped with a seed head. */
export const cattails = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const h = s * (1.8 + r() * 1.2);
    const px = x + (r() - 0.5) * s * 0.9;
    const pz = z + (r() - 0.5) * s * 0.9;
    const lean = (r() - 0.5) * 0.25;
    b.add(box(s * 0.12, h, s * 0.12), 0xa8c83a, 'flat', { x: px, y: y + h / 2, z: pz, rz: lean });
    b.add(box(s * 0.26, s * 0.6, s * 0.26), 0xf0c83a, 'flat', { x: px - Math.sin(lean) * h * 0.45, y: y + h - s * 0.1, z: pz, rz: lean });
  }
  // A blade or two at the foot.
  b.add(new ConeGeometry(s * 0.14, s * 1.1, 3), 0xc0d84a, 'leaf', { x, y: y + s * 0.5, z, sz: 0.35, rz: 0.3 });
};

/** A little clump of flowers: flat four-petal blooms on short stems, a yellow eye in each. */
export const flowers = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, color?: number): void => {
  const bloom = color ?? pick(r, [0xff4a3a, 0xffffff, 0xff8ac8, 0xffd23a] as const);
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i += 1) {
    const px = x + (r() - 0.5) * s * 1.4;
    const pz = z + (r() - 0.5) * s * 1.4;
    const h = s * (0.25 + r() * 0.2);
    const ry = r() * Math.PI;
    b.add(box(s * 0.08, h, s * 0.08), 0x3a9a2a, 'flat', { x: px, y: y + h / 2, z: pz });
    b.add(box(s * 0.62, s * 0.08, s * 0.22), bloom, 'flat', { x: px, y: y + h, z: pz, ry });
    b.add(box(s * 0.22, s * 0.08, s * 0.62), bloom, 'flat', { x: px, y: y + h, z: pz, ry });
    b.add(box(s * 0.2, s * 0.1, s * 0.2), 0xffd23a, 'flat', { x: px, y: y + h + 0.04, z: pz, ry });
  }
};

/** An arching root or branch: brown blocks along a half-arch from the ground, as in the reference. */
export const archRoot = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1, ry = 0): void => {
  const segs = 8;
  const span = s * 7;
  const height = s * 4.5;
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  let prev: [number, number] = [0, 0];
  for (let i = 1; i <= segs; i += 1) {
    const t = i / segs;
    const d = t * span;
    const h = Math.sin(t * Math.PI * 0.62) * height;
    const [pd, ph] = prev;
    const len = Math.hypot(d - pd, h - ph);
    const pitch = Math.atan2(h - ph, d - pd);
    const cd = (d + pd) / 2;
    const ch = (h + ph) / 2;
    b.add(box(s * 0.7 * (1 - t * 0.35), s * 0.7 * (1 - t * 0.35), len * 1.15), shade(0x8a5a2e, 0.9 + (i % 2) * 0.1), 'flat', { x: x + fx * cd, y: y + ch, z: z + fz * cd, ry, rx: -pitch });
    prev = [d, h];
  }
  void r;
};

/**
 * A GIANT JUNGLE TREE for beyond the walls: a tall block trunk and broad
 * stacked leaf slabs, turned against each other, tall enough to stand over an
 * arena wall - the jungle canopy seen from inside.
 */
export const jungleGiant = (b: PartBuilder, r: Rand, x: number, y: number, z: number, s = 1): void => {
  const h = s * (26 + r() * 10);
  b.add(trunkGeometry(h, s * 1.3, s * 0.9, (r() - 0.5) * s * 2, 4, 5), shade(0x7a4e28, 0.9 + r() * 0.2), 'flat', { x, y, z, ry: r() });
  const green = pick(r, LEAF);
  const layers = 3 + Math.floor(r() * 2);
  for (let i = 0; i < layers; i += 1) {
    const w = s * (11 - i * 2.2) * (0.9 + r() * 0.2);
    b.add(box(w, s * 2.2, w * (0.8 + r() * 0.3)), shade(green, 0.85 + i * 0.08), 'flat', { x: x + (r() - 0.5) * s * 2, y: y + h * (0.72 + i * 0.1), z: z + (r() - 0.5) * s * 2, ry: r() * 1.5 });
  }
  cubeCanopyTop(b, r, x, y + h + s * 1.2, z, s * 2.6, green);
};

const cubeCanopyTop = (b: PartBuilder, r: Rand, x: number, y: number, z: number, size: number, green: number): void => {
  b.add(box(size * 1.5, size, size * 1.5), shade(green, 1.08), 'flat', { x, y, z, ry: r() });
};
