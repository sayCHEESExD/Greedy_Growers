import {
  MAX_GARDEN_CAPACITY,
  PLOT,
  PLOTS,
  gardenSpot,
  multAt,
  visibleName,
} from '@greedy/shared';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type Object3D } from 'three';
import { buildFurniture } from '../models/furniture.js';
import { buildFruit, buildTree, treeHeight, treeKey } from '../models/greedyTrees.js';
import { block, brick, shade } from '../models/shapes.js';
import type { NetPlotState } from '../net/netTypes.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { WoodSign } from './WoodSign.js';

interface TreeView {
  readonly group: Group;
  model: Group | null;
  /** The storm cloud gathering over a growing tree, and its inner flicker. */
  cloud: Group | null;
  cloudMaterial: MeshLambertMaterial | null;
  glow: MeshBasicMaterial | null;
  key: string;
  /** For the strike's shake. */
  dead: boolean;
  shake: number;
}

/** Garden trees are kept to a tidy size so the row stays a row. */
const CLOUD_BOX = new BoxGeometry(1, 1, 1);

const GARDEN_MAX_HEIGHT = 13;

/**
 * ONE PLOT, drawn from its replicated state: the saplings growing on the soil
 * (each rebuilt only when it crosses a growth stage or a mutation changes its
 * look, and smoothly rescaled every frame as its multiplier climbs), the
 * owner's sign with their portrait and likes, the garden row and its fruit,
 * the furniture and the market stand.
 *
 * Positions are the plot's LOCAL frame; the root sits at the plot's middle.
 */
export class PlotView {
  readonly root = new Group();
  private readonly trees = new Map<number, TreeView>();
  private readonly gardenTrees = new Map<number, { group: Group; key: string; fruitKey: string; fruits: Group | null }>();
  private readonly furniture = new Map<number, Group>();
  private readonly sign = new WoodSign(5.8, 2.7);
  private readonly spots: Group;
  private spotsShown = -1;
  private stand: Group | null = null;
  private standKey = '';

  constructor(readonly slot: number) {
    const p = PLOTS[slot]!;
    this.root.position.set(p.x, 0, p.z);
    // The owner's sign at the front corner, turned a little toward the lane.
    // Its two legs stand BEHIND the board (the face is never crossed), a
    // frame rims the board and a brace ties the legs below it.
    const signGroup = new Group();
    signGroup.position.set(PLOT.sign.x, 0, PLOT.sign.z);
    signGroup.rotation.y = -0.32;
    const post = new PartBuilder();
    const boardY = 3.9;
    const back = -0.45;
    for (const x of [-2.2, 2.2]) {
      brick(post, 0.6, boardY + 1.2, 0.6, 0x5a3016, { x, y: (boardY + 1.2) / 2, z: back - 0.32 });
      brick(post, 1.1, 0.35, 1.1, 0x4a2610, { x, y: 0.17, z: back - 0.32 });
    }
    brick(post, 4.4, 0.4, 0.4, 0x5a3016, { y: 1.3, z: back - 0.32 });
    brick(post, 6.3, 3.1, 0.45, 0x7a4a22, { y: boardY, z: -0.2 });
    // The frame: four rails proud of the board's edge, round the face.
    brick(post, 6.7, 0.32, 0.6, 0x5a3016, { y: boardY + 1.66, z: -0.18 });
    brick(post, 6.7, 0.32, 0.6, 0x5a3016, { y: boardY - 1.66, z: -0.18 });
    for (const x of [-3.2, 3.2]) brick(post, 0.32, 3.0, 0.6, 0x5a3016, { x, y: boardY, z: -0.18 });
    signGroup.add(post.build('plot-sign'));
    this.sign.mesh.position.set(0, boardY, 0.06);
    signGroup.add(this.sign.mesh);
    this.root.add(signGroup);
    this.spots = new Group();
    this.root.add(this.spots);
  }

  /** The world point a sapling of this plot stands on. */
  treeWorld(id: number): { x: number; z: number } | null {
    const view = this.trees.get(id);
    if (!view) return null;
    return { x: this.root.position.x + view.group.position.x, z: this.root.position.z + view.group.position.z };
  }

