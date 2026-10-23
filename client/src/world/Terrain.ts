import { BufferAttribute, BufferGeometry, Color, MeshLambertMaterial } from 'three';
import { studify } from '../render/Studs.js';

/**
 * PAINTED TERRAIN: the ground of every area is ONE surface, laid as a grid of
 * tiles (two studs a side), each tile painted its own colour - grass tones,
 * trails, mud, sand, leaf litter, snow - the way a Roblox builder paints
 * terrain. There is never a second surface over the first: no decals, no
 * overlays, nothing coplanar, so nothing can flicker.
 *
 * Liquids are CUT INTO the ground: a water, lava, tar or ice tile is a hole in
 * the ground with earth banks down its sides and its own surface a little
 * below the rim (water over a darker bed, so it reads as shallow water). A
 * walker stands at the ground's height and wades straight across.
 */

/** Two studs: tile edges fall on the stud grid. */
export const TILE = 2.2;

export type Liquid = 'water' | 'lava' | 'tar' | 'ice' | 'void';

export interface Cell {
  readonly color: number;
  readonly liquid?: Liquid;
  /** The liquid's colour (water tint, lava orange...). */
  readonly liquidColor?: number;
}

export interface TerrainSpec {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** The ground's height. */
  readonly y: number;
  readonly paint: (x: number, z: number) => Cell;
  /** Earth colour of the banks round a liquid. */
  readonly bank?: number;
  /** When set, the rectangle's outer edge gets a skirt down to this height (a raised floor's sides). */
  readonly skirtTo?: number;
  readonly skirtColor?: number;
}

export interface TerrainParts {
  /** Opaque, vertex-coloured: the ground, liquid banks, water beds, tar and ice. */
  readonly ground: BufferGeometry;
  /** Translucent water surfaces, vertex-coloured. */
  readonly water: BufferGeometry | null;
  /** Lava: unlit, vertex-coloured. */
  readonly glow: BufferGeometry | null;
}

/** How far below the ground a liquid's surface lies, and a water bed. */
const SURFACE_DROP = 0.1;
const BED_DROP = 0.95;
/** How far a void's bank falls: the island's edge down into the sea. */
const VOID_DROP = 3.2;

class Sink {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];

  /** A flat quad, face up, at height y. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, color: Color): void {
    this.tri(x0, y, z0, x0, y, z1, x1, y, z1, 0, 1, 0, color);
    this.tri(x0, y, z0, x1, y, z1, x1, y, z0, 0, 1, 0, color);
  }

  /** A vertical quad from (ax, az) to (bx, bz) between heights y0 < y1, facing (nx, nz). */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, nx: number, nz: number, color: Color): void {
    // Wound so the front faces along the given normal.
    const flip = (bz - az) * nx - (bx - ax) * nz < 0;
    if (flip) {
      this.tri(ax, y0, az, bx, y1, bz, ax, y1, az, nx, 0, nz, color);
      this.tri(ax, y0, az, bx, y0, bz, bx, y1, bz, nx, 0, nz, color);
    } else {
      this.tri(ax, y0, az, ax, y1, az, bx, y1, bz, nx, 0, nz, color);
      this.tri(ax, y0, az, bx, y1, bz, bx, y0, bz, nx, 0, nz, color);
    }
  }

  private tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, nx: number, ny: number, nz: number, color: Color): void {
    this.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i += 1) {
      this.normals.push(nx, ny, nz);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  geometry(): BufferGeometry | null {
    if (this.positions.length === 0) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    return g;
  }
}

const A = new Color();
const B = new Color();

