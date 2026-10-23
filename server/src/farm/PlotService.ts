import {
  CHARGED_FROM,
  MAX_FRUIT_PER_TREE,
  MAX_FURNITURE,
  MAX_MULT,
  MessageType,
  NEAR_MISS,
  PLOT,
  RARITIES,
  TUTORIAL,
  WEATHERS,
  fertilizerById,
  fertilizerCost,
  furnitureById,
  furnitureProblem,
  gardenCapacity,
  gardenSpot,
  growthRate,
  insideLawn,
  insideSoil,
  multAt,
  mutationBit,
  petBonuses,
  plotCapacity,
  plotToLocal,
  plotToWorld,
  rollCrash,
  seedById,
  treeValue,
  unlocked,
  weatherFromIndex,
  weatherMutationBit,
  wormById,
  wormMutationBit,
  type FxMessage,
  type PetBonuses,
} from '@greedy/shared';
import type { FurnitureRecord, GardenTreeRecord, PlotRecord, SaplingRecord, StandRecord } from '../persistence/index.js';
import { FurnitureState, GardenTreeState, SaplingState, StandSlotState, type PlotState } from '../rooms/state/PlotState.js';
import {
  addFruit,
  addStack,
  addTree,
  countOf,
  equip,
  hasGear,
  held,
  inventoryFull,
  refreshHeld,
  removeItems,
  takeSeed,
  takeStack,
  spendCash,
  addCash,
  type Farmer,
} from './Farmer.js';
import type { RoomContext } from './RoomContext.js';

/** How close to a sapling or garden tree you must stand to work it. */
const REACH = 11;
/** How close to your plot to place things in it. */
const PLOT_REACH = 8;
const AUTO_COLLECTOR = 3;

/** What the server alone knows about a sapling. */
interface Hidden {
  crash: number;
  rolledAt: number;
}

/**
 * THE PLOTS: planting, the growth clock, the LIGHTNING, harvesting, the
 * garden row and its fruit, potions, furniture and the market stand.
 *
 * Every request is checked against the server's own position of the player,
 * their own plot, their hand and their purse. The crash point of each sapling
 * lives in `hidden` and is never written to the schema.
 */
export class PlotService {
  private readonly hidden = new Map<SaplingState, Hidden>();
  private nextId = 1;

  constructor(private readonly ctx: RoomContext) {}

  // ---------------------------------------------------------------- seats

  /** Give a farmer a plot, restoring their saplings, garden, furniture and stand. */
  load(f: Farmer, plot: PlotState): void {
    const now = this.ctx.now();
    const p = f.profile;
    plot.owner = f.sessionId;
    plot.ownerName = f.player.displayName;
    plot.ownerAvatar = f.player.avatarUrl;
    plot.likes = p.likes;
    this.applyRebirths(f, plot);
    f.plot = plot;
    f.player.plot = plot.slot;

    for (const r of p.plot.saplings) {
      const s = new SaplingState();
      s.id = this.nextId++;
      s.seed = r.seed;
      s.mut = r.mut;
      s.x = r.x;
      s.z = r.z;
      s.plantedAt = r.plantedAt;
      s.rate = r.rate;
      s.boost = r.boost;
      s.fert = r.fert;
      s.dead = r.dead;
      s.deadMult = r.deadMult;
      s.deadAt = r.deadAt;
      s.predicted = r.predicted;
      // Struck while its owner was away: dead at the moment the multiplier reached the crash point.
      if (!s.dead && multAt(s.plantedAt, s.rate, now, s.boost) >= r.crash) {
        s.dead = true;
        s.deadMult = r.crash;
        s.deadAt = s.plantedAt + ((r.crash - s.boost) / Math.max(1e-6, s.rate)) * 1000;
        p.totalStruck += 1;
      }
      this.hidden.set(s, { crash: r.crash, rolledAt: r.rolledAt });
      plot.saplings.set(String(s.id), s);
    }
    for (const r of p.plot.garden) {
      const g = new GardenTreeState();
      g.spot = r.spot;
      g.seed = r.seed;
      g.mut = r.mut;
      g.mult = r.mult;
      setFruits(g, r.fruits);
      g.nextAt = r.nextAt;
      // Fruit kept coming while they were away, up to a full tree.
      const seed = seedById(r.seed);
      if (seed) {
        const every = RARITIES[seed.rarity].fruitSeconds * 1000;
        while (g.fruits < MAX_FRUIT_PER_TREE && g.nextAt <= now) {
          setFruits(g, [...fruitsOf(g), 0]);
          g.nextAt += every;
        }
        if (g.nextAt <= now) g.nextAt = now + every;
      }
      plot.garden.set(String(g.spot), g);
    }
    for (const r of p.plot.furniture) this.addFurnitureState(plot, r);
    for (const r of p.plot.stand) this.setStand(plot, r);
  }

