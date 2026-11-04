import { Client, Room, ServerError } from '@colyseus/core';
import {
  AD_SALE_COOLDOWN_MS,
  MAX_PLAYERS_PER_ROOM,
  MUTATIONS,
  MessageType,
  PLACES,
  PLOT,
  SEEDS,
  SPAWN,
  TUTORIAL,
  accountKeyFor,
  buxProduct,
  dayNumber,
  insideLawn,
  isAccountKey,
  isValidGuestId,
  plotEntrance,
  plotToLocal,
  sanitizeAppearance,
  sanitizeIdentity,
  sanitizeProportions,
  seedById,
  unlocked,
  type AuthStateMessage,
  type AuthStatus,
  type BuySeedMessage,
  type AdRewardMessage,
  type EmoteMessage,
  type EquipMessage,
  type EquipPetMessage,
  type FavoriteMessage,
  type FxMessage,
  type GardenPlaceMessage,
  type HatchMessage,
  type MoveMessage,
  type NoticeMessage,
  type Placement,
  type PlaceFurnitureMessage,
  type PlantMessage,
  type RedeemMessage,
  type RemoveFurnitureMessage,
  type RespawnMessage,
  type RespawnReason,
  type SelfState,
  type SellMessage,
  type SetAuthMessage,
  type SetAvatarMessage,
  type SetFertilizerMessage,
  type SetIdentityMessage,
  type SetWormMessage,
  type StallBuyMessage,
  type StandBuyMessage,
  type StandListMessage,
  type TeleportMessage,
  type TreeMessage,
  type TurnInMessage,
  type TutorialMessage,
  type UseGearMessage,
  type LikeMessage,
} from '@greedy/shared';
import { tokenHash, verifyGameToken } from '../auth/BloxityAuth.js';
import { verifyRewardToken } from '../bloxity/adReward.js';
import { trackFarmers } from '../bloxity/liveFarmers.js';
import { serverConfig } from '../config/serverConfig.js';
import { addCash, addSeeds, addStack, addTickets, equip, syncPets, type Farmer } from '../farm/Farmer.js';
import { MarketService } from '../farm/MarketService.js';
import { PlotService } from '../farm/PlotService.js';
import { RiverService } from '../farm/RiverService.js';
import type { RoomContext } from '../farm/RoomContext.js';
import { WeatherService } from '../farm/WeatherService.js';
import { MovementService } from '../movement/MovementService.js';
import { hasProgress, progressOf, type ProfileFields, type ProgressFields, type StoredProfile } from '../persistence/index.js';
import { buxGrants } from '../progression/BuxGrants.js';
import { leaderboardService } from '../progression/LeaderboardService.js';
import { profileStore } from '../progression/ProfileStore.js';
import { logger } from '../util/logger.js';
import { GameState } from './state/GameState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GameRoom';

/** Seconds between autosaves of every connected player. */
const AUTOSAVE_SECONDS = 15;
/** Milliseconds between looks for purchases waiting on an account. */
const GRANT_POLL_MS = 15_000;
/** Re-verification backoff for a token Bloxity could not be asked about. */
const REVERIFY_FIRST_MS = 15_000;
const REVERIFY_MAX_MS = 120_000;
/** How long a mid-session switch waits for the leaving profile to land before staying put. */
const SWITCH_SAVE_TIMEOUT_MS = 8000;
/** How long a leave or a dispose waits for its save to land before moving on. */
const LEAVE_SAVE_TIMEOUT_MS = 5000;
/** Longest token accepted. Bloxity's are a few hundred bytes. */
const MAX_TOKEN_LENGTH = 4096;
/** Least milliseconds between two gameplay requests from one player. */
const ACTION_GAP_MS = 60;
/** Least milliseconds between two Self snapshots to one player. */
const SELF_GAP_MS = 120;
/** How often the server clock is written into the state. */
const CLOCK_MS = 250;

/** Join refusals. The client's retry/backoff recognises STORAGE_UNAVAILABLE. */
export const JOIN_ERROR = {
  ROOM_FULL: 4103,
  BAD_PLAYER_ID: 4104,
  STORAGE_UNAVAILABLE: 4105,
} as const;

interface JoinOptions {
  /** The browser's own guest id. NEVER an account id; the prefix is refused. */
  playerId?: string;
  /** The portal's game token, or nothing. Verified with Bloxity, never trusted. */
  token?: string | null;
  avatar?: SetAvatarMessage;
  identity?: SetIdentityMessage;
}

/** What onAuth resolves and hands to onJoin. */
interface ResolvedProfile {
  readonly key: string;
  readonly guestKey: string;
  readonly accountKey: string | null;
  readonly token: string | null;
  readonly tokenHash: string;
  readonly status: AuthStatus;
  readonly profile: StoredProfile | null;
  readonly migrated: boolean;
}

/** Per-session identity bookkeeping the replicated state must not carry. */
interface Session {
  key: string;
  guestKey: string;
  accountKey: string | null;
  token: string | null;
  tokenHash: string;
  status: AuthStatus;
  /** True while a login change is being applied: autosaves and grants hold off. */
  switching: boolean;
  queued: SetAuthMessage | null;
  granting: boolean;
  reverifyAt: number;
  reverifyDelay: number;
  grantPollAt: number;
}

