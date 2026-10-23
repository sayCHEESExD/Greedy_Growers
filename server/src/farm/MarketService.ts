import {
  CAN_OF_WORMS_TICKETS,
  CODES,
  MAX_EQUIPPED_PETS,
  MUTATIONS,
  MessageType,
  RARITIES,
  RIVER_SEEDS,
  SEEDS,
  SERVE_RADIUS,
  STALLS,
  STARTING_CASH,
  TUTORIAL,
  WHEEL,
  WHEEL_SPIN_TICKETS,
  dayNumber,
  deadValue,
  eggById,
  fallRequests,
  farmersRequests,
  formatMoney,
  fruitValue,
  furnitureById,
  gearById,
  hatch,
  nextRebirth,
  petById,
  petBonuses,
  petFinderMs,
  rollWorm,
  seedById,
  stallFront,
  treeValue,
  unlockLevel,
  unlocked,
  weightedPick,
  type FruitItem,
  type HatchedMessage,
  type SoldMessage,
  type SpunMessage,
  type StallBuyKind,
  type StallId,
  type TreeItem,
} from '@greedy/shared';
import {
  addCash,
  addFruit,
  addGear,
  addPet,
  addSeeds,
  addStack,
  addTickets,
  equip,
  held,
  removeItems,
  spendTickets,
  syncPets,
  takeStack,
  type Farmer,
} from './Farmer.js';
import type { PlotService } from './PlotService.js';
import type { RoomContext } from './RoomContext.js';

/**
 * THE MARKET: the Sell stand, rebirth, every rebirth-locked stall (Pets,
 * Farmers Market, Lucky Wheel, Furniture, Gear Shop, Worms, Fall Harvest),
 * the Index's tickets, codes, and the pets' finds.
 *
 * Stalls serve only a player standing at their counter who has reached the
 * stall's rebirth; prices are the server's tables, never the client's.
 */
export class MarketService {
  constructor(
    private readonly ctx: RoomContext,
    private readonly plots: PlotService,
  ) {}

  atStall(f: Farmer, id: StallId, pad = 0): boolean {
    const stall = STALLS.find((s) => s.id === id);
    if (!stall) return false;
    const front = stallFront(stall);
    return Math.hypot(f.player.x - front.x, f.player.z - front.z) <= SERVE_RADIUS + pad;
  }

