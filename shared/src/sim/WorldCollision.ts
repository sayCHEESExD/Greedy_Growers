import { buildStaticSolids, worldBounds } from '../config/map.js';
import { MOVEMENT } from '../config/movement.js';
import { PLAYER_HEIGHT } from '../constants/world.js';
import type { Aabb } from '../types/math.js';

/** Grid cell for the broad phase, in world units. */
const CELL = 16;
const EPS = 1e-4;

/**
 * THE WORLD AS THE SIMULATION SEES IT: axis-aligned boxes and a floor at
 * y = 0, shared by the server (authority) and the client (prediction), so the
 * two collide against the exact same shapes.
 *
 * Two kinds of solid:
 *
 *   - STATIC: the fences, soil beds, stalls, fountain, trees and hills - the
 *     island itself, built once from `map.ts`;
 *   - DYNAMIC GROUPS, keyed: a garden's house exists only once its owner has
 *     bought one. The server sets a group when the house changes; each client
 *     sets the same group from the replicated garden, so prediction and
 *     authority agree within a patch.
 *
 * The player is a box of half-width `radius` and `PLAYER_HEIGHT` height.
 * Horizontal moves resolve one axis at a time; a face no higher than
 * `MOVEMENT.stepHeight` above the feet is STEPPED ONTO rather than blocking,
 * which is what makes soil beds and hill terraces walkable without ramps.
 */
export class WorldCollision {
  private readonly solids: (Aabb | null)[] = [];
  private readonly grid = new Map<number, number[]>();
  private readonly bounds: Aabb;
  private readonly seen: number[] = [];
  private stamp = 1;
  private readonly marks: number[] = [];
  private readonly groups = new Map<string, number[]>();
  private readonly groupKeys = new Map<string, string>();
  private readonly free: number[] = [];

  constructor() {
    for (const box of buildStaticSolids()) this.add(box);
    this.bounds = worldBounds();
  }

  /** Every static and dynamic solid, for diagnostics and the verification scripts. */
  get boxes(): readonly Aabb[] {
    return this.solids.filter((box): box is Aabb => box !== null);
  }

  /**
   * Replace a dynamic group's boxes. Cheap when unchanged: the boxes are
   * compared by value first, so calling this on every patch costs nothing.
   */
  setGroup(key: string, boxes: readonly Aabb[]): void {
    const signature = boxes.map((b) => `${b.minX},${b.maxX},${b.minY},${b.maxY},${b.minZ},${b.maxZ}`).join('|');
    if (this.groupKeys.get(key) === signature) return;
    this.groupKeys.set(key, signature);
    for (const index of this.groups.get(key) ?? []) this.remove(index);
    const indices: number[] = [];
    for (const box of boxes) indices.push(this.add(box));
    this.groups.set(key, indices);
  }

