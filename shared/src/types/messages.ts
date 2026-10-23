import type { PlaceId } from '../config/map.js';
import type { AvatarAppearance, AvatarProportions } from './avatar.js';
import type { HeldRef } from './profile.js';

/**
 * Client -> server input (MessageType.Move). INPUT ONLY: the server simulates
 * movement from intent and owns the result.
 */
export interface MoveMessage {
  seq: number;
  dt: number;
  moveX: number;
  moveZ: number;
  jump: boolean;
  cameraYaw: number;
}

export type RespawnReason = 'manual' | 'join' | 'teleport';

export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

export interface TeleportMessage {
  /** A named place, your own plot, or somebody's plot ('plot:3'). */
  to: PlaceId | 'plot' | `plot:${number}`;
}

export interface EquipMessage {
  ref: HeldRef;
}

export interface BuySeedMessage {
  id: number;
}

export interface PlantMessage {
  x: number;
  z: number;
}

export interface TreeMessage {
  tree: number;
}

export interface GardenPlaceMessage {
  spot: number;
}

export interface GardenSpotMessage {
  spot: number;
}

export interface UseGearMessage {
  tree: number;
}

export interface SetFertilizerMessage {
  /** 0 = none. */
  id: number;
}

export interface SetWormMessage {
  /** 0 = none. */
  id: number;
}

export interface FavoriteMessage {
  uid: number;
}

/** 'all' sells every tree and fruit not favourited; 'held' the one in hand. */
export interface SellMessage {
  mode: 'all' | 'held';
}

export type StallBuyKind = 'egg' | 'gear' | 'can' | 'furniture' | 'fallSeed' | 'spin';

export interface StallBuyMessage {
  kind: StallBuyKind;
  id: number;
}

export interface TurnInMessage {
  board: 'farmers' | 'fall';
  index: number;
}

export interface HatchMessage {
  egg: number;
}

export interface EquipPetMessage {
  uid: number;
  on: boolean;
}

export interface PlaceFurnitureMessage {
  kind: number;
  /** Plot-local. */
  x: number;
  z: number;
  rot: number;
}

export interface RemoveFurnitureMessage {
  id: number;
}

export interface StandListMessage {
  /** Fruit uid to list (0 clears `slot`). */
  uid: number;
  slot: number;
  price: number;
}

export interface StandBuyMessage {
  plot: number;
  slot: number;
}

export interface RedeemMessage {
  code: string;
}

export interface LikeMessage {
  slot: number;
}

export interface EmoteMessage {
  /** A Boxity emote catalogue id. */
  id: string;
}

export interface TutorialMessage {
  skip: boolean;
}

// ---------------------------------------------------------- server -> client

export interface NoticeMessage {
  kind: 'good' | 'bad' | 'info' | 'gold';
  text: string;
}

export interface SoldMessage {
  amount: number;
  count: number;
}

export interface FxMessage {
  kind: 'strike' | 'nearMiss' | 'blocked' | 'plant' | 'harvest' | 'buy' | 'rebirth' | 'sparkle' | 'announce' | 'fruit';
  x: number;
  z: number;
  /** Extra: a plot slot, a seed id... */
  data?: number;
  text?: string;
}

export interface SpunMessage {
  slice: number;
}

export interface HatchedMessage {
  egg: number;
  pet: number;
}

export interface SetAvatarMessage {
  appearance: AvatarAppearance;
  proportions: AvatarProportions;
}

export interface SetIdentityMessage {
  displayName: string;
  avatarUrl: string;
}

export interface SetAuthMessage {
  token: string | null;
}

export type AuthStatus = 'account' | 'guest' | 'unavailable';

export interface AuthStateMessage {
  status: AuthStatus;
  note?: string;
}
