import { JUMP_VELOCITY, MOVEMENT, WALK_SPEED } from '../config/movement.js';
import { SPAWN } from '../config/map.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../constants/world.js';
import { rotateTowards } from '../types/math.js';
import type { WorldCollision } from './WorldCollision.js';

/**
 * THE movement simulation, shared by the server and by client prediction.
 *
 * The server runs it to own the result and the client runs the identical
 * function to predict ahead of the network, so the two can only disagree
 * through inputs, never through maths. Walking, running and jumping - there
 * is no sprint: how fast a gardener walks is `SimParams.moveSpeed`, which the
 * server sets.
 */

export interface PlayerMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  /** Edge-detect for the jump control, so a hold is one jump. */
  jumpLatched: boolean;
  /** Monotonic count of jumps, so a remote can mirror them. */
  jumpCount: number;
}

/** One frame of player intent. Carries no position - only what was pressed. */
export interface MovementInput {
  moveX: number;
  moveZ: number;
  jump: boolean;
  cameraYaw: number;
}

/** Server-owned tuning the step reads but never changes. */
export interface SimParams {
  /** Run speed in world units per second, from the Speed stat. */
  moveSpeed: number;
  /** Jump take-off velocity. */
  jumpVelocity: number;
  /** Half-width of the current form's collision body. */
  radius: number;
}

export interface SimEvents {
  jumped: boolean;
  landed: boolean;
}

/** Largest single step the simulation will take, in seconds. */
export const MAX_SIM_DELTA = 0.1;

export const createMotion = (): PlayerMotion => ({
  x: SPAWN.x,
  y: SPAWN.y,
  z: SPAWN.z,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: SPAWN.yaw,
  grounded: true,
  jumpLatched: false,
  jumpCount: 0,
});

export const createSimEvents = (): SimEvents => ({ jumped: false, landed: false });

export const createSimParams = (): SimParams => ({ moveSpeed: WALK_SPEED, jumpVelocity: JUMP_VELOCITY, radius: PLAYER_RADIUS });

export const copyMotion = (from: PlayerMotion, to: PlayerMotion): void => {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.vx = from.vx;
  to.vy = from.vy;
  to.vz = from.vz;
  to.yaw = from.yaw;
  to.grounded = from.grounded;
  to.jumpLatched = from.jumpLatched;
  to.jumpCount = from.jumpCount;
};

/** Reset to a placement. */
export const resetMotion = (motion: PlayerMotion, x: number, y: number, z: number, yaw: number): void => {
  motion.x = x;
  motion.y = y;
  motion.z = z;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = yaw;
  motion.grounded = true;
  motion.jumpLatched = false;
};

export const horizontalSpeed = (motion: PlayerMotion): number => Math.hypot(motion.vx, motion.vz);

/** Sanitise one input before it is simulated. Applied on the SERVER. */
export const sanitiseInput = (input: Partial<MovementInput> | undefined): MovementInput => {
  const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  let moveX = finite(input?.moveX);
  let moveZ = finite(input?.moveZ);
  const magnitude = Math.hypot(moveX, moveZ);
  if (magnitude > 1) {
    moveX /= magnitude;
    moveZ /= magnitude;
  }
  return { moveX, moveZ, jump: input?.jump === true, cameraYaw: finite(input?.cameraYaw) };
};

const AXIS = { value: 0, y: 0, hit: false };

/**
 * Advance one player by one step.
 *
 * @param motion    mutated in place
 * @param input     already sanitised intent
 * @param params    server-owned tuning
 * @param delta     seconds; clamped internally to [0, MAX_SIM_DELTA]
 * @param collision the world the player moves through
 * @param events    mutated in place with the edges this step produced
 */