/**
 * The authoritative room.
 *
 * Composition only: every farm rule lives in a service, and this decides the
 * order they run in. Nothing a client sends is ever copied into state: a Move
 * is simulated; a purchase, a planting, a harvest or a sale is checked against
 * the server's position of the player, their own plot, hand and purse.
 *
 * WHOSE PROGRESS A SESSION PLAYS ON is decided here too: the client sends its
 * browser id and the portal's TOKEN, Bloxity is asked whose token it is, and
 * the profile is READ FROM STORAGE in onAuth. A read that fails refuses the
 * join - a player is never seated on an empty profile that would autosave
 * over their real one.
 */
export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override autoDispose = true;

  private readonly movement = new MovementService();
  private readonly farmers = new Map<string, Farmer>();
  private readonly sessions = new Map<string, Session>();
  /** Lets go of this room's farmers in the Boxity reporters. */
  private untrack: () => void = () => undefined;

  private readonly ctx: RoomContext = {
    state: undefined as unknown as GameState,
    collision: this.movement.collision,
    now: () => Date.now(),
    random: () => Math.random(),
    notify: (f, kind, text) => this.clientOf(f.sessionId)?.send(MessageType.Notice, { kind, text } satisfies NoticeMessage),
    announce: (kind, text) => this.broadcast(MessageType.Notice, { kind, text } satisfies NoticeMessage),
    send: (f, type, payload) => this.clientOf(f.sessionId)?.send(type, payload),
    fx: (message: FxMessage) => this.broadcast(MessageType.Fx, message),
    tutorial: (f, step) => this.advanceTutorial(f, step),
    discover: (f, seed, mut) => this.discover(f, seed, mut),
    ownerOf: (slot) => {
      const owner = this.state.plots[slot]?.owner;
      return owner ? this.farmers.get(owner) : undefined;
    },
    farmers: () => this.farmers.values(),
  };

  private readonly plots = new PlotService(this.ctx);
  private readonly river = new RiverService(this.ctx);
  private readonly weather = new WeatherService(this.ctx);
  private readonly market = new MarketService(this.ctx, this.plots);

  private autosaveTimer = 0;
  private clockAt = 0;

  override onCreate(): void {
    this.untrack = trackFarmers(() => this.farmers.values());
    this.state = new GameState();
    (this.ctx as { state: GameState }).state = this.state;
    this.state.now = Date.now();
    this.setPatchRate(serverConfig.patchRateMs);
    this.weather.tick();
    this.river.start();

    this.onMessage(MessageType.Move, (client, message: MoveMessage) => this.onMove(client, message));
    this.onMessage(MessageType.RequestRespawn, (client) => this.placeAt(client, SPAWN, 'manual'));
    this.onMessage(MessageType.Teleport, (client, message: TeleportMessage) => this.onTeleport(client, message));
    this.onMessage(MessageType.SetIdentity, (client, message: SetIdentityMessage) => this.onSetIdentity(client, message));
    this.onMessage(MessageType.SetAvatar, (client, message: SetAvatarMessage) => this.onSetAvatar(client, message));
    this.onMessage(MessageType.SetAuth, (client, message: SetAuthMessage) => {
      void this.switchAuth(client, message, false);
    });

    this.action(MessageType.Equip, (f, m: EquipMessage) => equip(f, typeof m?.ref === 'string' ? m.ref.slice(0, 32) : ''));
    this.action(MessageType.BuySeed, (f, m: BuySeedMessage) => this.river.buy(f, Number(m?.id)));
    this.action(MessageType.Plant, (f, m: PlantMessage) => this.plots.plant(f, Number(m?.x), Number(m?.z)));
    this.action(MessageType.Harvest, (f, m: TreeMessage) => this.plots.harvest(f, Number(m?.tree)));
    this.action(MessageType.GardenPlace, (f, m: GardenPlaceMessage) => this.plots.gardenPlace(f, Number(m?.spot)));
    this.action(MessageType.GardenPick, (f, m: GardenPlaceMessage) => this.plots.gardenPick(f, Number(m?.spot)));
    this.action(MessageType.GardenLift, (f, m: GardenPlaceMessage) => this.plots.gardenLift(f, Number(m?.spot)));
    this.action(MessageType.UseGear, (f, m: UseGearMessage) => this.plots.useGear(f, Number(m?.tree)));
    this.action(MessageType.SetFertilizer, (f, m: SetFertilizerMessage) => this.onSetFertilizer(f, Number(m?.id)));
    this.action(MessageType.SetWorm, (f, m: SetWormMessage) => this.onSetWorm(f, Number(m?.id)));
    this.action(MessageType.Favorite, (f, m: FavoriteMessage) => this.onFavorite(f, Number(m?.uid)));
    this.action(MessageType.Sell, (f, m: SellMessage) => this.market.sell(f, m?.mode === 'held' ? 'held' : 'all'));
    this.action(MessageType.Rebirth, (f) => this.market.rebirth(f));
    this.action(MessageType.ClaimIndex, (f) => this.market.claimIndex(f));
    this.action(MessageType.StallBuy, (f, m: StallBuyMessage) => this.market.stallBuy(f, m?.kind, Number(m?.id)));
    this.action(MessageType.TurnIn, (f, m: TurnInMessage) => this.market.turnIn(f, m?.board === 'fall' ? 'fall' : 'farmers', Number(m?.index)));
    this.action(MessageType.Hatch, (f, m: HatchMessage) => this.market.hatchEgg(f, Number(m?.egg)));
    this.action(MessageType.EquipPet, (f, m: EquipPetMessage) => this.market.equipPet(f, Number(m?.uid), m?.on === true));
    this.action(MessageType.PlaceFurniture, (f, m: PlaceFurnitureMessage) => this.plots.placeFurniture(f, Number(m?.kind), Number(m?.x), Number(m?.z), Number(m?.rot)));
    this.action(MessageType.RemoveFurniture, (f, m: RemoveFurnitureMessage) => this.plots.removeFurniture(f, Number(m?.id)));
    this.action(MessageType.StandList, (f, m: StandListMessage) => this.plots.standList(f, Number(m?.uid), Number(m?.slot), Number(m?.price)));
    this.action(MessageType.StandBuy, (f, m: StandBuyMessage) => this.plots.standBuy(f, Number(m?.plot), Number(m?.slot)));
    this.action(MessageType.Redeem, (f, m: RedeemMessage) => this.market.redeem(f, String(m?.code ?? '')));
    this.action(MessageType.Like, (f, m: LikeMessage) => this.onLike(f, Number(m?.slot)));
    this.action(MessageType.Emote, (f, m: EmoteMessage) => this.onEmote(f, m?.id));
    this.action(MessageType.AdReward, (f, m: AdRewardMessage) => void this.onAdReward(f, m?.token));
    this.action(MessageType.Tutorial, (f, m: TutorialMessage) => this.onTutorial(f, m));
    if (serverConfig.devCheats) this.action('dev', (f, m: DevMessage) => this.onDev(f, m));

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), serverConfig.patchRateMs);
    logger.info(SCOPE, `room ${this.roomId} created (capacity ${MAX_PLAYERS_PER_ROOM})`);
  }

  /** A gameplay request: rate limited, and only for a seated farmer. */
  private action<T>(type: string, handle: (f: Farmer, message: T) => void): void {
    this.onMessage(type, (client, message: T) => {
      const f = this.farmers.get(client.sessionId);
      const session = this.sessions.get(client.sessionId);
      if (!f || !session || session.switching) return;
      const now = Date.now();
      if (now - f.lastActionAt < ACTION_GAP_MS) return;
      f.lastActionAt = now;
      handle(f, message);
    });
  }

  private clientOf(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  override async onAuth(client: Client, options: JoinOptions = {}): Promise<ResolvedProfile> {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      logger.warn(SCOPE, `refused a join: room ${this.roomId} is full (${this.clients.length}/${MAX_PLAYERS_PER_ROOM})`);
      throw new ServerError(JOIN_ERROR.ROOM_FULL, 'room is full');
    }
    const guestKey = readGuestKey(options.playerId);
    const token = readToken(options.token);
    try {
      return await this.resolveProfile(guestKey, token, null);
    } catch (error) {
      logger.error(SCOPE, `refused a join: storage unreachable for ${client.sessionId}:`, error);
      throw new ServerError(JOIN_ERROR.STORAGE_UNAVAILABLE, 'storage unavailable, try again shortly');
    }
  }

  override onJoin(client: Client, options: JoinOptions = {}, auth?: ResolvedProfile): void {
    const resolved: ResolvedProfile = auth ?? {
      key: '',
      guestKey: '',
      accountKey: null,
      token: null,
      tokenHash: '',
      status: 'guest',
      profile: null,
      migrated: false,
    };

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    const now = Date.now();
    this.sessions.set(client.sessionId, {
      key: resolved.key,
      guestKey: resolved.guestKey,
      accountKey: resolved.accountKey,
      token: resolved.token,
      tokenHash: resolved.tokenHash,
      status: resolved.status,
      switching: false,
      queued: null,
      granting: false,
      reverifyAt: now + REVERIFY_FIRST_MS,
      reverifyDelay: REVERIFY_FIRST_MS,
      grantPollAt: now + GRANT_POLL_MS,
    });

    if (resolved.profile) {
      player.displayName = resolved.profile.displayName;
      player.avatarUrl = resolved.profile.avatarUrl;
    }
    if (options.avatar) this.writeAvatar(player, options.avatar);
    if (options.identity) {
      const identity = sanitizeIdentity(options.identity, serverConfig.bloxity.staticUrl);
      if (identity.displayName) {
        player.displayName = identity.displayName;
        player.avatarUrl = identity.avatarUrl;
      }
    }

    const f: Farmer = {
      sessionId: client.sessionId,
      key: resolved.key,
      accountId: accountIdOf(resolved.accountKey),
      profile: profileStore.progressFrom(resolved.profile),
      player,
      plot: null,
      dirty: true,
      lastSelfAt: 0,
      lastActionAt: 0,
      petTimers: new Map(),
      predictions: new Map(),
      ranks: { cash: 0, earned: 0, rebirths: 0, best: 0 },
    };
    player.accountId = f.accountId ?? '';
    this.state.players.set(client.sessionId, player);
    this.farmers.set(client.sessionId, f);
    this.movement.initialise(player);
    this.seat(f);

    this.placeAt(client, this.homeOf(f), 'join');
    this.sendAuthState(client, resolved.status);
    this.flushSelf(f, true);
    if (resolved.accountKey) void this.applyGrants(client.sessionId);

    logger.info(
      SCOPE,
      `join ${client.sessionId} as ${describe(resolved)} (${resolved.profile ? 'restored' : 'new'}) ` +
        `plot=${f.plot?.slot ?? -1} cash=${f.profile.cash} rebirths=${f.profile.rebirths}`,
    );
  }

  /** Give a farmer a plot and restore their hand and pets. */
  private seat(f: Farmer): void {
    const free = this.state.plots.find((plot) => !plot.owner);
    if (free) this.plots.load(f, free);
    this.market.rollDay(f);
    syncPets(f);
    equip(f, f.profile.equipped);
  }

  /** Where a player appears: by the river for the tutorial, their plot afterwards. */
  private homeOf(f: Farmer): Placement {
    if (f.profile.tutorial < TUTORIAL.done || !f.plot) return SPAWN;
    return plotEntrance(f.plot.slot);
  }

  override async onLeave(client: Client): Promise<void> {
    const f = this.farmers.get(client.sessionId);
    const key = this.sessions.get(client.sessionId)?.key;
    const fields = f ? this.fieldsOf(f) : null;

    if (f?.plot) this.plots.unload(f.plot);
    this.state.players.delete(client.sessionId);
    this.farmers.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.sessions.delete(client.sessionId);

    logger.info(SCOPE, `leave ${client.sessionId}`);
    if (fields && key) await this.saveBounded(key, fields);
  }

  override async onDispose(): Promise<void> {
    this.untrack();
    const saves: Promise<void>[] = [];
    for (const [sessionId, f] of this.farmers) {
      const key = this.sessions.get(sessionId)?.key;
      if (key) saves.push(this.saveBounded(key, this.fieldsOf(f)));
    }
    await Promise.all(saves);
    logger.info(SCOPE, `room ${this.roomId} disposed`);
  }

  // ------------------------------------------------------------- identity

  /**
   * WHOSE PROFILE, and the profile itself, read from storage now.
   *
   * With a token, Bloxity is asked. Verified -> the account key; the
   * account's own profile always wins. If the account has none and this
   * browser's guest has real progress, the guest's progress becomes the
   * account's - insert-only, so two pods racing for the same first login
   * create one profile - and the guest is then retired.
   *
   * Rejected -> a guest. Unavailable -> a guest FOR NOW, re-asked on a backoff.
   * Throws when storage cannot be read. Callers refuse or stay put.
   */
  private async resolveProfile(guestKey: string, token: string | null, live: ProfileFields | null): Promise<ResolvedProfile> {
    let status: AuthStatus = 'guest';
    let accountKey: string | null = null;
    let carriedFrom: readonly string[] = [];
    const hash = token ? tokenHash(token) : '';
    if (token) {
      const outcome = await verifyGameToken(token);
      if (outcome.status === 'verified') {
        accountKey = accountKeyFor(outcome.accountId);
        carriedFrom = outcome.carriedFrom;
        status = 'account';
      } else if (outcome.status === 'unavailable') {
        status = 'unavailable';
      }
    }

    if (accountKey) {
      let profile = await profileStore.load(accountKey);
      let migrated = false;
      if (!profile && guestKey) {
        const guest = await profileStore.load(guestKey);
        const retired = Boolean(guest?.migratedTo);
        const source: ProfileFields | null =
          live ?? (guest ? { ...progressOf(guest), displayName: guest.displayName, avatarUrl: guest.avatarUrl, updatedAt: guest.updatedAt } : null);
        if (!retired && source && hasProgress(source)) {
          const created = { ...source, updatedAt: Date.now(), migratedFrom: guestKey };
          if (await profileStore.insertIfAbsent(accountKey, created)) {
            // Only AFTER the account holds it is the guest copy retired.
            await profileStore.retireGuest(guestKey, accountKey, progressOf(source), {
              displayName: source.displayName,
              avatarUrl: source.avatarUrl,
            });
            profile = await profileStore.load(accountKey);
            migrated = true;
            logger.info(SCOPE, `migrated guest ${guestKey} into ${accountKey} (cash=${source.cash})`);
          } else {
            logger.info(SCOPE, `lost the first-login race for ${accountKey}; loading the winner`);
            profile = await profileStore.load(accountKey);
          }
        }
      }
      if (!profile && carriedFrom.length) {
        const carried = await this.carryGuestProgress(accountKey, carriedFrom);
        if (carried) {
          profile = carried;
          migrated = true;
        }
      }
      return { key: accountKey, guestKey, accountKey, token, tokenHash: hash, status, profile, migrated };
    }

    const profile = guestKey ? await profileStore.load(guestKey) : null;
    return { key: guestKey, guestKey, accountKey: null, token, tokenHash: hash, status, profile, migrated: false };
  }

  /**
   * BOXITY GUEST PROGRESS FOLLOWING A SIGN-IN (CrazyGames players start as
   * Boxity guests, whose saves live under their guest account id).
   *
   * Only for an account with NO progress in this game: the first guest in
   * `carriedFrom` that still holds unretired progress is copied in -
   * insert-only, as above - and then retired, so one guest save can never be
   * copied into a second account. An account that has progress is never
   * touched; the caller only gets here when it has none.
   */
  private async carryGuestProgress(accountKey: string, carriedFrom: readonly string[]): Promise<StoredProfile | null> {
    for (const guestId of carriedFrom) {
      const guestKey = accountKeyFor(guestId);
      const guest = await profileStore.load(guestKey);
      if (!guest || guest.migratedTo) continue;
      const source: ProfileFields = { ...progressOf(guest), displayName: guest.displayName, avatarUrl: guest.avatarUrl, updatedAt: guest.updatedAt };
      if (!hasProgress(source)) continue;
      if (!(await profileStore.insertIfAbsent(accountKey, { ...source, updatedAt: Date.now(), migratedFrom: guestKey }))) {
        return profileStore.load(accountKey);
      }
      await profileStore.retireGuest(guestKey, accountKey, progressOf(source), { displayName: source.displayName, avatarUrl: source.avatarUrl });
      logger.info(SCOPE, `carried Boxity guest ${guestKey} into ${accountKey} (cash=${source.cash})`);
      return profileStore.load(accountKey);
    }
    return null;
  }

  /**
   * A LOGIN CHANGE ON THE LIVE SESSION: sign-in, sign-out, account switch, or
   * a re-ask about a token Bloxity was unavailable for. Save the profile being
   * left, resolve the new one, and re-seat the gardener on it.
   */
  private async switchAuth(client: Client, message: SetAuthMessage, reverify: boolean): Promise<void> {
    const session = this.sessions.get(client.sessionId);
    const g = this.farmers.get(client.sessionId);
    if (!session || !g) return;

    const token = readToken(message?.token);
    if (session.switching) {
      session.queued = { token };
      return;
    }
    const hash = token ? tokenHash(token) : '';
    if (!reverify && hash === session.tokenHash) return;

    session.switching = true;
    try {
      const leavingKey = session.key;
      const wasGuest = session.accountKey === null;
      const live = this.fieldsOf(g);

      if (leavingKey) {
        const landed = await withTimeout(profileStore.save(leavingKey, live), SWITCH_SAVE_TIMEOUT_MS);
        if (!landed) {
          logger.warn(SCOPE, `${client.sessionId}: storage did not take the leaving save; staying on ${leavingKey}`);
          this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
          return;
        }
      }

      let target: ResolvedProfile;
      try {
        target = await this.resolveProfile(session.guestKey, token, wasGuest ? live : null);
      } catch (error) {
        logger.warn(SCOPE, `${client.sessionId}: storage unreachable during a login change; staying put:`, error);
        this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
        return;
      }

      session.token = target.token;
      session.tokenHash = target.tokenHash;
      if (target.status === 'unavailable') {
        session.reverifyDelay = Math.min(REVERIFY_MAX_MS, session.reverifyDelay * 2);
        session.reverifyAt = Date.now() + session.reverifyDelay;
      } else {
        session.reverifyDelay = REVERIFY_FIRST_MS;
      }

      if (target.key === session.key) {
        session.status = target.status;
        this.sendAuthState(client, target.status);
        return;
      }

      // Re-seat on the new profile, on the same plot.
      const plot = g.plot;
      if (plot) this.plots.unload(plot);
      g.profile = profileStore.progressFrom(target.profile);
      g.key = target.key;
      g.accountId = accountIdOf(target.accountKey);
      g.player.accountId = g.accountId ?? '';
      g.plot = null;
      g.petTimers.clear();
      g.predictions.clear();
      if (plot) this.plots.load(g, plot);
      this.market.rollDay(g);
      syncPets(g);
      equip(g, g.profile.equipped);
      session.key = target.key;
      session.accountKey = target.accountKey;
      session.status = target.status;
      this.placeAt(client, this.homeOf(g), 'join');
      this.flushSelf(g, true);

      if (target.key) await this.saveBounded(target.key, this.fieldsOf(g));
      this.sendAuthState(client, target.status);
      leaderboardService.rebuild(this.state.leaderboard, this.farmers.values());
      logger.info(SCOPE, `${client.sessionId} switched ${leavingKey || '(none)'} -> ${describe(target)}${target.migrated ? ' [migrated]' : ''}`);
    } finally {
      session.switching = false;
      const queued = session.queued;
      session.queued = null;
      if (queued) void this.switchAuth(client, queued, false);
      else if (session.accountKey) void this.applyGrants(client.sessionId);
    }
  }

  private sendAuthState(client: Client, status: AuthStatus, note?: string): void {
    const message: AuthStateMessage = note ? { status, note } : { status };
    client.send(MessageType.AuthState, message);
  }

  // ---------------------------------------------------------------- input

  private onMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.movement.applyInput(client.sessionId, player, message);
  }

  /** A teleport is to a NAMED place the server knows, your own plot, or somebody's. */
  private onTeleport(client: Client, message: TeleportMessage): void {
    const f = this.farmers.get(client.sessionId);
    if (!f) return;
    const to = String(message?.to ?? '');
    if (to === 'plot') {
      if (f.plot) this.placeAt(client, plotEntrance(f.plot.slot), 'teleport');
      return;
    }
    const visit = /^plot:(\d{1,2})$/.exec(to);
    if (visit) {
      const plot = this.state.plots[Number(visit[1])];
      if (plot?.owner) this.placeAt(client, plotEntrance(plot.slot), 'teleport');
      return;
    }
    if (to in PLACES) this.placeAt(client, PLACES[to as keyof typeof PLACES], 'teleport');
  }

  private onSetFertilizer(f: Farmer, id: number): void {
    const p = f.profile;
    if (id === 0) p.fertilizer = 0;
    else if (unlocked(p.rebirths, 'fertilizer')) {
      const fert = [1, 2, 3, 4].includes(id) ? id : 0;
      const need = [0, 1, 3, 5, 7][fert] ?? 99;
      if (p.rebirths >= need) p.fertilizer = fert;
    }
    f.dirty = true;
  }

  private onSetWorm(f: Farmer, id: number): void {
    const p = f.profile;
    p.worm = id > 0 && p.worms.some((w) => w.id === id) ? id : 0;
    f.dirty = true;
  }

  private onFavorite(f: Farmer, uid: number): void {
    const p = f.profile;
    const tree = p.trees.findIndex((t) => t.uid === uid);
    if (tree >= 0) p.trees[tree] = { ...p.trees[tree]!, fav: !p.trees[tree]!.fav };
    const fruit = p.fruits.findIndex((t) => t.uid === uid);
    if (fruit >= 0) p.fruits[fruit] = { ...p.fruits[fruit]!, fav: !p.fruits[fruit]!.fav };
    f.dirty = true;
  }

  private onLike(f: Farmer, slot: number): void {
    const plot = this.state.plots[Math.floor(slot)];
    if (!plot?.owner || plot.owner === f.sessionId) return;
    const owner = this.farmers.get(plot.owner);
    if (!owner) return;
    const local = plotToLocal(plot.slot, f.player.x, f.player.z);
    const near = Math.hypot(local.x - PLOT.sign.x, local.z - PLOT.sign.z) < 14 || insideLawn(local.x, local.z, 4);
    if (!near) return;
    const today = dayNumber(Date.now());
    if (f.profile.likedDay !== today) {
      f.profile.likedDay = today;
      f.profile.likedKeys = [];
    }
    const ownerKey = owner.key || owner.sessionId;
    if (f.profile.likedKeys.includes(ownerKey)) {
      this.ctx.notify(f, 'info', 'You already liked this plot today!');
      return;
    }
    f.profile.likedKeys.push(ownerKey);
    owner.profile.likes += 1;
    plot.likes = owner.profile.likes;
    f.dirty = true;
    owner.dirty = true;
    this.ctx.notify(f, 'good', `You liked ${owner.player.displayName || 'their'}'s plot!`);
    this.ctx.notify(owner, 'gold', `${f.player.displayName || 'Someone'} liked your plot!`);
  }

  /**
   * A REWARDED AD WAS WATCHED: "2x next sale". Granted ONLY when Boxity
   * verifies the token (once per token, this game, within five minutes) - a
   * client saying it watched one is worth nothing. One at a time per player,
   * and not again until the cooldown has run.
   */
  private async onAdReward(f: Farmer, token: unknown): Promise<void> {
    if (typeof token !== 'string' || !token || token.length > 4096 || f.adPending) return;
    const p = f.profile;
    if (p.saleBoost) {
      this.ctx.notify(f, 'info', 'Your next sale already pays double!');
      return;
    }
    if (p.adSaleAt && Date.now() < p.adSaleAt + AD_SALE_COOLDOWN_MS) {
      this.ctx.notify(f, 'info', 'That bonus is cooling down. Try again soon!');
      return;
    }
    f.adPending = true;
    try {
      const valid = await verifyRewardToken(token);
      // The player may have left (or switched profile) while Boxity answered.
      if (this.farmers.get(f.sessionId) !== f) return;
      if (!valid) {
        this.ctx.notify(f, 'bad', 'The ad reward could not be confirmed.');
        return;
      }
      f.profile.saleBoost = true;
      f.profile.adSaleAt = Date.now();
      f.dirty = true;
      this.ctx.notify(f, 'gold', 'Your next sale pays 2x!');
    } finally {
      f.adPending = false;
    }
  }

  /**
   * A Boxity emote. Cosmetic, so the id is only shape-checked: ownership is
   * Boxity's (it only offers entitled emotes) and an unknown id plays nothing.
   */
  private onEmote(f: Farmer, id: unknown): void {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return;
    f.player.emoteId = id;
    f.player.emoteAt = Date.now();
  }

  private advanceTutorial(f: Farmer, step: number): void {
    if (f.profile.tutorial !== step) return;
    f.profile.tutorial = step + 1;
    f.dirty = true;
    if (f.profile.tutorial === TUTORIAL.done) this.ctx.notify(f, 'gold', 'Nice! Now grow bigger trees - but watch out for the lightning!');
  }

  private onTutorial(f: Farmer, m: TutorialMessage): void {
    if (f.profile.tutorial >= TUTORIAL.done || m?.skip !== true) return;
    f.profile.tutorial = TUTORIAL.done;
    f.dirty = true;
  }

  /** Record a seed and its mutations in the Index; a first sighting is news. */
  private discover(f: Farmer, seedId: number, mut: number): void {
    const p = f.profile;
    const seed = seedById(seedId);
    if (!seed) return;
    const bit = 2 ** (seedId - 1);
    const fresh = Math.floor(p.discoveredSeeds / bit) % 2 === 0;
    if (fresh) p.discoveredSeeds += bit;
    const newMuts = mut & ~p.discoveredMutations;
    p.discoveredMutations |= mut;
    if (!fresh && !newMuts) return;
    f.dirty = true;
    if (!unlocked(p.rebirths, 'index')) return;
    const names = [...(fresh ? [`${seed.name} Seed`] : []), ...MUTATIONS.filter((m) => newMuts & m.bit).map((m) => m.name)];
    this.ctx.notify(f, 'gold', `New in your Index: ${names.join(', ')}! Claim your Tickets.`);
  }

  /** DEV ONLY (--dev-cheats): cash, tickets, seeds, rebirths, growth and teleports for testing. */
  private onDev(f: Farmer, m: DevMessage): void {
    const p = f.profile;
    if (typeof m?.cash === 'number') addCash(f, Math.min(1e30, m.cash), false);
    if (typeof m?.tickets === 'number') addTickets(f, Math.min(1e6, m.tickets));
    if (typeof m?.seed === 'number' && seedById(m.seed)) addSeeds(f, m.seed, typeof m.mut === 'number' ? m.mut : 0, Math.min(50, m.count ?? 1));
    if (typeof m?.rebirths === 'number') {
      p.rebirths = Math.max(0, Math.min(7, Math.floor(m.rebirths)));
      if (f.plot) this.plots.applyRebirths(f, f.plot);
    }
    if (typeof m?.egg === 'number') addStack(p.eggs, m.egg, 1);
    if (typeof m?.grow === 'number') this.plots.devGrow(f, m.grow);
    if (m?.tutorialDone) p.tutorial = TUTORIAL.done;
    if (m?.discoverAll) {
      for (const s of SEEDS) if (Math.floor(p.discoveredSeeds / 2 ** (s.id - 1)) % 2 === 0) p.discoveredSeeds += 2 ** (s.id - 1);
    }
    if (typeof m?.weather === 'string') this.weather.force(m.weather as never, 'A tester');
    if (Array.isArray(m?.tp) && m.tp.length === 2) {
      const client = this.clientOf(f.sessionId);
      if (client) this.placeAt(client, { x: Number(m.tp[0]), y: 0, z: Number(m.tp[1]), yaw: f.player.rotationY }, 'teleport');
    }
    if (m?.crashes) this.ctx.notify(f, 'info', `crashes: ${this.plots.devCrashes(f).map((c) => c.toFixed(2)).join(', ')}`);
    f.dirty = true;
  }

  // ------------------------------------------------------- identity events

  private onSetAvatar(client: Client, message: SetAvatarMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.writeAvatar(player, message);
  }

  private onSetIdentity(client: Client, message: SetIdentityMessage): void {
    const f = this.farmers.get(client.sessionId);
    if (!f) return;
    const identity = sanitizeIdentity(message, serverConfig.bloxity.staticUrl);
    if (f.player.displayName === identity.displayName && f.player.avatarUrl === identity.avatarUrl) return;
    f.player.displayName = identity.displayName;
    f.player.avatarUrl = identity.avatarUrl;
    if (f.plot) {
      f.plot.ownerName = identity.displayName;
      f.plot.ownerAvatar = identity.avatarUrl;
    }
    this.persist(f);
  }

  private writeAvatar(player: PlayerState, message: SetAvatarMessage): void {
    player.avatar.apply(sanitizeAppearance(message?.appearance), sanitizeProportions(message?.proportions));
  }

  // ----------------------------------------------------------------- clock

  private tick(delta: number): void {
    const now = Date.now();
    this.state.elapsed += delta;
    if (now - this.clockAt >= CLOCK_MS) {
      this.clockAt = now;
      this.state.now = now;
    }
    this.tickSessions();
    this.weather.tick();
    this.river.tick();
    this.plots.tick();
    for (const f of this.farmers.values()) {
      if (f.player.ready) f.profile.playSeconds += delta;
      this.market.tickPets(f);
      if (f.plot && f.plot.likes !== f.profile.likes) f.plot.likes = f.profile.likes;
      this.flushSelf(f, false);
    }
    leaderboardService.update(delta, this.state.leaderboard, this.farmers.values());

    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      for (const f of this.farmers.values()) this.persist(f);
    }
  }

  /** Send the owner their private state, when it changed (throttled). */
  private flushSelf(f: Farmer, force: boolean): void {
    if (!f.dirty && !force) return;
    const now = Date.now();
    if (!force && now - f.lastSelfAt < SELF_GAP_MS) return;
    const client = this.clientOf(f.sessionId);
    if (!client) return;
    f.dirty = false;
    f.lastSelfAt = now;
    client.send(MessageType.Self, this.selfOf(f));
  }

  private selfOf(f: Farmer): SelfState {
    const p = f.profile;
    const today = dayNumber(Date.now());
    const likedSlots: number[] = [];
    if (p.likedDay === today) {
      for (const plot of this.state.plots) {
        if (!plot.owner) continue;
        const owner = this.farmers.get(plot.owner);
        if (owner && p.likedKeys.includes(owner.key || owner.sessionId)) likedSlots.push(plot.slot);
      }
    }
    const predictions: Record<number, number> = {};
    for (const [id, value] of f.predictions) predictions[id] = value;
    return {
      cash: p.cash,
      tickets: p.tickets,
      tokens: p.tokens,
      rebirths: p.rebirths,
      totalEarned: p.totalEarned,
      bestTree: p.bestTree,
      playSeconds: p.playSeconds,
      likes: p.likes,
      tutorial: p.tutorial,
      seeds: p.seeds,
      trees: p.trees,
      fruits: p.fruits,
      pets: p.pets,
      equippedPets: p.equippedPets,
      eggs: p.eggs,
      gear: p.gear,
      worms: p.worms,
      furniture: p.furniture,
      equipped: p.equipped,
      fertilizer: p.fertilizer,
      worm: p.worm,
      discoveredSeeds: p.discoveredSeeds,
      discoveredMutations: p.discoveredMutations,
      claimedSeeds: p.claimedSeeds,
      claimedMutations: p.claimedMutations,
      requestDay: p.requestDay,
      farmersDone: p.farmersDone,
      fallDone: p.fallDone,
      codes: p.codes,
      likedSlots,
      predictions,
      saleBoost: p.saleBoost,
      adSaleReadyAt: p.adSaleAt ? p.adSaleAt + AD_SALE_COOLDOWN_MS : 0,
    };
  }

  /** Re-asks about tokens Bloxity was unavailable for, and polls for purchases. */
  private tickSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.switching) continue;
      if (session.status === 'unavailable' && session.token && now >= session.reverifyAt) {
        session.reverifyAt = now + session.reverifyDelay;
        const client = this.clientOf(sessionId);
        if (client) void this.switchAuth(client, { token: session.token }, true);
      }
      if (session.accountKey && now >= session.grantPollAt) {
        session.grantPollAt = now + GRANT_POLL_MS;
        void this.applyGrants(sessionId);
      }
    }
  }

  // ---------------------------------------------------------------- grants

  /**
   * Pay out what the webhook recorded for this account: CLAIM (atomic per
   * grant, so no other pod pays the same one), hand over the product, SAVE
   * the profile, and only then mark the grants applied.
   */
  private async applyGrants(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    const f = this.farmers.get(sessionId);
    if (!session || !f || !session.accountKey || session.switching || session.granting) return;
    const accountKey = session.accountKey;
    session.granting = true;
    try {
      const grants = await buxGrants.claim(accountKey);
      if (grants.length === 0) return;
      if (this.sessions.get(sessionId) !== session || session.accountKey !== accountKey || session.switching) {
        logger.warn(SCOPE, `left ${grants.length} claimed grant(s) for ${accountKey} to a later session`);
        return;
      }
      for (const grant of grants) {
        const product = buxProduct(grant.sku);
        if (product?.grant.kind === 'egg') {
          addStack(f.profile.eggs, product.grant.id, product.grant.count);
          this.ctx.notify(f, 'gold', `Thank you! ${product.name} added to your Pets.`);
        } else if (product?.grant.kind === 'tickets') {
          addTickets(f, product.grant.count);
          this.ctx.notify(f, 'gold', `Thank you! +${product.grant.count} Tickets.`);
        } else if (product?.grant.kind === 'weather') {
          this.weather.force(product.grant.weather, f.player.displayName);
        }
        f.dirty = true;
        logger.info(SCOPE, `granted ${grant.sku} to ${sessionId} [${grant.transactionId}]`);
      }
      await profileStore.save(accountKey, this.fieldsOf(f));
      await buxGrants.settle(grants.map((grant) => grant.transactionId));
    } catch (error) {
      logger.warn(SCOPE, `could not pay grants for ${accountKey}: ${String(error)}`);
    } finally {
      session.granting = false;
    }
  }

  // ------------------------------------------------------------- placement

  /** THE one way a player is placed. */
  private placeAt(client: Client, placement: Placement, reason: RespawnReason): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.movement.teleport(client.sessionId, player, placement.x, placement.y, placement.z, placement.yaw);
    const message: RespawnMessage = { x: placement.x, y: placement.y, z: placement.z, rotationY: placement.yaw, reason };
    client.send(MessageType.Respawn, message);
  }

  // ----------------------------------------------------------------- saves

  /** Everything a save writes for a live farmer: their profile with their plot folded back in. */
  private fieldsOf(f: Farmer): ProfileFields {
    const progress: ProgressFields = { ...f.profile, plot: f.plot ? this.plots.snapshot(f.plot) : f.profile.plot };
    return { ...progress, displayName: f.player.displayName, avatarUrl: f.player.avatarUrl, updatedAt: Date.now() };
  }

  /** A routine save. Held while the session is changing login. */
  private persist(f: Farmer): void {
    const session = this.sessions.get(f.sessionId);
    if (!session || !session.key || session.switching) return;
    void this.saveQuietly(session.key, this.fieldsOf(f));
  }

  private async saveQuietly(key: string, fields: ProfileFields): Promise<void> {
    try {
      await profileStore.save(key, fields);
    } catch (error) {
      logger.error(SCOPE, `save of ${key} failed:`, error);
    }
  }

  /** A save that is waited for only so long; it stays queued and retried regardless. */
  private async saveBounded(key: string, fields: ProfileFields): Promise<void> {
    const landed = await withTimeout(this.saveQuietly(key, fields), LEAVE_SAVE_TIMEOUT_MS);
    if (!landed) logger.warn(SCOPE, `save of ${key} is queued; it lands when storage is back`);
  }
}