  /** Rebirth-dependent plot sizes. */
  applyRebirths(f: Farmer, plot: PlotState): void {
    const r = f.profile.rebirths;
    plot.rebirths = r;
    plot.capacity = plotCapacity(r);
    plot.gardenSpots = gardenCapacity(r);
    plot.hasStand = unlocked(r, 'stands');
    f.player.rebirths = r;
  }

  /** Free a plot (the owner left or moved profiles). The profile already holds its snapshot. */
  unload(plot: PlotState): void {
    plot.saplings.forEach((s) => this.hidden.delete(s));
    plot.saplings.clear();
    plot.garden.clear();
    plot.furniture.clear();
    plot.stand.clear();
    plot.owner = '';
    plot.ownerName = '';
    plot.ownerAvatar = '';
    plot.likes = 0;
    plot.capacity = 1;
    plot.gardenSpots = 3;
    plot.rebirths = 0;
    plot.hasStand = false;
  }

  /** The plot as a save writes it. */
  snapshot(plot: PlotState): PlotRecord {
    const saplings: SaplingRecord[] = [];
    plot.saplings.forEach((s) => {
      const h = this.hidden.get(s);
      saplings.push({
        seed: s.seed,
        mut: s.mut,
        x: s.x,
        z: s.z,
        plantedAt: s.plantedAt,
        rate: s.rate,
        boost: s.boost,
        crash: h?.crash ?? s.deadMult,
        fert: s.fert,
        dead: s.dead,
        deadMult: s.deadMult,
        deadAt: s.deadAt,
        rolledAt: h?.rolledAt ?? 0,
        predicted: s.predicted,
      });
    });
    const garden: GardenTreeRecord[] = [];
    plot.garden.forEach((g) => garden.push({ spot: g.spot, seed: g.seed, mut: g.mut, mult: g.mult, fruits: fruitsOf(g), nextAt: g.nextAt }));
    const furniture: FurnitureRecord[] = [];
    plot.furniture.forEach((d) => furniture.push({ kind: d.kind, x: d.x, z: d.z, rot: d.rot }));
    const stand: StandRecord[] = [];
    plot.stand.forEach((s, key) => stand.push({ slot: Number(key), seed: s.seed, mut: s.mut, mult: s.mult, price: s.price }));
    return { saplings, garden, furniture, stand };
  }

  /** Rebirth wipes the soil: every sapling goes. */
  clearSaplings(plot: PlotState): void {
    plot.saplings.forEach((s) => this.hidden.delete(s));
    plot.saplings.clear();
  }

  private bonuses(f: Farmer): PetBonuses {
    return petBonuses([f.player.pet0, f.player.pet1, f.player.pet2].filter((id) => id > 0));
  }

  /** The player's distance to a plot-local point of their plot. */
  private distanceTo(f: Farmer, x: number, z: number): number {
    if (!f.plot) return Infinity;
    const at = plotToWorld(f.plot.slot, x, z);
    return Math.hypot(f.player.x - at.x, f.player.z - at.z);
  }

  private nearOwnPlot(f: Farmer, pad = PLOT_REACH): boolean {
    if (!f.plot) return false;
    const local = plotToLocal(f.plot.slot, f.player.x, f.player.z);
    return insideLawn(local.x, local.z, pad);
  }

  // ---------------------------------------------------------------- plant

