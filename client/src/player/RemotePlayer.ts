import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { lookFromState } from '../bloxity/avatarLook.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { heldKeyOf, type HeldModelFactory } from './held.js';
import { NamePlate } from './NamePlate.js';
import { PetFollowers } from './PetFollowers.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const FOLLOW_RATE = 14;
const SNAP_DISTANCE = 14;

const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

/**
 * Another gardener, rendered from replicated state ONLY.
 *
 * The transform is smoothed toward the replicated one. What is in their hand
 * is their replicated `held*` fields; each rise of their `actionCount` is one
 * tool use to play - a difference against the count first seen, never a
 * replay of somebody's whole session.
 */
export class RemotePlayer {
  readonly character: PlayerCharacter;

  private readonly plate = new NamePlate();
  private readonly dresser: AvatarDresser;
  private lastLook = '';
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private targetYaw = 0;
  private placed = false;
  private lastActionCount = -1;
  private wasGrounded = true;
  private grounded = true;
  private speed = 0;
  private verticalVelocity = 0;
  private turnRate = 0;
  private displayName = '';
  private avatarUrl = '';
  private heldKind = 0;
  private lastEmoteAt = -1;
  /** The verified Boxity account id ('' for a guest), for matching chat. */
  accountId = '';
  readonly pets = new PetFollowers();

  get position(): { readonly x: number; readonly y: number; readonly z: number } {
    return { x: this.targetX, y: this.targetY, z: this.targetZ };
  }

  constructor(state: NetPlayerState, private readonly heldModels: HeldModelFactory) {
    this.character = new PlayerCharacter();
    this.character.root.add(this.plate.sprite);
    this.dresser = new AvatarDresser(this.character);
    this.apply(state);
    this.character.setPosition(this.targetX, this.targetY, this.targetZ);
    this.character.setYaw(this.targetYaw);
    this.placed = true;
  }

  apply(state: NetPlayerState): void {
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetZ = state.z;
    this.targetYaw = state.rotationY;
    this.grounded = state.grounded;
    this.speed = state.speed;
    this.verticalVelocity = state.verticalVelocity;

    if (state.displayName !== this.displayName || state.avatarUrl !== this.avatarUrl) {
      this.displayName = state.displayName;
      this.avatarUrl = state.avatarUrl;
      this.plate.set(state.displayName, state.avatarUrl, this.character.height);
    }

    this.accountId = state.accountId ?? '';
    this.heldKind = state.heldKind;
    const key = heldKeyOf(state.heldKind, state.heldId, state.heldMut, state.heldMult, state.heldDead);
    this.character.setHeld(key, () => this.heldModels(state.heldKind, state.heldId, state.heldMut, state.heldMult, state.heldDead));
    this.pets.set([state.pet0, state.pet1, state.pet2]);
    if (this.lastEmoteAt >= 0 && state.emoteAt > this.lastEmoteAt && state.emoteId) this.character.emote(state.emoteId);
    this.lastEmoteAt = state.emoteAt;

    if (this.lastActionCount >= 0 && state.actionCount > this.lastActionCount) {
      this.character.act(this.heldKind === 1 ? 'plant' : 'pick');
    }
    this.lastActionCount = state.actionCount;
    this.dressFrom(state);
  }

  private dressFrom(state: NetPlayerState): void {
    const avatar = state.avatar;
    if (!avatar) return;
    const look = lookFromState(avatar);
    const key = JSON.stringify(look);
    if (key === this.lastLook) return;
    this.lastLook = key;
    this.dresser.setLook(look.appearance, look.proportions);
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    const position = this.character.root.position;
    const gap = Math.hypot(this.targetX - position.x, this.targetY - position.y, this.targetZ - position.z);
    const yawBefore = this.character.root.rotation.y;
    if (!this.placed || gap > SNAP_DISTANCE) {
      position.set(this.targetX, this.targetY, this.targetZ);
      this.character.setYaw(this.targetYaw);
      this.placed = true;
    } else {
      const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
      position.x += (this.targetX - position.x) * alpha;
      position.y += (this.targetY - position.y) * alpha;
      position.z += (this.targetZ - position.z) * alpha;
      const yaw = this.character.root.rotation.y;
      this.character.setYaw(yaw + shortestAngle(yaw, this.targetYaw) * Math.min(1, alpha * 1.5));
    }
    const turn = shortestAngle(yawBefore, this.character.root.rotation.y);
    this.turnRate += ((dt > 0 ? turn / dt : 0) - this.turnRate) * Math.min(1, dt * 10);

    const m = this.character.motion;
    m.speed = this.speed;
    m.grounded = this.grounded;
    m.verticalVelocity = this.verticalVelocity;
    m.turnRate = this.turnRate;
    m.landed = this.grounded && !this.wasGrounded;
    this.wasGrounded = this.grounded;
    this.character.update(dt);
    const r = this.character.root;
    this.pets.update(dt, performance.now() / 1000, r.position.x, r.position.y, r.position.z, r.rotation.y, this.speed > 1);
  }

  /** Where a chat bubble goes: just above the name plate. */
  get bubbleHeight(): number {
    return this.plate.top + 0.15;
  }

  dispose(): void {
    this.pets.dispose();
    this.plate.dispose();
    this.dresser.dispose();
    this.character.dispose();
  }
}
