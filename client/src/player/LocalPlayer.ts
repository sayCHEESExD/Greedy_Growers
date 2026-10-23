import {
  WorldCollision,
  copyMotion,
  createMotion,
  createSimEvents,
  createSimParams,
  horizontalSpeed,
  resetMotion,
  stepPlayer,
  type MoveMessage,
  type MovementInput,
  type PlayerMotion,
  type SimParams,
} from '@greedy/shared';
import { Vector3 } from 'three';
import type { InputState } from '../input/InputState.js';
import { NamePlate } from './NamePlate.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const MAX_PENDING_INPUTS = 240;
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const SNAP_DISTANCE = 5;
const CORRECTION_RATE = 14;
/** How long the body turns to face what it is working on. */
const FACE_SECONDS = 0.45;

const lerp = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;
const EMPTY_INPUTS: MoveMessage[] = [];

export type PlacementKind = 'none' | 'respawn' | 'correction';

interface PendingInput {
  seq: number;
  dt: number;
  input: MovementInput;
}

/** The authoritative fields the client reconciles against: EVERY field of `PlayerMotion`. */
export interface AuthoritativeMotion {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  grounded: boolean;
  jumpLatched: boolean;
  jumpCount: number;
  lastInputSeq: number;
}

/**
 * The locally controlled gardener: a PREDICTION of a server-owned simulation.
 *
 * Runs the identical `stepPlayer`, keeps every input the server has not
 * acknowledged, and on each server update snaps to the authoritative state and
 * replays them. The walk speed and jump come from the server's replicated
 * figures (`setParams`), never from anything local.
 *
 * A tool use is PRESENTATION: it plays at once for feel, and the server decides
 * separately whether the planting, watering or harvest happened.
 */
export class LocalPlayer {
  readonly character: PlayerCharacter;
  readonly position = new Vector3();
  readonly velocity = new Vector3();

  private readonly previous = { x: 0, y: 0, z: 0 };
  private readonly motion: PlayerMotion = createMotion();
  private readonly events = createSimEvents();
  private readonly replayEvents = createSimEvents();
  private readonly collision: WorldCollision;
  private readonly params: SimParams = createSimParams();

  private readonly pending: PendingInput[] = [];
  private nextSeq = 1;
  private readonly outgoing: MoveMessage[] = [];
  private accumulator = 0;
  private readonly correction = new Vector3();
  private placement: PlacementKind = 'none';
  private lastYaw = 0;
  private turnRate = 0;
  private jumpPending = false;
  private wasJumpHeld = false;
  private readonly plate = new NamePlate();

  private faceYaw = 0;
  private faceFor = 0;

  jumpedEdge = false;
  landedEdge = false;

  /** Where your own chat bubble goes. No plate is drawn over you, so just above the head. */
  get bubbleHeight(): number {
    return this.character.height + 0.9;
  }

  constructor(collision: WorldCollision) {
    this.collision = collision;
    this.character = new PlayerCharacter();
    // Your own name is not drawn over your own head (Roblox does the same).
    this.previous.x = this.motion.x;
    this.previous.y = this.motion.y;
    this.previous.z = this.motion.z;
    this.syncFromMotion();
    this.syncCharacter();
  }

  get horizontalSpeed(): number {
    return horizontalSpeed(this.motion);
  }