  plant(f: Farmer, wx: number, wz: number): void {
    const plot = f.plot;
    const hand = held(f);
    if (!plot || hand.kind !== 'seed' || !Number.isFinite(wx) || !Number.isFinite(wz)) return;
    const seed = seedById(hand.stack.seed);
    if (!seed) return;
    const local = plotToLocal(plot.slot, wx, wz);
    if (!insideSoil(local.x, local.z, 0.8)) {
      this.ctx.notify(f, 'bad', 'Plant your seed on your own plot! Press PLOT to go there.');
      return;
    }
    if (Math.hypot(f.player.x - wx, f.player.z - wz) > REACH) return;
    if (plot.saplings.size >= plot.capacity) {
      this.ctx.notify(f, 'bad', plot.capacity === 1 ? 'Your plot is full! Harvest your tree first.' : `Your plot is full! (${plot.capacity}/${plot.capacity})`);
      return;
    }
    let crowded = false;
    plot.saplings.forEach((s) => {
      if (Math.hypot(s.x - local.x, s.z - local.z) < PLOT.spacing) crowded = true;
    });
    if (crowded) {
      this.ctx.notify(f, 'bad', 'Too close to another tree!');
      return;
    }

    const p = f.profile;
    const bonus = this.bonuses(f);
    let crashFactor = bonus.crash;
    let speed = bonus.growth;
    let mutationLuck = 1;
    const fert = fertilizerById(p.fertilizer);
    let fertId = 0;
    if (fert && unlocked(p.rebirths, 'fertilizer') && p.rebirths >= fert.rebirth) {
      const cost = fertilizerCost(fert, seed);
      if (spendCash(f, cost)) {
        fertId = fert.id;
        crashFactor *= 1 + (fert.crash - 1) * bonus.fertilizerBoost;
        speed += fert.speed * bonus.fertilizerBoost;
        mutationLuck = fert.mutation;
      } else {
        this.ctx.notify(f, 'info', `Not enough cash for ${fert.name} - planted without it.`);
      }
    }
    let mut = hand.stack.mut;
    const worm = wormById(p.worm);
    if (worm && countOf(p.worms, worm.id) > 0) {
      takeStack(p.worms, worm.id, 1);
      crashFactor *= worm.crash;
      mut |= wormMutationBit(worm);
      if (countOf(p.worms, worm.id) === 0) p.worm = 0;
    }
    if (!takeSeed(f, seed.id, hand.stack.mut)) return;
    for (const pm of bonus.plantMutations) if (this.ctx.random() < pm.chance) mut |= pm.bit;

    const now = this.ctx.now();
    const s = new SaplingState();
    s.id = this.nextId++;
    s.seed = seed.id;
    s.mut = mut;
    s.x = Math.round(local.x * 10) / 10;
    s.z = Math.round(local.z * 10) / 10;
    s.plantedAt = now;
    s.rate = growthRate(seed, speed);
    s.fert = fertId;
    const hidden: Hidden = { crash: rollCrash(this.ctx.random(), crashFactor), rolledAt: 0 };
    // A new player's tutorial tree is never struck before 2x: their first harvest should be worth selling.
    if (p.tutorial < TUTORIAL.done) hidden.crash = Math.max(hidden.crash, 2 + this.ctx.random() * 5);
    // Planted during weather: it rolls for the weather's mutation now.
    const weather = weatherFromIndex(this.ctx.state.weather);
    if (WEATHERS[weather].mutation) {
      hidden.rolledAt = this.ctx.state.weatherStart;
      if (this.ctx.random() < WEATHERS[weather].chance * bonus.mutationLuck * mutationLuck) s.mut |= weatherMutationBit(weather);
    }
    this.hidden.set(s, hidden);
    plot.saplings.set(String(s.id), s);
    p.totalPlanted += 1;
    refreshHeld(f);
    f.player.actionCount = (f.player.actionCount + 1) & 0xffff;
    f.dirty = true;
    this.ctx.fx({ kind: 'plant', x: wx, z: wz, data: seed.id });
    this.ctx.tutorial(f, TUTORIAL.plant);
    if (s.mut) this.ctx.discover(f, seed.id, s.mut);
  }

