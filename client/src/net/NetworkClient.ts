import {
  MessageType,
  ROOM_NAME,
  type AuthStateMessage,
  type FxMessage,
  type HatchedMessage,
  type HeldRef,
  type MoveMessage,
  type NoticeMessage,
  type PlaceId,
  type RespawnMessage,
  type SelfState,
  type SetAuthMessage,
  type SetAvatarMessage,
  type SetIdentityMessage,
  type SoldMessage,
  type SpunMessage,
  type StallBuyKind,
} from '@greedy/shared';
import { Client, type Room } from 'colyseus.js';
import { clientConfig } from '../config/clientConfig.js';
import { logger } from '../util/logger.js';
import { takeDeepLinkRoom } from './deepLink.js';
import { locateRoom } from './RoomLocator.js';
import type { BoardId, ConnectionStatus, NetGameState, NetLeaderEntry, NetPlayerState, NetPlotState } from './netTypes.js';

const SCOPE = 'NetworkClient';

/** Key under which this browser's stable player id is kept. */
const PLAYER_ID_KEY = 'greedy.playerId';

/** Backoff between join attempts, in milliseconds. A cold pod can take ~45 s. */
const JOIN_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

/** Past this a join gives up (a database outage excepted, below). */
const GIVE_UP_MS = 60_000;

/** Colyseus' close code for a leave the client asked for. */
const CONSENTED_LEAVE = 4000;

/**
 * Asks Boxity's matchmaker for a game socket (`Legion.SDK.net.resolveEndpoint`)
 * and answers its `endpoint`, or null when there is no Boxity to ask.
 */
export type EndpointResolver = () => Promise<string | null>;

/**
 * The server's "storage unavailable" refusal. Not a failure of THIS join but
 * of the database behind it, so the retry does not give up: it keeps asking
 * at the longest backoff until the server can read profiles again.
 */