  get isGrounded(): boolean {
    return this.motion.grounded;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  get maxRunSpeed(): number {
    return this.params.moveSpeed;
  }

  drainOutgoing(): MoveMessage[] {
    if (this.outgoing.length === 0) return EMPTY_INPUTS;
    const batch = this.outgoing.slice();
    this.outgoing.length = 0;
    return batch;
  }

  /** The server's movement figures: walk speed and jump. */
  setParams(moveSpeed: number, jumpVelocity: number): void {
    if (Number.isFinite(moveSpeed) && moveSpeed > 0) this.params.moveSpeed = moveSpeed;
    if (Number.isFinite(jumpVelocity) && jumpVelocity > 0) this.params.jumpVelocity = jumpVelocity;
  }

  setDisplayName(displayName: string, avatarUrl: string): void {
    this.plate.set(displayName, avatarUrl, this.character.height);
  }

  /** Turn to face a point for a moment (the plant being tended). */
  faceToward(x: number, z: number): void {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    if (dx * dx + dz * dz < 0.01) return;
    this.faceYaw = Math.atan2(dx, dz);
    this.faceFor = FACE_SECONDS;
  }

  teleport(x: number, y: number, z: number, rotationY: number): void {
    resetMotion(this.motion, x, y, z, rotationY);
    this.previous.x = x;
    this.previous.y = y;
    this.previous.z = z;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.accumulator = 0;
    this.correction.set(0, 0, 0);
    this.placement = 'respawn';
    this.jumpPending = false;
    this.character.resetAnimation();
    this.syncFromMotion();
    this.syncCharacter();
  }

  reconcile(state: AuthoritativeMotion): void {
    const predictedX = this.motion.x;
    const predictedY = this.motion.y;
    const predictedZ = this.motion.z;

    const m = this.motion;
    m.x = state.x;
    m.y = state.y;
    m.z = state.z;
    m.vx = state.velocityX;
    m.vy = state.velocityY;
    m.vz = state.velocityZ;
    m.yaw = state.rotationY;
    m.grounded = state.grounded;
    m.jumpLatched = state.jumpLatched;
    m.jumpCount = state.jumpCount;

    let kept = 0;
    for (const entry of this.pending) {
      if (entry.seq <= state.lastInputSeq) continue;
      this.pending[kept] = entry;
      kept += 1;
    }
    this.pending.length = kept;
    for (const entry of this.pending) stepPlayer(m, entry.input, this.params, entry.dt, this.collision, this.replayEvents);

    const dx = predictedX - m.x;
    const dy = predictedY - m.y;
    const dz = predictedZ - m.z;
    const snapped = Math.hypot(dx, dy, dz) > SNAP_DISTANCE;
    this.correction.set(snapped ? 0 : dx, snapped ? 0 : dy, snapped ? 0 : dz);
    if (snapped) {
      this.previous.x = m.x;
      this.previous.y = m.y;
      this.previous.z = m.z;
      if (this.placement === 'none') this.placement = 'correction';
    }
    this.syncFromMotion();
    this.syncCharacter();
  }

  update(delta: number, input: Readonly<InputState>, cameraYaw: number): void {
    this.jumpedEdge = false;
    this.landedEdge = false;

    // A fresh press is remembered until a step takes it: a tap can be shorter than a fixed step.
    if (input.jump && !this.wasJumpHeld) this.jumpPending = true;
    this.wasJumpHeld = input.jump;

    this.accumulator += Math.max(0, delta);

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;
      const movement: MovementInput = {
        moveX: input.moveX,
        moveZ: input.moveZ,
        jump: this.jumpPending || input.jump,
        cameraYaw,
      };
      this.jumpPending = false;
      const seq = this.nextSeq;
      this.nextSeq += 1;
      this.previous.x = this.motion.x;
      this.previous.y = this.motion.y;
      this.previous.z = this.motion.z;
      stepPlayer(this.motion, movement, this.params, FIXED_DT, this.collision, this.events);
      this.jumpedEdge = this.jumpedEdge || this.events.jumped;
      this.landedEdge = this.landedEdge || this.events.landed;
      this.pending.push({ seq, dt: FIXED_DT, input: movement });
      if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
      this.outgoing.push({ seq, dt: FIXED_DT, moveX: movement.moveX, moveZ: movement.moveZ, jump: movement.jump, cameraYaw });
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.faceFor = Math.max(0, this.faceFor - delta);

    this.decayCorrection(delta);
    this.syncFromMotion();
    this.syncCharacter();
    this.updateAnimation(delta);
  }

  consumePlacement(): PlacementKind {
    const kind = this.placement;
    this.placement = 'none';
    return kind;
  }

  readMotion(into: PlayerMotion): void {
    copyMotion(this.motion, into);
  }

  private decayCorrection(delta: number): void {
    if (this.correction.lengthSq() < 1e-8) {
      this.correction.set(0, 0, 0);
      return;
    }
    this.correction.multiplyScalar(Math.exp(-CORRECTION_RATE * delta));
  }

  private syncFromMotion(): void {
    const alpha = Math.min(Math.max(this.accumulator / FIXED_DT, 0), 1);
    this.position.set(
      lerp(this.previous.x, this.motion.x, alpha) + this.correction.x,
      lerp(this.previous.y, this.motion.y, alpha) + this.correction.y,
      lerp(this.previous.z, this.motion.z, alpha) + this.correction.z,
    );
    this.velocity.set(this.motion.vx, this.motion.vy, this.motion.vz);
  }

  private updateAnimation(delta: number): void {
    const m = this.character.motion;
    let turn = this.motion.yaw - this.lastYaw;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    this.lastYaw = this.motion.yaw;
    this.turnRate += ((delta > 0 ? turn / delta : 0) - this.turnRate) * Math.min(1, delta * 10);
    m.grounded = this.motion.grounded;
    m.speed = this.horizontalSpeed;
    m.verticalVelocity = this.motion.vy;
    m.turnRate = this.turnRate;
    m.landed = this.landedEdge;
    this.character.update(delta);
  }


  private syncCharacter(): void {
    this.character.setPosition(this.position.x, this.position.y, this.position.z);
    // While tending a plant the body faces it; otherwise where it walks.
    this.character.root.rotation.y = this.faceFor > 0 && this.horizontalSpeed < 4 ? this.faceYaw : this.motion.yaw;
  }
}
