import { Group, type Object3D } from 'three';
import { attachToMount, measureMounts } from '../animation/rig/BoneMounts.js';
import { AVATAR_HEIGHT, AvatarBody } from './AvatarBody.js';
import { createMotion, type Motion } from './Motion.js';

/**
 * A GARDENER ON SCREEN: their own Bloxity avatar, and whatever is in their
 * right hand - a shovel, a seed bag, a watering can, a fresh carrot.
 *
 *   root      physics transform (position + facing). Gameplay owns it.
 *     avatar  the player's own avatar body, animated procedurally
 *       held  the held item, riding the right hand's bone
 */
export class PlayerCharacter {
  readonly root = new Group();
  /** What the body is doing: written by the owner every frame. */
  readonly motion: Motion = createMotion();

  private readonly avatar = new AvatarBody();
  private heldKey = '';
  private held: Object3D | null = null;
  private heldBuild: (() => Object3D | null) | null = null;

  constructor() {
    this.root.add(this.avatar.root);
  }

  /** Height of the head above the ground: where name plates sit, what the camera frames. */
  get height(): number {
    return AVATAR_HEIGHT;
  }

  /** The AVATAR body, for the dresser. */
  get body(): { visual: Group; model: Object3D } {
    return this.avatar.body;
  }

  /** Wear a different avatar body, or null for the bundled one. The held item moves to the new hand. */
  setModel(next: Object3D | null): Object3D {
    const model = this.avatar.setModel(next);
    if (this.held && this.heldBuild) {
      this.held.removeFromParent();
      this.mount(this.held);
    }
    return model;
  }

  /**
   * Put something in the hand. `key` names it; the same key again is a no-op,
   * so this is safe to call on every patch. `build` makes its model.
   */
  setHeld(key: string, build: () => Object3D | null): void {
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.heldBuild = build;
    if (this.held) {
      this.held.removeFromParent();
      this.held = null;
    }
    this.motion.holding = key !== '';
    if (!key) return;
    const object = build();
    if (!object) return;
    this.held = object;
    this.mount(object);
  }

  /**
   * Wear something on the head or the back (an NPC's hat, a backpack): sized
   * to the head, measured in the bind pose and parented to the bone.
   */
  wear(object: Object3D, where: 'head' | 'back'): void {
    this.atOrigin(() => {
      const mounts = measureMounts(this.avatar.rigRef, this.root, AVATAR_HEIGHT);
      const mount = where === 'head' ? mounts.head : mounts.back;
      if (where === 'head') object.scale.multiplyScalar(mounts.headSize);
      if (mount) attachToMount(object, mount, this.root);
      else this.root.add(object);
    });
  }

  /** Run a measurement with the character at the origin, unturned, in the bind pose. */
  private atOrigin(run: () => void): void {
    const r = this.root;
    const position = r.position.clone();
    const rotation = r.rotation.clone();
    const parent = r.parent;
    r.removeFromParent();
    r.position.set(0, 0, 0);
    r.rotation.set(0, 0, 0);
    this.avatar.bindPose();
    r.updateMatrixWorld(true);
    run();
    r.position.copy(position);
    r.rotation.copy(rotation);
    parent?.add(r);
  }

  /**
   * Attach to the right hand: measured in the bind pose with the character at
   * the origin, then parented to the forearm bone so it follows every swing.
   */
  private mount(object: Object3D): void {
    const r = this.root;
    const position = r.position.clone();
    const rotation = r.rotation.clone();
    const parent = r.parent;
    r.removeFromParent();
    r.position.set(0, 0, 0);
    r.rotation.set(0, 0, 0);
    this.avatar.bindPose();
    r.updateMatrixWorld(true);
    const mounts = measureMounts(this.avatar.rigRef, r, AVATAR_HEIGHT);
    if (mounts.hand) {
      attachToMount(object, mounts.hand, r);
    } else {
      object.position.set(-0.6, 2, 1.2);
      r.add(object);
    }
    r.position.copy(position);
    r.rotation.copy(rotation);
    parent?.add(r);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  /** Play one tool use. */
  act(kind: Motion['actionKind']): void {
    this.motion.actionKind = kind;
    this.motion.actionTime = 0;
  }

  cheer(): void {
    this.motion.cheerTime = 0;
  }

  /** Play a Boxity emote by its catalogue id. Walking away ends it. */
  emote(id: string): void {
    this.motion.emote = id;
    this.motion.emoteTime = 0;
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    const m = this.motion;
    if (m.actionTime >= 0) m.actionTime += dt;
    if (m.cheerTime >= 0) m.cheerTime += dt;
    if (m.emoteTime >= 0) m.emoteTime += dt;
    if (m.speed > 1.5 || !m.grounded) m.emote = '';
    this.avatar.update(dt, m);
  }

  resetAnimation(): void {
    this.avatar.reset();
  }

  dispose(): void {
    this.held?.removeFromParent();
    this.avatar.dispose();
    this.root.removeFromParent();
  }
}