  // -------------------------------------------------------------- harvest

  harvest(f: Farmer, id: number): void {
    const plot = f.plot;
    const s = plot?.saplings.get(String(Math.floor(id)));
    if (!plot || !s) return;
    if (this.distanceTo(f, s.x, s.z) > REACH) return;
    const seed = seedById(s.seed);
    if (!seed) return;
    if (inventoryFull(f)) {
      this.ctx.notify(f, 'bad', 'Your inventory is full! Sell something first.');
      return;
    }
    const now = this.ctx.now();
    const at = plotToWorld(plot.slot, s.x, s.z);
    const h = this.hidden.get(s);
    let mult = s.dead ? s.deadMult : multAt(s.plantedAt, s.rate, now, s.boost);
    let mut = s.mut;
    let dead = s.dead;
    if (!dead && h && mult >= h.crash) {
      // The tick has not caught it yet: it is already struck.
      this.strike(plot, s, h.crash, now);
      dead = true;
      mult = s.deadMult;
    }
    let nearMiss = false;
    if (!dead && h && h.crash - mult <= NEAR_MISS) {
      // Lightning hits as it is picked: the tree survives, charged with it.
      mut |= mutationBit(mult < CHARGED_FROM ? 'shocked' : 'charged');
      nearMiss = true;
    }
    mult = Math.min(MAX_MULT, Math.floor(mult * 100) / 100);
    const item = addTree(f, seed.id, mult, mut, dead);
    if (!item) return;
    this.hidden.delete(s);
    plot.saplings.delete(String(s.id));
    f.predictions.delete(s.id);
    const p = f.profile;
    p.totalHarvested += 1;
    if (!dead) p.bestTree = Math.max(p.bestTree, treeValue(seed, mult, mut));
    equip(f, `tree:${item.uid}`);
    f.player.actionCount = (f.player.actionCount + 1) & 0xffff;
    this.ctx.fx({ kind: nearMiss ? 'nearMiss' : 'harvest', x: at.x, z: at.z, data: seed.id });
    if (nearMiss) this.ctx.notify(f, 'gold', `So close! Lightning hit as you harvested - your tree is ${mult < CHARGED_FROM ? 'Shocked' : 'Charged'}!`);
    this.ctx.discover(f, seed.id, mut);
    this.ctx.tutorial(f, TUTORIAL.harvest);
  }

  private strike(plot: PlotState, s: SaplingState, crash: number, now: number): void {
    s.dead = true;
    s.deadMult = crash;
    s.deadAt = Math.min(now, s.plantedAt + ((crash - s.boost) / Math.max(1e-6, s.rate)) * 1000);
    s.predicted = 0;
    const owner = this.ctx.ownerOf(plot.slot);
    if (owner) {
      owner.profile.totalStruck += 1;
      owner.dirty = true;
      const seed = seedById(s.seed);
      this.ctx.notify(owner, 'bad', `Lightning struck your ${seed?.name ?? ''} Tree at ${crash.toFixed(2)}x!`);
    }
    const at = plotToWorld(plot.slot, s.x, s.z);
    this.ctx.fx({ kind: 'strike', x: at.x, z: at.z, data: plot.slot } satisfies FxMessage);
  }

  // ------------------------------------------------------------- the clock

