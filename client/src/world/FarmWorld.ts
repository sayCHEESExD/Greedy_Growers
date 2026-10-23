import {
  BOARDS,
  BOUNDS,
  GREEDY_TREE,
  GUARANTEE_SIGN,
  ORCHARD,
  PLOT,
  PLOTS,
  RIVER,
  STALLS,
  insideLawn,
} from '@greedy/shared';
import {
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildTree } from '../models/greedyTrees.js';
import { ball, block, brick, seededRandom, shade } from '../models/shapes.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { MarketScene, ringGeometry, type StallView } from './MarketScene.js';
import { paintTerrain, tileHash, waterSurface, type Cell } from './Terrain.js';
import { foam, hangingVine, pebbles, reeds, tallGrass, terrainWall, waterfallGeometry, type Ledge, type WallTier } from './Wild.js';
import { boulders, broadleaf, bush, flowers, grassTuft, jungleGiant, palm, rock, type Rand } from './WildNature.js';

const CHUNK = 66;
/** How far past the walls the valley floor runs (under the terrain walls and the forest beyond). */
const OUTER = 90;

/** The baseplate's oranges (the reference's studded ground), the market's warmer yellows, the river's edge. */
const ORANGE = [0xeb962c, 0xe8902a, 0xef9e30, 0xe48a28] as const;
const YELLOW = [0xf2b23a, 0xf0aa36, 0xf4b840, 0xeea634] as const;
const EDGE = 0x9a4a1a;
const GRASS = [0x5ec83e, 0x6acc44, 0x56bc3a, 0x72d24a] as const;
const LOT = [0xd8822a, 0xd27c28] as const;
const WALL = 0xeadcb4;
/** The valley's rock (Monkey Evolution's warm sandstone), its turf, its banks. */
const ROCK = 0xc8925a;
const TURF = 0x56c23a;
const BANK = 0xa8703a;
const FALL = 0x8adcff;

const tiers = (bank: readonly [number, number], shelf: readonly [number, number], cliff: readonly [number, number]): WallTier[] => [
  { depth: 3.4, height: bank, color: BANK },
  { depth: 5, height: shelf, color: ROCK },
  { depth: 10, height: cliff, color: shade(ROCK, 1.08) },
];

/**
 * THE CANAL'S WATER: no texture, nothing tiles. Two layers of value noise
 * drift downstream at the seeds' own speed, long streaks of light slide along
 * the current, the middle runs deep and the edges shallow, and white foam
 * curls along both banks - all from world position and one clock, so it never
 * repeats in a way the eye can catch.
 */
const riverUniforms = { uRiverTime: { value: 0 } };

