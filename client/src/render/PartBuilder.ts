import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { studPlastic } from './Studs.js';

/**
 * BATCHED PRIMITIVES.
 *
 * Everything drawn in code - every prop, building, pet and accessory - is a
 * pile of boxes, cylinders and cones. Drawn one mesh each, a village is
 * thousands of draw calls; merged, it is a handful. This builder collects
 * parts with a colour and a KIND and merges them into at most three meshes:
 *
 *   - 'stud'   : Roblox studded plastic (the studs drawn by the shader from
 *                world position), tinted per part by VERTEX COLOUR, so a
 *                hundred colours of studded plastic are still one material;
 *   - 'smooth' : smooth plastic, no studs (fruit, tools, trim);
 *   - 'flat'   : studded and hard-edged (flat shading) - rock, bark, canopy;
 *   - 'leaf'   : two-sided, for blades and leaves;
 *   - 'glow'   : unlit, vertex-coloured - flames, lamps, eyes.
 *
 * The three materials are shared process-wide, so two builders' meshes differ
 * only in geometry.
 */
export type PartKind = 'stud' | 'smooth' | 'glow' | 'flat' | 'leaf';

const KINDS: readonly PartKind[] = ['stud', 'smooth', 'glow', 'flat', 'leaf'];

let shared: Record<PartKind, Material> | null = null;

export const partMaterials = (): Record<PartKind, Material> => {
  if (!shared) {
    shared = {
      // Studded Roblox plastic: the studs are drawn by the shader from world position.
      stud: studPlastic({ vertexColors: true, flatShading: true }),
      smooth: new MeshLambertMaterial({ vertexColors: true }),
      glow: new MeshBasicMaterial({ vertexColors: true, fog: false }),
      // Faceted blocks: rock, bark, bone, canopy - hard edges catch the sun.
      flat: studPlastic({ vertexColors: true, flatShading: true }),
      // Two-sided: grass blades and leaves, seen from under as well as over.
      leaf: studPlastic({ vertexColors: true, side: DoubleSide, flatShading: true }, 0.5),
    };
  }
  return shared;
};

const MATRIX = new Matrix4();
const QUAT = new Quaternion();
const EULER = new Euler();
const SCALE = new Vector3(1, 1, 1);
const POSITION = new Vector3();
const COLOR = new Color();
const HSL = { h: 0, s: 0, l: 0 };

export interface Transform {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export class PartBuilder {
  private readonly parts: Record<PartKind, BufferGeometry[]> = { stud: [], smooth: [], glow: [], flat: [], leaf: [] };

  get isEmpty(): boolean {
    return KINDS.every((kind) => this.parts[kind].length === 0);
  }

  /**
   * Add a geometry, transformed and coloured. The geometry is consumed (it
   * is transformed in place and merged), so pass a fresh one.
   */
  add(geometry: BufferGeometry, color: number | string, kind: PartKind = 'smooth', transform: Transform = {}): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    EULER.set(transform.rx ?? 0, transform.ry ?? 0, transform.rz ?? 0, 'YXZ');
    QUAT.setFromEuler(EULER);
    POSITION.set(transform.x ?? 0, transform.y ?? 0, transform.z ?? 0);
    SCALE.set(transform.sx ?? 1, transform.sy ?? 1, transform.sz ?? 1);
    MATRIX.compose(POSITION, QUAT, SCALE);
    g.applyMatrix4(MATRIX);

    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    COLOR.set(color);
    // Everything built here is Roblox plastic: colours a touch cleaner and more saturated.
    COLOR.getHSL(HSL);
    COLOR.setHSL(HSL.h, Math.min(1, HSL.s * 1.15), Math.min(0.95, HSL.l * 1.03));
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = COLOR.r;
      colors[i * 3 + 1] = COLOR.g;
      colors[i * 3 + 2] = COLOR.b;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    this.parts[kind].push(g);
    return this;
  }