  /** Lightning, weather mutations and fruit, for every owned plot. */
  tick(): void {
    const now = this.ctx.now();
    const weather = weatherFromIndex(this.ctx.state.weather);
    const def = WEATHERS[weather];
    const weatherBit = weatherMutationBit(weather);
    const weatherStart = this.ctx.state.weatherStart;
    for (const plot of this.ctx.state.plots) {
      if (!plot.owner) continue;
      const owner = this.ctx.ownerOf(plot.slot);
      const bonus = owner ? this.bonuses(owner) : null;
      plot.saplings.forEach((s) => {
        if (s.dead) return;
        const h = this.hidden.get(s);
        if (!h) return;
        const mult = multAt(s.plantedAt, s.rate, now, s.boost);
        if (mult >= h.crash) {
          if (bonus && bonus.lightningBlock > 0 && this.ctx.random() < bonus.lightningBlock) {
            // A Turtle took the hit: the lightning moves on, well past here.
            h.crash = Math.min(MAX_MULT, h.crash + 1 + rollCrash(this.ctx.random()));
            const at = plotToWorld(plot.slot, s.x, s.z);
            this.ctx.fx({ kind: 'blocked', x: at.x, z: at.z, data: plot.slot });
            if (owner) this.ctx.notify(owner, 'good', 'Your Turtle blocked a lightning strike!');
            return;
          }
          this.strike(plot, s, h.crash, now);
          return;
        }
        if (weatherBit && h.rolledAt !== weatherStart) {
          h.rolledAt = weatherStart;
          const fert = fertilizerById(s.fert);
          const chance = def.chance * (bonus?.mutationLuck ?? 1) * (fert?.mutation ?? 1);
          if (!(s.mut & weatherBit) && this.ctx.random() < chance) {
            s.mut |= weatherBit;
            if (owner) {
              this.ctx.notify(owner, 'gold', `Your seed became ${def.mutation ? def.mutation[0]!.toUpperCase() + def.mutation.slice(1) : ''}!`);
              this.ctx.discover(owner, s.seed, s.mut);
            }
          }
        }
      });
      plot.garden.forEach((g) => {
        if (g.fruits >= MAX_FRUIT_PER_TREE || now < g.nextAt) return;
        const seed = seedById(g.seed);
        if (!seed) return;
        g.nextAt = now + RARITIES[seed.rarity].fruitSeconds * 1000;
        let mut = 0;
        if (weatherBit && this.ctx.random() < def.chance * (bonus?.mutationLuck ?? 1)) mut |= weatherBit;
        if (owner && hasGear(owner, AUTO_COLLECTOR) && !inventoryFull(owner)) {
          addFruit(owner, g.seed, g.mut | mut, g.mult);
          if (mut) this.ctx.discover(owner, g.seed, g.mut | mut);
          return;
        }
        setFruits(g, [...fruitsOf(g), mut]);
      });
    }
  }

  // ---------------------------------------------------------------- garden

  gardenPlace(f: Farmer, spot: number): void {
    const plot = f.plot;
    const hand = held(f);
    const i = Math.floor(spot);
    if (!plot || hand.kind !== 'tree' || i < 0 || i >= plot.gardenSpots) return;
    if (hand.item.dead) {
      this.ctx.notify(f, 'bad', 'Dead trees cannot be planted in your garden. Sell it instead!');
      return;
    }
    const at = gardenSpot(i);
    if (this.distanceTo(f, at.x, at.z) > REACH) return;
    if (plot.garden.has(String(i))) {
      this.ctx.notify(f, 'bad', 'That garden spot is taken.');
      return;
    }
    const seed = seedById(hand.item.seed);
    if (!seed) return;
    const g = new GardenTreeState();
    g.spot = i;
    g.seed = hand.item.seed;
    g.mut = hand.item.mut;
    g.mult = Math.max(1, hand.item.mult);
    g.nextAt = this.ctx.now() + RARITIES[seed.rarity].fruitSeconds * 1000;
    plot.garden.set(String(i), g);
    removeItems(f, new Set([hand.item.uid]));
    const w = plotToWorld(plot.slot, at.x, at.z);
    this.ctx.fx({ kind: 'plant', x: w.x, z: w.z, data: seed.id });
    this.ctx.notify(f, 'good', `Planted your ${seed.name} Tree in the garden. It will grow fruit!`);
  }

  gardenPick(f: Farmer, spot: number): void {
    const plot = f.plot;
    const g = plot?.garden.get(String(Math.floor(spot)));
    if (!plot || !g || g.fruits === 0) return;
    const at = gardenSpot(g.spot);
    if (this.distanceTo(f, at.x, at.z) > REACH) return;
    const fruits = fruitsOf(g);
    let picked = 0;
    for (const mut of fruits) {
      if (!addFruit(f, g.seed, g.mut | mut, g.mult)) break;
      picked += 1;
      this.ctx.discover(f, g.seed, g.mut | mut);
    }
    if (picked === 0) {
      this.ctx.notify(f, 'bad', 'Your inventory is full! Sell something first.');
      return;
    }
    setFruits(g, fruits.slice(picked));
    const w = plotToWorld(plot.slot, at.x, at.z);
    this.ctx.fx({ kind: 'fruit', x: w.x, z: w.z, data: g.seed });
  }