const riverMaterial = (): MeshLambertMaterial => {
  const material = new MeshLambertMaterial({ color: 0xffffff, emissive: 0x0a3050 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRiverTime = riverUniforms.uRiverTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRiverPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vRiverPos;',
          'uniform float uRiverTime;',
          'float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
          'float rNoise(vec2 p) {',
          '  vec2 i = floor(p); vec2 f = fract(p);',
          '  vec2 u = f * f * (3.0 - 2.0 * f);',
          '  return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x), u.y);',
          '}',
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '{',
          `  float speed = ${RIVER.speed.toFixed(2)};`,
          `  float across = (vRiverPos.z - ${RIVER.z.toFixed(1)}) / ${RIVER.half.toFixed(1)};`,
          '  vec2 p = vRiverPos.xz;',
          '  float t = uRiverTime;',
          '  float n1 = rNoise(vec2((p.x - t * speed) * 0.11, p.y * 0.32));',
          '  float n2 = rNoise(vec2((p.x - t * speed * 1.3) * 0.27 + 7.0, p.y * 0.71 + t * 0.15));',
          '  float ripple = n1 * 0.62 + n2 * 0.38;',
          '  float edge = smoothstep(0.35, 1.0, abs(across));',
          '  vec3 deep = vec3(0.07, 0.40, 0.78);',
          '  vec3 shallow = vec3(0.26, 0.70, 0.96);',
          '  vec3 col = mix(deep, shallow, clamp(edge * 0.75 + (ripple - 0.5) * 0.55 + 0.15, 0.0, 1.0));',
          '  float streak = smoothstep(0.66, 0.92, rNoise(vec2((p.x - t * speed * 1.1) * 0.06, p.y * 1.4 + 3.0)));',
          '  col += vec3(0.30, 0.36, 0.40) * streak * (1.0 - edge * 0.6);',
          '  float sparkle = smoothstep(0.86, 0.98, rNoise(vec2((p.x - t * speed) * 0.9, p.y * 0.9 + t * 0.6)));',
          '  col += vec3(0.5) * sparkle * 0.35;',
          '  float foamLine = smoothstep(0.80, 0.97, abs(across) + (n2 - 0.5) * 0.18);',
          '  col = mix(col, vec3(0.93, 0.98, 1.0), foamLine * 0.9);',
          '  diffuseColor.rgb = col;',
          '}',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => 'greedy-river';
  return material;
};

/**
 * THE FALLS' WATER: streaks of light and white water pouring down, stretched
 * along the drop, a little foam where each sheet leaves its lip - noise again,
 * so no band repeats.
 */
const fallsMaterial = (): MeshLambertMaterial => {
  const material = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false, emissive: 0x1a4a66 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRiverTime = riverUniforms.uRiverTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFallPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFallPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vFallPos;',
          'uniform float uRiverTime;',
          'float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
          'float fNoise(vec2 p) {',
          '  vec2 i = floor(p); vec2 f = fract(p);',
          '  vec2 u = f * f * (3.0 - 2.0 * f);',
          '  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), u.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), u.x), u.y);',
          '}',
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '{',
          '  float a = vFallPos.z + vFallPos.x * 0.0;',
          '  float y = vFallPos.y + uRiverTime * 9.0;',
          '  float n1 = fNoise(vec2(a * 1.3, y * 0.18));',
          '  float n2 = fNoise(vec2(a * 2.6 + 5.0, y * 0.42));',
          '  float streak = smoothstep(0.55, 0.85, n1 * 0.65 + n2 * 0.35);',
          '  vec3 col = mix(vec3(0.36, 0.74, 0.98), vec3(0.62, 0.88, 1.0), n2);',
          '  col = mix(col, vec3(0.95, 0.99, 1.0), streak * 0.75);',
          '  diffuseColor.rgb = col;',
          '}',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => 'greedy-falls';
  return material;
};

/** The soil's tile: a diamond of dark grooves on warm brown (tiles into the reference's lattice). */
const soilTexture = (): Texture => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8e4c24';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(size / 2, 6);
  ctx.lineTo(size - 6, size / 2);
  ctx.lineTo(size / 2, size - 6);
  ctx.lineTo(6, size / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5a2c12';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size / 2, 0);
  ctx.lineTo(size, size / 2);
  ctx.lineTo(size / 2, size);
  ctx.closePath();
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/** Plants on the ledges a terrain wall reported, by tier: low growth in front, trees on the high shelves. */
const plantLedges = (b: PartBuilder, r: Rand, ledges: readonly Ledge[], density = 1): void => {
  for (const ledge of ledges) {
    const across = ledge.run === 'z' ? ledge.w : ledge.d;
    if (across < 1.2) continue;
    const step = [6, 9, 11][Math.min(2, ledge.tier)]! / density;
    const length = ledge.s1 - ledge.s0;
    const count = Math.max(1, Math.floor(length / step));
    for (let i = 0; i < count; i += 1) {
      if (r() < 0.3) continue;
      const along = ledge.s0 + ((i + 0.3 + r() * 0.4) / count) * length;
      const off = (r() - 0.5) * Math.max(0, across - 1.8) * 0.5;
      const x = ledge.run === 'z' ? ledge.x + off : along;
      const z = ledge.run === 'z' ? along : ledge.z + off;
      const y = ledge.y;
      const roll = r();
      if (ledge.tier === 0) {
        if (roll < 0.45) bush(b, r, x, y, z, 0.8 + r() * 0.3, 2);
        else if (roll < 0.75) tallGrass(b, r, x, y, z, 1);
        else flowers(b, r, x, y, z, 1);
      } else if (ledge.tier === 1) {
        if (roll < 0.4) broadleaf(b, r, x, y, z, 0.9 + r() * 0.3);
        else if (roll < 0.65) bush(b, r, x, y, z, 1.1, 3);
        else if (roll < 0.82) palm(b, r, x, y, z, 0.9);
        else boulders(b, r, x, y, z, 0.8, shade(ROCK, 0.9));
      } else if (roll < 0.6) broadleaf(b, r, x, y, z, 1.2 + r() * 0.5);
      else if (roll < 0.85) palm(b, r, x, y, z, 1.1);
      else bush(b, r, x, y, z, 1.4, 2);
    }
  }
};

/**
 * THE STATIC WORLD: the orange studded baseplate and the canal cut into it,
 * the beige boundary walls with the stadium behind the Greedy Tree, the
 * waterfall cliff the canal springs from and the tunnel it drains into, the
 * seven soil beds, the market (`MarketScene`), the glowing Greedy Tree, the
 * guaranteed-spawn board, the leaderboards, the fenced garden along the bank -
 * and round it all a valley of terraced sandstone cliffs, turf and block
 * forest in the +1 Monkey Evolution style. Everything stands on the ground or
 * on the ledge it was planted on: nothing floats.
 */
export class FarmWorld {
  readonly root = new Group();
  /** The stalls, their keepers and the Lucky Wheel (`MarketScene`). */
  readonly market = new MarketScene();
  /** The Greedy Tree's neon rings. */
  private readonly rings: Group[] = [];
  private readonly falls: BufferGeometry[] = [];
  /** Board textures redrawn by the caller. */
  readonly guaranteeCanvas: HTMLCanvasElement;
  private readonly guaranteeTexture: CanvasTexture;
  readonly boardCanvases: HTMLCanvasElement[] = [];
  private readonly boardTextures: CanvasTexture[] = [];

  constructor() {
    this.buildTerrain();
    this.buildRiver();
    this.buildWalls();
    this.buildStadium();
    this.buildSource();
    this.buildDrain();
    this.buildPlotsGround();
    this.root.add(this.market.root);
    this.buildGreedyTree();
    this.buildOrchard();
    this.buildScenery();
    this.buildValley();
    this.buildFalls();
    const g = this.buildCanvasBoard(14, 4.2, 512, GUARANTEE_SIGN.x, 4.6, GUARANTEE_SIGN.z, Math.PI);
    this.guaranteeCanvas = g.canvas;
    this.guaranteeTexture = g.texture;
    this.buildBoards();
  }

  // --------------------------------------------------------------- ground

  private paint(x: number, z: number): Cell {
    const inside = x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;
    const h = tileHash(x, z, 3);
    if (!inside) return { color: GRASS[Math.floor(h * GRASS.length)]! };
    if (x >= RIVER.minX && x <= RIVER.maxX) {
      const d = Math.abs(z - RIVER.z);
      if (d < RIVER.half) return { color: 0x2f93e0, liquid: 'water', liquidColor: 0x2f93e0 };
      if (d < RIVER.half + 2.2) return { color: EDGE };
    }
    for (const p of PLOTS) {
      const lx = x - p.x;
      const lz = z - p.z;
      if (!insideLawn(lx, lz)) continue;
      if (Math.abs(lz - PLOT.gardenZ) < 3.6 && Math.abs(lx) < PLOT.lawnHalfX - 0.6) return { color: GRASS[Math.floor(h * 4)]! };
      return { color: LOT[Math.floor(h * 2)]! };
    }
    if (z > RIVER.half + 2.2) {
      // The market: a lighter walk from the bank to the stalls and along their fronts.
      const walk = Math.abs(x) < 6 || (z > 44 && z < 52 && x > -112 && x < 110) || (Math.abs(z - 30) < 3.5 && x > -64 && x < 48);
      if (walk) return { color: shade(YELLOW[Math.floor(h * 4)]!, 1.07) };
      return { color: YELLOW[Math.floor(h * 4)]! };
    }
    // The south bank: a path along the river in front of the plots, and a spur up to each.
    const front = PLOTS[0]!.z + PLOT.lawnFront;
    const path = (z > front + 1 && z < front + 6) || PLOTS.some((p) => Math.abs(x - p.x) < 3 && z > front && z < RIVER.z - RIVER.half - 2.2);
    if (path) return { color: shade(ORANGE[Math.floor(h * 4)]!, 1.1) };
    return { color: ORANGE[Math.floor(h * 4)]! };
  }

  private buildTerrain(): void {
    const b = new PartBuilder();
    const minX = BOUNDS.minX - OUTER;
    const maxX = BOUNDS.maxX + OUTER;
    const minZ = BOUNDS.minZ - OUTER;
    const maxZ = BOUNDS.maxZ + OUTER;
    for (let x0 = minX; x0 < maxX; x0 += CHUNK) {
      for (let z0 = minZ; z0 < maxZ; z0 += CHUNK) {
        const parts = paintTerrain({ minX: x0, maxX: Math.min(maxX, x0 + CHUNK), minZ: z0, maxZ: Math.min(maxZ, z0 + CHUNK), y: 0, paint: (x, z) => this.paint(x, z), bank: 0x7a3a12 });
        if (parts.ground.getAttribute('position')?.count) b.addPainted(parts.ground, 'stud');
        parts.water?.dispose();
      }
    }
    const ground = b.build('terrain', false);
    ground.traverse((child) => {
      if ((child as Mesh).isMesh) (child as Mesh).receiveShadow = true;
    });
    this.root.add(ground);
  }

  /** The canal's surface: one long strip under the flowing-water shader, reeds and pebbles on its banks. */
  private buildRiver(): void {
    const length = RIVER.maxX - RIVER.minX;
    const geometry = new PlaneGeometry(length, RIVER.half * 2, Math.ceil(length / 6), 4);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new Mesh(geometry, riverMaterial());
    mesh.position.set((RIVER.minX + RIVER.maxX) / 2, -0.32, RIVER.z);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    const b = new PartBuilder();
    const r = seededRandom(0x2eed);
    for (let x = RIVER.minX + 14; x < RIVER.maxX - 10; x += 9 + r() * 10) {
      const side = r() < 0.5 ? -1 : 1;
      const z = RIVER.z + side * (RIVER.half + 1.2 + r() * 0.6);
      if (STALLS.some((s) => s.z < 32 && Math.abs(x - s.x) < s.hx + 4)) continue;
      if (r() < 0.6) reeds(b, r, x, 0, z, 0.8);
      else pebbles(b, r, x, 0, z, 0.8);
    }
    this.root.add(b.build('river-banks'));
  }

  // ---------------------------------------------------------------- walls

  /** The beige, studded boundary walls (the reference's stadium walls), with pillars. */
  private buildWalls(): void {
    const b = new PartBuilder();
    const h = 10;
    const t = 3;
    const { minX, maxX, minZ, maxZ } = BOUNDS;
    const run = (x0: number, z0: number, x1: number, z1: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const along = x1 !== x0;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      brick(b, along ? len : t, h, along ? t : len, WALL, { x: cx, y: h / 2, z: cz });
      brick(b, along ? len + 1 : t + 1, 0.8, along ? t + 1 : len + 1, shade(WALL, 0.88), { x: cx, y: h + 0.4, z: cz });
      const n = Math.floor(len / 4);
      for (let i = 0; i < n; i += 2) {
        const k = -len / 2 + (i + 0.5) * 4;
        brick(b, along ? 2 : t, 1.4, along ? t : 2, WALL, { x: along ? cx + k : cx, y: h + 1.5, z: along ? cz : cz + k });
      }
      for (let i = 0; i <= Math.floor(len / 24); i += 1) {
        const k = -len / 2 + i * 24;
        brick(b, along ? 3 : t + 1.4, h + 2.4, along ? t + 1.4 : 3, shade(WALL, 0.93), { x: along ? cx + k : cx, y: (h + 2.4) / 2, z: along ? cz : cz + k });
      }
    };
    run(minX - 1.5, maxZ + 1.5, maxX + 1.5, maxZ + 1.5);
    run(minX - 1.5, minZ - 1.5, maxX + 1.5, minZ - 1.5);
    run(minX - 1.5, minZ - 1.5, minX - 1.5, -30);
    run(minX - 1.5, 30, minX - 1.5, maxZ + 1.5);
    run(maxX + 1.5, minZ - 1.5, maxX + 1.5, -22);
    run(maxX + 1.5, 22, maxX + 1.5, maxZ + 1.5);
    this.root.add(b.build('walls'));
  }

  /** The stadium behind the Greedy Tree, past the north wall: tiers of seating rising away, banners on its rim. */
  private buildStadium(): void {
    const b = new PartBuilder();
    const z0 = BOUNDS.maxZ + 3;
    const half = 64;
    const SEAT = [0xe8d8ae, 0xdccb9e] as const;
    for (let i = 0; i < 6; i += 1) {
      const y = 4 + i * 3.4;
      brick(b, half * 2 - i * 6, y, 5, SEAT[i % 2]!, { x: GREEDY_TREE.x, y: y / 2, z: z0 + 2.5 + i * 5 });
    }
    brick(b, half * 2, 30, 3, shade(WALL, 0.95), { x: GREEDY_TREE.x, y: 15, z: z0 + 33 });
    brick(b, half * 2 + 2, 1.2, 4, shade(WALL, 0.85), { x: GREEDY_TREE.x, y: 30.6, z: z0 + 33 });
    const flags = [0xe02b2b, 0xffd23a, 0x3fae3a, 0x2f8ae0, 0xb06aff];
    for (let i = 0; i < 9; i += 1) {
      const x = GREEDY_TREE.x - half + 8 + i * ((half * 2 - 16) / 8);
      brick(b, 0.5, 8, 0.5, 0x5a5a62, { x, y: 35, z: z0 + 33 });
      block(b, 3, 2, 0.2, flags[i % flags.length]!, { x: x + 1.6, y: 37.6, z: z0 + 33 }, 'smooth');
    }
    for (const s of [-1, 1]) brick(b, 8, 34, 34, shade(WALL, 0.9), { x: GREEDY_TREE.x + s * (half + 4), y: 17, z: z0 + 17 });
    this.root.add(b.build('stadium'));
  }

  // ---------------------------------------------------------------- source

  /**
   * THE SOURCE: a sandstone cliff stepping up westward across the canal's head,
   * turf on every tier, the canal pouring off it in three falls - step to
   * step, a pool on each - into the canal; terraced cliff either side closes
   * the gap in the west wall, and the giant autumn tree stands on the top step.
   */
  private buildSource(): void {
    const b = new PartBuilder();
    const r = seededRandom(0x50c);
    const face = RIVER.minX;
    const wall = tiers([5, 7], [12, 15], [20, 25]);
    const ledges: Ledge[] = [
      ...terrainWall(b, r, { run: 'z', face, out: -1, from: -30, to: -RIVER.half - 2.4, tiers: wall, cap: TURF, vines: 0.4, segment: [6, 10] }),
      ...terrainWall(b, r, { run: 'z', face, out: -1, from: RIVER.half + 2.4, to: 30, tiers: wall, cap: TURF, vines: 0.4, segment: [6, 10] }),
    ];
    plantLedges(b, r, ledges);
    const width = RIVER.half * 2 + 4.8;
    const steps = [
      { x0: face, x1: face - 7, top: 6 },
      { x0: face - 7, x1: face - 15, top: 12 },
      { x0: face - 15, x1: face - 36, top: 18 },
    ];
    for (const [k, s] of steps.entries()) {
      const depth = s.x0 - s.x1;
      for (let m = 0; m < 2; m += 1) {
        const y0 = m === 0 ? -0.3 : s.top / 2;
        const y1 = m === 0 ? s.top / 2 : s.top;
        b.box(depth, y1 - y0, width - m * 0.3, shade(ROCK, m % 2 ? 0.88 : 1.02), 'flat', { x: s.x0 - depth / 2, y: (y0 + y1) / 2, z: 0 });
      }
      for (const side of [-1, 1]) {
        b.box(depth + 0.3, 0.44, 2.6, shade(TURF, 0.96 + k * 0.03), 'flat', { x: s.x0 - depth / 2, y: s.top + 0.22, z: side * (width / 2 - 1.3) });
        boulders(b, r, s.x0 - 1.2, s.top + 0.44, side * (width / 2 - 1.2), 0.7, shade(ROCK, 0.85));
        bush(b, r, s.x1 + 2.4, s.top + 0.44, side * (width / 2 - 1.2), 0.7, 2);
        grassTuft(b, r, (s.x0 + s.x1) / 2, s.top + 0.44, side * (width / 2 - 1.1), 1);
      }
      // The pool's bed, a little below the step's rim.
      b.box(depth - 0.4, 0.3, RIVER.half * 2, 0x2a78c0, 'flat', { x: s.x0 - depth / 2 - 0.2, y: s.top - 0.05, z: 0 });
      for (let i = 0; i < 2; i += 1) rock(b, r, s.x0 - 1.5 - r() * (depth - 3), s.top + 0.44, (r() < 0.5 ? -1 : 1) * (width / 2 - 1.3), 0.6, shade(ROCK, 0.8));
      // The fall from this step's lip to the one below (the canal for the lowest), foam where it lands.
      const low = k === 0 ? -0.3 : steps[k - 1]!.top + 0.15;
      const sheet = waterfallGeometry(s.x0 + 0.2, 0, RIVER.half * 2 - 1, s.top + 0.25, low, 1, 0, FALL);
      if (sheet) this.falls.push(sheet);
      foam(b, r, s.x0 + 0.6, low, 0, RIVER.half * 2 - 1, 1, 0);
    }
    const pools = new PartBuilder();
    for (const s of steps) pools.box(s.x0 - s.x1 - 0.6, 0.1, RIVER.half * 2 - 0.2, 0x4ab8f0, 'flat', { x: (s.x0 + s.x1) / 2, y: s.top + 0.2, z: 0 });
    const poolGroup = pools.build('source-pools', false);
    poolGroup.traverse((child) => {
      if ((child as Mesh).isMesh) (child as Mesh).material = waterSurface();
    });
    this.root.add(poolGroup);
    // Behind the top step: a high cliff the water springs from, turf over it, vines down its face.
    const top = steps[2]!;
    b.box(10, 30, width + 10, shade(ROCK, 1.08), 'flat', { x: top.x1 - 5, y: 14.7, z: 0 });
    b.box(10.4, 0.44, width + 10.4, TURF, 'flat', { x: top.x1 - 5, y: 29.9, z: 0 });
    for (const z of [-6, 0, 6]) hangingVine(b, r, top.x1 + 0.2, 30, z + (r() - 0.5) * 2, 6 + r() * 6);
    this.root.add(b.build('source'));

    // The giant autumn tree, rooted on the top step beside the water.
    const t = new PartBuilder();
    const tx = top.x1 + 6;
    const ty = top.top + 0.44;
    const tz = -RIVER.half - 3;
    for (let i = 0; i < 4; i += 1) brick(t, 2.4, 3, 2.4, 0x5a3016, { x: tx + Math.cos(i * 1.6) * 3, y: ty + 1.2, z: tz + Math.sin(i * 1.6) * 3, ry: i * 1.6 });
    brick(t, 5, 28, 5, 0x6a3a1a, { x: tx, y: ty + 14, z: tz });
    for (const [dx, dz, ry] of [
      [6, 4, 0.7],
      [-5, 5, 2.3],
      [2, -6, 4.1],
    ] as const) {
      t.box(1.6, 12, 1.6, 0x6a3a1a, 'flat', { x: tx + dx * 0.5, y: ty + 27, z: tz + dz * 0.5, ry, rx: 0.6 });
    }
    for (const [dx, dz, s] of [
      [0, 0, 24],
      [10, 8, 16],
      [-8, 10, 15],
      [6, -10, 16],
      [-10, -6, 14],
    ] as const) {
      t.box(s, s * 0.6, s, 0xc8281e, 'flat', { x: tx + dx, y: ty + 32 + (s - 14) * 0.2, z: tz + dz, ry: s * 0.2 });
      t.box(s * 0.7, s * 0.45, s * 0.7, 0xe0402a, 'flat', { x: tx + dx, y: ty + 32 + s * 0.45, z: tz + dz, ry: s * 0.31 });
    }
    for (let i = 0; i < 14; i += 1) {
      const a = r() * Math.PI * 2;
      const d = 4 + r() * 6;
      const lx = Math.max(top.x1 + 1, Math.min(top.x0 - 1, tx + Math.cos(a) * d));
      block(t, 0.8, 0.12, 0.8, [0xc8281e, 0xe0402a, 0xff8a2a][i % 3]!, { x: lx, y: ty + 0.06, z: tz + Math.sin(a) * d * 0.4, ry: r() }, 'flat');
    }
    this.root.add(t.build('source-tree'));
  }

  /** The tunnel the canal drains into: a stone arch in a terraced cliff, a grate across its mouth. */
  private buildDrain(): void {
    const b = new PartBuilder();
    const r = seededRandom(0xd2a1);
    const face = RIVER.maxX;
    const wall = tiers([5, 7], [12, 15], [19, 24]);
    const ledges: Ledge[] = [
      ...terrainWall(b, r, { run: 'z', face, out: 1, from: -30, to: -RIVER.half - 3, tiers: wall, cap: TURF, vines: 0.4, segment: [6, 10] }),
      ...terrainWall(b, r, { run: 'z', face, out: 1, from: RIVER.half + 3, to: 30, tiers: wall, cap: TURF, vines: 0.4, segment: [6, 10] }),
    ];
    plantLedges(b, r, ledges);
    const STONE = 0x9a8e80;
    for (const side of [-1, 1]) brick(b, 4, 12, 3, STONE, { x: face + 2, y: 6, z: side * (RIVER.half + 1.5) });
    brick(b, 4.4, 3, RIVER.half * 2 + 6, shade(STONE, 0.92), { x: face + 2, y: 13.5, z: 0 });
    for (let i = 0; i < 5; i += 1) brick(b, 4.6, 0.8, 2, shade(STONE, 1.06), { x: face + 2, y: 15.4, z: -RIVER.half - 1 + i * ((RIVER.half * 2 + 2) / 4) });
    brick(b, 14, 16, RIVER.half * 2 + 6, shade(ROCK, 1.02), { x: face + 11, y: 8, z: 0 });
    b.box(14.4, 0.44, RIVER.half * 2 + 6.4, TURF, 'flat', { x: face + 11, y: 16.22, z: 0 });
    block(b, 1, 11.4, RIVER.half * 2, 0x10141a, { x: face + 3.6, y: 5.4, z: 0 }, 'smooth');
    for (let i = 0; i < 8; i += 1) block(b, 0.45, 11.4, 0.45, 0x4a4a52, { x: face + 0.6, y: 5.4, z: -RIVER.half + 0.9 + i * 1.75 }, 'smooth');
    block(b, 0.5, 0.5, RIVER.half * 2, 0x4a4a52, { x: face + 0.6, y: 10.8, z: 0 }, 'smooth');
    bush(b, r, face + 9, 16.44, -4, 1.2, 2);
    broadleaf(b, r, face + 12, 16.44, 5, 1.1);
    this.root.add(b.build('drain'));
  }

  // ---------------------------------------------------------------- plots

  /** The seven soil beds: raised brown soil with the reference's diamond lattice and a darker studded border. */
  private buildPlotsGround(): void {
    const b = new PartBuilder();
    const r = seededRandom(0x9107);
    const half = PLOT.soilHalf;
    const top = PLOT.soilTop;
    const BORDER = 0x5a2a12;
    const material = new MeshLambertMaterial({ map: soilTexture() });
    for (const p of PLOTS) {
      b.box(half * 2, top, half * 2, 0x8a4a22, 'flat', { x: p.x, y: top / 2, z: p.z });
      const face = new PlaneGeometry(half * 2, half * 2);
      face.rotateX(-Math.PI / 2);
      const uv = face.getAttribute('uv') as BufferAttribute;
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * half, uv.getY(i) * half);
      const mesh = new Mesh(face, material);
      mesh.position.set(p.x, top + 0.01, p.z);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      for (const side of [-1, 1]) {
        brick(b, half * 2 + 1.6, top + 0.5, 0.8, BORDER, { x: p.x, y: (top + 0.5) / 2, z: p.z + side * (half + 0.4) });
        brick(b, 0.8, top + 0.5, half * 2, BORDER, { x: p.x + side * (half + 0.4), y: (top + 0.5) / 2, z: p.z });
      }
      // The garden row's kerbs at either end.
      const gz = p.z + PLOT.gardenZ;
      for (const side of [-1, 1]) brick(b, 0.5, 0.5, 7.2, 0x6a3a1a, { x: p.x + side * (PLOT.lawnHalfX - 0.6), y: 0.25, z: gz });
      // The lawn's back corners: a bush and a lantern each.
      for (const side of [-1, 1]) {
        const x = p.x + side * (PLOT.lawnHalfX - 1.6);
        const z = p.z + PLOT.lawnBack + 1.6;
        bush(b, r, x, 0, z, 0.8, 2);
        brick(b, 0.5, 3.4, 0.5, 0x3a3a42, { x: x - side * 2.6, y: 1.7, z });
        block(b, 0.9, 0.9, 0.9, 0xfff2b0, { x: x - side * 2.6, y: 3.8, z }, 'glow');
        block(b, 1.2, 0.3, 1.2, 0x3a3a42, { x: x - side * 2.6, y: 4.4, z });
      }
    }
    this.root.add(b.build('soil'));
  }

  // --------------------------------------------------------- greedy tree

  /** The glowing Greedy Tree at the back of the market, ringed with neon. */
  private buildGreedyTree(): void {
    const { x, z } = GREEDY_TREE;
    const b = new PartBuilder();
    const r = seededRandom(0x6eed);
    brick(b, 14, 1.2, 14, 0x3a2a5a, { x, y: 0.6, z });
    brick(b, 12, 2, 12, 0x4a2a6a, { x, y: 1, z });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      b.box(1.6, 1.4, 5, 0x7a2ac0, 'glow', { x: x + Math.cos(a) * 4.5, y: 2.4, z: z + Math.sin(a) * 4.5, ry: -a + Math.PI / 2, rx: 0.3 });
    }
    for (let i = 0; i < 8; i += 1) {
      const w = 8 - i * 0.6;
      b.box(w, 5, w, i % 2 ? 0x8a3ad8 : 0x9a4ae8, 'glow', { x: x + Math.sin(i * 0.8) * 1.2, y: 4 + i * 4.6, z: z + Math.cos(i * 0.8) * 0.8, ry: i * 0.3 });
    }
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      const d = 7 + r() * 5;
      const s = 6 + r() * 4;
      b.box(s, s * 0.8, s, i % 3 ? 0x6ad8f0 : 0xb06aff, 'flat', { x: x + Math.cos(a) * d, y: 38 + r() * 8, z: z + Math.sin(a) * d, ry: r() });
    }
    b.box(14, 10, 14, 0x9ae8ff, 'flat', { x, y: 46, z, ry: 0.5 });
    this.root.add(b.build('greedy-tree'));
    for (let i = 0; i < 3; i += 1) {
      const ring = new Mesh(ringGeometry(10 + i * 3, 0.5, 40), new MeshBasicMaterial({ color: i % 2 ? 0xff7ad9 : 0xc77dff, fog: false, side: DoubleSide }));
      ring.position.set(x, 18 + i * 8, z);
      ring.rotation.x = 0.25 * (i % 2 ? 1 : -1);
      this.root.add(ring);
      this.rings.push(ring as unknown as Group);
    }
  }

  /** The fenced garden along the north bank behind the Sell stand: palms, blossoms and grown fruit trees in rows. */
  private buildOrchard(): void {
    const o = ORCHARD;
    const b = new PartBuilder();
    const r = seededRandom(0x0c4a);
    const fence = (x0: number, z0: number, x1: number, z1: number): void => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.floor(len / 3));
      for (let i = 0; i <= n; i += 1) {
        const t = i / n;
        brick(b, 0.6, 2.4, 0.6, 0x7a4a22, { x: x0 + (x1 - x0) * t, y: 1.2, z: z0 + (z1 - z0) * t });
      }
      for (const y of [0.9, 1.8]) block(b, Math.abs(x1 - x0) + 0.3, 0.3, Math.abs(z1 - z0) + 0.3, 0x8a5a2a, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2 });
    };
    fence(o.minX, o.minZ, o.maxX, o.minZ);
    fence(o.minX, o.maxZ, o.maxX, o.maxZ);
    fence(o.maxX, o.minZ, o.maxX, o.maxZ);
    fence(o.minX, o.minZ + 12, o.minX, o.maxZ);
    for (let i = 0; i < 40; i += 1) {
      const x = o.minX + 3 + r() * (o.maxX - o.minX - 6);
      const z = o.minZ + 3 + r() * (o.maxZ - o.minZ - 6);
      if (r() < 0.5) flowers(b, r, x, 0, z, 0.9);
      else grassTuft(b, r, x, 0, z, 1);
    }
    for (let x = o.minX + 10; x < o.maxX - 4; x += 22) palm(b, r, x + 5, 0, (o.minZ + o.maxZ) / 2 + (r() - 0.5) * 4, 1.1);
    this.root.add(b.build('orchard'));
    const kinds = [9, 11, 12, 3, 6, 10, 4, 14];
    let i = 0;
    for (let x = o.minX + 8; x < o.maxX - 4; x += 11) {
      for (const z of [o.minZ + 7, o.maxZ - 7]) {
        const seed = kinds[i % kinds.length]!;
        const tree = buildTree(seed, 5 + (i % 4) * 2.5, false, 0);
        tree.position.set(x + ((i * 7) % 3) - 1, 0, z);
        tree.rotation.y = i * 1.3;
        this.root.add(tree);
        i += 1;
      }
    }
  }

  /** Grounded props: hay, pumpkins, crates and flower beds round the plots, the bank and along the walls. */
  private buildScenery(): void {
    const b = new PartBuilder();
    const r = seededRandom(0x5ce7);
    const { minX, maxX, minZ, maxZ } = BOUNDS;
    const hay = (x: number, z: number, ry: number): void => {
      brick(b, 2.4, 1.6, 1.6, 0xe8c25a, { x, y: 0.8, z, ry });
      block(b, 2.5, 0.2, 1.7, 0xc89a3a, { x, y: 0.6, z, ry }, 'flat');
      block(b, 2.5, 0.2, 1.7, 0xc89a3a, { x, y: 1.1, z, ry }, 'flat');
    };
    const crate = (x: number, z: number, s: number, ry: number): void => {
      brick(b, s, s, s, 0x9a6a3a, { x, y: s / 2, z, ry });
      block(b, s + 0.08, 0.16, s + 0.08, 0x6a3a1a, { x, y: s - 0.08, z, ry }, 'flat');
    };
    const pumpkin = (x: number, z: number, s: number): void => {
      ball(b, 0.9 * s, 0xff8a1a, { x, y: 0.72 * s, z, sy: 0.8 }, 'smooth', 1);
      brick(b, 0.2 * s, 0.5 * s, 0.2 * s, 0x5a8a2a, { x, y: 1.5 * s, z });
    };
    for (let i = 0; i + 1 < PLOTS.length; i += 1) {
      const x = (PLOTS[i]!.x + PLOTS[i + 1]!.x) / 2;
      const z = PLOTS[i]!.z;
      hay(x, z - 10, 0.2 + r());
      hay(x + 0.3, z - 8.2, 0.4 + r());
      pumpkin(x - 0.6, z + 4, 1.1);
      pumpkin(x + 0.8, z + 6, 0.8);
      tallGrass(b, r, x, 0, z - 20, 1);
      flowers(b, r, x, 0, z + 12, 1);
    }
    for (const s of STALLS.filter((st) => st.id === 'sell' || st.id === 'fall')) {
      crate(s.x - s.hx - 2.4, s.z + 1, 1.6, 0.3);
      crate(s.x - s.hx - 2.6, s.z + 2.9, 1.2, 0.8);
      pumpkin(s.x + s.hx + 2.4, s.z + 2, 1);
    }
    const along = (x: number, z: number): void => {
      const roll = r();
      if (roll < 0.4) bush(b, r, x, 0, z, 1 + r() * 0.4, 2);
      else if (roll < 0.7) flowers(b, r, x, 0, z, 1.1);
      else if (roll < 0.85) tallGrass(b, r, x, 0, z, 1.2);
      else rock(b, r, x, 0, z, 0.9, 0xb8a890);
    };
    for (let x = minX + 6; x < maxX - 6; x += 7 + r() * 5) {
      if (Math.abs(x - GREEDY_TREE.x) > 12) along(x, maxZ - 3 - r() * 2);
      along(x, minZ + 3 + r() * 2);
    }
    for (let z = minZ + 6; z < maxZ - 6; z += 7 + r() * 5) {
      if (Math.abs(z) > 40) along(minX + 3 + r() * 2, z);
      if (Math.abs(z) > 30 && !(z > ORCHARD.minZ - 4 && z < ORCHARD.maxZ + 4)) along(maxX - 3 - r() * 2, z);
    }
    this.root.add(b.build('scenery'));
  }

  /**
   * THE VALLEY beyond the walls: terraced sandstone cliffs, turf-capped, vines
   * down their faces, bushes on the low bank, trees and palms on the high
   * shelves - every plant on the ledge `terrainWall` reported - and a forest of
   * giants on the valley floor behind them.
   */
  private buildValley(): void {
    const b = new PartBuilder();
    const r = seededRandom(0x4111);
    const { minX, maxX, minZ, maxZ } = BOUNDS;
    const gap = 5;
    const wall = tiers([5, 8], [12, 16], [20, 27]);
    const spec = { tiers: wall, cap: TURF, vines: 0.35, segment: [9, 16] as const };
    const north = maxZ + 40;
    const ledges: Ledge[] = [
      ...terrainWall(b, r, { ...spec, run: 'x', face: north, out: 1, from: minX - 30, to: maxX + 30 }),
      ...terrainWall(b, r, { ...spec, run: 'x', face: minZ - gap, out: -1, from: minX - 30, to: maxX + 30 }),
      ...terrainWall(b, r, { ...spec, run: 'z', face: minX - gap, out: -1, from: minZ - 30, to: -36 }),
      ...terrainWall(b, r, { ...spec, run: 'z', face: minX - gap, out: -1, from: 36, to: north }),
      ...terrainWall(b, r, { ...spec, run: 'z', face: maxX + gap, out: 1, from: minZ - 30, to: -30 }),
      ...terrainWall(b, r, { ...spec, run: 'z', face: maxX + gap, out: 1, from: 30, to: north }),
    ];
    plantLedges(b, r, ledges, 0.8);
    // Between the north wall and the cliffs: lawn and trees either side of the stadium.
    for (let x = minX - 20; x < maxX + 20; x += 18 + r() * 10) {
      if (Math.abs(x - GREEDY_TREE.x) < 78) continue;
      broadleaf(b, r, x, 0, maxZ + 12 + r() * 20, 1.3 + r() * 0.5);
    }
    // Giants on the valley floor beyond the cliffs.
    const back = gap + 3.4 + 5 + 10 + 4;
    for (let i = 0; i < 26; i += 1) {
      const side = i % 4;
      const t = r();
      const x = side < 2 ? minX - 20 + t * (maxX - minX + 40) : side === 2 ? minX - back - r() * 30 : maxX + back + r() * 30;
      const z = side === 0 ? north + back + r() * 30 : side === 1 ? minZ - back - r() * 30 : minZ - 20 + t * (north - minZ + 20);
      jungleGiant(b, r, x, 0, z, 0.9 + r() * 0.4);
    }
    this.root.add(b.build('valley'));
  }

  /** Every waterfall sheet, merged under the pouring material. */
  private buildFalls(): void {
    if (!this.falls.length) return;
    const merged = mergeGeometries(this.falls, false);
    for (const g of this.falls) g.dispose();
    this.falls.length = 0;
    if (!merged) return;
    const mesh = new Mesh(merged, fallsMaterial());
    mesh.renderOrder = 2;
    this.root.add(mesh);
  }

  // --------------------------------------------------------------- boards

  /** A free-standing wooden board with a canvas face the caller draws on; its legs stand behind the face. */
  private buildCanvasBoard(width: number, height: number, pixels: number, x: number, y: number, z: number, yaw: number): { canvas: HTMLCanvasElement; texture: CanvasTexture } {
    const group = new Group();
    const b = new PartBuilder();
    brick(b, width + 1, height + 1, 0.6, 0x7a4a22, { y });
    for (const dx of [-width / 2 + 1, width / 2 - 1]) {
      brick(b, 0.8, y + height / 2, 0.8, 0x6a3a1a, { x: dx, y: (y + height / 2) / 2, z: 0.7 });
      brick(b, 1.4, 0.4, 1.4, 0x5a3016, { x: dx, y: 0.2, z: 0.7 });
    }
    group.add(b.build('board'));
    const canvas = document.createElement('canvas');
    canvas.width = pixels;
    canvas.height = Math.round((pixels * height) / width);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const face = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: texture, transparent: true }));
    face.position.set(0, y, -0.32);
    face.rotation.y = Math.PI;
    group.add(face);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    this.root.add(group);
    return { canvas, texture };
  }

  private buildBoards(): void {
    for (let i = 0; i < 4; i += 1) {
      const { canvas, texture } = this.buildCanvasBoard(10, 13, 400, BOARDS.x - 16 + i * 11, 8, BOARDS.z, Math.PI);
      this.boardCanvases.push(canvas);
      this.boardTextures.push(texture);
    }
  }

  /** The caller redrew a board canvas. */
  boardsChanged(): void {
    for (const texture of this.boardTextures) texture.needsUpdate = true;
  }

  guaranteeChanged(): void {
    this.guaranteeTexture.needsUpdate = true;
  }

  // -------------------------------------------------------------- the clock

  get stalls(): readonly StallView[] {
    return this.market.stalls;
  }

  /** Spin the Lucky Wheel to land on a slice (the server already chose it). */
  spinWheel(slice: number): void {
    this.market.spinWheel(slice);
  }

  get wheelSpinning(): boolean {
    return this.market.wheelSpinning;
  }

  update(delta: number, time: number): void {
    riverUniforms.uRiverTime.value = time % 1000;
    for (let i = 0; i < this.rings.length; i += 1) {
      const ring = this.rings[i]!;
      ring.rotation.y = time * (0.4 + i * 0.15) * (i % 2 ? -1 : 1);
      ring.position.y = 18 + i * 8 + Math.sin(time * 1.2 + i) * 0.8;
    }
    this.market.update(delta, time);
  }
}