const STORAGE_UNAVAILABLE = 4105;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const resolvePlayerId = (): string => {
  const fresh = `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    const existing = window.localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    window.localStorage.setItem(PLAYER_ID_KEY, fresh);
  } catch {
    return fresh;
  }
  return fresh;
};

export interface NetworkHandlers {
  onStatusChange?(status: ConnectionStatus, detail?: string): void;
  onSelfJoined?(sessionId: string): void;
  onRespawn?(message: RespawnMessage): void;
  onSelf?(state: SelfState): void;
  onNotice?(message: NoticeMessage): void;
  onSpun?(message: SpunMessage): void;
  onHatched?(message: HatchedMessage): void;
  onSold?(message: SoldMessage): void;
  onFx?(message: FxMessage): void;
  onAuthState?(message: AuthStateMessage): void;
  /** A state patch landed: players and gardens may have changed. */
  onPatch?(): void;
}

/**
 * Thin wrapper over colyseus.js. The rest of the client never imports
 * colyseus.js directly, and never writes to the room: it READS the replicated
 * state (players, gardens, clock, boards) and SENDS requests.
 */
export class NetworkClient {
  private readonly handlers: NetworkHandlers;
  private client: Client | null = null;
  private room: Room<NetGameState> | null = null;
  private status: ConnectionStatus = 'idle';
  private token: (() => string | null) | null = null;
  private sentToken: string | null | undefined = undefined;
  private look: (() => SetAvatarMessage | null) | null = null;
  private identityOf: (() => SetIdentityMessage) | null = null;
  private resolveEndpoint: EndpointResolver | null = null;
  private hostingId = '';
  /** True while WE are leaving, so the close is not mistaken for a dropped room. */
  private leaving = false;

  /** The server's clock, sampled with the local clock it arrived at. */
  private serverNow = 0;
  private serverNowAt = 0;

  constructor(handlers: NetworkHandlers = {}) {
    this.handlers = handlers;
  }

  setLookProvider(provider: () => SetAvatarMessage | null): void {
    this.look = provider;
  }

  /** How to reach the matchmaker, and the hosting id rooms are listed under. */
  setEndpointResolver(hostingId: string, resolver: EndpointResolver): void {
    this.hostingId = hostingId;
    this.resolveEndpoint = resolver;
  }

  setTokenProvider(provider: () => string | null): void {
    this.token = provider;
  }

  setDisplayProvider(provider: () => SetIdentityMessage): void {
    this.identityOf = provider;
  }

  sendAvatar(message: SetAvatarMessage): void {
    this.room?.send(MessageType.SetAvatar, message);
  }

  sendIdentity(message: SetIdentityMessage): void {
    this.room?.send(MessageType.SetIdentity, message);
  }

  /**
   * Tell the server the login changed (sign-in, sign-out, account switch).
   * The live session switches profile; there is no reconnect. Deduped.
   */
  sendAuth(token: string | null): void {
    if (!this.room) return;
    if (token === this.sentToken) return;
    this.sentToken = token;
    const message: SetAuthMessage = { token };
    this.room.send(MessageType.SetAuth, message);
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get roomId(): string {
    return this.room?.roomId ?? '';
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get connected(): boolean {
    return this.room !== null && this.status === 'connected';
  }

  /**
   * THE SERVER'S WALL CLOCK NOW (ms), extrapolated from its last sample.
   * Growth, restocks, weather and quests are all timed against this, so a
   * player whose own clock is wrong still sees the garden the server sees.
   */
  now(): number {
    if (this.serverNowAt === 0) return Date.now();
    return this.serverNow + (performance.now() - this.serverNowAt);
  }

  get state(): NetGameState | null {
    return this.room?.state ?? null;
  }

  get players(): NetGameState['players'] | null {
    return this.room?.state?.players ?? null;
  }

  plot(slot: number): NetPlotState | null {
    return this.room?.state?.plots?.[slot] ?? null;
  }

  get plots(): ArrayLike<NetPlotState> | null {
    return this.room?.state?.plots ?? null;
  }

  player(sessionId: string): NetPlayerState | null {
    return this.room?.state?.players?.get(sessionId) ?? null;
  }

  board(id: BoardId): NetLeaderEntry[] {
    const rows = this.room?.state?.leaderboard?.[id];
    const out: NetLeaderEntry[] = [];
    if (!rows) return out;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row && row.handle) out.push({ handle: row.handle, name: row.name, avatarUrl: row.avatarUrl, value: row.value });
    }
    return out;
  }

  /**
   * A FRESH Colyseus client for this attempt.
   *
   * Hosted: `Legion.SDK.net.resolveEndpoint` on EVERY attempt, and a NEW
   * Client from each answer - each endpoint is pinned to one pod, and the SDK
   * carries the party ticket and reuses the player's seat on retries. The game
   * socket never goes to the game's own <id>.host address.
   *
   * A dev build (`npm run dev`) talks to the dev server beside it instead.
   */
  private async freshClient(): Promise<Client> {
    if (clientConfig.devServerUrl) return new Client(clientConfig.devServerUrl);
    const endpoint = this.resolveEndpoint ? await this.resolveEndpoint() : null;
    if (!endpoint) throw new Error('the Boxity matchmaker is unavailable (the SDK did not load)');
    return new Client(endpoint);
  }

  /**
   * Join the room a `?roomId=` link named, through the relay of the pod that
   * holds it. Null when it is gone or full: the caller matchmakes as normal.
   */
  private async joinLinked(roomId: string, options: Record<string, unknown>): Promise<Room<NetGameState> | null> {
    try {
      const client = clientConfig.devServerUrl
        ? new Client(clientConfig.devServerUrl)
        : await locateRoom(this.hostingId, roomId).then((found) => (found ? new Client(found.endpoint) : null));
      if (!client) return null;
      return await client.joinById<NetGameState>(roomId, options);
    } catch (error) {
      logger.info(SCOPE, `linked room ${roomId} not joinable (${String(error)}); matchmaking instead`);
      return null;
    }
  }

  async connect(): Promise<void> {
    this.leaving = false;
    this.setStatus('connecting');
    logger.info(SCOPE, `joining "${ROOM_NAME}" ${clientConfig.devServerUrl ? `at ${clientConfig.devServerUrl}` : 'through the Boxity matchmaker'}`);

    const playerId = resolvePlayerId();
    const startedAt = performance.now();
    const linked = takeDeepLinkRoom();
    let joinedWith: string | null = null;
    let room: Room<NetGameState> | null = null;

    for (let attempt = 1; ; attempt += 1) {
      const token = this.token?.() ?? null;
      const options = {
        playerId,
        token,
        avatar: this.look?.() ?? undefined,
        identity: this.identityOf?.() ?? undefined,
      };
      try {
        if (linked && attempt === 1) room = await this.joinLinked(linked, options);
        if (!room) {
          const client = await this.freshClient();
          room = await client.joinOrCreate<NetGameState>(ROOM_NAME, options);
        }
        joinedWith = token;
        break;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const code = (error as { code?: unknown }).code;
        const storageDown = code === STORAGE_UNAVAILABLE;
        logger.warn(SCOPE, `join attempt ${attempt} failed: ${detail}`);
        if (!storageDown && performance.now() - startedAt >= GIVE_UP_MS) {
          this.setStatus('error', detail);
          throw error;
        }
        const wait = JOIN_BACKOFF_MS[Math.min(attempt, JOIN_BACKOFF_MS.length) - 1] ?? 0;
        this.setStatus('connecting', storageDown ? 'the server is waiting for its database' : `attempt ${attempt + 1}`);
        await sleep(wait);
      }
    }

    this.room = room;
    this.sentToken = joinedWith;
    this.bindRoom(room);
    this.setStatus('connected');
    logger.info(SCOPE, `joined roomId=${room.roomId} sessionId=${room.sessionId}`);
    this.handlers.onSelfJoined?.(room.sessionId);
    this.sendAuth(this.token?.() ?? null);
  }

  // ---------------------------------------------------------------- requests

  sendInput(message: MoveMessage): void {
    this.room?.send(MessageType.Move, message);
  }

  teleport(to: PlaceId | 'plot' | `plot:${number}`): void {
    this.send(MessageType.Teleport, { to });
  }

  equip(ref: HeldRef): void {
    this.send(MessageType.Equip, { ref });
  }

  buySeed(id: number): void {
    this.send(MessageType.BuySeed, { id });
  }

  plant(x: number, z: number): void {
    this.send(MessageType.Plant, { x, z });
  }

  harvest(tree: number): void {
    this.send(MessageType.Harvest, { tree });
  }

  gardenPlace(spot: number): void {
    this.send(MessageType.GardenPlace, { spot });
  }

  gardenPick(spot: number): void {
    this.send(MessageType.GardenPick, { spot });
  }

  gardenLift(spot: number): void {
    this.send(MessageType.GardenLift, { spot });
  }

  useGear(tree: number): void {
    this.send(MessageType.UseGear, { tree });
  }

  setFertilizer(id: number): void {
    this.send(MessageType.SetFertilizer, { id });
  }

  setWorm(id: number): void {
    this.send(MessageType.SetWorm, { id });
  }

  favorite(uid: number): void {
    this.send(MessageType.Favorite, { uid });
  }

  sell(mode: 'all' | 'held'): void {
    this.send(MessageType.Sell, { mode });
  }

  rebirth(): void {
    this.send(MessageType.Rebirth, {});
  }

  claimIndex(): void {
    this.send(MessageType.ClaimIndex, {});
  }

  stallBuy(kind: StallBuyKind, id: number): void {
    this.send(MessageType.StallBuy, { kind, id });
  }

  turnIn(board: 'farmers' | 'fall', index: number): void {
    this.send(MessageType.TurnIn, { board, index });
  }

  hatch(egg: number): void {
    this.send(MessageType.Hatch, { egg });
  }

  equipPet(uid: number, on: boolean): void {
    this.send(MessageType.EquipPet, { uid, on });
  }

  placeFurniture(kind: number, x: number, z: number, rot: number): void {
    this.send(MessageType.PlaceFurniture, { kind, x, z, rot });
  }

  removeFurniture(id: number): void {
    this.send(MessageType.RemoveFurniture, { id });
  }

  standList(uid: number, slot: number, price: number): void {
    this.send(MessageType.StandList, { uid, slot, price });
  }

  standBuy(plot: number, slot: number): void {
    this.send(MessageType.StandBuy, { plot, slot });
  }

  redeem(code: string): void {
    this.send(MessageType.Redeem, { code });
  }

  like(slot: number): void {
    this.send(MessageType.Like, { slot });
  }

  emote(id: string): void {
    this.send(MessageType.Emote, { id });
  }

  tutorial(skip: boolean): void {
    this.send(MessageType.Tutorial, { skip });
  }

  /** DEV ONLY: the dev server's cheats (ignored by a production server). */
  dev(message: Record<string, unknown>): void {
    this.send('dev', message);
  }

  private send(type: string, payload: unknown): void {
    this.room?.send(type, payload);
  }

  requestRespawn(): void {
    this.room?.send(MessageType.RequestRespawn, {});
  }

  async disconnect(): Promise<void> {
    this.leaving = true;
    await this.room?.leave(true);
    this.room = null;
    this.sentToken = undefined;
    this.setStatus('disconnected');
  }

  private bindRoom(room: Room<NetGameState>): void {
    room.onStateChange((state) => {
      if (state.now > 0 && state.now !== this.serverNow) {
        this.serverNow = state.now;
        this.serverNowAt = performance.now();
      }
      this.handlers.onPatch?.();
    });

    room.onMessage<RespawnMessage>(MessageType.Respawn, (message) => this.handlers.onRespawn?.(message));
    room.onMessage<SelfState>(MessageType.Self, (message) => this.handlers.onSelf?.(message));
    room.onMessage<NoticeMessage>(MessageType.Notice, (message) => this.handlers.onNotice?.(message));
    room.onMessage<SpunMessage>(MessageType.Spun, (message) => this.handlers.onSpun?.(message));
    room.onMessage<HatchedMessage>(MessageType.Hatched, (message) => this.handlers.onHatched?.(message));
    room.onMessage<SoldMessage>(MessageType.Sold, (message) => this.handlers.onSold?.(message));
    room.onMessage<FxMessage>(MessageType.Fx, (message) => this.handlers.onFx?.(message));
    room.onMessage<AuthStateMessage>(MessageType.AuthState, (message) => {
      logger.info(SCOPE, `playing as ${message.status}${message.note ? ` (${message.note})` : ''}`);
      this.handlers.onAuthState?.(message);
    });

    room.onError((code, message) => {
      logger.error(SCOPE, `room error ${code}: ${message ?? ''}`);
      this.setStatus('error', message);
    });

    room.onLeave((code) => {
      logger.warn(SCOPE, `left room (code ${code})`);
      if (this.room === room) this.room = null;
      this.setStatus('disconnected', `code ${code}`);
      // The room closed under us (a pod restart, a drop): resolve again and
      // rejoin. A leave we asked for is not a drop.
      if (this.leaving || code === CONSENTED_LEAVE) return;
      void this.connect().catch((error: unknown) => logger.error(SCOPE, 'rejoin failed:', error));
    });
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatusChange?.(status, detail);
  }
}