  gardenLift(f: Farmer, spot: number): void {
    const plot = f.plot;
    const g = plot?.garden.get(String(Math.floor(spot)));
    if (!plot || !g) return;
    const at = gardenSpot(g.spot);
    if (this.distanceTo(f, at.x, at.z) > REACH) return;
    if (g.fruits > 0) this.gardenPick(f, spot);
    const item = addTree(f, g.seed, g.mult, g.mut, false);
    if (!item) {
      this.ctx.notify(f, 'bad', 'Your inventory is full! Sell something first.');
      return;
    }
    plot.garden.delete(String(g.spot));
    equip(f, `tree:${item.uid}`);
  }

  // ------------------------------------------------------------------ gear

  useGear(f: Farmer, id: number): void {
    const plot = f.plot;
    const hand = held(f);
    const s = plot?.saplings.get(String(Math.floor(id)));
    if (!plot || !s || hand.kind !== 'gear' || s.dead) return;
    if (this.distanceTo(f, s.x, s.z) > REACH) return;
    const h = this.hidden.get(s);
    if (!h) return;
    const now = this.ctx.now();
    const mult = multAt(s.plantedAt, s.rate, now, s.boost);
    if (hand.id === 1) {
      if (!takeStack(f.profile.gear, 1, 1)) return;
      // A reading it will certainly reach: somewhere in the safe part of what is left.
      const safe = mult + (h.crash - mult) * (0.55 + this.ctx.random() * 0.35);
      s.predicted = Math.max(mult, Math.floor(safe * 100) / 100);
      f.predictions.set(s.id, s.predicted);
      this.ctx.notify(f, 'gold', `The potion swirls... this tree will safely reach ${s.predicted.toFixed(2)}x!`);
    } else if (hand.id === 2) {
      if (!takeStack(f.profile.gear, 2, 1)) return;
      const target = Math.min(Math.max(mult * 1.5, mult + 1), h.crash - 0.05);
      if (target > mult) s.boost += target - mult;
      this.ctx.notify(f, 'good', `Miracle Grow! Your tree jumped to ${Math.max(mult, target).toFixed(2)}x.`);
    } else return;
    refreshHeld(f);
    f.dirty = true;
    const at = plotToWorld(plot.slot, s.x, s.z);
    this.ctx.fx({ kind: 'sparkle', x: at.x, z: at.z, data: hand.id });
  }

  // ------------------------------------------------------------- furniture

  placeFurniture(f: Farmer, kind: number, x: number, z: number, rot: number): void {
    const plot = f.plot;
    const def = furnitureById(Math.floor(kind));
    if (!plot || !def || !unlocked(f.profile.rebirths, 'furniture')) return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (plot.furniture.size >= MAX_FURNITURE) {
      this.ctx.notify(f, 'bad', `Your plot holds ${MAX_FURNITURE} pieces of furniture at most.`);
      return;
    }
    const problem = furnitureProblem(plot.furniture.values(), def.id, x, z, rot & 3);
    if (problem) {
      this.ctx.notify(f, 'bad', problem);
      return;
    }
    if (!this.nearOwnPlot(f, 12)) return;
    if (!takeStack(f.profile.furniture, def.id, 1)) return;
    this.addFurnitureState(plot, { kind: def.id, x, z, rot: rot & 3 });
    f.dirty = true;
  }

  removeFurniture(f: Farmer, id: number): void {
    const plot = f.plot;
    const d = plot?.furniture.get(String(Math.floor(id)));
    if (!plot || !d) return;
    plot.furniture.delete(String(d.id));
    addStack(f.profile.furniture, d.kind, 1);
    f.dirty = true;
  }

  private addFurnitureState(plot: PlotState, r: FurnitureRecord): void {
    const d = new FurnitureState();
    d.id = this.nextId++;
    d.kind = r.kind;
    d.x = r.x;
    d.z = r.z;
    d.rot = r.rot;
    plot.furniture.set(String(d.id), d);
  }

