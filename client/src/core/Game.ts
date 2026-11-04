import {
  AD_SALE_PLACEMENT,
  FERTILIZERS,
  MUTATIONS,
  PLOT,
  PLOTS,
  RARITIES,
  RIVER,
  SEEDS,
  SPAWN,
  STALLS,
  TUTORIAL,
  TUTORIAL_TEXT,
  WHEEL,
  WorldCollision,
  deadValue,
  eggById,
  fertilizerCost,
  formatMoney,
  formatMult,
  formatPrice,
  formatTimer,
  fruitValue,
  furnitureById,
  furnitureProblem,
  gardenSpot,
  insideLawn,
  insideSoil,
  multAt,
  mutationLabel,
  mutationsOf,
  nextRebirth,
  petById,
  plotToLocal,
  plotToWorld,
  seedById,
  stallFront,
  treeValue,
  unlockLevel,
  unlocked,
  visibleName,
  weatherFromIndex,
  wormById,
  type FxMessage,
  type NoticeMessage,
  type SelfState,
  type SoldMessage,
  type StallId,
} from '@greedy/shared';
import { Group, Mesh, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { AudioManager } from '../audio/AudioManager.js';
import { PlayerAudio } from '../audio/PlayerAudio.js';
import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { Bloxity, GAME_SLUG } from '../bloxity/Bloxity.js';
import type { LegionChatMessage, LegionReservedArea } from '../bloxity/legionTypes.js';
import { lookFromLegion } from '../bloxity/avatarLook.js';
import { identityFromLegion } from '../bloxity/identity.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { InputManager } from '../input/InputManager.js';
import { buildFurniture } from '../models/furniture.js';
import { treeHeight } from '../models/greedyTrees.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { BoardId, ConnectionStatus, NetPlotState, NetRiverSeed } from '../net/netTypes.js';
import { buildHeldModel, heldKeyOf } from '../player/held.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { PetFollowers } from '../player/PetFollowers.js';
import { playerModelLoader } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { PartBuilder } from '../render/PartBuilder.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { BloxityPanel } from '../ui/BloxityPanel.js';
import { Hud, type HotbarItem, type PlantOption } from '../ui/Hud.js';
import { IconFactory } from '../ui/IconFactory.js';
import { anyModalOpen, closeTopModal, onModalChange, topModalPanel } from '../ui/Modal.js';
import {
  Dialogue,
  type DialogueOption,
  IndexWindow,
  ItemsWindow,
  LeaderboardWindow,
  PetsWindow,
  RebirthWindow,
  Reveal,
  ShopWindow,
  StallWindow,
  StandWindow,
} from '../ui/windows.js';
import { WorldOverlay, type LabelLine } from '../ui/WorldOverlay.js';
import { logger } from '../util/logger.js';
import { Chevrons } from '../world/Chevrons.js';
import { Effects } from '../world/Effects.js';
import { FarmWorld } from '../world/FarmWorld.js';
import { PlotView } from '../world/PlotView.js';
import { RiverView } from '../world/RiverView.js';
import { Sky } from '../world/Sky.js';
import { tickWater } from '../world/Terrain.js';
import { Weather } from '../world/Weather.js';

const SCOPE = 'Game';

/** What to tell a player whose rewarded ad did not complete: the real reason, never a blanket "it did not finish". */
const adResultMessage = (status: string, reason?: string): string => {
  switch (status) {
    case 'skipped':
      return 'The ad was skipped, so no bonus this time.';
    case 'no-fill':
      return 'No ad is available right now. Try again in a little while.';
    case 'blocked':
      return 'Ads are blocked in this browser, so the bonus is unavailable.';
    case 'denied':
      return reason ? `The ad was not allowed: ${reason}.` : 'The ad was not allowed right now.';
    case 'disabled':
      return 'Ads are not available here.';
    default:
      return 'The ad could not play. Please try again later.';
  }
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT';
};

/** How close to something to get its prompt. */
const PROMPT = { seed: 7, tree: 9, garden: 7, stall: 12, sign: 8, stand: 7 } as const;
/** Labels show within these ranges. */
const LABEL_RANGE = { seed: 34, tree: 60 } as const;
/** How far past a keeper's prompt reach a conversation survives (so it does not flicker at the edge). */
const TALK_GIVE = 1.5;
/** How far a player may wander from where a conversation started before it ends. */
const TALK_WANDER = 6;

interface Target {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly distance: number;
  readonly action: string;
  readonly activate: () => void;
}

type Listing = { slot: number; seed: number; mut: number; mult: number; price: number }[];

/**
 * THE COMPOSITION ROOT. Owns every subsystem and the per-frame order - input,
 * prediction, the replicated world, prompts and labels, the HUD, the render -
 * and no gameplay rules: every seed bought, tree harvested and dollar earned
 * is the server's. The client asks, and draws what the server says.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly collision = new WorldCollision();
  private readonly network: NetworkClient;
  private readonly remotePlayers: RemotePlayerManager;
  private readonly sky = new Sky();
  private world!: FarmWorld;
  private readonly river = new RiverView();
  private readonly plots: PlotView[] = [];
  private readonly effects = new Effects();
  private readonly weather: Weather;
  private readonly chevrons = new Chevrons();
  private readonly audio = new AudioManager();
  private readonly playerAudio: PlayerAudio;
  private readonly bloxity: Bloxity;
  private readonly bloxityPanel: BloxityPanel;
  private readonly fpsReadout: HTMLDivElement;
  private readonly pets = new PetFollowers();

  private readonly hud: Hud;
  private readonly icons: IconFactory;
  private readonly overlay: WorldOverlay;
  private readonly items: ItemsWindow;
  private readonly rebirth: RebirthWindow;
  private readonly shop: ShopWindow;
  private readonly index: IndexWindow;
  private readonly petsWindow: PetsWindow;
  private readonly boards: LeaderboardWindow;
  private readonly stall: StallWindow;
  private readonly stand: StandWindow;
  private readonly dialogue: Dialogue;
  private readonly reveal: Reveal;

  private localPlayer: LocalPlayer | null = null;
  private dresser: AvatarDresser | null = null;
  private pendingAvatar: (() => void) | null = null;
  private localSessionId: string | null = null;
  private self: SelfState | null = null;
  private patched = false;
  /** The held item, as the player last asked for it (the server confirms). */
  private equipped = '';
  private time = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private lastTutorial = -1;
  private boardTimer = 0;
  private guaranteeSecond = -1;
  private placing = 0;
  private placingRot = 0;
  private ghost: Group | null = null;
  private ghostKey = '';
  private readonly ghostMaterial = new MeshBasicMaterial({ color: 0x5aff7a, transparent: true, opacity: 0.55, depthWrite: false });
  /** The keepers' prompts stay quiet until then (just after a conversation closed). */
  private talkQuietUntil = 0;
  /** An ad break is playing: the frame holds still. */
  private adBreak = false;
  /** Where the open conversation started, or null. */
  private talkAnchor: { x: number; z: number } | null = null;
  /** The SELL button asked for the counter: open it on arrival, until then. 0 = not waiting. */
  private sellOnArrival = 0;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();
  private readonly flash: HTMLDivElement;
  private flashLevel = 0;
  private pendingSpin = -1;

  constructor(container: HTMLElement) {
    this.renderer = new RendererManager(container);
    this.icons = new IconFactory(this.renderer.renderer);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene, buildHeldModel);
    this.weather = new Weather(this.sceneManager, this.sky);
    this.playerAudio = new PlayerAudio(this.audio);

    this.overlay = new WorldOverlay(container);
    this.flash = document.createElement('div');
    this.flash.className = 'gg-flash';
    container.appendChild(this.flash);
    this.hud = new Hud(container, {
      market: () => this.goTo('market'),
      plot: () => this.goTo('plot'),
      sell: () => this.goTo('sell'),
      shop: () => this.shop.toggle(),
      items: () => this.items.toggle(),
      rebirth: () => this.rebirth.toggle(),
      index: () => this.index.toggle(),
      leaderboard: () => this.boards.toggle(),
      pets: () => this.petsWindow.toggle(),
      sound: () => this.audio.toggleMuted(),
      equip: (ref) => this.equip(ref),
      fertilizer: (id) => this.network.setFertilizer(id),
      worm: (id) => this.network.setWorm(id),
      skipTutorial: () => {
        this.network.tutorial(true);
        this.hud.notice('Tutorial skipped. Happy growing!', 'info');
      },
    });
    this.items = new ItemsWindow(container, this.icons, {
      equip: (ref) => {
        this.equip(ref);
        this.items.close();
      },
      favorite: (uid) => this.network.favorite(uid),
      hatch: (egg) => this.network.hatch(egg),
      pet: (uid, on) => this.network.equipPet(uid, on),
      furniture: (kind) => {
        this.items.close();
        this.startPlacing(kind);
      },
    });
    this.rebirth = new RebirthWindow(container, () => {
      this.network.rebirth();
      this.rebirth.close();
    });
    this.shop = new ShopWindow(container, this.icons, {
      buy: async (sku) => {
        const result = await this.bloxity.requestPurchase(sku, { gameMode: 'greedy' });
        return result.success ? 'Purchased! It will arrive in a few seconds.' : result.error ?? 'Purchase cancelled.';
      },
      redeem: (code) => this.network.redeem(code),
    });
    this.index = new IndexWindow(container, this.icons, () => this.network.claimIndex());
    this.petsWindow = new PetsWindow(container, this.icons, {
      hatch: (egg) => this.network.hatch(egg),
      pet: (uid, on) => this.network.equipPet(uid, on),
    });
    this.boards = new LeaderboardWindow(container, (board) => this.network.board(board));
    this.stall = new StallWindow(container, this.icons, {
      buy: (kind, id) => {
        this.audio.play('click');
        this.network.stallBuy(kind, id);
      },
      turnIn: (board, index) => this.network.turnIn(board, index),
    });
    this.stand = new StandWindow(container, this.icons, {
      list: (uid, slot, price) => this.network.standList(uid, slot, price),
      buy: (plot, slot) => this.network.standBuy(plot, slot),
    });
    this.dialogue = new Dialogue(container);
    this.reveal = new Reveal(container);

    this.bloxity = new Bloxity({
      setMasterVolume: (level) => this.audio.setMasterVolume(level),
      setMusicVolume: (level) => this.audio.setMusicVolume(level),
      setGraphicsQuality: (level) => this.renderer.setQuality(level),
      setShowFps: (show) => {
        this.fpsReadout.hidden = !show;
      },
      setCameraSensitivity: (scale) => this.input.look.setSensitivityScale(scale),
      respawn: () => this.network.requestRespawn(),
      pointerLockChanged: () => undefined,
      avatarChanged: (equipped, proportions) => {
        const look = lookFromLegion(equipped, proportions);
        this.network.sendAvatar(look);
        const apply = (): void => this.dresser?.setLook(look.appearance, look.proportions);
        if (this.dresser) apply();
        else this.pendingAvatar = apply;
      },
      // Boxity draws the picker; the game plays the clip and replicates it.
      playEmote: (id) => {
        this.localPlayer?.character.emote(id);
        this.network.emote(id);
      },
      chatMessage: (message) => this.showChatBubble(message),
    });
    this.bloxityPanel = new BloxityPanel(container, this.bloxity);

    this.fpsReadout = document.createElement('div');
    this.fpsReadout.className = 'aoe-fps aoe-font';
    this.fpsReadout.hidden = true;
    container.appendChild(this.fpsReadout);

    // The crosshair, while the cursor is locked to the camera: a click picks what it is on.
    const crosshair = document.createElement('div');
    crosshair.className = 'gg-crosshair';
    crosshair.hidden = true;
    container.appendChild(crosshair);
    this.input.look.onLockChange((locked) => {
      crosshair.hidden = !locked;
      document.body.classList.toggle('gg-locked', locked);
    });

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('pointerdown', this.onGesture);
    this.renderer.onResize((width, height) => {
      this.camera.setViewport(width, height);
      // Boxity's corner is sized by the window too: ask it again rather than wait to be told.
      this.avoidReserved(this.bloxity.reservedAreas());
    });

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        this.localSessionId = sessionId;
        this.bloxity.updateRoom(this.network.roomId);
      },
      onPatch: () => {
        this.patched = true;
      },
      onRespawn: (message) => {
        const player = this.localPlayer;
        if (!player) return;
        player.teleport(message.x, message.y, message.z, message.rotationY);
        this.input.look.setYaw(message.rotationY);
      },
      onSelf: (state) => this.onSelf(state),
      onNotice: (message) => this.onNotice(message),
      onSold: (message) => this.onSold(message),
      onFx: (message) => this.onFx(message),
      onSpun: (message) => this.onSpun(message.slice),
      onHatched: (message) => this.onHatched(message.egg, message.pet),
    });
    // Hosted: every connect resolves a socket through Boxity's matchmaker.
    this.network.setEndpointResolver(GAME_SLUG, async () => (await this.bloxity.resolveEndpoint(GAME_SLUG))?.endpoint ?? null);
    this.network.setTokenProvider(() => this.bloxity.getToken());
    this.network.setLookProvider(() => lookFromLegion(this.bloxity.getEquipped(), this.bloxity.getProportions()));
    this.network.setDisplayProvider(() => identityFromLegion(this.bloxity.getUser(), this.bloxity.getGuest()));
    this.bloxity.onUserChanged((user) => {
      this.network.sendAuth(this.bloxity.getToken());
      this.network.sendIdentity(identityFromLegion(user, this.bloxity.getGuest()));
    });
  }

  // ------------------------------------------------------------- lifecycle

  startBloxity(): void {
    this.bloxity.start();
    // Ad breaks may start at any time: pause the game and mute it, then resume.
    this.bloxity.ads.onBreak(
      () => this.setAdBreak(true),
      () => this.setAdBreak(false),
    );
    // Screen ads: every full-screen panel is a 'panel' screen, laid out round the panel on top.
    onModalChange(() => this.bloxity.ads.setPanel(topModalPanel()));
    // Boxity's toolbar and chat feed own the top-left: the HUD keeps clear.
    this.bloxity.onReservedAreasChange((areas) => this.avoidReserved(areas));
    document.body.classList.toggle('aoe-portal-embedded', this.bloxity.embedded);
  }

  /** Keep the HUD's rails clear of the screen areas Boxity draws over on the left. */
  /** Hold the game still and silent for an ad break, and let it go after. */
  private setAdBreak(on: boolean): void {
    this.adBreak = on;
    this.audio.setAdHold(on);
    this.input.setSuppressed(on || anyModalOpen());
    if (on) this.input.look.release();
  }

  private avoidReserved(areas: readonly LegionReservedArea[]): void {
    this.bloxity.ads.setReserved(areas);
    const half = window.innerWidth / 2;
    const bottom = areas.filter((area) => area.left < half).reduce((most, area) => Math.max(most, area.top + area.height), 0);
    this.hud.avoidReserved(bottom);
  }

  loadingStep(text: string): void {
    this.bloxity.loadingStep(text);
  }

  async initialise(): Promise<void> {
    const scene = this.sceneManager.scene;
    await playerModelLoader.load();
    this.world = new FarmWorld();
    for (let i = 0; i < PLOTS.length; i += 1) {
      const view = new PlotView(i);
      this.plots.push(view);
      scene.add(view.root);
    }
    scene.add(this.sky.root, this.world.root, this.river.root, this.effects.root, this.chevrons.root, this.pets.root);

    this.localPlayer = new LocalPlayer(this.collision);
    this.dresser = new AvatarDresser(this.localPlayer.character);
    this.pendingAvatar?.();
    this.pendingAvatar = null;
    scene.add(this.localPlayer.character.root);
    this.camera.setMountHeight(this.localPlayer.character.height);
    this.localPlayer.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw);
    this.input.look.setYaw(SPAWN.yaw);
    this.camera.snapTo(this.localPlayer.position);
    logger.info(SCOPE, 'world ready');
  }

  async connect(): Promise<void> {
    await this.network.connect();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
    this.bloxity.loadingEnd();
    this.bloxity.gameplayStart();
  }

  stop(): void {
    this.input.detach();
    this.bloxity.gameplayEnd();
    this.bloxity.updateRoom('');
    void this.network.disconnect();
  }

  /** For the dev testkit. */
  get net(): NetworkClient {
    return this.network;
  }

  // ----------------------------------------------------------------- frame

  update(delta: number, _now: number): void {
    // An ad break: the game holds still and silent until Boxity ends it.
    if (this.adBreak) return;
    const now = this.network.now();
    this.time += delta;
    const modal = anyModalOpen();
    this.input.setSuppressed(modal);
    // Free roam: no menu, no keeper's options, a mouse. Only then may a click
    // lock the cursor to the camera; anything else hands it straight back.
    this.input.look.setLockAllowed(!modal && !this.dialogue.isOpen && !this.input.touchActive);
    const input = this.input.sample();
    const player = this.localPlayer;

    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);
    this.camera.setZoom(this.input.look.zoom);

    if (this.patched) {
      this.patched = false;
      this.syncPlayers();
    }

    if (player) {
      player.update(delta, input, this.input.look.yaw);
      const placement = player.consumePlacement();
      if (placement !== 'none') this.camera.snapTo(player.position, false);
      this.camera.setTarget(player.position);
      this.sceneManager.followShadow(player.position.x, player.position.y, player.position.z);
      for (const message of player.drainOutgoing()) this.network.sendInput(message);
      this.playerAudio.update(delta, {
        horizontalSpeed: player.horizontalSpeed,
        isGrounded: player.isGrounded,
        jumpedEdge: player.jumpedEdge,
        landedEdge: player.landedEdge,
        hip: 1.5,
      });
      this.syncLocalHeld();
      const root = player.character.root;
      this.pets.update(delta, this.time, root.position.x, root.position.y, root.position.z, root.rotation.y, player.horizontalSpeed > 1);
    }

    const px = player?.position.x ?? 0;
    const pz = player?.position.z ?? 0;
    this.syncPlots(now, delta);
    this.river.update(this.network.state?.river ?? null, now, this.time);
    this.remotePlayers.advance(delta, player?.position ?? null);
    this.sky.follow(this.camera.camera.position.x, this.camera.camera.position.z);
    this.sky.update(delta);
    tickWater(delta);
    const kind = weatherFromIndex(this.network.state?.weather ?? 0);
    this.weather.update(delta, kind, this.time, this.camera.camera.position.x, this.camera.camera.position.z);
    this.world.update(delta, this.time);
    this.effects.update(delta);
    this.camera.update(delta, player?.horizontalSpeed ?? 0);
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(0, this.flashLevel - delta * 4);
      this.flash.style.opacity = this.flashLevel.toFixed(3);
    }

    this.overlay.begin(this.camera.camera, this.renderer.width, this.renderer.height);
    if (player && !modal) this.handlePicks();
    if (player) this.updateWorldUi(now, px, pz, modal);
    this.watchTalk();
    this.overlay.end();
    this.updateHud(now);
    this.updateTutorial(now);
    this.updateGhost();
    this.updateBoards(now, delta);
    this.tickFps(delta);

    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  // ------------------------------------------------------------ replication

  private syncPlayers(): void {
    const players = this.network.players;
    if (!players) return;
    const seen = new Set<string>();
    players.forEach((state, sessionId) => {
      seen.add(sessionId);
      if (sessionId === this.localSessionId) {
        const player = this.localPlayer;
        if (!player) return;
        player.setParams(state.moveSpeed, state.jumpVelocity);
        player.setDisplayName(state.displayName, state.avatarUrl);
        this.pets.set([state.pet0, state.pet1, state.pet2]);
        if (state.ready) {
          player.reconcile({
            x: state.x,
            y: state.y,
            z: state.z,
            rotationY: state.rotationY,
            velocityX: state.velocityX,
            velocityY: state.velocityY,
            velocityZ: state.velocityZ,
            grounded: state.grounded,
            jumpLatched: state.jumpLatched,
            jumpCount: state.jumpCount,
            lastInputSeq: state.lastInputSeq,
          });
        }
        return;
      }
      if (this.remotePlayers.has(sessionId)) this.remotePlayers.update(sessionId, state);
      else {
        this.remotePlayers.add(sessionId, state);
        if (state.displayName) this.bloxity.playerJoined(state.displayName);
      }
    });
    this.remotePlayers.retain(seen);
  }

  /** The local hand: what the player asked for, shown at once. */
  private syncLocalHeld(): void {
    const player = this.localPlayer;
    if (!player) return;
    const ref = this.equipped;
    let kind = 0;
    let id = 0;
    let mut = 0;
    let mult = 0;
    let dead = false;
    const seed = /^seed:(\d+):(\d+)$/.exec(ref);
    if (seed) {
      kind = 1;
      id = Number(seed[1]);
      mut = Number(seed[2]);
    } else if (ref.startsWith('tree:')) {
      const item = this.self?.trees.find((t) => t.uid === Number(ref.slice(5)));
      if (item) {
        kind = 2;
        id = item.seed;
        mut = item.mut;
        mult = item.mult;
        dead = item.dead;
      }
    } else if (ref.startsWith('fruit:')) {
      const item = this.self?.fruits.find((t) => t.uid === Number(ref.slice(6)));
      if (item) {
        kind = 3;
        id = item.seed;
        mut = item.mut;
      }
    } else if (ref.startsWith('gear:')) {
      kind = 4;
      id = Number(ref.slice(5));
    }
    player.character.setHeld(heldKeyOf(kind, id, mut, mult, dead), () => buildHeldModel(kind, id, mut, mult, dead));
  }

  private mySlot(): number {
    if (!this.localSessionId) return -1;
    return this.network.player(this.localSessionId)?.plot ?? -1;
  }

  private myPlot(): NetPlotState | null {
    const slot = this.mySlot();
    return slot >= 0 ? this.network.plot(slot) : null;
  }

  private syncPlots(now: number, delta: number): void {
    const states = this.network.plots;
    const camera = this.camera.camera.position;
    const mine = this.mySlot();
    for (let i = 0; i < this.plots.length; i += 1) {
      const state = states?.[i];
      if (!state) continue;
      const view = this.plots[i]!;
      const near = Math.hypot(camera.x - view.root.position.x, camera.z - view.root.position.z) < 200;
      view.update(state, now, this.time, delta, near || i === mine);
    }
  }

  // --------------------------------------------------------------- clicks

  private rayFrom(x: number, y: number): void {
    this.pointer.set((x / this.renderer.width) * 2 - 1, -(y / this.renderer.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera.camera);
  }

  private groundHit(y: number): Vector3 | null {
    this.plane.constant = -y;
    return this.raycaster.ray.intersectPlane(this.plane, this.hit) ? this.hit : null;
  }

  private handlePicks(): void {
    for (const pick of this.input.look.consumePicks()) {
      this.rayFrom(pick.x, pick.y);
      if (this.placing) {
        this.placeClick();
        continue;
      }
      // Holding a seed: a click on your own soil plants there.
      if (/^seed:/.test(this.equipped)) {
        const plot = this.myPlot();
        const point = this.groundHit(PLOT.soilTop);
        if (!plot || !point) continue;
        const local = plotToLocal(plot.slot, point.x, point.z);
        if (insideSoil(local.x, local.z, 0.8)) this.plantAt(point.x, point.z);
      }
    }
  }

  private plantAt(x: number, z: number): void {
    const plot = this.myPlot();
    if (!plot) return;
    if (plot.saplings.size >= plot.capacity) {
      this.hud.notice(plot.capacity === 1 ? 'Your plot is full! Harvest your tree first.' : 'Your plot is full!', 'bad');
      this.audio.play('refuse');
      return;
    }
    const local = plotToLocal(plot.slot, x, z);
    let crowded = false;
    plot.saplings.forEach((s) => {
      if (Math.hypot(s.x - local.x, s.z - local.z) < PLOT.spacing) crowded = true;
    });
    if (crowded) {
      this.hud.notice('Too close to another tree!', 'bad');
      this.audio.play('refuse');
      return;
    }
    this.localPlayer?.faceToward(x, z);
    this.localPlayer?.character.act('plant');
    this.audio.play('plant');
    this.network.plant(x, z);
  }

  // ------------------------------------------------------- furniture mode

  private startPlacing(kind: number): void {
    if (!furnitureById(kind)) return;
    if (!this.inOwnPlot()) {
      this.hud.notice('Go to your plot to place furniture!', 'info');
      this.goTo('plot');
    }
    this.placing = kind;
    this.placingRot = 0;
    this.ghostKey = '';
    this.equip('');
    this.hud.notice('Click your lawn to place it. R rotates, Esc cancels.', 'info');
  }

  private stopPlacing(): void {
    this.placing = 0;
    if (this.ghost) this.ghost.visible = false;
  }

  private placeLocal(): { x: number; z: number } | null {
    const plot = this.myPlot();
    const hit = this.groundHit(0);
    if (!plot || !hit) return null;
    const local = plotToLocal(plot.slot, hit.x, hit.z);
    return { x: Math.round(local.x * 2) / 2, z: Math.round(local.z * 2) / 2 };
  }

  private placeClick(): void {
    const plot = this.myPlot();
    const local = this.placeLocal();
    if (!plot || !local) return;
    // Clicking furniture already there picks it back up.
    let picked = 0;
    plot.furniture.forEach((d) => {
      const def = furnitureById(d.kind);
      if (def && Math.abs(d.x - local.x) < def.hx && Math.abs(d.z - local.z) < def.hz) picked = d.id;
    });
    const problem = furnitureProblem(plot.furniture.values(), this.placing, local.x, local.z, this.placingRot);
    if (problem) {
      if (picked) {
        this.network.removeFurniture(picked);
        this.audio.play('pop');
        return;
      }
      this.hud.notice(problem, 'bad');
      this.audio.play('refuse');
      return;
    }
    this.audio.play('plant');
    this.network.placeFurniture(this.placing, local.x, local.z, this.placingRot);
    const left = (this.self?.furniture.find((f) => f.id === this.placing)?.count ?? 1) - 1;
    if (left <= 0) this.stopPlacing();
  }

  private updateGhost(): void {
    const plot = this.myPlot();
    const pointer = this.input.look.pointer;
    if (!this.placing || !plot || !pointer || this.input.look.dragging) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const view = this.plots[plot.slot]!;
    const key = `${this.placing}:${this.placingRot}:${plot.slot}`;
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      this.ghost?.removeFromParent();
      const b = new PartBuilder();
      buildFurniture(b, this.placing);
      const group = b.build('ghost', false);
      group.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.isMesh) mesh.material = this.ghostMaterial;
      });
      group.rotation.y = this.placingRot * (Math.PI / 2);
      this.ghost = group;
      view.root.add(group);
    }
    this.rayFrom(pointer.x, pointer.y);
    const local = this.placeLocal();
    if (!local || !this.ghost) return;
    this.ghost.visible = true;
    this.ghost.position.set(local.x, 0.02, local.z);
    const ok = furnitureProblem(plot.furniture.values(), this.placing, local.x, local.z, this.placingRot) === null;
    this.ghostMaterial.color.setHex(ok ? 0x5aff7a : 0xff5a5a);
  }

  // ------------------------------------------------------ prompts & labels

  private inOwnPlot(): boolean {
    const plot = this.myPlot();
    const p = this.localPlayer?.position;
    if (!plot || !p) return false;
    const local = plotToLocal(plot.slot, p.x, p.z);
    return insideLawn(local.x, local.z, 2);
  }

  private nearestTarget(px: number, pz: number, now: number): Target | null {
    let best: Target | null = null;
    const offer = (target: Target): void => {
      if (!best || target.distance < best.distance) best = target;
    };
    const ref = this.equipped;
    // River seeds: Buy.
    this.network.state?.river.forEach((s: NetRiverSeed) => {
      const at = RiverView.positionOf(s, now);
      const d = Math.hypot(at.x - px, at.z - pz);
      if (d > PROMPT.seed || at.x > RIVER.endX) return;
      offer({ x: at.x, y: 0.4, z: at.z, distance: d, action: 'Buy', activate: () => this.buySeed(s) });
    });
    const plot = this.myPlot();
    if (plot) {
      // Your saplings: Harvest, or Collect a dead one; with a potion in hand, use it.
      plot.saplings.forEach((s) => {
        const at = plotToWorld(plot.slot, s.x, s.z);
        const d = Math.hypot(at.x - px, at.z - pz);
        if (d > PROMPT.tree) return;
        const potion = ref.startsWith('gear:') && !s.dead;
        offer({ x: at.x, y: 1.4, z: at.z, distance: d, action: potion ? 'Use' : s.dead ? 'Collect' : 'Harvest', activate: () => (potion ? this.network.useGear(s.id) : this.harvest(s.id, at.x, at.z)) });
      });
      // Holding a seed on your soil: Plant Seed, right where you stand.
      if (/^seed:/.test(ref)) {
        const local = plotToLocal(plot.slot, px, pz);
        if (insideSoil(local.x, local.z, 0.8)) offer({ x: px, y: 1.2, z: pz, distance: 0.5, action: 'Plant Seed', activate: () => this.plantAt(px, pz) });
      }
      // The garden row: plant a carried tree, pick fruit, lift a tree.
      for (let i = 0; i < plot.gardenSpots; i += 1) {
        const spot = gardenSpot(i);
        const at = plotToWorld(plot.slot, spot.x, spot.z);
        const d = Math.hypot(at.x - px, at.z - pz);
        if (d > PROMPT.garden) continue;
        const tree = plot.garden.get(String(i));
        if (tree) {
          if (tree.fruits > 0) offer({ x: at.x, y: 2.4, z: at.z, distance: d, action: 'Pick Fruit', activate: () => this.network.gardenPick(i) });
          else offer({ x: at.x, y: 2.4, z: at.z, distance: d + 2, action: 'Pick Up Tree', activate: () => this.network.gardenLift(i) });
        } else if (ref.startsWith('tree:')) {
          offer({ x: at.x, y: 1.6, z: at.z, distance: d, action: 'Plant in Garden', activate: () => this.network.gardenPlace(i) });
        }
      }
      // Your market stand.
      if (plot.hasStand) {
        const at = plotToWorld(plot.slot, PLOT.stand.x, PLOT.stand.z);
        const d = Math.hypot(at.x - px, at.z - pz);
        if (d < PROMPT.stand) offer({ x: at.x, y: 3, z: at.z, distance: d, action: 'Market Stand', activate: () => this.openStand(plot.slot) });
      }
    }
    // Other plots: like the sign, browse the stand.
    const states = this.network.plots;
    if (states) {
      for (let i = 0; i < states.length; i += 1) {
        const state = states[i];
        if (!state?.owner || state.owner === this.localSessionId) continue;
        const sign = plotToWorld(i, PLOT.sign.x, PLOT.sign.z);
        const d = Math.hypot(sign.x - px, sign.z - pz);
        if (d < PROMPT.sign) {
          const liked = this.self?.likedSlots.includes(i) ?? false;
          offer({ x: sign.x, y: 4, z: sign.z, distance: d, action: liked ? 'Liked!' : 'Like', activate: () => this.like(i, liked) });
        }
        if (state.hasStand && state.stand.size > 0) {
          const at = plotToWorld(i, PLOT.stand.x, PLOT.stand.z);
          const ds = Math.hypot(at.x - px, at.z - pz);
          if (ds < PROMPT.stand) offer({ x: at.x, y: 3, z: at.z, distance: ds, action: 'Market Stand', activate: () => this.openStand(i) });
        }
      }
    }
    // The stall keepers (quiet for a moment after a conversation closes).
    for (const stall of performance.now() < this.talkQuietUntil || this.dialogue.isOpen || this.stall.isOpen ? [] : STALLS) {
      const front = stallFront(stall);
      const d = Math.hypot(front.x - px, front.z - pz);
      if (d > PROMPT.stall) continue;
      offer({ x: stall.x, y: 5.2, z: stall.z + Math.cos(stall.yaw) * (stall.hz - 2), distance: d + 1, action: stall.id === 'sell' ? 'Sell' : 'Talk', activate: () => this.talk(stall.id) });
    }
    return best;
  }

  private updateWorldUi(now: number, px: number, pz: number, modal: boolean): void {
    const touch = document.body.classList.contains('aoe-touch-mode');
    if (!modal && !this.placing) {
      const target = this.nearestTarget(px, pz, now);
      if (target) this.overlay.setPrompt({ key: 'E', object: '', action: target.action, activate: target.activate }, target.x, target.y, target.z, touch);
    }
    const scaleFor = (d: number): number => Math.max(0.32, Math.min(1.1, 18 / Math.max(1, d)));
    // River seed billboards: the nearest dozen.
    const seeds: { s: NetRiverSeed; d: number; x: number; z: number }[] = [];
    this.network.state?.river.forEach((s: NetRiverSeed) => {
      const at = RiverView.positionOf(s, now);
      if (at.x > RIVER.endX) return;
      const d = Math.hypot(at.x - px, at.z - pz);
      if (d < LABEL_RANGE.seed) seeds.push({ s, d, x: at.x, z: at.z });
    });
    seeds.sort((a, b) => a.d - b.d);
    for (const { s, d, x, z } of seeds.slice(0, 10)) {
      const seed = seedById(s.seed);
      if (!seed) continue;
      const lines: LabelLine[] = [];
      if (s.mut) lines.push({ text: mutationLabel(s.mut), className: 'gg-l-mut', color: mutationsOf(s.mut)[0]?.color });
      lines.push({ text: `${seed.name} Seed`, className: 'gg-l-name' });
      lines.push({ text: RARITIES[seed.rarity].name, className: 'gg-l-rarity', color: RARITIES[seed.rarity].color });
      lines.push({ text: formatPrice(seed.price), className: 'gg-l-price', color: (this.self?.cash ?? 0) >= seed.price ? '#4dff4a' : '#ff5a5a' });
      this.overlay.label(`seed:${s.id}`, x, 2.4, z, lines, scaleFor(d));
    }
    // Tree billboards on every plot nearby: mutation, value (red once struck) and multiplier.
    const states = this.network.plots;
    const mine = this.mySlot();
    if (states) {
      for (let i = 0; i < states.length; i += 1) {
        const state = states[i];
        if (!state?.owner) continue;
        const centre = PLOTS[i]!;
        if (Math.hypot(centre.x - px, centre.z - pz) > LABEL_RANGE.tree + 20) continue;
        state.saplings.forEach((s) => {
          const at = plotToWorld(i, s.x, s.z);
          const d = Math.hypot(at.x - px, at.z - pz);
          if (d > LABEL_RANGE.tree) return;
          const seed = seedById(s.seed);
          if (!seed) return;
          const mult = s.dead ? s.deadMult : multAt(s.plantedAt, s.rate, now, s.boost);
          const value = s.dead ? deadValue(seed, mult, s.mut) : treeValue(seed, mult, s.mut);
          const lines: LabelLine[] = [];
          if (s.mut) lines.push({ text: mutationLabel(s.mut), className: 'gg-l-mut', color: mutationsOf(s.mut)[0]?.color });
          if (s.dead) lines.push({ text: `Dead ${seed.name} Tree`, className: 'gg-l-small' });
          lines.push({ text: formatMoney(value), className: s.dead ? 'gg-l-value gg-l-value--dead' : 'gg-l-value' });
          lines.push({ text: formatMult(mult), className: 'gg-l-mult', color: s.dead ? '#ff8a8a' : undefined });
          if (i === mine && s.predicted > 0 && !s.dead) lines.push({ text: `Safe to ${formatMult(s.predicted)}`, className: 'gg-l-small', color: '#5ad8ff' });
          const h = Math.min(treeHeight(mult), 14) * 0.62 + 2;
          this.overlay.label(`tree:${i}:${s.id}`, at.x, PLOT.soilTop + h, at.z, lines, scaleFor(d));
        });
        if (i === mine) {
          state.garden.forEach((g) => {
            const spot = gardenSpot(g.spot);
            const at = plotToWorld(i, spot.x, spot.z);
            const d = Math.hypot(at.x - px, at.z - pz);
            if (d > 26) return;
            const seed = seedById(g.seed);
            if (!seed) return;
            const lines: LabelLine[] = [
              { text: `${seed.name} Tree (${formatMult(g.mult)})`, className: 'gg-l-small' },
              { text: g.fruits > 0 ? `${g.fruits} fruit - ${formatMoney(fruitValue(seed, g.mult, g.mut))} each` : `Fruit in ${formatTimer((g.nextAt - now) / 1000)}`, className: 'gg-l-small', color: g.fruits > 0 ? '#4dff4a' : '#ffe066' },
            ];
            this.overlay.label(`garden:${g.spot}`, at.x, Math.min(treeHeight(g.mult), 13) + 1.8, at.z, lines, scaleFor(d));
          });
        }
      }
    }
    // Locked stalls: the reference's padlock and "REBIRTH N".
    const rebirths = this.self?.rebirths ?? 0;
    for (const stall of STALLS) {
      if (!stall.unlock || unlocked(rebirths, stall.unlock)) continue;
      const d = Math.hypot(stall.x - px, stall.z - pz);
      if (d > 70) continue;
      this.overlay.label(`lock:${stall.id}`, stall.x, 6.2, stall.z, [{ text: `🔒 REBIRTH ${unlockLevel(stall.unlock)}`, className: 'gg-l-lock' }], scaleFor(d));
    }
  }

  /** Is the player out of a keeper's reach (the Talk prompt's, plus a little give)? */
  private outOfReach(id: string, px: number, pz: number): boolean {
    const stall = STALLS.find((s) => s.id === id);
    if (!stall) return true;
    const front = stallFront(stall);
    return Math.hypot(front.x - px, front.z - pz) > PROMPT.stall + TALK_GIVE;
  }

  /**
   * KEEP CONVERSATIONS HONEST, first thing every frame: one that is open ends
   * the moment the player leaves the keeper's reach or walks off from where it
   * started; the SELL button's counter opens once its teleport has landed.
   */
  private watchTalk(): void {
    const player = this.localPlayer;
    if (!player) return;
    const px = player.position.x;
    const pz = player.position.z;
    if (this.sellOnArrival > 0) {
      if (!this.outOfReach('sell', px, pz)) {
        this.sellOnArrival = 0;
        this.openSell();
      } else if (performance.now() > this.sellOnArrival) this.sellOnArrival = 0;
    }
    const npc = this.dialogue.isOpen ? this.dialogue.npc : this.stall.isOpen ? this.stall.which : '';
    if (!npc) return;
    const wandered = this.talkAnchor !== null && Math.hypot(px - this.talkAnchor.x, pz - this.talkAnchor.z) > TALK_WANDER;
    if (wandered || this.outOfReach(npc, px, pz)) this.closeTalk();
  }

  // ------------------------------------------------------------ actions

  private buySeed(s: NetRiverSeed): void {
    const seed = seedById(s.seed);
    if (!seed) return;
    if ((this.self?.cash ?? 0) < seed.price) {
      this.hud.notice(`You need ${formatMoney(seed.price)} for the ${seed.name} Seed!`, 'bad');
      this.audio.play('refuse');
      return;
    }
    this.localPlayer?.character.act('pick');
    this.network.buySeed(s.id);
  }

  private harvest(id: number, x: number, z: number): void {
    this.localPlayer?.faceToward(x, z);
    this.localPlayer?.character.act('pick');
    this.network.harvest(id);
  }

  private talk(id: StallId): void {
    const stall = STALLS.find((s) => s.id === id);
    if (!stall) return;
    this.audio.play('open');
    if (stall.unlock && !unlocked(this.self?.rebirths ?? 0, stall.unlock)) {
      this.hud.notice(`Unlocks at Rebirth ${unlockLevel(stall.unlock)}`, 'bad');
      this.audio.play('refuse');
      return;
    }
    // One conversation at a time: whatever was open closes first.
    this.closeTalk();
    if (id === 'sell') {
      this.openSell();
      return;
    }
    this.stall.show(id as 'pets', this.self, () => this.network.now());
    this.anchorTalk();
  }

  private openSell(): void {
    const stall = STALLS.find((s) => s.id === 'sell')!;
    const boosted = this.self?.saleBoost ?? false;
    const options: DialogueOption[] = [
      { text: 'I want to sell my inventory', action: () => this.sell('all') },
      { text: 'I want to sell this', action: () => this.sell('held') },
    ];
    // The rewarded ad: offered only while Boxity can show one, the bonus is not
    // already waiting, and its cooldown (the server's clock) has run.
    if (!boosted && this.bloxity.ads.available() && this.network.now() >= (this.self?.adSaleReadyAt ?? 0)) {
      options.push({ text: '📺 Watch an ad: next sale pays 2x', action: () => void this.watchSaleAd() });
    }
    options.push({ text: 'Nevermind', action: () => this.closeTalk() });
    this.dialogue.open('sell', options, stall.keeper, boosted ? 'Your next sale pays double!' : 'Whatcha got for me?');
    this.anchorTalk();
  }

  /**
   * THE "2x NEXT SALE" REWARDED AD. Boxity plays it; only a 'completed' result
   * is worth anything, and even then the SERVER grants the bonus, after Boxity
   * verifies the result's token. Every other outcome says what really happened.
   */
  private async watchSaleAd(): Promise<void> {
    this.closeTalk();
    const result = await this.bloxity.ads.showRewarded(AD_SALE_PLACEMENT);
    if (result.status === 'completed') {
      if (result.rewardToken) this.network.adReward(result.rewardToken);
      else {
        logger.warn(SCOPE, 'rewarded ad completed without a reward token', result);
        this.hud.notice('The ad finished, but no reward came back. Please try again.', 'bad');
      }
      return;
    }
    logger.info(SCOPE, 'rewarded ad not completed', result);
    this.hud.notice(adResultMessage(result.status, result.reason), result.status === 'skipped' ? 'info' : 'bad');
  }

  /** Where the conversation started: walking off from here ends it. */
  private anchorTalk(): void {
    const p = this.localPlayer?.position;
    this.talkAnchor = p ? { x: p.x, z: p.z } : null;
  }

  /**
   * END THE CONVERSATION: the options, the keeper's speech bubble and any
   * counter window, all at once. The keeper's prompt is held off briefly so
   * the key that closed it (E, or the Nevermind number) cannot open it again.
   */
  private closeTalk(): void {
    const npc = this.dialogue.npc || this.stall.which;
    this.talkAnchor = null;
    this.sellOnArrival = 0;
    if (this.dialogue.isOpen) this.dialogue.close();
    if (this.stall.isOpen) this.stall.close();
    this.overlay.hush('npc:sell');
    if (npc) this.talkQuietUntil = performance.now() + 350;
  }

  private sell(mode: 'all' | 'held'): void {
    this.closeTalk();
    this.network.sell(mode);
  }

  private standListing(slot: number): Listing {
    const listing: Listing = [];
    this.network.plot(slot)?.stand.forEach((s, key) => listing.push({ slot: Number(key), seed: s.seed, mut: s.mut, mult: s.mult, price: s.price }));
    return listing;
  }

  private standSlot = -1;

  private openStand(slot: number): void {
    const plot = this.network.plot(slot);
    if (!plot) return;
    this.standSlot = slot;
    this.stand.show(slot, plot.owner === this.localSessionId, this.standListing(slot), this.self);
  }

  /** The top buttons: the server moves you; at the Sell stand the counter opens. */
  private goTo(place: 'market' | 'plot' | 'sell'): void {
    this.audio.play('click');
    this.network.teleport(place);
    // The counter opens once the teleport lands by it (or not at all, after a few seconds).
    if (place === 'sell') this.sellOnArrival = performance.now() + 4000;
  }

  private like(slot: number, liked: boolean): void {
    if (liked) {
      this.hud.notice('You already liked this plot today!', 'info');
      return;
    }
    this.audio.play('like');
    this.network.like(slot);
  }

  private equip(ref: string): void {
    this.equipped = ref;
    this.audio.play('click');
    this.network.equip(ref);
  }

  // -------------------------------------------------------------- the HUD

  private hotbarItems(self: SelfState): HotbarItem[] {
    const items: HotbarItem[] = [];
    for (const s of [...self.seeds].sort((a, b) => (seedById(a.seed)?.price ?? 0) - (seedById(b.seed)?.price ?? 0))) {
      items.push({ ref: `seed:${s.seed}:${s.mut}`, name: `${s.mut ? `${mutationLabel(s.mut)} ` : ''}${seedById(s.seed)?.name ?? ''} Seed`, count: s.count });
    }
    for (const t of [...self.trees].reverse()) {
      const seed = seedById(t.seed);
      if (seed) items.push({ ref: `tree:${t.uid}`, name: `${t.dead ? 'Dead ' : ''}${seed.name} Tree${t.mut ? ` (${mutationLabel(t.mut)})` : ''} (${formatMult(t.mult)})`, dead: t.dead, fav: t.fav });
    }
    for (const f of [...self.fruits].reverse().slice(0, 4)) {
      const seed = seedById(f.seed);
      if (seed) items.push({ ref: `fruit:${f.uid}`, name: `${f.mut ? `${mutationLabel(f.mut)} ` : ''}${seed.name}`, fav: f.fav });
    }
    for (const g of self.gear) {
      if (g.id === 1 || g.id === 2) items.push({ ref: `gear:${g.id}`, name: g.id === 1 ? 'Prediction Potion' : 'Miracle Grow', count: g.count });
    }
    const shown = items.slice(0, 10);
    if (this.equipped && !shown.some((i) => i.ref === this.equipped)) {
      const held = items.find((i) => i.ref === this.equipped);
      if (held) shown[9] = held;
    }
    return shown;
  }

  private updateHud(now: number): void {
    const state = this.network.state;
    if (state) {
      const kind = weatherFromIndex(state.weather);
      const next = weatherFromIndex(state.weatherNext);
      this.hud.setWeather(kind, (state.weatherEnds - now) / 1000, next, (state.weatherNextAt - now) / 1000, (this.self?.gear ?? []).some((g) => g.id === 5));
    }
    const self = this.self;
    if (!self) return;
    this.hud.setCash(self.cash, self.tickets, self.tokens, self.rebirths);
    this.hud.setHotbar(this.hotbarItems(self), this.equipped);
    let indexReady = false;
    for (const seed of SEEDS) {
      const bit = 2 ** (seed.id - 1);
      if (Math.floor(self.discoveredSeeds / bit) % 2 === 1 && Math.floor(self.claimedSeeds / bit) % 2 === 0) indexReady = true;
    }
    for (const m of MUTATIONS) if (self.discoveredMutations & m.bit && !(self.claimedMutations & m.bit)) indexReady = true;
    const next = nextRebirth(self.rebirths);
    this.hud.setRails({ indexUnlocked: unlocked(self.rebirths, 'index'), indexReady, canRebirth: !!next && self.cash >= next.cost, shopNew: self.tutorial >= TUTORIAL.done });
    // The fertilizer and worm chips while a seed is in hand.
    const seedMatch = /^seed:(\d+):/.exec(this.equipped);
    const seed = seedMatch ? seedById(Number(seedMatch[1])) : undefined;
    const ferts: PlantOption[] = FERTILIZERS.map((f) => ({ id: f.id, label: seed ? `${f.name} (${formatMoney(fertilizerCost(f, seed))})` : f.name, locked: self.rebirths < f.rebirth }));
    const worms: PlantOption[] = self.worms.map((w) => ({ id: w.id, label: `${wormById(w.id)?.name ?? 'Worm'} x${w.count}`, locked: false }));
    this.hud.setPlantBar(!!seed, ferts, self.fertilizer, worms, self.worm);
  }

  // ------------------------------------------------------------ tutorial

  private updateTutorial(now: number): void {
    const self = this.self;
    const player = this.localPlayer;
    const step = self?.tutorial ?? TUTORIAL.done;
    if (!self || !player || step >= TUTORIAL.done) {
      this.hud.guide('');
      this.hud.focus(null);
      this.chevrons.update(null, null, this.time);
      if (this.lastTutorial >= 0 && this.lastTutorial < TUTORIAL.done && step >= TUTORIAL.done) this.audio.play('win');
      this.lastTutorial = step;
      return;
    }
    if (step !== this.lastTutorial) {
      if (this.lastTutorial >= 0) this.audio.play('claim');
      this.lastTutorial = step;
    }
    const p = player.position;
    let target: { x: number; z: number } | null = null;
    let focus: 'market' | 'plot' | 'sell' | null = null;
    const plot = this.myPlot();
    switch (step) {
      case TUTORIAL.buy: {
        // The nearest free Oak on the river.
        let best: { x: number; z: number; d: number } | null = null;
        this.network.state?.river.forEach((s: NetRiverSeed) => {
          if (s.seed !== 1) return;
          const at = RiverView.positionOf(s, now);
          if (at.x > RIVER.endX - 20) return;
          const d = Math.hypot(at.x - p.x, at.z - p.z);
          if (!best || d < best.d) best = { x: at.x, z: at.z, d };
        });
        target = best;
        break;
      }
      case TUTORIAL.plant:
        if (plot) target = plotToWorld(plot.slot, 0, 0);
        if (!this.inOwnPlot()) focus = 'plot';
        break;
      case TUTORIAL.harvest:
        if (plot) {
          let first: { x: number; z: number } | null = null;
          plot.saplings.forEach((s) => {
            if (!first) first = plotToWorld(plot.slot, s.x, s.z);
          });
          target = first ?? plotToWorld(plot.slot, 0, 0);
        }
        break;
      case TUTORIAL.sell:
        target = stallFront(STALLS.find((s) => s.id === 'sell')!);
        focus = 'sell';
        break;
    }
    this.hud.guide(TUTORIAL_TEXT[step] ?? '', true);
    this.hud.focus(focus);
    this.chevrons.update(target ? { x: p.x, y: p.y, z: p.z } : null, target, this.time);
  }

  // ------------------------------------------------------------- boards

  /** The guaranteed-spawn board (every second) and the leaderboards (every few). */
  private updateBoards(now: number, delta: number): void {
    const state = this.network.state;
    if (!state || !this.world) return;
    const second = Math.floor(now / 1000);
    if (second !== this.guaranteeSecond) {
      this.guaranteeSecond = second;
      const c = this.world.guaranteeCanvas;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#7a4a22';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.font = `bold ${Math.round(c.height * 0.3)}px Fredoka, sans-serif`;
        ctx.textAlign = 'left';
        ctx.lineWidth = c.height * 0.05;
        const line = (y: number, rarity: string, color: string, at: number): void => {
          const parts: [string, string][] = [
            ['Guaranteed ', '#ffffff'],
            [rarity, color],
            [` in ${formatTimer(Math.max(0, (at - now) / 1000))}`, '#ffffff'],
          ];
          const width = parts.reduce((w, [t]) => w + ctx.measureText(t).width, 0);
          let x = (c.width - width) / 2;
          for (const [text, fill] of parts) {
            ctx.strokeStyle = '#2a1408';
            ctx.strokeText(text, x, y);
            ctx.fillStyle = fill;
            ctx.fillText(text, x, y);
            x += ctx.measureText(text).width;
          }
        };
        line(c.height * 0.42, 'Legendary', '#ff3b3b', state.legendaryAt);
        line(c.height * 0.82, 'Mythic', '#ffe23d', state.mythicAt);
        this.world.guaranteeChanged();
      }
    }
    this.boardTimer -= delta;
    if (this.boardTimer > 0) return;
    this.boardTimer = 3;
    const titles: [BoardId, string][] = [
      ['cash', 'CASH'],
      ['earned', 'TOTAL EARNED'],
      ['rebirths', 'REBIRTHS'],
      ['best', 'BIGGEST TREE'],
    ];
    titles.forEach(([id, title], i) => {
      const c = this.world.boardCanvases[i];
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      ctx.fillStyle = '#5a3216';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#ffd23a';
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.round(c.width * 0.09)}px Fredoka, sans-serif`;
      ctx.fillText(title, c.width / 2, c.width * 0.12);
      ctx.font = `bold ${Math.round(c.width * 0.055)}px Fredoka, sans-serif`;
      this.network
        .board(id)
        .slice(0, 10)
        .forEach((row, k) => {
          const y = c.width * 0.22 + k * c.width * 0.1;
          ctx.textAlign = 'left';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(`${k + 1}. ${(row.name || 'Farmer').slice(0, 14)}`, c.width * 0.06, y);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#7dff4a';
          ctx.fillText(id === 'rebirths' ? String(row.value) : formatMoney(row.value), c.width * 0.94, y);
        });
    });
    this.world.boardsChanged();
  }

  // ------------------------------------------------------------- messages

  private onSelf(state: SelfState): void {
    const before = this.self;
    this.self = state;
    // The server's hand wins: it equips a bought seed and a harvested tree on its own.
    if (!before || before.equipped !== state.equipped) this.equipped = state.equipped;
    if (this.equipped && !this.ownsRef(state, this.equipped)) this.equipped = '';
    if (before && state.rebirths > before.rebirths) {
      this.audio.play('cheer');
      this.rebirth.close();
    }
    this.items.setState(state);
    this.rebirth.setState(state);
    this.index.setState(state);
    this.petsWindow.setState(state);
    this.stall.setState(state);
    if (this.stand.isOpen && this.standSlot >= 0) this.stand.update(this.standListing(this.standSlot), state);
    if (this.placing && !(state.furniture.find((f) => f.id === this.placing)?.count ?? 0)) this.stopPlacing();
  }

  private ownsRef(state: SelfState, ref: string): boolean {
    const seed = /^seed:(\d+):(\d+)$/.exec(ref);
    if (seed) return state.seeds.some((s) => s.seed === Number(seed[1]) && s.mut === Number(seed[2]));
    if (ref.startsWith('tree:')) return state.trees.some((t) => t.uid === Number(ref.slice(5)));
    if (ref.startsWith('fruit:')) return state.fruits.some((t) => t.uid === Number(ref.slice(6)));
    if (ref.startsWith('gear:')) return state.gear.some((g) => g.id === Number(ref.slice(5)));
    return false;
  }

  private onNotice(message: NoticeMessage): void {
    this.hud.notice(message.text, message.kind);
    if (message.kind === 'bad') this.audio.play('refuse');
    else if (message.kind === 'gold') this.audio.play('sparkle');
  }

  private onSold(message: SoldMessage): void {
    this.hud.notice(`Sold for ${formatMoney(message.amount)}`, 'good');
    this.audio.play('sell');
    const p = this.localPlayer?.position;
    if (p) this.overlay.pop(`+${formatMoney(message.amount)}`, 'green', { x: p.x, y: p.y + 4, z: p.z });
    if (message.amount >= 1000) this.audio.play('win');
  }

  private onFx(message: FxMessage): void {
    const p = this.localPlayer?.position;
    const d = p ? Math.hypot(message.x - p.x, message.z - p.z) : 0;
    const near = d < 120;
    switch (message.kind) {
      case 'strike':
      case 'nearMiss': {
        this.effects.strike(message.x, 0.4, message.z, message.kind === 'nearMiss' ? 0x9ae8ff : 0xfff6a0);
        const strength = Math.max(0.15, 1 - d / 160);
        this.weather.strike(strength);
        this.audio.play('thunder', strength);
        if (d < 40) this.flashLevel = 0.55 * strength;
        if (message.kind === 'nearMiss') this.effects.sparkle(message.x, 1, message.z, 0x5ad8ff);
        break;
      }
      case 'blocked':
        this.effects.sparkle(message.x, 2, message.z, 0x7dff4a);
        if (near) this.audio.play('unlock');
        break;
      case 'plant':
        if (near) this.effects.plant(message.x, PLOT.soilTop, message.z);
        break;
      case 'harvest':
        this.effects.harvest(message.x, PLOT.soilTop, message.z);
        if (near) this.audio.play('harvest');
        break;
      case 'buy':
        this.effects.sparkle(message.x, 0.4, message.z);
        if (d < 12) this.audio.play('buy');
        break;
      case 'fruit':
        if (p && d < 14) {
          const target = new Vector3(p.x, p.y + 2, p.z);
          this.effects.fruit(message.data ?? 1, message.x, 2, message.z, () => target);
          this.audio.play('pop');
        }
        break;
      case 'sparkle':
        this.effects.sparkle(message.x, 2, message.z, message.data === 1 ? 0x5ad8ff : 0x7dff4a);
        break;
      case 'rebirth':
        this.effects.rebirth(message.x, 0, message.z);
        if (message.text) this.hud.notice(`${visibleName(message.text)} just reached Rebirth ${message.data}!`, 'gold');
        break;
      case 'announce':
        this.audio.play('alarm');
        break;
    }
  }

  private onSpun(slice: number): void {
    this.pendingSpin = slice;
    this.stall.close();
    this.world.spinWheel(slice);
    this.audio.play('click');
    const check = (): void => {
      if (this.world.wheelSpinning) {
        window.setTimeout(check, 200);
        return;
      }
      const prize = WHEEL[this.pendingSpin];
      if (!prize) return;
      this.audio.play('win');
      const icon = prize.prize.kind === 'egg' ? this.icons.egg(prize.prize.id) : prize.prize.kind === 'gear' ? this.icons.gear(prize.prize.id) : '';
      this.reveal.show(icon, prize.label, 'Lucky Wheel prize!', prize.color);
    };
    window.setTimeout(check, 600);
  }

  private onHatched(egg: number, pet: number): void {
    const def = petById(pet);
    if (!def) return;
    this.audio.play('cheer');
    this.reveal.show(this.icons.pet(pet), `You hatched a ${def.name}!`, `${eggById(egg)?.name ?? 'Egg'} - ${def.blurb}`, '#ffe066');
  }

  private onStatusChange(status: ConnectionStatus): void {
    logger.info(SCOPE, `connection: ${status}`);
    if (status === 'disconnected' || status === 'error') this.hud.notice('Disconnected from the server. Reload to rejoin.', 'bad');
  }

  // ---------------------------------------------------------------- input

  private readonly onKey = (event: KeyboardEvent): void => {
    if (isTyping(event.target)) return;
    if (event.key === 'Escape') {
      if (this.placing) {
        this.stopPlacing();
        return;
      }
      if (this.dialogue.isOpen || this.stall.isOpen) {
        this.closeTalk();
        return;
      }
      closeTopModal();
      return;
    }
    if (anyModalOpen()) return;
    const key = event.key.toLowerCase();
    if (key === 'e') {
      // E only uses a prompt; a conversation's choices are their numbers (E never sells by accident).
      this.overlay.activatePrompt();
      return;
    }
    if (key === 'r' && this.placing) {
      this.placingRot = (this.placingRot + 1) % 4;
      return;
    }
    if (/^[0-9]$/.test(key)) {
      const index = key === '0' ? 9 : Number(key) - 1;
      if (this.dialogue.isOpen && this.dialogue.choose(index)) return;
      this.hud.pressSlot(index, this.equipped);
      return;
    }
    // The HUD's buttons by key (their badges show which); G is a second key for Items.
    if (key === 'g') this.items.toggle();
    else this.hud.pressShortcut(key);
  };

  /**
   * A Boxity chat line over its sender: yourself, or the remote whose VERIFIED
   * account id (replicated by the server) is the sender's. Nobody in view, no
   * bubble. Cosmetic: it never throws.
   */
  private showChatBubble(message: LegionChatMessage): void {
    if (message.isLocalPlayer) {
      const local = this.localPlayer;
      if (local) this.bloxity.attachBubble(local.character.root, message, local.bubbleHeight);
      return;
    }
    const id = String(message.userId ?? '').replace(/^legion_/, '');
    const remote = this.remotePlayers.byAccount(id);
    if (remote) this.bloxity.attachBubble(remote.character.root, message, remote.bubbleHeight);
  }

  /** Browsers only start audio after a gesture. */
  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  private tickFps(delta: number): void {
    if (this.fpsReadout.hidden) return;
    this.fpsAccum += delta;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.5) {
      this.fpsReadout.textContent = `${Math.round(this.fpsFrames / this.fpsAccum)} FPS`;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }
}