  /** A strike landed on a sapling here: shake it. */
  struck(id: number): void {
    const view = this.trees.get(id);
    if (view) view.shake = 1;
  }

  update(state: NetPlotState, now: number, time: number, delta: number, detail: boolean): void {
    this.updateSign(state);
    this.updateSaplings(state, now, time, delta);
    if (!detail) return;
    this.updateSpots(state);
    this.updateGarden(state, time);
    this.updateFurniture(state);
    this.updateStand(state);
  }

  private updateSign(state: NetPlotState): void {
    if (!state.owner) {
      this.sign.set({ rows: [{ text: 'Empty Plot', size: 1.2, color: '#fff4dc' }] });
      return;
    }
    this.sign.set({
      rows: [{ text: visibleName(state.ownerName), size: 1, color: '#fff4dc' }],
      portrait: state.ownerAvatar || undefined,
      panels: [{ text: `${state.likes}`, icon: 'like', color: '#ffffff' }],
    });
  }

  private updateSaplings(state: NetPlotState, now: number, time: number, delta: number): void {
    const seen = new Set<number>();
    state.saplings.forEach((s) => {
      seen.add(s.id);
      let view = this.trees.get(s.id);
      if (!view) {
        const group = new Group();
        group.position.set(s.x, PLOT.soilTop, s.z);
        group.rotation.y = (s.id * 2.399) % (Math.PI * 2);
        this.root.add(group);
        view = { group, model: null, key: '', dead: s.dead, shake: 0, cloud: null, cloudMaterial: null, glow: null };
        this.trees.set(s.id, view);
      }
      const mult = s.dead ? s.deadMult : multAt(s.plantedAt, s.rate, now, s.boost);
      const key = treeKey(s.seed, mult, s.dead, s.mut);
      if (key !== view.key) {
        view.key = key;
        if (view.model) disposeTree(view.model);
        view.model = buildTree(s.seed, mult, s.dead, s.mut);
        view.group.add(view.model);
        if (s.dead && !view.dead) view.shake = 1;
        view.dead = s.dead;
      }
      if (view.model) {
        const huge = (s.mut & (1 << 11)) !== 0 ? 1.18 : 1;
        // A planted seed springs up over its first moments; the tree then tracks its multiplier.
        const age = (now - s.plantedAt) / 1000;
        const pop = Math.min(1, 0.35 + age * 1.6);
        view.model.scale.setScalar((treeHeight(mult) / 10) * huge * pop);
        const sway = s.dead ? 0 : Math.sin(time * 1.3 + s.id) * 0.02;
        view.shake = Math.max(0, view.shake - delta * 1.6);
        const jolt = view.shake > 0 ? Math.sin(time * 60) * 0.06 * view.shake : 0;
        view.model.rotation.z = sway + jolt;
        view.model.rotation.x = jolt * 0.6;
        this.updateCloud(view, s.dead, mult, time, s.id);
      }
    });
    for (const [id, view] of this.trees) {
      if (seen.has(id)) continue;
      if (view.model) disposeTree(view.model);
      view.cloudMaterial?.dispose();
      view.glow?.dispose();
      view.group.removeFromParent();
      this.trees.delete(id);
    }
  }

