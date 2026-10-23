import { eggById, furnitureById, gearById, petById, wormById } from '@greedy/shared';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Object3D,
  type WebGLRenderer,
} from 'three';
import { buildFurniture } from '../models/furniture.js';
import { buildFruit, buildSeed, buildTree } from '../models/greedyTrees.js';
import { buildEgg, buildPet } from '../models/pets.js';
import { block, cylinder } from '../models/shapes.js';
import { PartBuilder } from '../render/PartBuilder.js';

const SIZE = 128;

/**
 * ICONS DRAWN FROM THE MODELS THEMSELVES: every crop, seed bag, tool, piece
 * of gear and decoration is rendered once, off screen, into a small picture
 * for the hotbar, the shops, the backpack and the Index. So the carrot in the
 * shop is exactly the carrot in the garden, and there is no icon atlas to
 * ship. Rendered lazily, the first time each is asked for, then cached.
 */
export class IconFactory {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 200);
  private readonly target = new WebGLRenderTarget(SIZE, SIZE);
  private readonly cache = new Map<string, string>();
  private readonly pixels = new Uint8Array(SIZE * SIZE * 4);
  private readonly canvas = document.createElement('canvas');
  private readonly holder = new Group();

  constructor(private readonly renderer: WebGLRenderer) {
    this.target.texture.colorSpace = SRGBColorSpace;
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.scene.add(new AmbientLight(0xffffff, 1.4));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0xfff0d8, 0.9);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);
    this.scene.add(this.holder);
  }

  seed(id: number, mut = 0): string {
    return this.icon(`seed:${id}:${mut ? 1 : 0}`, () => {
      const b = new PartBuilder();
      buildSeed(b, id, 1);
      if (mut) b.box(0.4, 0.4, 0.4, 0xfff2a0, 'glow', { y: 1.8 });
      return b.build('icon');
    });
  }

  /** A tree at its growth stage and look (live or dead). */
  tree(id: number, mult: number, mut: number, dead: boolean): string {
    const stage = mult < 0.6 ? 0 : mult < 2 ? 1 : mult < 6 ? 2 : mult < 25 ? 3 : 4;
    return this.icon(`tree:${id}:${stage}:${mut}:${dead ? 1 : 0}`, () => {
      const group = new Group();
      const tree = buildTree(id, Math.max(0.7, mult), dead, mut);
      tree.scale.setScalar(1);
      group.add(tree);
      return group;
    });
  }

  fruit(id: number, mut = 0): string {
    return this.icon(`fruit:${id}:${mut ? 1 : 0}`, () => {
      const b = new PartBuilder();
      buildFruit(b, id, 1, mut ? 0xffd23a : undefined);
      return b.build('icon');
    });
  }

  pet(id: number): string {
    return this.icon(`pet:${id}`, () => {
      const b = new PartBuilder();
      const pet = petById(id);
      if (pet) buildPet(b, pet);
      return b.build('icon');
    });
  }

  egg(id: number): string {
    return this.icon(`egg:${id}`, () => {
      const b = new PartBuilder();
      const egg = eggById(id);
      if (egg) buildEgg(b, egg.color, egg.spots);
      return b.build('icon');
    });
  }

  gear(id: number): string {
    return this.icon(`gear:${id}`, () => {
      const b = new PartBuilder();
      const gear = gearById(id);
      if (gear) {
        if (gear.permanent) {
          b.box(1.6, 1.4, 1.2, 0x8a8a92, 'stud', { y: 0.7 });
          b.box(0.6, 0.6, 0.2, gear.color, 'glow', { y: 0.8, z: 0.62 });
          cylinder(b, 0.1, 0.1, 0.8, 0x5a5a62, { x: 0.5, y: 1.8 });
          b.box(0.3, 0.3, 0.3, gear.color, 'glow', { x: 0.5, y: 2.3 });
        } else {
          cylinder(b, 0.5, 0.65, 1.3, gear.color, { y: 0.65 }, 'glow', 10);
          block(b, 0.35, 0.5, 0.35, 0x6a3a1a, { y: 1.5 });
        }
      }
      return b.build('icon');
    });
  }

  worm(id: number): string {
    return this.icon(`worm:${id}`, () => {
      const b = new PartBuilder();
      const worm = wormById(id);
      const color = worm?.color ?? 0xe88aa0;
      for (let i = 0; i < 6; i += 1) b.box(0.5, 0.5, 0.5, color, 'smooth', { x: -1.2 + i * 0.45, y: 0.3 + Math.abs(Math.sin(i * 0.9)) * 0.6 });
      b.box(0.15, 0.15, 0.1, 0x111111, 'smooth', { x: 1.15, y: 0.75, z: 0.25 });
      return b.build('icon');
    });
  }

  furniture(id: number): string {
    return this.icon(`furniture:${id}`, () => {
      const b = new PartBuilder();
      if (furnitureById(id)) buildFurniture(b, id);
      return b.build('icon');
    });
  }

  private icon(key: string, build: () => Object3D): string {
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const url = this.render(build());
    this.cache.set(key, url);
    return url;
  }

  private render(object: Object3D): string {
    this.holder.clear();
    this.holder.add(object);
    // A three-quarter view, fitted to the model's bounds. Scaled to a few units
    // across first, so studded parts carry a sensible number of studs.
    object.rotation.y += -0.6;
    object.updateMatrixWorld(true);
    const raw = new Box3().setFromObject(object).getSize(new Vector3());
    object.scale.multiplyScalar(4 / Math.max(0.05, raw.x, raw.y, raw.z));
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.001;
    const distance = radius / Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(centre.x + distance * 0.35, centre.y + distance * 0.35, centre.z + distance * 0.87);
    this.camera.lookAt(centre);
    this.camera.near = distance * 0.1;
    this.camera.far = distance * 4;
    this.camera.updateProjectionMatrix();

    const previousTarget = this.renderer.getRenderTarget();
    const previousClear = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setClearAlpha(previousClear);

    const ctx = this.canvas.getContext('2d')!;
    const image = ctx.createImageData(SIZE, SIZE);
    // WebGL rows run bottom-up.
    for (let y = 0; y < SIZE; y += 1) {
      image.data.set(this.pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    }
    ctx.putImageData(image, 0, 0);
    this.holder.remove(object);
    object.traverse((child) => {
      const mesh = child as unknown as { isMesh?: boolean; geometry?: { dispose(): void } };
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.target.dispose();
  }
}
