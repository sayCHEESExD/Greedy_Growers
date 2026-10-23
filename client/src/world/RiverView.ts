import { RIVER, riverSeedX } from '@greedy/shared';
import { Group, type BufferGeometry } from 'three';
import { buildSeed } from '../models/greedyTrees.js';
import type { NetRiverSeed } from '../net/netTypes.js';
import { PartBuilder, meshesFor, type PartKind } from '../render/PartBuilder.js';

/**
 * THE RIVER'S SEEDS: each a little block bobbing downstream on its lane,
 * placed from its spawn time on the shared clock, so every client sees the
 * same seed in the same place. A mutated seed carries a glowing cap.
 */
export class RiverView {
  readonly root = new Group();
  private readonly seeds = new Map<number, Group>();
  private readonly cache = new Map<number, Partial<Record<PartKind, BufferGeometry>>>();

  private geometryOf(seed: number): Partial<Record<PartKind, BufferGeometry>> {
    let g = this.cache.get(seed);
    if (!g) {
      const b = new PartBuilder();
      buildSeed(b, seed, 1.25);
      g = b.geometries();
      this.cache.set(seed, g);
    }
    return g;
  }

  /** The world position of a river seed now. */
  static positionOf(s: NetRiverSeed, now: number): { x: number; z: number } {
    return { x: riverSeedX(s.spawnAt, now), z: RIVER.z + s.lane };
  }

  update(river: Map<string, NetRiverSeed> | { forEach(cb: (s: NetRiverSeed) => void): void } | null, now: number, time: number): void {
    const seen = new Set<number>();
    river?.forEach((s: NetRiverSeed) => {
      seen.add(s.id);
      let group = this.seeds.get(s.id);
      if (!group) {
        group = meshesFor(this.geometryOf(s.seed), `river-seed-${s.seed}`, false);
        if (s.mut) {
          const cap = new PartBuilder();
          cap.box(0.5, 0.5, 0.5, 0xfff2a0, 'glow', { y: 2 });
          group.add(cap.build('seed-mut', false));
        }
        this.root.add(group);
        this.seeds.set(s.id, group);
      }
      const at = RiverView.positionOf(s, now);
      group.position.set(at.x, -0.25 + Math.sin(time * 2.4 + s.id) * 0.12, at.z);
      group.rotation.y = time * 0.6 + s.id;
      group.visible = at.x <= RIVER.endX;
    });
    for (const [id, group] of this.seeds) {
      if (seen.has(id)) continue;
      group.removeFromParent();
      group.traverse((child) => {
        const mesh = child as unknown as { isMesh?: boolean; geometry?: BufferGeometry; name?: string };
        if (mesh.isMesh && child.parent?.name === 'seed-mut') mesh.geometry?.dispose();
      });
      this.seeds.delete(id);
    }
  }
}