  private add(box: Aabb): number {
    const index = this.free.pop() ?? this.solids.length;
    this.solids[index] = box;
    this.marks[index] = 0;
    for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx += 1) {
      for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz += 1) {
        const key = cellKey(cx, cz);
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(index);
      }
    }
    return index;
  }

  private remove(index: number): void {
    const box = this.solids[index];
    if (!box) return;
    for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx += 1) {
      for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz += 1) {
        const list = this.grid.get(cellKey(cx, cz));
        if (!list) continue;
        const at = list.indexOf(index);
        if (at >= 0) list.splice(at, 1);
      }
    }
    this.solids[index] = null;
    this.free.push(index);
  }

  /** Candidate solids overlapping an XZ rectangle, each once. Reuses one array. */
  private query(minX: number, maxX: number, minZ: number, maxZ: number): readonly number[] {
    const out = this.seen;
    out.length = 0;
    this.stamp += 1;
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
        const list = this.grid.get(cellKey(cx, cz));
        if (!list) continue;
        for (const index of list) {
          if (this.marks[index] === this.stamp) continue;
          this.marks[index] = this.stamp;
          const b = this.solids[index];
          if (!b) continue;
          if (b.maxX <= minX || b.minX >= maxX || b.maxZ <= minZ || b.minZ >= maxZ) continue;
          out.push(index);
        }
      }
    }
    return out;
  }

  /** True when a player box standing at (x, y, z) overlaps any solid. */
  private blocked(x: number, y: number, z: number, r: number): boolean {
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.maxY > y + EPS && b.minY < y + PLAYER_HEIGHT - EPS) return true;
    }
    return false;
  }

  /** True when a standing player at (x, z) on the ground would overlap a solid: for placement checks. */
  occupied(x: number, z: number, r: number, y = 0): boolean {
    return this.blocked(x, y, z, r);
  }

  /**
   * Move horizontally along one axis, stepping up low faces.
   *
   * Writes the new coordinate on that axis into `out.value`, a raised `y` into
   * `out.y` when a step was taken, and `out.hit` when a wall stopped it.
   */
  moveAxis(axis: 'x' | 'z', x: number, y: number, z: number, delta: number, r: number, out: { value: number; y: number; hit: boolean }): void {
    out.y = y;
    out.hit = false;
    let nx = axis === 'x' ? x + delta : x;
    let nz = axis === 'z' ? z + delta : z;
    let ny = y;

    for (let pass = 0; pass < 3; pass += 1) {
      let collided = false;
      for (const index of this.query(nx - r, nx + r, nz - r, nz + r)) {
        const b = this.solids[index]!;
        if (b.maxY <= ny + EPS || b.minY >= ny + PLAYER_HEIGHT - EPS) continue;
        // A low face: step onto it, if there is headroom up there.
        const rise = b.maxY - ny;
        if (rise <= MOVEMENT.stepHeight && !this.blocked(nx, b.maxY, nz, r)) {
          ny = b.maxY;
          collided = true;
          break;
        }
        // A wall: stop against its face.
        if (axis === 'x') nx = delta > 0 ? b.minX - r - EPS : b.maxX + r + EPS;
        else nz = delta > 0 ? b.minZ - r - EPS : b.maxZ + r + EPS;
        out.hit = true;
        collided = true;
        break;
      }
      if (!collided) break;
    }
    // Never let the step or the push leave the player further than asked.
    if (axis === 'x') {
      if ((delta > 0 && nx < x) || (delta < 0 && nx > x)) nx = x;
    } else if ((delta > 0 && nz < z) || (delta < 0 && nz > z)) nz = z;

    out.value = axis === 'x' ? nx : nz;
    out.y = ny;
  }

  /** The highest floor under the footprint at or below `y + tolerance`: a box top, or the ground. */
  floorBelow(x: number, y: number, z: number, radius: number, tolerance = EPS): number {
    const r = radius * 0.92;
    let floor = 0;
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.maxY <= y + tolerance && b.maxY > floor) floor = b.maxY;
    }
    return floor;
  }

  /** The lowest ceiling above a head at `headY`, or +Infinity. */
  ceilingAbove(x: number, headY: number, z: number, radius: number): number {
    const r = radius * 0.92;
    let ceiling = Number.POSITIVE_INFINITY;
    for (const index of this.query(x - r, x + r, z - r, z + r)) {
      const b = this.solids[index]!;
      if (b.minY >= headY - EPS && b.minY < ceiling) ceiling = b.minY;
    }
    return ceiling;
  }

  /** Keep a position inside the world, whatever displacement produced it. */
  clampToBounds(position: { x: number; z: number }, r: number): void {
    const b = this.bounds;
    if (position.x < b.minX + r) position.x = b.minX + r;
    if (position.x > b.maxX - r) position.x = b.maxX - r;
    if (position.z < b.minZ + r) position.z = b.minZ + r;
    if (position.z > b.maxZ - r) position.z = b.maxZ - r;

  }
}

const cellKey = (cx: number, cz: number): number => (cx + 4096) * 8192 + (cz + 4096);