  /**
   * THE STORM CUE: a dark block cloud over every growing tree, thin and pale
   * on a sapling, heavy and crackling over a greedy giant - the lightning is
   * always up there somewhere. Gone once the tree is struck.
   */
  private updateCloud(view: TreeView, dead: boolean, mult: number, time: number, id: number): void {
    if (dead || mult < 1) {
      if (view.cloud) view.cloud.visible = false;
      return;
    }
    if (!view.cloud) {
      const cloud = new Group();
      view.cloudMaterial = new MeshLambertMaterial({ color: 0x4a4e5a, transparent: true, opacity: 0.2, depthWrite: false });
      view.glow = new MeshBasicMaterial({ color: 0xfff6a0, transparent: true, opacity: 0, depthWrite: false, fog: false });
      for (const [x, y, z, s] of [
        [0, 0, 0, 3.4],
        [2.2, -0.3, 0.6, 2.4],
        [-2.1, -0.2, -0.4, 2.6],
        [0.4, 0.8, -1.4, 2.2],
      ] as const) {
        const puff = new Mesh(CLOUD_BOX, view.cloudMaterial);
        puff.position.set(x, y, z);
        puff.scale.set(s, s * 0.7, s);
        cloud.add(puff);
      }
      const core = new Mesh(CLOUD_BOX, view.glow);
      core.scale.set(2.2, 1, 2.2);
      core.position.y = -0.8;
      cloud.add(core);
      view.group.add(cloud);
      view.cloud = cloud;
    }
    const risk = Math.min(1, Math.log10(Math.max(1, mult)) / 1.6);
    view.cloud.visible = true;
    view.cloud.position.y = treeHeight(mult) + 4 + Math.sin(time * 0.8 + id) * 0.3;
    view.cloud.rotation.y = time * 0.15 + id;
    view.cloud.scale.setScalar(0.7 + risk * 0.9);
    if (view.cloudMaterial) {
      view.cloudMaterial.opacity = 0.18 + risk * 0.62;
      view.cloudMaterial.color.setHex(risk > 0.6 ? 0x2e3240 : 0x4a4e5a);
    }
    // A crackle inside it now and then, more often the bigger the tree.
    if (view.glow) {
      const beat = Math.sin(time * (3 + risk * 9) + id * 1.7);
      view.glow.opacity = risk > 0.25 && beat > 0.97 ? 0.8 * risk : Math.max(0, view.glow.opacity - 0.08);
    }
  }

  /** Mounds for the open garden spots, so the row reads as somewhere to plant. */
  private updateSpots(state: NetPlotState): void {
    const open = state.owner ? state.gardenSpots : 0;
    if (open === this.spotsShown) return;
    this.spotsShown = open;
    this.spots.children.forEach((child) => disposeBuilt(child));
    this.spots.clear();
    const b = new PartBuilder();
    for (let i = 0; i < MAX_GARDEN_CAPACITY; i += 1) {
      const at = gardenSpot(i);
      if (i < open) {
        b.box(3.2, 0.5, 3.2, 0x7a4220, 'flat', { x: at.x, y: 0.25, z: at.z });
        block(b, 2.4, 0.06, 2.4, 0x5a2e14, { x: at.x, y: 0.52, z: at.z });
      } else {
        // A locked spot: a little fence square.
        for (const side of [-1, 1]) {
          block(b, 3, 0.5, 0.2, 0x9a7a5a, { x: at.x, y: 0.6, z: at.z + side * 1.4 });
          block(b, 0.2, 0.5, 3, 0x9a7a5a, { x: at.x + side * 1.4, y: 0.6, z: at.z });
        }
      }
    }
    this.spots.add(b.build('garden-spots'));
  }

  private updateGarden(state: NetPlotState, time: number): void {
    const seen = new Set<number>();
    state.garden.forEach((g) => {
      seen.add(g.spot);
      let view = this.gardenTrees.get(g.spot);
      const at = gardenSpot(g.spot);
      const key = treeKey(g.seed, g.mult, false, g.mut);
      if (!view || view.key !== key) {
        if (view) {
          if (view.fruits) disposeBuilt(view.fruits);
          disposeTree(view.group);
        }
        const group = new Group();
        const tree = buildTree(g.seed, g.mult, false, g.mut);
        const scale = Math.min(treeHeight(g.mult), GARDEN_MAX_HEIGHT) / 10;
        tree.scale.setScalar(scale);
        group.add(tree);
        group.position.set(at.x, 0.5, at.z);
        group.rotation.y = g.spot * 1.7;
        this.root.add(group);
        view = { group, key, fruitKey: '', fruits: null };
        this.gardenTrees.set(g.spot, view);
      }
      const fruitKey = `${g.fruits}:${g.f0}:${g.f1}:${g.f2}`;
      if (fruitKey !== view.fruitKey) {
        view.fruitKey = fruitKey;
        if (view.fruits) disposeBuilt(view.fruits);
        view.fruits = null;
        if (g.fruits > 0) {
          const b = new PartBuilder();
          const height = Math.min(treeHeight(g.mult), GARDEN_MAX_HEIGHT);
          const muts = [g.f0, g.f1, g.f2];
          for (let i = 0; i < g.fruits; i += 1) {
            const a = (i / 3) * Math.PI * 2 + 0.5;
            const fruit = new PartBuilder();
            buildFruit(fruit, g.seed, 1.3, muts[i] ? shade(0xffd23a, 1) : undefined);
            b.absorb(fruit, { x: Math.cos(a) * height * 0.22, y: height * 0.62, z: Math.sin(a) * height * 0.22 });
            // A sparkle cube over each ripe fruit so they read from afar.
            b.box(0.4, 0.4, 0.4, 0xfff2a0, 'glow', { x: Math.cos(a) * height * 0.22, y: height * 0.62 + 1.9, z: Math.sin(a) * height * 0.22 });
          }
          view.fruits = b.build('fruits', false);
          view.group.add(view.fruits);
        }
      }
      if (view.fruits) view.fruits.position.y = Math.sin(time * 2 + g.spot) * 0.15;
    });
    for (const [spot, view] of this.gardenTrees) {
      if (seen.has(spot)) continue;
      if (view.fruits) disposeBuilt(view.fruits);
      disposeTree(view.group);
      this.gardenTrees.delete(spot);
    }
  }

