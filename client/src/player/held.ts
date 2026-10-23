import { gearById } from '@greedy/shared';
import { Group, type Object3D } from 'three';
import { buildFruit, buildSeed, buildTree, treeHeight } from '../models/greedyTrees.js';
import { block, cylinder } from '../models/shapes.js';
import { PartBuilder } from '../render/PartBuilder.js';

/**
 * WHAT IS IN A HAND, as the replicated held fields describe it: 0 nothing,
 * 1 seeds (seed id), 2 a harvested tree (seed id, mutations, size, dead),
 * 3 a fruit, 4 gear (a potion).
 *
 * A harvested tree is carried upright by its trunk, as in the reference -
 * scaled down so a 100x giant still fits through the market, but still
 * clearly bigger than a 2x sapling.
 */
export type HeldModelFactory = (kind: number, id: number, mut: number, mult: number, dead: boolean) => Object3D | null;

/** A key that changes exactly when the model would. */
export const heldKeyOf = (kind: number, id: number, mut: number, mult: number, dead: boolean): string => {
  if (kind === 0) return '';
  return kind === 2 ? `${kind}:${id}:${mut}:${Math.round(mult * 4)}:${dead ? 1 : 0}` : `${kind}:${id}:${mut}`;
};

/** Build the model in a hand's frame. */
export const buildHeldModel: HeldModelFactory = (kind, id, mut, mult, dead) => {
  switch (kind) {
    case 1: {
      const b = new PartBuilder();
      buildSeed(b, id, 0.7);
      return b.build('held-seed', true);
    }
    case 2: {
      const tree = buildTree(id, mult, dead, mut);
      const height = Math.min(9, 2.6 + treeHeight(mult) * 0.35);
      tree.scale.setScalar(height / 10);
      const group = new Group();
      tree.position.y = -0.8;
      group.add(tree);
      return group;
    }
    case 3: {
      const b = new PartBuilder();
      buildFruit(b, id, 0.8, mut ? 0xffd23a : undefined);
      return b.build('held-fruit', true);
    }
    case 4: {
      const gear = gearById(id);
      if (!gear) return null;
      const b = new PartBuilder();
      cylinder(b, 0.32, 0.4, 0.8, gear.color, { y: 0.4 }, 'glow', 8);
      block(b, 0.2, 0.35, 0.2, 0x6a3a1a, { y: 0.95 });
      return b.build('held-gear', true);
    }
    default:
      return null;
  }
};
