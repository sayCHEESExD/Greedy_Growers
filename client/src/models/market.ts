import { stallById, type StallId } from '@greedy/shared';
import { PartBuilder } from '../render/PartBuilder.js';
import { buildFruit } from './greedyTrees.js';
import { ball, block, brick, cone, cylinder, shade, wedge } from './shapes.js';

/**
 * THE MARKET STALLS, after the reference. Every stall shares one design
 * language, built by `frame` and `titleBoard`:
 *
 *   - a studded wooden floor, a counter at the front (top at COUNTER) with a
 *     dark top slab, plank battens and a stripe of the stall's colour;
 *   - four dark corner posts on grey stone feet, low side rails;
 *   - a pegboard back wall with a shelf, things hanging from its pegs;
 *   - a striped awning sloping from the back to the front, a scalloped trim
 *     along its front edge, two lanterns hanging under it;
 *   - a framed wooden title board standing on the awning's front edge (the
 *     caller hangs the canvas title on its face, see `stallLayout`);
 *   - a big themed prop on the roof, always BEHIND the title board so it
 *     frames the title and never covers it.
 *
 * Built facing +Z (the counter's front) round the stall's middle; the caller
 * turns it to the stall's yaw. Every solid part at walking height stays inside
 * the stall's collision footprint (`hx`/`hz` in `shared/config/map.ts`);
 * only the awning, its trim and the rooftop props reach past it, overhead.
 */

// ------------------------------------------------------------------ palette

const WOOD = 0x9a5a2a;
const WOOD_DARK = 0x6a3a1a;
const WOOD_LIGHT = 0xc08048;
const PEG = 0xb87840;
const PEG_HOLE = 0x5a3016;
const BOARD = 0x5a2e14;
const STONE = 0x8e8e96;
const LAMP = 0xffe08a;
const GOLD = 0xffd23a;

// ------------------------------------------------------------------ proportions

/** Floor board thickness. */
const FLOOR = 0.4;
/** Counter top surface height (about the keepers' waist). */
const COUNTER = 2.4;
/** The step the keeper stands on behind the counter. */
const RISER = 0.5;
/** The shelf on the back wall (top surface). */
const SHELF = 4.6;
/** The awning's underside at its back and front edges. */
const AWN_BACK = 9;
const AWN_FRONT = 7.4;
/** The title board's centre height and size. */
const BOARD_Y = 9.8;
const BOARD_H = 2.8;
const BOARD_MAX_W = 15;

interface StallStyle {
  /** Awning stripes, alternating. */
  readonly stripe: readonly [number, number];
  /** Scallop tabs, cycling. */
  readonly trim: readonly number[];
}

const STYLES: Readonly<Record<StallId, StallStyle>> = {
  sell: { stripe: [0xe02b2b, 0xffffff], trim: [0xe02b2b, 0xe8e8ee] },
  fall: { stripe: [0xe8701a, 0xffe0b0], trim: [0xe8701a, 0xffd23a] },
  pets: { stripe: [0xffc81e, 0xfff4d0], trim: [0xffc81e, 0xe8e8ee] },
  farmers: { stripe: [0x3fae3a, 0xffffff], trim: [0x3fae3a, 0xe8e8ee] },
  wheel: { stripe: [0xd8321e, 0xffffff], trim: [0xd8321e, 0xffffff] },
  furniture: { stripe: [0xff8a2a, 0xffffff], trim: [0xff8a2a, 0xe8e8ee] },
  stands: { stripe: [0xe02b2b, 0xffd23a], trim: [0xe02b2b, 0xff8a2a, 0xffd23a, 0x3fae3a, 0x2f8ae0] },
  gear: { stripe: [0x2f6ae0, 0xffffff], trim: [0x2f6ae0, 0xe8e8ee] },
  worms: { stripe: [0xff6aa8, 0xfff0f6], trim: [0xff6aa8, 0xe8e8ee] },
};

/** The booth inside the footprint: its centre x and half width (Fall Harvest leaves room for its scarecrow). */
const booth = (id: StallId): { cx: number; hw: number; hz: number } => {
  const s = stallById(id);
  if (id === 'fall') return { cx: 2, hw: 4.5, hz: s.hz };
  return { cx: 0, hw: s.hx, hz: s.hz };
};

// ------------------------------------------------------------------ layout (shared with MarketScene)

export interface StallSignSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
  readonly rz?: number;
}

export interface StallLayout {
  /** Where the keeper stands (behind the counter, on the floor). */
  readonly keeper: { readonly x: number; readonly y: number; readonly z: number };
  /** The canvas title's panel, on the title board's face. */
  readonly title: StallSignSpot;
  /** The Market Stands' SOLD sign face. */
  readonly sold?: StallSignSpot;
}

/** The Lucky Wheel: where its face turns, and its scale. */
export const WHEEL_FACE = { x: -0.9, y: 5.7, z: -0.4, scale: 0.95 } as const;
const WHEEL_BOARD = { y: 12, z: 0.45, w: 10.2, h: 2.6 } as const;
const SOLD_SIGN = { x: -4.8, y: 12.9, z: 0.6, rz: 0.14 } as const;

export const stallLayout = (id: StallId): StallLayout => {
  if (id === 'wheel') {
    return {
      keeper: { x: 4.2, y: 1, z: 0.9 },
      title: { x: 0, y: WHEEL_BOARD.y, z: WHEEL_BOARD.z + 0.22, w: WHEEL_BOARD.w - 0.6, h: WHEEL_BOARD.h - 0.4 },
    };
  }
  const { cx, hw, hz } = booth(id);
  const w = Math.min(hw * 2 - 1.2, BOARD_MAX_W);
  return {
    keeper: { x: cx, y: FLOOR + RISER, z: hz - 3 },
    title: { x: cx, y: BOARD_Y, z: hz - 0.1 + 0.22, w: w - 0.6, h: BOARD_H - 0.45 },
    sold: id === 'stands' ? { x: SOLD_SIGN.x, y: SOLD_SIGN.y, z: SOLD_SIGN.z + 0.26, w: 4.2, h: 1.9, rz: SOLD_SIGN.rz } : undefined,
  };
};

// ------------------------------------------------------------------ helpers

/** Build a prop round its own origin, then place (and turn, and scale) it as one. */
const part = (b: PartBuilder, t: Parameters<PartBuilder['absorb']>[1], build: (p: PartBuilder) => void): void => {
  const p = new PartBuilder();
  build(p);
  b.absorb(p, t);
};

/**
 * A voxel ball: stacked studded layers, each a cross of two bricks, so it
 * reads as the reference's chunky block-built eggs and fruit. `taper` narrows
 * the top (an egg).
 */
const voxelBall = (b: PartBuilder, r: number, color: number, x: number, y: number, z: number, sy = 1, taper = 0, layers = 7): void => {
  const h = (2 * r * sy) / layers;
  for (let k = 0; k < layers; k += 1) {
    const u = -1 + (2 * k + 1) / layers;
    const w = Math.max(0.3, 2 * r * Math.sqrt(1 - u * u) * (1 - taper * u));
    const c = shade(color, 0.94 + (k / layers) * 0.1);
    b.box(w, h, w * 0.72, c, 'stud', { x, y: y + u * r * sy, z });
    b.box(w * 0.72, h, w, c, 'stud', { x, y: y + u * r * sy, z });
  }
};