  /**
   * Add a geometry that is already coloured per vertex (painted terrain):
   * its own colours are kept, given the same plastic lift as every part.
   */
  addPainted(geometry: BufferGeometry, kind: PartKind = 'stud'): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const color = g.getAttribute('color') as BufferAttribute | undefined;
    if (!color || g.getAttribute('position').count === 0) {
      g.dispose();
      return this;
    }
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
    }
    if (!g.getAttribute('uv')) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    for (let i = 0; i < color.count; i += 1) {
      COLOR.setRGB(color.getX(i), color.getY(i), color.getZ(i));
      COLOR.getHSL(HSL);
      COLOR.setHSL(HSL.h, Math.min(1, HSL.s * 1.15), Math.min(0.95, HSL.l * 1.03));
      color.setXYZ(i, COLOR.r, COLOR.g, COLOR.b);
    }
    this.parts[kind].push(g);
    return this;
  }

  /** A box by size and centre. Studded boxes get world-scaled UVs, so studs are the same size everywhere. */
  box(w: number, h: number, d: number, color: number | string, kind: PartKind = 'stud', transform: Transform = {}): this {
    const geometry = kind === 'stud' ? studBox(w, h, d) : new BoxGeometry(w, h, d);
    return this.add(geometry, color, kind, transform);
  }

  /**
   * Take every part of another builder, moved by a transform (a model built
   * round its own origin, placed and turned): many models, one merge. The
   * other builder is left empty.
   */
  absorb(other: PartBuilder, transform: Transform = {}): this {
    EULER.set(transform.rx ?? 0, transform.ry ?? 0, transform.rz ?? 0, 'YXZ');
    QUAT.setFromEuler(EULER);
    POSITION.set(transform.x ?? 0, transform.y ?? 0, transform.z ?? 0);
    SCALE.set(transform.sx ?? 1, transform.sy ?? 1, transform.sz ?? 1);
    MATRIX.compose(POSITION, QUAT, SCALE);
    for (const kind of KINDS) {
      for (const g of other.parts[kind]) this.parts[kind].push(g.applyMatrix4(MATRIX));
      other.parts[kind] = [];
    }
    return this;
  }

  /** Merge everything added so far into this builder's meshes. */
  build(name = 'parts', castShadow = true): Group {
    const group = new Group();
    group.name = name;
    const materials = partMaterials();
    for (const kind of KINDS) {
      const list = this.parts[kind];
      if (list.length === 0) continue;
      const merged = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      this.parts[kind] = [];
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, materials[kind]);
      mesh.name = `${name}-${kind}`;
      mesh.castShadow = castShadow && kind !== 'glow';
      mesh.receiveShadow = kind !== 'glow';
      group.add(mesh);
    }
    return group;
  }

  /** Merge into ONE geometry per kind without building meshes (for callers that instance or cache). */
  geometries(): Partial<Record<PartKind, BufferGeometry>> {
    const out: Partial<Record<PartKind, BufferGeometry>> = {};
    for (const kind of KINDS) {
      const list = this.parts[kind];
      if (list.length === 0) continue;
      const merged = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      this.parts[kind] = [];
      if (merged) {
        merged.computeBoundingSphere();
        out[kind] = merged;
      }
    }
    return out;
  }
}

/** Meshes for a cached set of geometries, on the shared materials. */
export const meshesFor = (geometries: Partial<Record<PartKind, BufferGeometry>>, name: string, castShadow = true): Group => {
  const group = new Group();
  group.name = name;
  const materials = partMaterials();
  for (const kind of KINDS) {
    const geometry = geometries[kind];
    if (!geometry) continue;
    const mesh = new Mesh(geometry, materials[kind]);
    mesh.castShadow = castShadow && kind !== 'glow';
    mesh.receiveShadow = kind !== 'glow';
    group.add(mesh);
  }
  return group;
};

/** A box whose UVs are world-scaled (one stud plate every 2 units). */
export const studBox = (w: number, h: number, d: number, tile = 2): BoxGeometry => {
  const geometry = new BoxGeometry(w, h, d);
  const uv = geometry.getAttribute('uv');
  const spans: readonly (readonly [number, number])[] = [
    [d / tile, h / tile],
    [d / tile, h / tile],
    [w / tile, d / tile],
    [w / tile, d / tile],
    [w / tile, h / tile],
    [w / tile, h / tile],
  ];
  for (let face = 0; face < 6; face += 1) {
    const span = spans[face]!;
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      uv.setXY(index, uv.getX(index) * span[0], uv.getY(index) * span[1]);
    }
  }
  uv.needsUpdate = true;
  return geometry;
};