  private updateFurniture(state: NetPlotState): void {
    const seen = new Set<number>();
    state.furniture.forEach((d) => {
      seen.add(d.id);
      if (this.furniture.has(d.id)) return;
      const b = new PartBuilder();
      buildFurniture(b, d.kind);
      const group = b.build(`furniture-${d.kind}`);
      group.position.set(d.x, 0, d.z);
      group.rotation.y = d.rot * (Math.PI / 2);
      this.root.add(group);
      this.furniture.set(d.id, group);
    });
    for (const [id, group] of this.furniture) {
      if (seen.has(id)) continue;
      disposeBuilt(group);
      this.furniture.delete(id);
    }
  }

  private updateStand(state: NetPlotState): void {
    const slots: string[] = [];
    state.stand.forEach((s, key) => slots.push(`${key}:${s.seed}:${s.mut}`));
    const key = `${state.hasStand && state.owner ? 1 : 0}|${slots.sort().join(',')}`;
    if (key === this.standKey) return;
    this.standKey = key;
    if (this.stand) disposeBuilt(this.stand);
    this.stand = null;
    if (!state.hasStand || !state.owner) return;
    const b = new PartBuilder();
    const { x, z } = PLOT.stand;
    brick(b, 6, 2.2, 2.4, 0x8a5228, { x, y: 1.1, z });
    brick(b, 6.4, 0.3, 2.8, 0x6a3a1a, { x, y: 2.35, z });
    for (const dx of [-2.8, 2.8]) brick(b, 0.5, 5.2, 0.5, 0x6a3a1a, { x: x + dx, y: 2.6, z: z - 1 });
    for (let i = 0; i < 5; i += 1) block(b, 1.4, 0.3, 3.4, i % 2 ? 0xffffff : 0x3fae3a, { x: x - 2.8 + i * 1.4, y: 5.3, z: z - 0.2, rx: 0.25 });
    state.stand.forEach((s, slotKey) => {
      const fruit = new PartBuilder();
      buildFruit(fruit, s.seed, 1.1);
      b.absorb(fruit, { x: x - 2 + Number(slotKey) * 2, y: 2.5, z });
    });
    this.stand = b.build('stand');
    this.root.add(this.stand);
  }

  dispose(): void {
    for (const view of this.trees.values()) if (view.model) disposeTree(view.model);
    this.root.removeFromParent();
    this.sign.dispose();
  }
}

/**
 * Remove a tree model. Its geometries are SHARED (cached per seed/stage), so
 * only an object built just for this view - fruit, furniture, the stand - is
 * left for the garbage collector; the cache keeps the trees.
 */
const disposeTree = (object: Object3D): void => {
  object.removeFromParent();
};

/** Remove and free an object built for this view alone (fruit, furniture, the stand, the spots). */
const disposeBuilt = (object: Object3D): void => {
  object.removeFromParent();
  object.traverse((child) => {
    const mesh = child as unknown as { isMesh?: boolean; geometry?: { dispose(): void } };
    if (mesh.isMesh) mesh.geometry?.dispose();
  });
};