/** A block-built egg standing on (x, y, z), spots on its front. */
const egg = (b: PartBuilder, r: number, color: number, spots: number, x: number, y: number, z: number): void => {
  const sy = 1.3;
  voxelBall(b, r, color, x, y + r * sy, z, sy, 0.22);
  const marks: readonly (readonly [number, number])[] = [[-0.35, 0.75], [0.3, 1.05], [-0.15, 1.55], [0.4, 1.8], [-0.4, 2.15]];
  for (const [dx, dy] of marks) {
    const u = (dy - r * sy) / (r * sy);
    const w = 2 * r * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.22 * u);
    b.box(r * 0.38, r * 0.3, 0.12, spots, 'stud', { x: x + dx * r, y: y + dy * r, z: z + w * 0.5 + 0.04 });
  }
};

/** A crate of fruit on the counter. */
const crate = (b: PartBuilder, x: number, z: number, seedId: number): void => {
  brick(b, 1.9, 0.8, 1.3, WOOD_LIGHT, { x, y: COUNTER + 0.4, z });
  block(b, 1.95, 0.16, 1.35, WOOD_DARK, { x, y: COUNTER + 0.62, z });
  const fruit = new PartBuilder();
  for (let i = 0; i < 3; i += 1) {
    buildFruit(fruit, seedId, 0.6);
    b.absorb(fruit, { x: x - 0.5 + i * 0.5, y: COUNTER + 0.8, z });
  }
};

/** A peg sticking out of the pegboard (things hang from it). */
const peg = (b: PartBuilder, x: number, y: number, hz: number): void => {
  block(b, 0.14, 0.14, 0.4, WOOD_DARK, { x, y, z: -hz + 1.05 });
};

/** A lantern hanging under the awning. */
const lantern = (b: PartBuilder, x: number, y: number, z: number): void => {
  block(b, 0.12, 0.5, 0.12, 0x2a2a30, { x, y: y + 0.6, z });
  block(b, 0.8, 0.16, 0.8, 0x2a2a30, { x, y: y + 0.4, z });
  block(b, 0.56, 0.66, 0.56, LAMP, { x, y, z }, 'glow');
  block(b, 0.7, 0.12, 0.7, 0x2a2a30, { x, y: y - 0.38, z });
};

// ------------------------------------------------------------------ the shared frame

/** Counter, posts, rails, pegboard, shelf, awning, scallops and lanterns: every stall's frame. */
const frame = (b: PartBuilder, s: StallStyle, cx: number, hw: number, hz: number): void => {
  const zb = -hz - 0.4;
  const zf = hz + 1.4;
  const awnY = (z: number): number => AWN_BACK - ((AWN_BACK - AWN_FRONT) * (z - zb)) / (zf - zb);

  // Floor: a dark skirt and the studded boards on it.
  brick(b, hw * 2, 0.2, hz * 2, WOOD_DARK, { x: cx, y: 0.1 });
  brick(b, hw * 2 - 0.3, FLOOR - 0.2, hz * 2 - 0.3, WOOD_LIGHT, { x: cx, y: 0.2 + (FLOOR - 0.2) / 2 });

  // Corner posts on stone feet, up to the awning.
  const px = hw - 0.45;
  for (const x of [cx - px, cx + px]) {
    for (const z of [hz - 0.45, -hz + 0.45]) {
      const top = awnY(z);
      brick(b, 0.8, top - FLOOR, 0.8, WOOD_DARK, { x, y: (top + FLOOR) / 2, z });
      brick(b, 1.1, 0.6, 1.1, STONE, { x, y: FLOOR + 0.3, z });
    }
  }

  // The counter: body, kick plate, plank battens, a stripe of the stall's colour, the top slab.
  const cw = hw * 2 - 1.7;
  const cz = hz - 1.05;
  const bodyH = COUNTER - 0.3 - FLOOR;
  brick(b, cw, bodyH, 1.5, WOOD, { x: cx, y: FLOOR + bodyH / 2, z: cz });
  brick(b, cw + 0.1, 0.4, 1.6, WOOD_DARK, { x: cx, y: FLOOR + 0.2, z: cz });
  const battens = Math.max(3, Math.round(cw / 2.2));
  for (let i = 0; i <= battens; i += 1) {
    block(b, 0.18, bodyH - 0.5, 0.1, WOOD_DARK, { x: cx - cw / 2 + 0.3 + ((cw - 0.6) * i) / battens, y: FLOOR + 0.4 + (bodyH - 0.5) / 2, z: cz + 0.78 });
  }
  block(b, cw, 0.26, 0.12, s.stripe[0], { x: cx, y: COUNTER - 0.55, z: cz + 0.8 });
  brick(b, hw * 2 - 0.2, 0.3, 1.9, WOOD_DARK, { x: cx, y: COUNTER - 0.15, z: hz - 1.0 });

  // The keeper's step behind the counter.
  brick(b, cw, RISER, hz * 2 - 2.75, WOOD, { x: cx, y: FLOOR + RISER / 2, z: -hz + 0.85 + (hz * 2 - 2.75) / 2 });

  // Low side rails from the back wall to the counter.
  const railLen = hz * 2 - 2.75;
  const railZ = -hz + 0.85 + railLen / 2;
  for (const x of [cx - px, cx + px]) {
    brick(b, 0.5, 1.8, railLen, WOOD, { x, y: FLOOR + 0.9, z: railZ });
    brick(b, 0.7, 0.25, railLen, WOOD_DARK, { x, y: FLOOR + 1.9, z: railZ });
  }

  // The pegboard back wall, its holes, a shelf on brackets.
  const wallTop = awnY(-hz + 0.85) - 0.05;
  const wallH = wallTop - FLOOR;
  brick(b, cw, wallH, 0.5, PEG, { x: cx, y: FLOOR + wallH / 2, z: -hz + 0.6 });
  brick(b, cw + 0.2, 0.35, 0.7, WOOD_DARK, { x: cx, y: wallTop - 0.17, z: -hz + 0.6 });
  const cols = Math.floor((cw - 1) / 1.2);
  for (let i = 0; i <= cols; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const y = SHELF + 0.9 + j * 1.1;
      if (y > wallTop - 0.6) continue;
      block(b, 0.26, 0.26, 0.06, PEG_HOLE, { x: cx - (cols * 1.2) / 2 + i * 1.2, y, z: -hz + 0.87 });
    }
  }
  brick(b, cw - 0.6, 0.25, 0.9, WOOD_DARK, { x: cx, y: SHELF - 0.125, z: -hz + 1.25 });
  for (const x of [cx - cw / 2 + 1, cx + cw / 2 - 1]) block(b, 0.2, 0.7, 0.6, WOOD_DARK, { x, y: SHELF - 0.6, z: -hz + 1.15 });

  // The awning: smooth striped canvas sloping down to the front.
  const span = hw * 2 + 1.4;
  const stripes = Math.max(5, Math.round(span / 1.6));
  const sw = span / stripes;
  const tilt = Math.atan2(AWN_BACK - AWN_FRONT, zf - zb);
  const len = Math.hypot(AWN_BACK - AWN_FRONT, zf - zb);
  const midY = (AWN_BACK + AWN_FRONT) / 2 + 0.15;
  const midZ = (zb + zf) / 2;
  for (let i = 0; i < stripes; i += 1) {
    block(b, sw + 0.01, 0.3, len, s.stripe[i % 2]!, { x: cx - span / 2 + sw * (i + 0.5), y: midY, z: midZ, rx: tilt });
  }
  // The beam the awning hangs from at the back, and its side valances.
  brick(b, span, 0.5, 0.6, WOOD_DARK, { x: cx, y: AWN_BACK + 0.05, z: zb + 0.2 });
  for (const x of [cx - span / 2 - 0.05, cx + span / 2 + 0.05]) block(b, 0.14, 0.6, len, s.trim[0]!, { x, y: midY - 0.15, z: midZ, rx: tilt });
  // The scalloped trim along the front edge.
  block(b, span + 0.1, 0.42, 0.2, s.trim[0]!, { x: cx, y: AWN_FRONT + 0.12, z: zf });
  const tabs = Math.round(span / 1.25);
  const tw = span / tabs;
  for (let i = 0; i < tabs; i += 1) {
    const x = cx - span / 2 + tw * (i + 0.5);
    const c = s.trim[i % s.trim.length]!;
    block(b, tw - 0.12, 0.62, 0.18, c, { x, y: AWN_FRONT - 0.4, z: zf });
    block(b, tw * 0.46, 0.3, 0.18, c, { x, y: AWN_FRONT - 0.86, z: zf });
  }
  // Lanterns under the front of the awning.
  for (const x of [cx - px + 1, cx + px - 1]) lantern(b, x, awnY(hz - 0.45) - 1.1, hz - 0.45);
};