interface DevMessage {
  cash?: number;
  tickets?: number;
  seed?: number;
  mut?: number;
  count?: number;
  rebirths?: number;
  egg?: number;
  grow?: number;
  tutorialDone?: boolean;
  discoverAll?: boolean;
  weather?: string;
  tp?: number[];
  crashes?: boolean;
}

/** The account id inside an account key, or null. */
const accountIdOf = (accountKey: string | null): string | null => (accountKey && isAccountKey(accountKey) ? accountKey.slice('bloxity:'.length) : null);

/** A guest key from a join option: valid, or empty when none was sent. Refuses the account prefix. */
const readGuestKey = (raw: unknown): string => {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'string' && isAccountKey(raw)) {
    logger.warn(SCOPE, `refused a join: browser id carries the account prefix`);
    throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  }
  if (!isValidGuestId(raw)) {
    logger.warn(SCOPE, `refused a join: malformed browser id`);
    throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  }
  return raw;
};

const readToken = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_TOKEN_LENGTH ? raw : null;

const describe = (resolved: ResolvedProfile): string => {
  if (resolved.accountKey) return `account ${resolved.accountKey}`;
  const key = resolved.guestKey || '(no id)';
  return resolved.status === 'unavailable' ? `guest ${key} (bloxity unavailable, will re-ask)` : `guest ${key}`;
};

/** True if the promise settled within the deadline; it keeps running either way. */
const withTimeout = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