/** Lay a painted rectangle of terrain. */
export const paintTerrain = (spec: TerrainSpec): TerrainParts => {
  const { minX, maxX, minZ, maxZ, y } = spec;
  const i0 = Math.floor(minX / TILE);
  const i1 = Math.ceil(maxX / TILE);
  const j0 = Math.floor(minZ / TILE);
  const j1 = Math.ceil(maxZ / TILE);
  const cols = i1 - i0;
  const rows = j1 - j0;
  const cells: Cell[] = new Array(cols * rows);
  const x0Of = (i: number): number => Math.max(minX, (i0 + i) * TILE);
  const x1Of = (i: number): number => Math.min(maxX, (i0 + i + 1) * TILE);
  const z0Of = (j: number): number => Math.max(minZ, (j0 + j) * TILE);
  const z1Of = (j: number): number => Math.min(maxZ, (j0 + j + 1) * TILE);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      cells[j * cols + i] = spec.paint((x0Of(i) + x1Of(i)) / 2, (z0Of(j) + z1Of(j)) / 2);
    }
  }
  const at = (i: number, j: number): Cell | null => (i < 0 || j < 0 || i >= cols || j >= rows ? null : cells[j * cols + i]!);

  const ground = new Sink();
  const water = new Sink();
  const glow = new Sink();
  const bankColor = new Color(spec.bank ?? 0x7a5230);
  const bank = new Color();
  for (let j = 0; j < rows; j += 1) {
    const z0 = z0Of(j);
    const z1 = z1Of(j);
    // Runs of equal ground merge into one quad; liquids likewise, per kind and tint.
    let i = 0;
    while (i < cols) {
      const cell = at(i, j)!;
      let k = i + 1;
      while (k < cols) {
        const next = at(k, j)!;
        if (next.color !== cell.color || next.liquid !== cell.liquid || next.liquidColor !== cell.liquidColor) break;
        k += 1;
      }
      const x0 = x0Of(i);
      const x1 = x1Of(k - 1);
      if (!cell.liquid) {
        ground.flat(x0, z0, x1, z1, y, A.setHex(cell.color));
      } else {
        A.setHex(cell.liquidColor ?? 0x2fa8d8);
        if (cell.liquid === 'void') {
          // Nothing: the sea shows through.
        } else if (cell.liquid === 'water') {
          water.flat(x0, z0, x1, z1, y - SURFACE_DROP, A);
          // The bed: the water's own colour, deep and dark.
          ground.flat(x0, z0, x1, z1, y - BED_DROP, B.copy(A).multiplyScalar(0.42));
        } else if (cell.liquid === 'lava') {
          glow.flat(x0, z0, x1, z1, y - SURFACE_DROP, A);
        } else {
          ground.flat(x0, z0, x1, z1, y - SURFACE_DROP, A);
        }
      }
      i = k;
    }
  }
  // Banks: wherever a liquid tile meets dry ground, an earth face down into it.
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const cell = at(i, j)!;
      if (!cell.liquid) continue;
      const depth = cell.liquid === 'void' ? VOID_DROP : cell.liquid === 'water' ? BED_DROP : SURFACE_DROP;
      const x0 = x0Of(i);
      const x1 = x1Of(i);
      const z0 = z0Of(j);
      const z1 = z1Of(j);
      const sides: readonly (readonly [Cell | null, number, number, number, number, number, number])[] = [
        [at(i - 1, j), x0, z0, x0, z1, 1, 0],
        [at(i + 1, j), x1, z0, x1, z1, -1, 0],
        [at(i, j - 1), x0, z0, x1, z0, 0, 1],
        [at(i, j + 1), x0, z1, x1, z1, 0, -1],
      ];
      for (const [side, ax, az, bx, bz, nx, nz] of sides) {
        if (!side || side.liquid) continue;
        // The bank takes the colour of the ground above it, darkened into earth.
        bank.setHex(side.color).lerp(bankColor, 0.65);
        ground.wall(ax, az, bx, bz, y - depth, y, nx, nz, bank);
      }
    }
  }
  if (spec.skirtTo !== undefined) {
    const skirt = new Color(spec.skirtColor ?? spec.bank ?? 0x7a5230);
    const low = spec.skirtTo;
    ground.wall(minX, minZ, maxX, minZ, low, y, 0, -1, skirt);
    ground.wall(minX, maxZ, maxX, maxZ, low, y, 0, 1, skirt);
    ground.wall(minX, minZ, minX, maxZ, low, y, -1, 0, skirt);
    ground.wall(maxX, minZ, maxX, maxZ, low, y, 1, 0, skirt);
  }
  return { ground: ground.geometry() ?? new BufferGeometry(), water: water.geometry(), glow: glow.geometry() };
};

// ------------------------------------------------------------- noise

/** Smooth value noise in 0..1, seeded: the blobs every painter is made of. */
export const valueNoise = (seed: number): ((x: number, z: number) => number) => {
  const hash = (i: number, j: number): number => {
    let h = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (x: number, z: number): number => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const fx = smooth(x - i);
    const fz = smooth(z - j);
    const a = hash(i, j);
    const b = hash(i + 1, j);
    const c = hash(i, j + 1);
    const d = hash(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
};

/** A per-tile hash in 0..1: the speckle of a hand-painted floor. */
export const tileHash = (x: number, z: number, seed = 0): number => {
  const i = Math.floor(x / TILE);
  const j = Math.floor(z / TILE);
  let h = (i * 73856093) ^ (j * 19349663) ^ (seed * 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------- materials

/**
 * WATER THAT MOVES: bands of light drift across still water and pour down a
 * waterfall, drawn in the shader from world position and one shared clock.
 */
const flow = { value: 0 };

const flowing = <T extends MeshLambertMaterial>(material: T, fall: boolean): T => {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uFlowTime = flow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlowPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const band = fall
      ? 'fract(vFlowPos.y * 0.45 + uFlowTime * 1.6 + sin(vFlowPos.x * 1.7 + vFlowPos.z * 1.7) * 0.25)'
      : 'fract((vFlowPos.x * 0.6 + vFlowPos.z * 0.35) * 0.22 + uFlowTime * 0.18 + sin(vFlowPos.z * 0.35 + uFlowTime) * 0.12)';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlowPos;\nuniform float uFlowTime;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n{ float b = ${band}; diffuseColor.rgb *= 0.9 + ${fall ? '0.28' : '0.2'} * smoothstep(0.0, 0.12, b) * (1.0 - smoothstep(0.34, 0.48, b)); }`,
      );
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|flow:${fall ? 1 : 0}`;
  return material;
};

let waterMaterial: MeshLambertMaterial | null = null;
let fallMaterial: MeshLambertMaterial | null = null;

/** The shared material of every still water surface (vertex-coloured, translucent). */
export const waterSurface = (): MeshLambertMaterial => {
  if (!waterMaterial) {
    waterMaterial = flowing(new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, emissive: 0x0a2a3a }), false);
  }
  return waterMaterial;
};

/** The shared material of every waterfall: bright, translucent, pouring. */
export const waterfallSurface = (): MeshLambertMaterial => {
  if (!fallMaterial) {
    fallMaterial = flowing(studify(new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86, depthWrite: false, emissive: 0x1a4a66 }), 0.2), true);
  }
  return fallMaterial;
};

/** Advance the water's clock (once a frame, from whoever owns the frame). */
export const tickWater = (delta: number): void => {
  flow.value = (flow.value + delta) % 1000;
};