/** The title board: a framed dark panel with studded wooden rails, standing on its legs. */
const titleBoard = (b: PartBuilder, cx: number, y: number, z: number, w: number, h: number, legTo: number, accent: number): void => {
  brick(b, w, h, 0.4, BOARD, { x: cx, y, z });
  brick(b, w + 0.6, 0.45, 0.6, WOOD, { x: cx, y: y + h / 2, z });
  brick(b, w + 0.6, 0.45, 0.6, WOOD, { x: cx, y: y - h / 2, z });
  for (const x of [cx - w / 2, cx + w / 2]) brick(b, 0.45, h + 0.9, 0.6, WOOD, { x, y, z });
  // Corner caps in the stall's colour.
  for (const x of [cx - w / 2, cx + w / 2]) {
    for (const yy of [y - h / 2, y + h / 2]) block(b, 0.62, 0.62, 0.66, accent, { x, y: yy, z });
  }
  // Legs down to the awning (or the post tops).
  const bottom = y - h / 2 - 0.22;
  if (bottom > legTo) {
    for (const x of [cx - w / 2 + 1.2, cx + w / 2 - 1.2]) block(b, 0.4, bottom - legTo + 0.2, 0.4, WOOD_DARK, { x, y: (bottom + legTo) / 2, z: z - 0.1 });
  }
};

// ------------------------------------------------------------------ the stalls

/** Build a stall by id. */
export const buildStall = (b: PartBuilder, id: StallId): void => {
  if (id === 'wheel') {
    buildWheelStand(b);
    return;
  }
  const s = STYLES[id];
  const { cx, hw, hz } = booth(id);
  frame(b, s, cx, hw, hz);
  const w = Math.min(hw * 2 - 1.2, BOARD_MAX_W);
  const zb = -hz - 0.4;
  const zf = hz + 1.4;
  const awnAt = (z: number): number => AWN_BACK - ((AWN_BACK - AWN_FRONT) * (z - zb)) / (zf - zb) + 0.3;
  titleBoard(b, cx, BOARD_Y, hz - 0.1, w, BOARD_H, awnAt(hz - 0.2), s.stripe[0]);
  const ctx: Dress = { cx, hw, hz, roof: (z: number) => awnAt(z) };
  DRESS[id](b, ctx);
};

interface Dress {
  readonly cx: number;
  readonly hw: number;
  readonly hz: number;
  /** The awning's top surface at a local z. */
  readonly roof: (z: number) => number;
}

/** Goods sit on the counter at this z. */
const onCounter = (d: Dress): number => d.hz - 1.05;
const onShelf = (d: Dress): number => -d.hz + 1.25;

