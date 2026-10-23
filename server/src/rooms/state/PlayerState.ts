import { Schema, type } from '@colyseus/schema';
import { JUMP_VELOCITY, SPAWN, WALK_SPEED } from '@greedy/shared';
import { AvatarState } from './AvatarState.js';

/**
 * Replicated per-player state: what EVERYBODY needs to draw this player.
 * Every field is written by the SERVER. Cash and inventory are NOT here: they
 * travel to their own client alone, as the Self message.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';

  @type('float32') x: number = SPAWN.x;
  @type('float32') y: number = SPAWN.y;
  @type('float32') z: number = SPAWN.z;
  @type('float32') rotationY: number = SPAWN.yaw;

  @type('float32') speed = 0;
  @type('float32') verticalVelocity = 0;
  @type('boolean') grounded = true;

  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  @type('uint32') lastInputSeq = 0;
  @type('boolean') jumpLatched = false;
  @type('uint32') jumpCount = 0;

  @type(AvatarState) avatar = new AvatarState();
  @type('string') displayName = '';
  @type('string') avatarUrl = '';
  /**
   * The VERIFIED Boxity account id ('' for a guest), so a client can find the
   * character a Boxity chat message (keyed by that id) belongs to. Public: it
   * is the id every Boxity profile page already shows.
   */
  @type('string') accountId = '';

  @type('float32') moveSpeed = WALK_SPEED;
  @type('float32') jumpVelocity = JUMP_VELOCITY;

  /** The plot this player owns (-1 before one is assigned). */
  @type('int8') plot = -1;
  @type('uint8') rebirths = 0;

  /**
   * WHAT IS IN THEIR HAND, for everyone to see: 0 nothing, 1 seeds (seed id),
   * 2 a tree (seed id, mutations, size, dead), 3 a fruit, 4 gear (gear id).
   */
  @type('uint8') heldKind = 0;
  @type('uint16') heldId = 0;
  @type('uint16') heldMut = 0;
  @type('float32') heldMult = 0;
  @type('boolean') heldDead = false;

  /** Equipped pets (pet ids, 0 = none), so everyone draws them following. */
  @type('uint8') pet0 = 0;
  @type('uint8') pet1 = 0;
  @type('uint8') pet2 = 0;

  /**
   * The Boxity emote playing (its catalogue id, '' for none) and when it
   * started, so every client plays it once. Cosmetic: Boxity only offers a
   * player the emotes they are entitled to.
   */
  @type('string') emoteId = '';
  @type('float64') emoteAt = 0;
  /** Bumped on each plant/harvest/buy, so every client plays the gesture. */
  @type('uint16') actionCount = 0;

  @type('boolean') ready = false;
}
