import type { FxMessage, NoticeMessage, WorldCollision } from '@greedy/shared';
import type { GameState } from '../rooms/state/GameState.js';
import type { Farmer } from './Farmer.js';

/**
 * What a farm service may ask of the room: the clock, the world, and ways to
 * tell players things. Services hold no connections of their own.
 */
export interface RoomContext {
  readonly state: GameState;
  readonly collision: WorldCollision;
  now(): number;
  random(): number;
  notify(f: Farmer, kind: NoticeMessage['kind'], text: string): void;
  /** A notice to everyone in the room. */
  announce(kind: NoticeMessage['kind'], text: string): void;
  send(f: Farmer, type: string, payload: unknown): void;
  fx(message: FxMessage): void;
  /** The tutorial step `step` was completed (ignored unless the player is on it). */
  tutorial(f: Farmer, step: number): void;
  /** Record a seed (and its mutations) in the player's Index. */
  discover(f: Farmer, seed: number, mut: number): void;
  /** The farmer currently holding a plot slot, if any. */
  ownerOf(slot: number): Farmer | undefined;
  farmers(): Iterable<Farmer>;
}
