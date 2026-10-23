/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'greedygrowers';

/**
 * Default server port. Override with the PORT env var on the server.
 *
 * 3888: the sibling games on this machine occupy most of 2567-3870, and two
 * servers on one port means whichever starts first silently serves both.
 */
export const DEFAULT_SERVER_PORT = 3888;

/**
 * Most players in ONE room - and so the number of plots on the map. The
 * matchmaker locks a room at this figure and opens another.
 */
export const MAX_PLAYERS_PER_ROOM = 7;

/** How many OTHER players are drawn at once (rendering only; all are synchronised). */
export const VISIBLE_REMOTE_PLAYERS = 6;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

export const MessageType = {
  /** Client -> server: one frame of INPUT. Never a transform. */
  Move: 'move',
  /** Server -> client: authoritative placement. */
  Respawn: 'respawn',
  RequestRespawn: 'requestRespawn',
  /** Client -> server: MARKET, PLOT, SELL, or somebody's plot. */
  Teleport: 'teleport',
  /** Client -> server: take an item in hand. */
  Equip: 'equip',
  /** Client -> server: buy the river seed with this id. */
  BuySeed: 'buySeed',
  /** Client -> server: plant the seed in hand at a world point on your soil. */
  Plant: 'plant',
  /** Client -> server: harvest (or collect, when dead) a tree on your soil. */
  Harvest: 'harvest',
  /** Client -> server: put the tree in hand into a garden spot. */
  GardenPlace: 'gardenPlace',
  /** Client -> server: pick fruit from a garden tree, or take the tree back up. */
  GardenPick: 'gardenPick',
  GardenLift: 'gardenLift',
  /** Client -> server: use the gear in hand on a tree. */
  UseGear: 'useGear',
  /** Client -> server: the fertilizer (and worm) to plant with. */
  SetFertilizer: 'setFertilizer',
  SetWorm: 'setWorm',
  /** Client -> server: favourite / unfavourite an item. */
  Favorite: 'favorite',
  /** Client -> server: the Sell stand's choices. */
  Sell: 'sell',
  /** Client -> server: rebirth. */
  Rebirth: 'rebirth',
  /** Client -> server: claim Index tickets. */
  ClaimIndex: 'claimIndex',
  /** Client -> server: a stall purchase (eggs, gear, worms, furniture, fall seeds, a wheel spin). */
  StallBuy: 'stallBuy',
  /** Client -> server: hand in a Farmers Market or Fall Harvest request. */
  TurnIn: 'turnIn',
  /** Client -> server: hatch an egg, equip or unequip a pet. */
  Hatch: 'hatch',
  EquipPet: 'equipPet',
  /** Client -> server: place or lift furniture. */
  PlaceFurniture: 'placeFurniture',
  RemoveFurniture: 'removeFurniture',
  /** Client -> server: list fruit on your Market Stand, or buy from someone's. */
  StandList: 'standList',
  StandBuy: 'standBuy',
  /** Client -> server: redeem a code. */
  Redeem: 'redeem',
  /** Client -> server: like somebody's plot. */
  Like: 'like',
  /** Client -> server: play an emote. */
  Emote: 'emote',
  /** Client -> server: the tutorial was skipped. */
  Tutorial: 'tutorial',

  /** Server -> client: the owner's private state (cash, inventory...). */
  Self: 'self',
  /** Server -> client: the outcome of a request, for a toast. */
  Notice: 'notice',
  /** Server -> client: a sale. */
  Sold: 'sold',
  /** Server -> client: a one-off world effect (lightning, hatch, rebirth...). */
  Fx: 'fx',
  /** Server -> client: a wheel spin's result, to animate. */
  Spun: 'spun',
  /** Server -> client: what hatched. */
  Hatched: 'hatched',

  SetAvatar: 'setAvatar',
  SetIdentity: 'setIdentity',
  /** Client -> server: the portal's game TOKEN, or null when signed out. */
  SetAuth: 'setAuth',
  AuthState: 'authState',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
