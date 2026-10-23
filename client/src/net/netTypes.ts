import type { AvatarAppearance, AvatarProportions } from '@greedy/shared';
import type { MapSchema } from '@colyseus/schema';

/**
 * Client-side TYPE mirror of the server's Colyseus schema. Types only -
 * colyseus.js builds the concrete schema instances from the handshake.
 */
export interface NetPlayerState {
  sessionId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  speed: number;
  verticalVelocity: number;
  grounded: boolean;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  lastInputSeq: number;
  jumpLatched: boolean;
  jumpCount: number;

  avatar: AvatarAppearance & AvatarProportions;
  displayName: string;
  avatarUrl: string;
  moveSpeed: number;
  jumpVelocity: number;

  plot: number;
  rebirths: number;
  heldKind: number;
  heldId: number;
  heldMut: number;
  heldMult: number;
  heldDead: boolean;
  pet0: number;
  pet1: number;
  pet2: number;
  emoteId: string;
  /** The verified Boxity account id ('' for a guest), for matching chat. */
  accountId: string;
  emoteAt: number;
  actionCount: number;
  ready: boolean;
}

export interface NetSapling {
  id: number;
  seed: number;
  mut: number;
  x: number;
  z: number;
  plantedAt: number;
  rate: number;
  boost: number;
  fert: number;
  dead: boolean;
  deadMult: number;
  deadAt: number;
  predicted: number;
}

export interface NetGardenTree {
  spot: number;
  seed: number;
  mut: number;
  mult: number;
  fruits: number;
  f0: number;
  f1: number;
  f2: number;
  nextAt: number;
}

export interface NetFurniture {
  id: number;
  kind: number;
  x: number;
  z: number;
  rot: number;
}

export interface NetStandSlot {
  seed: number;
  mut: number;
  mult: number;
  price: number;
}

export interface NetPlotState {
  slot: number;
  owner: string;
  ownerName: string;
  ownerAvatar: string;
  likes: number;
  capacity: number;
  gardenSpots: number;
  rebirths: number;
  hasStand: boolean;
  saplings: MapSchema<NetSapling>;
  garden: MapSchema<NetGardenTree>;
  furniture: MapSchema<NetFurniture>;
  stand: MapSchema<NetStandSlot>;
}

export interface NetRiverSeed {
  id: number;
  seed: number;
  mut: number;
  spawnAt: number;
  lane: number;
}

export interface NetLeaderEntry {
  handle: string;
  name: string;
  avatarUrl: string;
  value: number;
}

export type BoardId = 'cash' | 'earned' | 'rebirths' | 'best';

export interface NetLeaderboardState {
  cash: ArrayLike<NetLeaderEntry>;
  earned: ArrayLike<NetLeaderEntry>;
  rebirths: ArrayLike<NetLeaderEntry>;
  best: ArrayLike<NetLeaderEntry>;
}

export interface NetGameState {
  players: MapSchema<NetPlayerState>;
  plots: ArrayLike<NetPlotState>;
  river: MapSchema<NetRiverSeed>;
  now: number;
  elapsed: number;
  weather: number;
  weatherStart: number;
  weatherEnds: number;
  weatherNext: number;
  weatherNextAt: number;
  legendaryAt: number;
  mythicAt: number;
  leaderboard: NetLeaderboardState;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
