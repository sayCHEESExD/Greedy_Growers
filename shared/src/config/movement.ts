/**
 * Movement tuning for the gardener: walk and jump. There is no sprint.
 *
 * The client predicts with these numbers and the server simulates with them,
 * so there is exactly one copy.
 */
export interface MovementConfig {
  readonly acceleration: number;
  readonly deceleration: number;
  /** Fraction of ground acceleration retained in the air. */
  readonly airControl: number;
  /** Downward acceleration, world units per second squared. */
  readonly gravity: number;
  /** Turn rate toward the movement direction, radians per second. */
  readonly turnSpeed: number;
  /** Largest distance one substep may integrate. */
  readonly maxSubstepDistance: number;
  readonly maxSubsteps: number;
  /** Height the character steps up without jumping: stair treads and floor slabs. */
  readonly stepHeight: number;
  /** Fastest fall, so a long drop cannot tunnel a floor. */
  readonly terminalVelocity: number;
}

export const MOVEMENT: MovementConfig = {
  acceleration: 120,
  deceleration: 110,
  airControl: 0.55,
  gravity: 70,
  turnSpeed: 12,
  maxSubstepDistance: 0.5,
  maxSubsteps: 40,
  stepHeight: 1.05,
  terminalVelocity: 90,
};

/** How fast a gardener walks, world units per second. Everyone walks at the same pace. */
export const WALK_SPEED = 17;

/** Jump take-off velocity: a hop over a garden fence. */
export const JUMP_VELOCITY = 25;