  /** At the counter and unlocked; says why not. */
  private serves(f: Farmer, id: StallId): boolean {
    const stall = STALLS.find((s) => s.id === id)!;
    if (!this.atStall(f, id, 4)) return false;
    if (stall.unlock && !unlocked(f.profile.rebirths, stall.unlock)) {
      this.ctx.notify(f, 'bad', `Unlocks at Rebirth ${unlockLevel(stall.unlock)}`);
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ sell

  private sellBonus(f: Farmer): number {
    return 1 + petBonuses([f.player.pet0, f.player.pet1, f.player.pet2].filter((id) => id > 0)).sell;
  }

  treeWorth(item: TreeItem): number {
    const seed = seedById(item.seed);
    if (!seed) return 0;
    return item.dead ? deadValue(seed, item.mult, item.mut) : treeValue(seed, item.mult, item.mut);
  }

  fruitWorth(item: FruitItem): number {
    const seed = seedById(item.seed);
    return seed ? fruitValue(seed, item.mult, item.mut) : 0;
  }

  sell(f: Farmer, mode: 'all' | 'held'): void {
    if (!this.atStall(f, 'sell', 6)) return;
    const bonus = this.sellBonus(f);
    let total = 0;
    const sold = new Set<number>();
    if (mode === 'held') {
      const hand = held(f);
      if (hand.kind === 'tree') {
        total = this.treeWorth(hand.item);
        sold.add(hand.item.uid);
      } else if (hand.kind === 'fruit') {
        total = this.fruitWorth(hand.item);
        sold.add(hand.item.uid);
      } else {
        this.ctx.notify(f, 'info', 'Hold the tree or fruit you want to sell!');
        return;
      }
    } else {
      for (const item of f.profile.trees) {
        if (item.fav) continue;
        total += this.treeWorth(item);
        sold.add(item.uid);
      }
      for (const item of f.profile.fruits) {
        if (item.fav) continue;
        total += this.fruitWorth(item);
        sold.add(item.uid);
      }
      if (sold.size === 0) {
        this.ctx.notify(f, 'info', 'You have nothing to sell!');
        return;
      }
    }
    const amount = Math.max(1, Math.floor(total * bonus));
    removeItems(f, sold);
    addCash(f, amount, true);
    this.ctx.send(f, MessageType.Sold, { amount, count: sold.size } satisfies SoldMessage);
    this.ctx.tutorial(f, TUTORIAL.sell);
    // "You can afford Pine Seeds!" - the cheapest river seed this sale put in reach.
    const before = f.profile.cash - amount;
    const reached = RIVER_SEEDS.filter((s) => s.price > before && s.price <= f.profile.cash).pop();
    if (reached) this.ctx.notify(f, 'gold', `You can afford ${reached.name} Seeds!`);
  }

  // --------------------------------------------------------------- rebirth

  rebirth(f: Farmer): void {
    const next = nextRebirth(f.profile.rebirths);
    if (!next) {
      this.ctx.notify(f, 'info', 'You have reached the highest rebirth!');
      return;
    }
    if (f.profile.cash < next.cost) {
      this.ctx.notify(f, 'bad', `You need ${formatMoney(next.cost)} to rebirth.`);
      return;
    }
    const p = f.profile;
    p.rebirths = next.level;
    p.cash = STARTING_CASH;
    p.seeds = [];
    p.trees = [];
    if (f.plot) {
      this.plots.clearSaplings(f.plot);
      this.plots.applyRebirths(f, f.plot);
    }
    equip(f, '');
    f.dirty = true;
    this.ctx.fx({ kind: 'rebirth', x: f.player.x, z: f.player.z, data: next.level, text: f.player.displayName });
    this.ctx.notify(f, 'gold', `REBIRTH ${next.level}! Unlocked: ${next.unlocks.map((u) => u.name).join(', ')}`);
  }

  // ---------------------------------------------------------------- stalls

  stallBuy(f: Farmer, kind: StallBuyKind, id: number): void {
    const p = f.profile;
    switch (kind) {
      case 'egg': {
        const egg = eggById(id);
        if (!egg || egg.special || !this.serves(f, 'pets')) return;
        if (!spendTickets(f, egg.tickets)) return this.needTickets(f, egg.tickets);
        addStack(p.eggs, egg.id, 1);
        this.ctx.notify(f, 'good', `Bought a ${egg.name}! Hatch it from your Pets menu.`);
        return;
      }
      case 'gear': {
        const gear = gearById(id);
        if (!gear || !this.serves(f, 'gear')) return;
        if (gear.permanent && p.gear.some((g) => g.id === gear.id)) {
          this.ctx.notify(f, 'info', `You already own the ${gear.name}.`);
          return;
        }
        if (!spendTickets(f, gear.tickets)) return this.needTickets(f, gear.tickets);
        addGear(f, gear.id, 1);
        this.ctx.notify(f, 'good', `Bought a ${gear.name}!`);
        return;
      }
      case 'can': {
        if (!this.serves(f, 'worms')) return;
        if (!spendTickets(f, CAN_OF_WORMS_TICKETS)) return this.needTickets(f, CAN_OF_WORMS_TICKETS);
        const worm = rollWorm(() => this.ctx.random());
        addStack(p.worms, worm.id, 1);
        this.ctx.notify(f, 'gold', `You found a ${worm.name}!`);
        return;
      }
      case 'furniture': {
        const def = furnitureById(id);
        if (!def || !this.serves(f, 'furniture')) return;
        if (!spendTickets(f, def.tickets)) return this.needTickets(f, def.tickets);
        addStack(p.furniture, def.id, 1);
        this.ctx.notify(f, 'good', `Bought a ${def.name}! Place it from your Items.`);
        return;
      }
      case 'fallSeed': {
        const seed = seedById(id);
        if (!seed || seed.tokens === undefined || !this.serves(f, 'fall')) return;
        if (p.tokens < seed.tokens) {
          this.ctx.notify(f, 'bad', `You need ${seed.tokens} Harvest Tokens.`);
          return;
        }
        p.tokens -= seed.tokens;
        addSeeds(f, seed.id, 0, 1);
        this.ctx.discover(f, seed.id, 0);
        this.ctx.notify(f, 'good', `Bought a ${seed.name} Seed!`);
        return;
      }
      case 'spin': {
        if (!this.serves(f, 'wheel')) return;
        if (!spendTickets(f, WHEEL_SPIN_TICKETS)) return this.needTickets(f, WHEEL_SPIN_TICKETS);
        const index = weightedPick(
          () => this.ctx.random(),
          WHEEL.map((slice, i) => [i, slice.weight] as const),
        );
        this.grantWheel(f, index);
        this.ctx.send(f, MessageType.Spun, { slice: index } satisfies SpunMessage);
        return;
      }
      default:
        return;
    }
  }

  private grantWheel(f: Farmer, index: number): void {
    const prize = WHEEL[index]!.prize;
    switch (prize.kind) {
      case 'gear':
        addGear(f, prize.id, prize.count);
        break;
      case 'tickets':
        addTickets(f, prize.count);
        break;
      case 'egg':
        addStack(f.profile.eggs, prize.id, 1);
        break;
      case 'basket':
        for (let i = 0; i < prize.count; i += 1) {
          const seed = RIVER_SEEDS[Math.floor(this.ctx.random() * Math.min(8, RIVER_SEEDS.length))]!;
          addFruit(f, seed.id, 0, 3);
        }
        break;
    }
    f.dirty = true;
  }

  private needTickets(f: Farmer, cost: number): void {
    this.ctx.notify(f, 'bad', `You need ${cost} Tickets! Earn them from the Index and the Farmers Market.`);
  }

  // ---------------------------------------------------------- request boards

  /** Roll today's boards over, if the day changed. */
  rollDay(f: Farmer): void {
    const today = dayNumber(this.ctx.now());
    if (f.profile.requestDay === today) return;
    f.profile.requestDay = today;
    f.profile.farmersDone = [false, false, false];
    f.profile.fallDone = [false, false, false];
    f.dirty = true;
  }

  turnIn(f: Farmer, board: 'farmers' | 'fall', index: number): void {
    this.rollDay(f);
    const i = Math.floor(index);
    const stall: StallId = board === 'farmers' ? 'farmers' : 'fall';
    if (i < 0 || i > 2 || !this.serves(f, stall)) return;
    const done = board === 'farmers' ? f.profile.farmersDone : f.profile.fallDone;
    if (done[i]) return;
    const day = dayNumber(this.ctx.now());
    const request = (board === 'farmers' ? farmersRequests(day) : fallRequests(day))[i]!;
    const seed = seedById(request.seed);
    if (!seed) return;
    if (request.kind === 'fruit') {
      const fruits = f.profile.fruits.filter((x) => x.seed === request.seed && !x.fav).slice(0, request.count);
      if (fruits.length < request.count) {
        this.ctx.notify(f, 'bad', `Bring ${request.count} ${seed.name} fruit${request.count === 1 ? '' : 's'} from your garden!`);
        return;
      }
      removeItems(f, new Set(fruits.map((x) => x.uid)));
    } else {
      const trees = f.profile.trees.filter((x) => x.seed === request.seed && !x.dead && !x.fav && x.mult >= request.minMult).slice(0, request.count);
      if (trees.length < request.count) {
        this.ctx.notify(f, 'bad', `Bring a live ${seed.name} Tree of at least ${request.minMult}x!`);
        return;
      }
      removeItems(f, new Set(trees.map((x) => x.uid)));
    }
    done[i] = true;
    if (board === 'farmers') {
      addTickets(f, request.reward);
      this.ctx.notify(f, 'gold', `+${request.reward} Tickets! Thank you, dear!`);
    } else {
      f.profile.tokens += request.reward;
      this.ctx.notify(f, 'gold', `+${request.reward} Harvest Tokens! Happy harvest!`);
    }
    f.dirty = true;
  }

  // ------------------------------------------------------------------ pets

  hatchEgg(f: Farmer, egg: number): void {
    const def = eggById(Math.floor(egg));
    if (!def) return;
    if (f.profile.pets.length >= 60) {
      this.ctx.notify(f, 'bad', 'You have too many pets!');
      return;
    }
    if (!takeStack(f.profile.eggs, def.id, 1)) return;
    const luck = petBonuses([f.player.pet0, f.player.pet1, f.player.pet2].filter((id) => id > 0)).hatchLuck;
    const pet = hatch(def.id, () => this.ctx.random(), luck);
    const uid = addPet(f, pet.id);
    if (f.profile.equippedPets.length < MAX_EQUIPPED_PETS) {
      f.profile.equippedPets.push(uid);
      syncPets(f);
    }
    f.dirty = true;
    this.ctx.send(f, MessageType.Hatched, { egg: def.id, pet: pet.id } satisfies HatchedMessage);
  }

  equipPet(f: Farmer, uid: number, on: boolean): void {
    const p = f.profile;
    if (!p.pets.some((x) => x.uid === uid)) return;
    if (on) {
      if (p.equippedPets.includes(uid)) return;
      if (p.equippedPets.length >= MAX_EQUIPPED_PETS) {
        this.ctx.notify(f, 'bad', `You can only have ${MAX_EQUIPPED_PETS} pets out at once.`);
        return;
      }
      p.equippedPets.push(uid);
    } else p.equippedPets = p.equippedPets.filter((x) => x !== uid);
    f.petTimers.delete(uid);
    syncPets(f);
    f.dirty = true;
  }

  /** Finder pets: forage fruit, find seeds, find eggs. */
  tickPets(f: Farmer): void {
    const now = this.ctx.now();
    const ids = [f.player.pet0, f.player.pet1, f.player.pet2].filter((id) => id > 0);
    if (ids.length === 0) return;
    const bonus = petBonuses(ids);
    for (const uid of f.profile.equippedPets) {
      const item = f.profile.pets.find((x) => x.uid === uid);
      const pet = item ? petById(item.pet) : undefined;
      if (!pet) continue;
      const every = petFinderMs(pet, bonus);
      if (every <= 0) continue;
      const due = f.petTimers.get(uid);
      if (due === undefined) {
        f.petTimers.set(uid, now + every);
        continue;
      }
      if (now < due) continue;
      f.petTimers.set(uid, now + every);
      const e = pet.effect;
      if (e.kind === 'forage') {
        const pool = RIVER_SEEDS.filter((s) => s.rarity === e.rarity);
        const seed = pool[Math.floor(this.ctx.random() * pool.length) % pool.length];
        if (seed && addFruit(f, seed.id, 0, 3)) this.ctx.notify(f, 'good', `Your ${pet.name} foraged a ${seed.name} fruit!`);
      } else if (e.kind === 'freeSeed') {
        const pool = RIVER_SEEDS.filter((s) => (e.rarities as readonly string[]).includes(s.rarity));
        const seed = pool[Math.floor(this.ctx.random() * pool.length) % pool.length];
        if (seed) {
          addSeeds(f, seed.id, 0, 1);
          this.ctx.discover(f, seed.id, 0);
          this.ctx.notify(f, 'good', `Your ${pet.name} found a ${seed.name} Seed!`);
        }
      } else if (e.kind === 'findEgg') {
        const roll = this.ctx.random();
        const egg = roll < 0.00025 ? 6 : roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3;
        addStack(f.profile.eggs, egg, 1);
        this.ctx.notify(f, 'gold', `Your ${pet.name} found a ${eggById(egg)?.name}!`);
      }
      f.dirty = true;
    }
  }

  // ----------------------------------------------------------------- index

  /** Tickets for every Index entry discovered but not yet claimed. */
  claimIndex(f: Farmer): void {
    const p = f.profile;
    if (!unlocked(p.rebirths, 'index')) return;
    let tickets = 0;
    for (const seed of SEEDS) {
      const bit = 2 ** (seed.id - 1);
      if (Math.floor(p.discoveredSeeds / bit) % 2 === 1 && Math.floor(p.claimedSeeds / bit) % 2 === 0) {
        tickets += RARITIES[seed.rarity].indexTickets;
        p.claimedSeeds += bit;
      }
    }
    for (const m of MUTATIONS) {
      if (p.discoveredMutations & m.bit && !(p.claimedMutations & m.bit)) {
        tickets += m.indexTickets;
        p.claimedMutations |= m.bit;
      }
    }
    if (tickets === 0) {
      this.ctx.notify(f, 'info', 'Discover new seeds and mutations to earn Tickets!');
      return;
    }
    addTickets(f, tickets);
    this.ctx.notify(f, 'gold', `+${tickets} Tickets from your Index!`);
  }

  redeem(f: Farmer, raw: string): void {
    const code = String(raw ?? '').trim().toUpperCase().slice(0, 24);
    const reward = CODES[code];
    if (!reward) {
      this.ctx.notify(f, 'bad', 'That code is not valid.');
      return;
    }
    if (f.profile.codes.includes(code)) {
      this.ctx.notify(f, 'info', 'You already redeemed that code.');
      return;
    }
    f.profile.codes.push(code);
    addTickets(f, reward.tickets);
    if (reward.tokens) f.profile.tokens += reward.tokens;
    f.dirty = true;
    this.ctx.notify(f, 'gold', `Code redeemed! +${reward.tickets} Tickets${reward.tokens ? ` and +${reward.tokens} Harvest Tokens` : ''}.`);
  }
}