const DRESS: Readonly<Record<Exclude<StallId, 'wheel'>, (b: PartBuilder, d: Dress) => void>> = {
  sell(b, d) {
    const z = onCounter(d);
    // Rooftop: a fat money bag and a big gold coin leaning on it.
    const bagZ = -0.6;
    const bagBase = d.roof(bagZ) + 2.6;
    brick(b, 3, 2.6, 2.4, WOOD_LIGHT, { x: 3.8, y: bagBase - 0.6, z: bagZ });
    voxelBall(b, 2, 0xd8b070, 3.8, bagBase + 1.9, bagZ, 0.95, 0.12);
    brick(b, 1.3, 0.7, 1.3, 0xc49a5a, { x: 3.8, y: bagBase + 3.9, z: bagZ });
    block(b, 1.6, 0.3, 1.6, 0xe02b2b, { x: 3.8, y: bagBase + 3.65, z: bagZ });
    brick(b, 1.9, 0.7, 1.9, 0xd8b070, { x: 3.8, y: bagBase + 4.5, z: bagZ });
    block(b, 0.5, 3, 0.5, WOOD_DARK, { x: -4.4, y: d.roof(0) + 1.5, z: -0.2 });
    part(b, { x: -4.4, y: bagBase + 1.4, z: 0.2, rz: 0.18 }, (p) => {
      cylinder(p, 1.9, 1.9, 0.5, GOLD, { rx: Math.PI / 2 }, 'smooth', 16);
      cylinder(p, 1.45, 1.45, 0.56, 0xf0b81a, { rx: Math.PI / 2 }, 'smooth', 16);
      block(p, 0.45, 1.8, 0.6, 0xfff0a0, {});
      block(p, 1.1, 0.35, 0.6, 0xfff0a0, { y: 0.5 });
      block(p, 1.1, 0.35, 0.6, 0xfff0a0, { y: -0.5 });
    });
    // Counter: crates of fruit, a weighing scale, a cash tin.
    crate(b, -4.6, z, 3);
    crate(b, 4.6, z, 6);
    block(b, 0.3, 0.9, 0.3, 0x7e7e86, { x: -2, y: COUNTER + 0.45, z });
    cylinder(b, 0.8, 0.6, 0.2, 0xc0c4cc, { x: -2, y: COUNTER + 1, z }, 'smooth', 12);
    brick(b, 1.3, 0.5, 0.9, 0x2f8a3a, { x: 2.2, y: COUNTER + 0.25, z });
    block(b, 0.9, 0.1, 0.6, GOLD, { x: 2.2, y: COUNTER + 0.55, z });
    // Wall: sacks on pegs and a row of baskets on the shelf.
    for (let i = 0; i < 5; i += 1) {
      const x = -5 + i * 2.5;
      peg(b, x, 6.9, d.hz);
      brick(b, 1.1, 1.2, 0.5, i % 2 ? 0xd8b070 : 0xc49a5a, { x, y: 6.1, z: -d.hz + 1.1 });
    }
    for (let i = 0; i < 4; i += 1) {
      const x = -4.5 + i * 3;
      brick(b, 1.5, 0.6, 0.7, WOOD_LIGHT, { x, y: SHELF + 0.3, z: onShelf(d) });
      ball(b, 0.3, [0xe02b2b, 0xffb21a, 0x7dc83a, 0xff6a8a][i]!, { x, y: SHELF + 0.75, z: onShelf(d) }, 'smooth', 0);
    }
  },

  fall(b, d) {
    const { cx } = d;
    const z = onCounter(d);
    // Rooftop: the great red maple leaf, flanked by golden leaves.
    const ly = 13.2;
    part(b, { x: cx, y: ly, z: -0.4 }, (p) => {
      brick(p, 3.4, 3.4, 0.5, 0xd8321e, { rz: Math.PI / 4 });
      for (let i = 0; i < 5; i += 1) {
        const a = (i - 2) * 0.62;
        brick(p, 1.6, 2.8, 0.45, shade(0xe8401e, 0.95 + (i % 2) * 0.1), { x: Math.sin(a) * 2.2, y: Math.cos(a) * 2.2, rz: -a });
      }
      block(p, 0.12, 4.4, 0.55, 0x9a1a10, { y: 0.2 });
      for (const side of [-1, 1]) brick(p, 2.4, 2.4, 0.4, GOLD, { x: side * 3.6, y: -1.4, z: -0.4, rz: Math.PI / 4 + side * 0.3 });
    });
    block(b, 0.4, ly - 2.4 - d.roof(-0.4), 0.4, WOOD_DARK, { x: cx, y: (ly - 2.4 + d.roof(-0.4)) / 2, z: -0.6 });
    // Counter: pumpkins and a basket of apples.
    for (let i = 0; i < 3; i += 1) {
      const x = cx + [-2.9, -1.7, 2.4][i]!;
      voxelBall(b, 0.6 + (i % 2) * 0.15, [0xff8a1a, 0xe8701a, 0xff9a3a][i]!, x, COUNTER + 0.55, z, 0.75, 0, 4);
      block(b, 0.15, 0.4, 0.15, 0x4f7a2a, { x, y: COUNTER + 1.2, z });
    }
    // Wall: corn cobs and a rake; jars of cider on the shelf.
    for (let i = 0; i < 3; i += 1) {
      const x = cx - 2.4 + i * 1.6;
      peg(b, x, 7, d.hz);
      block(b, 0.45, 1.4, 0.45, GOLD, { x, y: 6.1, z: -d.hz + 1.1 });
      block(b, 0.7, 0.5, 0.2, 0x7dc83a, { x, y: 6.9, z: -d.hz + 1.1 });
    }
    block(b, 0.2, 3, 0.2, WOOD_LIGHT, { x: cx + 2.6, y: 6.2, z: -d.hz + 1.1 });
    block(b, 1.4, 0.2, 0.2, 0x7e7e86, { x: cx + 2.6, y: 7.6, z: -d.hz + 1.1 });
    for (let i = 0; i < 4; i += 1) {
      cylinder(b, 0.3, 0.3, 0.7, 0xc8702a, { x: cx - 2.4 + i * 1.6, y: SHELF + 0.35, z: onShelf(d) }, 'smooth', 8);
      block(b, 0.4, 0.15, 0.4, 0xd8d8d8, { x: cx - 2.4 + i * 1.6, y: SHELF + 0.78, z: onShelf(d) });
    }
    // Beside the booth, inside the footprint: the scarecrow, a hay bale, pumpkins, sunflowers.
    const sx = -4.6;
    const sz = 0.2;
    block(b, 0.35, 5.6, 0.35, WOOD_DARK, { x: sx, y: 2.8, z: sz });
    block(b, 3.6, 0.3, 0.3, WOOD_DARK, { x: sx, y: 4.2, z: sz });
    brick(b, 1.9, 1.4, 1, 0x3a6ac8, { x: sx, y: 2.9, z: sz });
    brick(b, 2, 1.3, 1.05, 0xd8443a, { x: sx, y: 4.2, z: sz });
    for (const x of [-1.1, 1.1]) brick(b, 0.7, 1.4, 0.7, 0xd8443a, { x: sx + x * 1.15, y: 4.2, z: sz });
    for (const x of [-1.8, 1.8]) block(b, 0.3, 0.6, 0.3, 0xe8c25a, { x: sx + x, y: 3.9, z: sz });
    brick(b, 1.6, 1.6, 1.4, 0xe8c25a, { x: sx, y: 5.7, z: sz });
    for (const x of [-0.35, 0.35]) block(b, 0.25, 0.25, 0.1, 0x1a1a1a, { x: sx + x, y: 5.9, z: sz + 0.72 });
    block(b, 0.8, 0.12, 0.1, 0x6a3a1a, { x: sx, y: 5.3, z: sz + 0.72 });
    cylinder(b, 1.5, 1.5, 0.15, 0x7a4a1e, { x: sx, y: 6.55, z: sz }, 'smooth', 12);
    cylinder(b, 0.85, 0.95, 1, 0x7a4a1e, { x: sx, y: 7.1, z: sz }, 'smooth', 12);
    block(b, 0.6, 0.55, 0.9, 0x1a1a1a, { x: sx + 0.3, y: 7.9, z: sz });
    wedge(b, 0.3, 0.3, 0.6, 0xffb21a, { x: sx + 0.3, y: 7.8, z: sz + 0.7 });
    brick(b, 2.6, 1.4, 1.6, 0xe8c25a, { x: -4.9, y: 0.7, z: 3.4 });
    for (const x of [-5.8, -4.1]) block(b, 0.12, 1.42, 1.62, 0xb8902a, { x, y: 0.7, z: 3.4 });
    voxelBall(b, 0.75, 0xff8a1a, -4.9, 1.95, 3.4, 0.75, 0, 4);
    block(b, 0.15, 0.45, 0.15, 0x4f7a2a, { x: -4.9, y: 2.75, z: 3.4 });
    voxelBall(b, 0.6, 0xe8701a, -3.2, 0.45, 3.7, 0.75, 0, 4);
    for (let k = 0; k < 3; k += 1) {
      const x = -6 + k * 0.7;
      const zz = -2.8 + k * 0.6;
      block(b, 0.2, 3 + k * 0.4, 0.2, 0x4cb83a, { x, y: 1.5 + k * 0.2, z: zz }, 'leaf');
      cylinder(b, 0.7, 0.7, 0.2, 0xffd21a, { x, y: 3.1 + k * 0.4, z: zz + 0.1, rx: Math.PI / 2 }, 'smooth', 10);
      cylinder(b, 0.32, 0.32, 0.22, 0x6b3a1a, { x, y: 3.1 + k * 0.4, z: zz + 0.12, rx: Math.PI / 2 }, 'smooth', 8);
    }
    // Fallen leaves on the ground round the stand.
    for (let i = 0; i < 9; i += 1) {
      const a = i * 2.4;
      const r = 6 + (i % 3) * 1.4;
      block(b, 0.8, 0.06, 0.8, [0xd8321e, 0xe8701a, GOLD][i % 3]!, { x: Math.cos(a) * r, y: 0.05, z: Math.sin(a) * r * 0.9, ry: a });
    }
  },

  pets(b, d) {
    const z = onCounter(d);
    // Rooftop: the paw-print board and three giant eggs.
    const pawZ = 1;
    block(b, 0.45, 3.6, 0.45, WOOD_DARK, { x: -7.2, y: d.roof(pawZ) + 1.7, z: pawZ - 0.3 });
    part(b, { x: -7.2, y: 13.4, z: pawZ, rz: 0.1 }, (p) => {
      brick(p, 3.8, 3.8, 0.45, WOOD, {});
      brick(p, 3.2, 3.2, 0.1, BOARD, { z: 0.25 });
      const paw = 0xff8a2a;
      cylinder(p, 0.85, 0.85, 0.15, paw, { y: -0.45, z: 0.34, rx: Math.PI / 2 }, 'smooth', 10);
      for (const [x, y] of [[-0.95, 0.4], [-0.35, 0.95], [0.35, 0.95], [0.95, 0.4]] as const) cylinder(p, 0.36, 0.36, 0.15, paw, { x, y, z: 0.34, rx: Math.PI / 2 }, 'smooth', 8);
    });
    for (const [x, ez, r, c, sp] of [[-2.4, 0.2, 2.1, 0xe02b2b, 0xffffff], [1.4, -1, 2.5, 0xffc81e, 0xffffff], [5.2, 0.3, 2.1, 0x2fa8b8, 0x1f6a8a]] as const) {
      brick(b, r * 1.6, 1.9, r * 1.4, 0xe8c25a, { x, y: d.roof(ez) + 0.95, z: ez });
      egg(b, r, c, sp, x, d.roof(ez) + 1.8, ez);
    }
    // Counter: a pet carrier, nests with small eggs, a food bag.
    brick(b, 2.6, 2, 1.4, 0xd8443a, { x: 6, y: COUNTER + 1, z });
    block(b, 1.8, 1.3, 0.1, 0xbfe6ff, { x: 6, y: COUNTER + 1, z: z + 0.72 });
    for (let i = 0; i < 3; i += 1) block(b, 0.1, 1.3, 0.12, 0x2a2a30, { x: 5.5 + i * 0.5, y: COUNTER + 1, z: z + 0.75 });
    block(b, 1, 0.2, 0.3, 0x2a2a30, { x: 6, y: COUNTER + 2.1, z });
    for (let i = 0; i < 3; i += 1) {
      const x = [-3.8, -2, 2.4][i]!;
      brick(b, 1.5, 0.3, 1.1, 0xe8c25a, { x, y: COUNTER + 0.15, z });
      egg(b, 0.42, [0xf2e6c8, 0x7fc4ff, 0xd38cff][i]!, 0xffffff, x, COUNTER + 0.25, z);
    }
    brick(b, 1.2, 1.6, 0.8, 0x2f8ae0, { x: -6.2, y: COUNTER + 0.8, z });
    block(b, 0.8, 0.6, 0.05, 0xffffff, { x: -6.2, y: COUNTER + 0.9, z: z + 0.42 });
    // Wall: leashes on pegs; bowls and bones on the shelf.
    for (let i = 0; i < 4; i += 1) {
      const x = -5 + i * 3.3;
      peg(b, x, 7, d.hz);
      block(b, 0.18, 1.6, 0.12, [0xe02b2b, 0x2f8ae0, 0x3fae3a, 0xffc81e][i]!, { x, y: 6.1, z: -d.hz + 1.15 });
      block(b, 0.5, 0.5, 0.12, [0xe02b2b, 0x2f8ae0, 0x3fae3a, 0xffc81e][i]!, { x, y: 5.2, z: -d.hz + 1.15 });
    }
    for (let i = 0; i < 3; i += 1) {
      const x = -5 + i * 5;
      cylinder(b, 0.65, 0.5, 0.4, [0xe02b2b, 0x2f8ae0, 0xff6aa8][i]!, { x, y: SHELF + 0.2, z: onShelf(d) }, 'smooth', 12);
      block(b, 1.3, 0.3, 0.3, 0xf4f0e6, { x: x + 2.4, y: SHELF + 0.15, z: onShelf(d) });
      for (const dx of [-0.65, 0.65]) block(b, 0.3, 0.5, 0.4, 0xf4f0e6, { x: x + 2.4 + dx, y: SHELF + 0.2, z: onShelf(d) });
    }
  },

  farmers(b, d) {
    const z = onCounter(d);
    // Rooftop: the giant tomato and a star badge.
    const tz = -0.6;
    const ty = d.roof(tz) + 4.6;
    brick(b, 2, 2.6, 2, WOOD_DARK, { x: 3.6, y: d.roof(tz) + 1.3, z: tz });
    voxelBall(b, 2.6, 0xe02b2b, 3.6, ty, tz, 0.85);
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      block(b, 0.6, 0.3, 1.7, 0x3fae3a, { x: 3.6 + Math.sin(a) * 0.7, y: ty + 2.15, z: tz + Math.cos(a) * 0.7, ry: a }, 'leaf');
    }
    block(b, 0.4, 1.1, 0.4, 0x2f7a2a, { x: 3.6, y: ty + 2.7, z: tz });
    block(b, 0.7, 0.5, 0.3, 0xff8a8a, { x: 2.5, y: ty + 1, z: tz + 1.75 });
    block(b, 0.45, 3.6, 0.45, WOOD_DARK, { x: -5.4, y: d.roof(0.6) + 1.7, z: 0.4 });
    part(b, { x: -5.4, y: 13.6, z: 0.6, rz: 0.18 }, (p) => {
      brick(p, 3.6, 2.7, 0.45, 0xff6a1a, {});
      brick(p, 3, 2.1, 0.1, 0xff8a3a, { z: 0.25 });
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        cone(p, 0.36, 0.9, GOLD, { x: Math.sin(a) * 0.5, y: Math.cos(a) * 0.5, z: 0.36, rz: -a, sz: 0.4 }, 'smooth', 4);
      }
      cylinder(p, 0.5, 0.5, 0.22, GOLD, { z: 0.36, rx: Math.PI / 2 }, 'smooth', 5);
    });
    // Counter: crates of produce.
    crate(b, -6, z, 3);
    crate(b, -2.6, z, 7);
    crate(b, 2.6, z, 8);
    crate(b, 6, z, 4);
    // Wall: seed packets on pegs; jars of jam on the shelf.
    for (let i = 0; i < 6; i += 1) {
      const x = -6 + i * 2.4;
      peg(b, x, 7.2, d.hz);
      block(b, 0.9, 1.2, 0.08, [0xe02b2b, 0x3fae3a, 0xffc81e, 0x8a4ae0, 0xff8a2a, 0x2f8ae0][i]!, { x, y: 6.45, z: -d.hz + 1.1 });
      block(b, 0.6, 0.4, 0.04, 0xffffff, { x, y: 6.6, z: -d.hz + 1.16 });
    }
    for (let i = 0; i < 6; i += 1) {
      const x = -6 + i * 2.4;
      cylinder(b, 0.35, 0.35, 0.8, [0xc8203a, 0xffa01a, 0x7a2a8a][i % 3]!, { x, y: SHELF + 0.4, z: onShelf(d) }, 'smooth', 8);
      cylinder(b, 0.4, 0.4, 0.18, 0xf2f2ea, { x, y: SHELF + 0.88, z: onShelf(d) }, 'smooth', 8);
    }
  },

  furniture(b, d) {
    const z = onCounter(d);
    // Rooftop: a giant hammer and a red armchair.
    block(b, 0.5, 2.4, 0.5, WOOD_DARK, { x: -4.2, y: d.roof(0) + 1.2, z: -0.3 });
    part(b, { x: -4.6, y: d.roof(0) + 4, z: 0, rz: 0.55 }, (p) => {
      brick(p, 0.6, 5.2, 0.6, WOOD_LIGHT, {});
      brick(p, 3.4, 1.4, 1.4, 0x7e7e86, { y: 2.6 });
      brick(p, 0.9, 0.8, 1.2, 0x5e5e66, { x: -2, y: 2.9 });
      brick(p, 0.9, 0.8, 1.2, 0x5e5e66, { x: -2.3, y: 2.3 });
      block(p, 0.7, 1.2, 0.7, WOOD_DARK, { y: -2 });
    });
    brick(b, 3.6, 2.2, 3, WOOD_LIGHT, { x: 4.6, y: d.roof(-0.4) + 1.1, z: -0.4 });
    part(b, { x: 4.6, y: d.roof(-0.4) + 2.2, z: -0.4, ry: -0.3, sx: 1.5, sy: 1.5, sz: 1.5 }, (p) => {
      for (const [x, zz] of [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]] as const) block(p, 0.35, 0.6, 0.35, WOOD_DARK, { x, y: 0.3, z: zz });
      brick(p, 2.8, 0.8, 2.4, 0xd8392a, { y: 1 });
      brick(p, 2.8, 2.6, 0.6, 0xd8392a, { y: 2.3, z: -0.9 });
      for (const x of [-1.3, 1.3]) brick(p, 0.5, 1, 2.4, 0xb82a1e, { x, y: 1.85 });
      brick(p, 1.9, 0.3, 1.5, 0xff6a5a, { y: 1.5, z: 0.25 });
    });
    // Counter: a toolbox, a table lamp, a stack of planks.
    brick(b, 2.2, 1, 1, 0xd8392a, { x: -5.4, y: COUNTER + 0.5, z });
    block(b, 1, 0.2, 0.2, 0x2a2a30, { x: -5.4, y: COUNTER + 1.2, z });
    for (const x of [-5.9, -4.9]) block(b, 0.15, 0.3, 0.15, 0x2a2a30, { x, y: COUNTER + 1.05, z });
    cylinder(b, 0.5, 0.6, 0.2, WOOD_DARK, { x: 5.2, y: COUNTER + 0.1, z }, 'smooth', 10);
    block(b, 0.15, 1.2, 0.15, 0x2a2a30, { x: 5.2, y: COUNTER + 0.8, z });
    cylinder(b, 0.45, 0.8, 0.8, 0xfff2b0, { x: 5.2, y: COUNTER + 1.7, z }, 'glow', 10);
    for (let i = 0; i < 3; i += 1) brick(b, 3, 0.3, 0.8, i % 2 ? WOOD : WOOD_LIGHT, { x: -2.6, y: COUNTER + 0.15 + i * 0.3, z, ry: (i - 1) * 0.08 });
    // Wall: a saw, a hammer and a square on pegs; paint tins on the shelf.
    peg(b, -4, 7.2, d.hz);
    block(b, 2.6, 1, 0.08, 0xc0c4cc, { x: -4, y: 6.4, z: -d.hz + 1.1 });
    brick(b, 0.9, 0.9, 0.3, WOOD_LIGHT, { x: -2.4, y: 6.6, z: -d.hz + 1.1 });
    peg(b, 0.5, 7.2, d.hz);
    block(b, 0.25, 1.8, 0.25, WOOD_LIGHT, { x: 0.5, y: 6.1, z: -d.hz + 1.1 });
    block(b, 1, 0.45, 0.45, 0x7e7e86, { x: 0.5, y: 7, z: -d.hz + 1.1 });
    peg(b, 4, 7.2, d.hz);
    block(b, 0.25, 1.8, 0.08, 0xc0c4cc, { x: 3.6, y: 6.2, z: -d.hz + 1.1 });
    block(b, 1.1, 0.25, 0.08, 0xc0c4cc, { x: 4.1, y: 7, z: -d.hz + 1.1 });
    for (let i = 0; i < 5; i += 1) {
      const x = -5.6 + i * 2.8;
      cylinder(b, 0.45, 0.45, 0.8, 0x9a9aa2, { x, y: SHELF + 0.4, z: onShelf(d) }, 'smooth', 10);
      cylinder(b, 0.47, 0.47, 0.25, [0xe02b2b, 0x2f8ae0, 0x3fae3a, 0xffc81e, 0xffffff][i]!, { x, y: SHELF + 0.45, z: onShelf(d) }, 'smooth', 10);
    }
  },

  stands(b, d) {
    const z = onCounter(d);
    // Rooftop: the SOLD sign on its post and a giant newspaper.
    block(b, 0.45, 12.9 - d.roof(0.3), 0.45, WOOD_DARK, { x: SOLD_SIGN.x + 0.2, y: (12.9 + d.roof(0.3)) / 2, z: 0.3 });
    part(b, { x: SOLD_SIGN.x, y: SOLD_SIGN.y, z: SOLD_SIGN.z, rz: SOLD_SIGN.rz }, (p) => {
      brick(p, 4.6, 2.3, 0.4, 0xa86a36, {});
      brick(p, 5.1, 0.35, 0.55, WOOD_DARK, { y: 1.25 });
      brick(p, 5.1, 0.35, 0.55, WOOD_DARK, { y: -1.25 });
      for (const x of [-2.45, 2.45]) brick(p, 0.35, 2.85, 0.55, WOOD_DARK, { x });
    });
    part(b, { x: 4.4, y: 12.4, z: -0.2, rz: -0.22, ry: -0.2 }, (p) => {
      block(p, 3.4, 4.2, 0.14, 0xdcdcd2, { x: 0.5, y: -0.2, z: -0.25, rz: -0.12 });
      block(p, 3.6, 4.4, 0.14, 0xf6f6ee, {});
      block(p, 3, 0.7, 0.05, 0x1a1a1a, { y: 1.5, z: 0.09 });
      for (let i = 0; i < 6; i += 1) block(p, i % 3 === 2 ? 1.6 : 3, 0.22, 0.05, 0x2a2a2a, { x: i % 3 === 2 ? -0.7 : 0, y: 0.7 - i * 0.48, z: 0.09 });
    });
    block(b, 0.4, 12.4 - 2.2 - d.roof(-0.2), 0.4, WOOD_DARK, { x: 4.4, y: (12.4 - 2.2 + d.roof(-0.2)) / 2, z: -0.4 });
    // Counter: papers, cash stacks and a register.
    for (let i = 0; i < 4; i += 1) block(b, 1.2, 0.05, 1.5, 0xf6f6ee, { x: -6.4 + i * 1.3, y: COUNTER + 0.03 + i * 0.01, z, ry: (i % 2 ? 0.2 : -0.15) });
    for (let i = 0; i < 3; i += 1) brick(b, 0.9, 0.3 + i * 0.15, 0.6, 0x3fae3a, { x: 1.7 + i * 1, y: COUNTER + 0.15 + i * 0.075, z });
    brick(b, 1.9, 1.1, 1.3, 0x5a5a62, { x: 5.2, y: COUNTER + 0.55, z });
    block(b, 1.5, 0.5, 0.1, 0x7dff8a, { x: 5.2, y: COUNTER + 1.3, z: z - 0.3, rx: -0.3 }, 'glow');
    block(b, 1.4, 0.2, 0.6, 0x2a2a30, { x: 5.2, y: COUNTER + 1.15, z: z + 0.3 });
    // Wall: notes pinned up; ledgers on the shelf.
    for (let i = 0; i < 7; i += 1) block(b, 1.2, 1.3, 0.05, [0xffffff, 0xffe066, 0x8ae0ff, 0xff9ac0][i % 4]!, { x: -6.6 + i * 2.2, y: 6.2 + (i % 2) * 1, z: -d.hz + 0.9, rz: (i % 2 ? 0.1 : -0.1) });
    for (let i = 0; i < 7; i += 1) brick(b, 0.5, 1.1, 0.8, [0xe02b2b, 0x2f8ae0, 0x3fae3a, 0xffc81e][i % 4]!, { x: -6 + i * 0.6, y: SHELF + 0.55, z: onShelf(d) });
    for (let i = 0; i < 3; i += 1) block(b, 1.3, 0.12, 1, 0xf6f6ee, { x: 3 + i * 1.6, y: SHELF + 0.06, z: onShelf(d), ry: (i - 1) * 0.2 });
  },

  gear(b, d) {
    const z = onCounter(d);
    // Rooftop: a giant pickaxe, leaning over the right side of the board.
    part(b, { x: 5.4, y: d.roof(0.2) + 4.3, z: 0.2, rz: -0.55 }, (p) => {
      brick(p, 0.6, 9, 0.6, WOOD_LIGHT, {});
      block(p, 0.75, 0.9, 0.75, WOOD_DARK, { y: -3.6 });
      brick(p, 1.4, 1.3, 1, 0x5a5a62, { y: 4.2 });
      for (const side of [-1, 1]) {
        brick(p, 2.4, 0.9, 0.9, 0x6e6e78, { x: side * 1.8, y: 4, rz: side * 0.18 });
        brick(p, 1.3, 0.6, 0.7, 0x82828c, { x: side * 3.4, y: 3.55, rz: side * 0.42 });
      }
    });
    // Counter: potions, a watering can.
    for (let i = 0; i < 4; i += 1) {
      const x = -6 + i * 1.5;
      cylinder(b, 0.38, 0.48, 1, [0x5ad8ff, 0x7dff4a, 0xffb21a, 0xff5a5a][i]!, { x, y: COUNTER + 0.5, z }, 'glow', 8);
      block(b, 0.22, 0.35, 0.22, 0x6a3a1a, { x, y: COUNTER + 1.18, z });
    }
    cylinder(b, 0.7, 0.7, 1.2, 0x3fae3a, { x: 4.6, y: COUNTER + 0.6, z }, 'smooth', 12);
    block(b, 0.2, 0.2, 1.5, 0x3fae3a, { x: 4.6, y: COUNTER + 1, z: z + 0.6, rx: 0.6 });
    block(b, 0.2, 0.9, 0.2, 0x2f7a2a, { x: 4.6, y: COUNTER + 1.5, z: z - 0.5 });
    // Wall: shovel, rake and trowel; fertiliser bags on the shelf.
    for (const [x, tool] of [[-4.5, 0], [-1, 1], [2.5, 2], [5.6, 0]] as const) {
      peg(b, x, 7.6, d.hz);
      block(b, 0.2, 2.6, 0.2, WOOD_LIGHT, { x, y: 6.3, z: -d.hz + 1.1 });
      if (tool === 0) brick(b, 0.9, 1, 0.12, 0x9a9aa2, { x, y: 4.95 + 0.35, z: -d.hz + 1.1 });
      if (tool === 1) {
        block(b, 1.4, 0.2, 0.2, 0x9a9aa2, { x, y: 5.1, z: -d.hz + 1.1 });
        for (let k = 0; k < 4; k += 1) block(b, 0.1, 0.4, 0.1, 0x9a9aa2, { x: x - 0.55 + k * 0.37, y: 4.85, z: -d.hz + 1.1 });
      }
      if (tool === 2) brick(b, 0.6, 0.8, 0.12, 0x2f6ae0, { x, y: 5.2, z: -d.hz + 1.1 });
    }
    for (let i = 0; i < 4; i += 1) {
      const x = -5 + i * 3.3;
      brick(b, 1.4, 1.2, 0.8, 0xc49a5a, { x, y: SHELF + 0.6, z: onShelf(d) });
      block(b, 1.45, 0.3, 0.82, [0x3fae3a, 0x2f8ae0, 0xffb21a, 0xc77dff][i]!, { x, y: SHELF + 0.7, z: onShelf(d) });
    }
  },

  worms(b, d) {
    const z = onCounter(d);
    // Rooftop: a giant pink worm rearing up behind the board.
    const segs = 11;
    const wz = -0.4;
    const at = (t: number): [number, number] => [-5.6 + 11 * t, d.roof(wz) + 0.6 + 5.6 * Math.sin(t * Math.PI * 0.62)];
    for (let i = 0; i < segs; i += 1) {
      const t = i / (segs - 1);
      const [x, y] = at(t);
      const [x2, y2] = at(Math.min(1, t + 0.05));
      const [x1, y1] = at(Math.max(0, t - 0.05));
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const size = 1.3 + t * 0.35;
      const c = i === 7 ? 0xd84a88 : i % 2 ? 0xff8ac0 : 0xff6aa8;
      brick(b, size * 0.8, size, size, c, { x, y, z: wz, rz: ang });
    }
    const [hx, hy] = at(1);
    voxelBall(b, 1.05, 0xff8ac0, hx + 0.3, hy + 0.5, wz, 1, 0, 4);
    for (const dx of [-0.42, 0.42]) {
      block(b, 0.45, 0.55, 0.12, 0xffffff, { x: hx + 0.3 + dx, y: hy + 0.7, z: wz + 0.82 });
      block(b, 0.22, 0.28, 0.06, 0x1a1a1a, { x: hx + 0.3 + dx, y: hy + 0.64, z: wz + 0.9 });
    }
    block(b, 0.6, 0.14, 0.06, 0xb82a6a, { x: hx + 0.3, y: hy + 0.15, z: wz + 0.86 });
    // Counter: cans of worms and a bait bucket.
    for (let i = 0; i < 4; i += 1) {
      const x = -6.4 + i * 1.6;
      cylinder(b, 0.55, 0.55, 0.9, 0x9a9aa2, { x, y: COUNTER + 0.45, z }, 'smooth', 10);
      cylinder(b, 0.57, 0.57, 0.3, [0xff6aa8, 0x3fae3a, 0xffb21a, 0x2f8ae0][i]!, { x, y: COUNTER + 0.45, z }, 'smooth', 10);
      for (let k = 0; k < 3; k += 1) block(b, 0.16, 0.6, 0.16, 0xff8ab8, { x: x + (k - 1) * 0.2, y: COUNTER + 1.1, z, rz: (k - 1) * 0.5 });
    }
    cylinder(b, 0.9, 0.7, 1.3, 0x2f6ae0, { x: 5, y: COUNTER + 0.65, z }, 'smooth', 12);
    cylinder(b, 0.8, 0.8, 0.1, 0x5a3016, { x: 5, y: COUNTER + 1.25, z }, 'smooth', 12);
    block(b, 1.8, 0.1, 0.1, 0x2a2a30, { x: 5, y: COUNTER + 1.7, z });
    // Wall: fishing rods on pegs; jars of worms on the shelf.
    for (let i = 0; i < 3; i += 1) {
      const x = -4 + i * 4;
      peg(b, x - 0.5, 7.6, d.hz);
      peg(b, x + 0.5, 7.6, d.hz);
      block(b, 3, 0.16, 0.16, [WOOD_LIGHT, 0x2f8ae0, 0xe02b2b][i]!, { x, y: 7.75, z: -d.hz + 1.1 });
      cylinder(b, 0.3, 0.3, 0.3, 0x2a2a30, { x: x - 1, y: 7.4, z: -d.hz + 1.1, rx: Math.PI / 2 }, 'smooth', 8);
      block(b, 0.04, 1.6, 0.04, 0xeaeaea, { x: x + 1.45, y: 6.9, z: -d.hz + 1.1 });
    }
    for (let i = 0; i < 5; i += 1) {
      const x = -5.6 + i * 2.8;
      cylinder(b, 0.42, 0.42, 0.9, 0xcfefff, { x, y: SHELF + 0.45, z: onShelf(d) }, 'smooth', 8);
      cylinder(b, 0.3, 0.3, 0.5, 0x7a4a2a, { x, y: SHELF + 0.3, z: onShelf(d) }, 'smooth', 8);
      block(b, 0.15, 0.5, 0.15, 0xff8ab8, { x, y: SHELF + 0.7, z: onShelf(d), rz: 0.3 });
      cylinder(b, 0.45, 0.45, 0.15, 0xff6aa8, { x, y: SHELF + 0.98, z: onShelf(d) }, 'smooth', 8);
    }
  },
};