export const stepPlayer = (
  motion: PlayerMotion,
  input: MovementInput,
  params: SimParams,
  delta: number,
  collision: WorldCollision,
  events: SimEvents,
): void => {
  events.jumped = false;
  events.landed = false;
  const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_SIM_DELTA) : 0;
  if (dt === 0) return;

  const pressed = input.jump && !motion.jumpLatched;
  motion.jumpLatched = input.jump;

  // Camera-relative stick: forward is where the camera looks, right is -X at yaw 0.
  const yaw = input.cameraYaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const wishX = rx * input.moveX + fx * input.moveZ;
  const wishZ = rz * input.moveX + fz * input.moveZ;
  const wishLength = Math.hypot(wishX, wishZ);

  const speed = Math.max(0, params.moveSpeed);
  const targetX = wishX * speed;
  const targetZ = wishZ * speed;
  // Acceleration scales with the run speed, so a fast player is not sluggish off the mark.
  const scale = Math.max(1, speed / 16);
  const control = motion.grounded ? 1 : MOVEMENT.airControl;
  const rate = (wishLength > 0.01 ? MOVEMENT.acceleration : MOVEMENT.deceleration) * scale * control;
  const dvx = targetX - motion.vx;
  const dvz = targetZ - motion.vz;
  const dv = Math.hypot(dvx, dvz);
  const maxChange = rate * dt;
  if (dv <= maxChange) {
    motion.vx = targetX;
    motion.vz = targetZ;
  } else {
    motion.vx += (dvx / dv) * maxChange;
    motion.vz += (dvz / dv) * maxChange;
  }

  if (wishLength > 0.05) {
    motion.yaw = rotateTowards(motion.yaw, Math.atan2(wishX, wishZ), MOVEMENT.turnSpeed * dt);
  }

  if (pressed && motion.grounded) {
    motion.vy = params.jumpVelocity;
    motion.grounded = false;
    motion.jumpCount += 1;
    events.jumped = true;
  }

  motion.vy = Math.max(motion.vy - MOVEMENT.gravity * dt, -MOVEMENT.terminalVelocity);

  // Substep so a fast run cannot tunnel a thin wall.
  const travel = Math.max(Math.abs(motion.vx), Math.abs(motion.vz), Math.abs(motion.vy)) * dt;
  const steps = Math.min(MOVEMENT.maxSubsteps, Math.max(1, Math.ceil(travel / MOVEMENT.maxSubstepDistance)));
  const h = dt / steps;
  const wasGrounded = motion.grounded;
  const radius = Number.isFinite(params.radius) && params.radius > 0 ? Math.min(params.radius, 4) : PLAYER_RADIUS;
  let grounded = false;

  for (let i = 0; i < steps; i += 1) {
    collision.moveAxis('x', motion.x, motion.y, motion.z, motion.vx * h, radius, AXIS);
    if (AXIS.hit) motion.vx = 0;
    motion.x = AXIS.value;
    motion.y = AXIS.y;
    collision.moveAxis('z', motion.x, motion.y, motion.z, motion.vz * h, radius, AXIS);
    if (AXIS.hit) motion.vz = 0;
    motion.z = AXIS.value;
    motion.y = AXIS.y;
    collision.clampToBounds(motion, radius);

    const nextY = motion.y + motion.vy * h;
    if (motion.vy <= 0) {
      const floor = collision.floorBelow(motion.x, motion.y, motion.z, radius, 1e-3);
      // Walking down a stair tread stays on the ground rather than hopping off it.
      const snap = wasGrounded && !events.jumped && motion.y - floor <= MOVEMENT.stepHeight + 0.05;
      if (nextY <= floor || snap) {
        motion.y = floor;
        motion.vy = 0;
        grounded = true;
      } else {
        motion.y = nextY;
      }
    } else {
      const ceiling = collision.ceilingAbove(motion.x, motion.y + PLAYER_HEIGHT, motion.z, radius);
      if (nextY + PLAYER_HEIGHT >= ceiling) {
        motion.y = ceiling - PLAYER_HEIGHT;
        motion.vy = 0;
      } else {
        motion.y = nextY;
      }
    }
  }

  // Standing still on a floor is still grounded, even with no fall this step.
  if (!grounded && motion.vy <= 0) {
    const floor = collision.floorBelow(motion.x, motion.y, motion.z, radius, 0.05);
    if (motion.y - floor <= 0.05) {
      motion.y = floor;
      motion.vy = 0;
      grounded = true;
    }
  }
  motion.grounded = grounded;
  if (grounded && !wasGrounded) events.landed = true;
};