  // ----------------------------------------------------------------- stand

  standList(f: Farmer, uid: number, slot: number, price: number): void {
    const plot = f.plot;
    const i = Math.floor(slot);
    if (!plot || !plot.hasStand || i < 0 || i > 2) return;
    if (!this.nearOwnPlot(f, 10)) return;
    if (uid === 0) {
      const listed = plot.stand.get(String(i));
      if (!listed) return;
      if (!addFruit(f, listed.seed, listed.mut, listed.mult)) {
        this.ctx.notify(f, 'bad', 'Your inventory is full!');
        return;
      }
      plot.stand.delete(String(i));
      return;
    }
    const fruit = f.profile.fruits.find((x) => x.uid === uid);
    if (!fruit || plot.stand.has(String(i)) || !Number.isFinite(price) || price < 1) return;
    removeItems(f, new Set([fruit.uid]));
    this.setStand(plot, { slot: i, seed: fruit.seed, mut: fruit.mut, mult: fruit.mult, price: Math.min(1e30, Math.floor(price)) });
    this.ctx.notify(f, 'good', 'Listed on your Market Stand!');
  }

  standBuy(f: Farmer, slot: number, index: number): void {
    const plot = this.ctx.state.plots[Math.floor(slot)];
    const listed = plot?.stand.get(String(Math.floor(index)));
    if (!plot || !listed || plot.owner === f.sessionId) return;
    const owner = this.ctx.ownerOf(plot.slot);
    if (!owner) return;
    const at = plotToWorld(plot.slot, PLOT.stand.x, PLOT.stand.z);
    if (Math.hypot(f.player.x - at.x, f.player.z - at.z) > REACH) return;
    if (inventoryFull(f)) {
      this.ctx.notify(f, 'bad', 'Your inventory is full!');
      return;
    }
    if (!spendCash(f, listed.price)) {
      this.ctx.notify(f, 'bad', 'Not enough cash!');
      return;
    }
    addFruit(f, listed.seed, listed.mut, listed.mult);
    addCash(owner, listed.price, true);
    const name = seedById(listed.seed)?.name ?? '';
    plot.stand.delete(String(Math.floor(index)));
    this.ctx.notify(f, 'good', `Bought a ${name} fruit!`);
    this.ctx.notify(owner, 'gold', `${f.player.displayName || 'Someone'} bought your ${name} fruit!`);
    this.ctx.discover(f, listed.seed, listed.mut);
  }

  private setStand(plot: PlotState, r: StandRecord): void {
    const s = new StandSlotState();
    s.seed = r.seed;
    s.mut = r.mut;
    s.mult = r.mult;
    s.price = r.price;
    plot.stand.set(String(r.slot), s);
  }

  // ------------------------------------------------------------------ dev

  /** DEV: finish growing to a multiplier (never past the lightning). */
  devGrow(f: Farmer, target: number): void {
    const plot = f.plot;
    if (!plot) return;
    const now = this.ctx.now();
    plot.saplings.forEach((s) => {
      const h = this.hidden.get(s);
      if (!h || s.dead) return;
      const mult = multAt(s.plantedAt, s.rate, now, s.boost);
      const to = Math.min(target, h.crash - 0.05);
      if (to > mult) s.boost += to - mult;
    });
  }

  /** DEV: the crash points of a plot, for the verification scripts. */
  devCrashes(f: Farmer): number[] {
    const out: number[] = [];
    f.plot?.saplings.forEach((s) => out.push(this.hidden.get(s)?.crash ?? 0));
    return out;
  }
}

const fruitsOf = (g: GardenTreeState): number[] => [g.f0, g.f1, g.f2].slice(0, g.fruits);

const setFruits = (g: GardenTreeState, fruits: readonly number[]): void => {
  const list = fruits.slice(0, MAX_FRUIT_PER_TREE);
  g.fruits = list.length;
  g.f0 = list[0] ?? 0;
  g.f1 = list[1] ?? 0;
  g.f2 = list[2] ?? 0;
};