// ------------------------------------------------------------------ the Lucky Wheel

/**
 * The Lucky Wheel's stand: a red stage with a gold-trimmed edge and a front
 * step, the A-frame the wheel turns on, and a marquee arch - two posts and a
 * beam carrying the title board ABOVE the wheel and in front of its plane, so
 * the title is never behind the wheel. The pointer hangs from the board.
 */
const buildWheelStand = (b: PartBuilder): void => {
  const red = 0xd8392a;
  // The stage, its trim and the front step.
  brick(b, 12, 0.3, 6.2, 0x9a2418, { y: 0.15, z: -0.4 });
  brick(b, 11.8, 0.7, 6, red, { y: 0.65, z: -0.4 });
  block(b, 11.9, 0.16, 0.12, GOLD, { y: 0.92, z: 2.62 });
  for (const x of [-5.92, 5.92]) block(b, 0.12, 0.16, 6.1, GOLD, { x, y: 0.92, z: -0.4 });
  brick(b, 5, 0.5, 0.8, 0xb82a1e, { y: 0.25, z: 3.1 });
  // The A-frame and axle behind the wheel.
  const { x: wx, y: wy, z: wz } = WHEEL_FACE;
  for (const side of [-1, 1]) block(b, 0.45, 5, 0.45, WOOD_DARK, { x: wx + side * 0.8, y: 1 + 2.35, z: wz - 0.9, rz: -side * 0.33 });
  brick(b, 2.6, 0.4, 1, WOOD_DARK, { x: wx, y: 1.2, z: wz - 0.9 });
  block(b, 0.5, 0.5, 0.9, WOOD_DARK, { x: wx, y: wy, z: wz - 0.65 });
  // The marquee arch and the title board.
  const { y: by, z: bz, w: bw, h: bh } = WHEEL_BOARD;
  for (const x of [-5.5, 5.5]) {
    brick(b, 0.7, by + bh / 2 + 1.4 - 1, 0.7, WOOD_DARK, { x, y: 1 + (by + bh / 2 + 1.4 - 1) / 2, z: bz - 0.5 });
    brick(b, 1, 0.5, 1, STONE, { x, y: 1.25, z: bz - 0.5 });
  }
  brick(b, 12, 0.5, 0.8, WOOD_DARK, { y: by + bh / 2 + 1.4, z: bz - 0.5 });
  titleBoard(b, 0, by, bz, bw, bh, by + bh, red);
  for (const x of [-3.6, 3.6]) block(b, 0.3, 0.9, 0.3, WOOD_DARK, { x, y: by + bh / 2 + 0.9, z: bz - 0.2 });
  // Marquee bulbs round the board.
  for (let i = 0; i < 9; i += 1) {
    const x = -bw / 2 + 0.6 + ((bw - 1.2) * i) / 8;
    ball(b, 0.2, i % 2 ? GOLD : 0xfff2b0, { x, y: by + bh / 2 + 0.24, z: bz + 0.36 }, 'glow', 0);
    ball(b, 0.2, i % 2 ? 0xfff2b0 : GOLD, { x, y: by - bh / 2 - 0.24, z: bz + 0.36 }, 'glow', 0);
  }
  // The pointer over the top of the wheel.
  block(b, 0.9, 0.4, 0.5, GOLD, { x: wx, y: by - bh / 2 - 0.45, z: wz + 0.95 });
  cone(b, 0.5, 1.1, 0xe02b2b, { x: wx, y: by - bh / 2 - 1.15, z: wz + 0.95, rz: Math.PI }, 'smooth', 4);
};

/** The Lucky Wheel's face: coloured slices, a rim and a hub. Spun as one mesh. */
export const buildWheelFace = (b: PartBuilder, colors: readonly string[]): void => {
  const n = colors.length;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    // Laid flat first (rx), then turned round the axle (rz): one Euler would turn them the other way round.
    part(b, { x: Math.sin(a + Math.PI / n) * 1.8, y: Math.cos(a + Math.PI / n) * 1.8, z: 0.17, rz: -(a + Math.PI / n) }, (p) => {
      wedge(p, 2.6, 0.3, 3.6, Number.parseInt(colors[i]!.slice(1), 16), { rx: Math.PI / 2 }, 'smooth');
    });
  }
  cylinder(b, 4.3, 4.3, 0.25, 0x6a3a1a, { rx: Math.PI / 2, z: -0.12 }, 'smooth', 24);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    ball(b, 0.2, 0xffd23a, { x: Math.sin(a) * 4.1, y: Math.cos(a) * 4.1, z: 0.25 }, 'glow', 0);
  }
  cylinder(b, 0.7, 0.7, 0.6, 0xffd23a, { rx: Math.PI / 2, z: 0.3 }, 'smooth', 12);
};
