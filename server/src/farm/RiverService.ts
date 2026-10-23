import {
  RARITIES,
  RIVER,
  RIVER_SEEDS,
  TUTORIAL,
  WEATHERS,
  formatMoney,
  rarityRank,
  riverSeedX,
  seedById,
  weatherFromIndex,
  weatherMutationBit,
  weightedPick,
  type SeedDef,
} from '@greedy/shared';
import { RiverSeedState } from '../rooms/state/RiverSeedState.js';
import { addSeeds, equip, hasGear, spendCash, type Farmer } from './Farmer.js';
import type { RoomContext } from './RoomContext.js';

/** Milliseconds between seeds. */
const SPAWN_MS = 1500;
/** Guaranteed spawns: a Legendary every 5:00, a Mythic every 10:00 (the board by the source). */
const LEGENDARY_MS = 5 * 60_000;
const MYTHIC_MS = 10 * 60_000;
/** How close to a seed you must stand to buy it. */
const BUY_REACH = 8;
const SEED_NOTIFIER = 4;

/**
 * THE RIVER: one conveyor shared by the whole room. Seeds spawn at the source
 * on a timer, rolled by the original's odds (one in 5 for each Common, 1 in
 * 1,000 for each Divine...), float to the drain, and are gone. First come,
 * first served: a seed bought by one player vanishes for everyone.
 *
 * Seeds spawned during weather may carry its mutation; during Lucky River
 * everything Rare and up is three times as likely.
 */
export class RiverService {
  private nextAt = 0;
  private nextId = 1;

  constructor(private readonly ctx: RoomContext) {}

  start(): void {
    const now = this.ctx.now();
    const state = this.ctx.state;
    state.legendaryAt = now + LEGENDARY_MS;
    state.mythicAt = now + MYTHIC_MS;
    // Fill the river as if it had always been running, so the first player sees a full river.
    const span = ((RIVER.endX - RIVER.startX) / RIVER.speed) * 1000;
    for (let t = now - span + SPAWN_MS; t < now; t += SPAWN_MS) this.spawn(t, this.roll());
    this.nextAt = now + SPAWN_MS;
  }

  tick(): void {
    const now = this.ctx.now();
    const state = this.ctx.state;
    const gone: string[] = [];
    state.river.forEach((seed, key) => {
      if (riverSeedX(seed.spawnAt, now) > RIVER.endX) gone.push(key);
    });
    for (const key of gone) state.river.delete(key);

    if (now < this.nextAt) return;
    this.nextAt = now + SPAWN_MS;
    let seed: SeedDef;
    if (now >= state.mythicAt) {
      state.mythicAt = now + MYTHIC_MS;
      seed = this.ofRarity('mythic');
    } else if (now >= state.legendaryAt) {
      state.legendaryAt = now + LEGENDARY_MS;
      seed = this.ofRarity('legendary');
    } else seed = this.roll();
    const spawned = this.spawn(now, seed);
    this.herald(spawned);
  }

  private roll(): SeedDef {
    const luck = WEATHERS[weatherFromIndex(this.ctx.state.weather)].riverLuck;
    return weightedPick(
      () => this.ctx.random(),
      RIVER_SEEDS.map((s) => [s, (1 / s.oneIn) * (rarityRank(s.rarity) >= 1 ? luck : 1)] as const),
    );
  }

  private ofRarity(rarity: SeedDef['rarity']): SeedDef {
    const pool = RIVER_SEEDS.filter((s) => s.rarity === rarity);
    return pool[Math.floor(this.ctx.random() * pool.length) % pool.length]!;
  }

  private spawn(at: number, seed: SeedDef): RiverSeedState {
    const s = new RiverSeedState();
    s.id = this.nextId++;
    s.seed = seed.id;
    s.spawnAt = at;
    s.lane = RIVER.lanes[Math.floor(this.ctx.random() * RIVER.lanes.length) % RIVER.lanes.length]!;
    const weather = weatherFromIndex(this.ctx.state.weather);
    const bit = weatherMutationBit(weather);
    if (bit && this.ctx.random() < WEATHERS[weather].chance) s.mut = bit;
    this.ctx.state.river.set(String(s.id), s);
    return s;
  }

  /** Celestial and up are announced to the server; Legendary and up to Seed Notifier owners. */
  private herald(s: RiverSeedState): void {
    const seed = seedById(s.seed);
    if (!seed) return;
    const rank = rarityRank(seed.rarity);
    const name = `${RARITIES[seed.rarity].name} ${seed.name} Seed`;
    if (rank >= rarityRank('celestial')) {
      this.ctx.announce('gold', `A ${name} is floating down the river!`);
      this.ctx.fx({ kind: 'announce', x: RIVER.startX, z: RIVER.z, data: seed.id });
      return;
    }
    if (rank >= rarityRank('legendary')) {
      for (const f of this.ctx.farmers()) if (hasGear(f, SEED_NOTIFIER)) this.ctx.notify(f, 'gold', `Seed Notifier: a ${name} is on the river!`);
    }
  }

  buy(f: Farmer, id: number): void {
    const s = this.ctx.state.river.get(String(Math.floor(id)));
    if (!s) return;
    const seed = seedById(s.seed);
    if (!seed) return;
    const x = riverSeedX(s.spawnAt, this.ctx.now());
    if (Math.hypot(f.player.x - x, f.player.z - (RIVER.z + s.lane)) > BUY_REACH) return;
    if (!spendCash(f, seed.price)) {
      this.ctx.notify(f, 'bad', `You need ${formatMoney(seed.price)} for the ${seed.name} Seed!`);
      return;
    }
    this.ctx.state.river.delete(String(s.id));
    addSeeds(f, seed.id, s.mut, 1);
    equip(f, `seed:${seed.id}:${s.mut}`);
    f.player.actionCount = (f.player.actionCount + 1) & 0xffff;
    this.ctx.fx({ kind: 'buy', x, z: RIVER.z + s.lane, data: seed.id });
    this.ctx.discover(f, seed.id, s.mut);
    this.ctx.tutorial(f, TUTORIAL.buy);
  }
}
