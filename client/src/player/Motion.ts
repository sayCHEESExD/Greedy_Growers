/**
 * WHAT A CHARACTER IS DOING this frame. Written by its owner (the local
 * player's prediction, or a remote's replicated state) and only ever read by
 * its animator.
 */
export interface Motion {
  /** Horizontal speed, world units per second. */
  speed: number;
  grounded: boolean;
  verticalVelocity: number;
  /** Signed yaw rate, radians per second, for the body's lean into a turn. */
  turnRate: number;
  /** True while something is in the right hand: the arm is held out, Roblox-style. */
  holding: boolean;
  /** Seconds since the current tool use began, or -1. */
  actionTime: number;
  /** How the tool is used: a dig, a pour, a plant, a ring, a pick. */
  actionKind: ActionKind;
  /** Seconds since a cheer began, or -1. */
  cheerTime: number;
  /** True on the frame it touched down. */
  landed: boolean;
  /** The Boxity emote playing (its catalogue id, '' none) and seconds since it began. */
  emote: string;
  emoteTime: number;
}

export type ActionKind = 'dig' | 'pour' | 'plant' | 'ring' | 'pick';

export const createMotion = (): Motion => ({
  speed: 0,
  grounded: true,
  verticalVelocity: 0,
  turnRate: 0,
  holding: false,
  actionTime: -1,
  actionKind: 'pick',
  cheerTime: -1,
  landed: false,
  emote: '',
  emoteTime: -1,
});

/** How long one tool use plays. */
export const ACTION_SECONDS = 0.5;
/** A cheer (a purchase, a quest, a house). */
export const CHEER_SECONDS = 1.2;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));
/** 0 -> 1 -> 0 over [a, b]. */
export const bump = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
/** 0 -> 1 over [a, b], held at 1. */
export const ramp = (t: number, a: number, b: number): number => smooth((t - a) / Math.max(1e-6, b - a));
