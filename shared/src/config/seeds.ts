/**
 * THE SEEDS: what floats down the river, what it costs, how rare it is, how
 * fast its tree grows and what its fruit is worth.
 *
 * Prices, rarities and river odds are the original game's (Update 1.2 seed
 * list: 20 seeds over eight rarities, "1 in N" per spawn). Growth speeds and
 * fruit timers are not published; they are calibrated against the reference
 * video (a Common tree climbs about 0.6x per second) and the one figure the
 * guides give (a Coconut regrows fruit in about two minutes).
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'celestial' | 'secret' | 'divine';

export interface RarityDef {
  readonly id: Rarity;
  readonly name: string;
  /** Label colour (river billboards, item cards, the Index). */
  readonly color: string;
  readonly dark: string;
  /** Growth, multiplier per second, before speed bonuses. Rarer trees grow slower. */
  readonly growth: number;
  /** Seconds between fruits on a garden tree. */
  readonly fruitSeconds: number;
  /** Tickets for discovering a seed of this rarity in the Index. */
  readonly indexTickets: number;
}

export const RARITIES: Readonly<Record<Rarity, RarityDef>> = {
  common: { id: 'common', name: 'Common', color: '#d9d9d9', dark: '#6b6b6b', growth: 0.6, fruitSeconds: 30, indexTickets: 10 },
  rare: { id: 'rare', name: 'Rare', color: '#4aa3ff', dark: '#1d5fb0', growth: 0.45, fruitSeconds: 45, indexTickets: 25 },
  epic: { id: 'epic', name: 'Epic', color: '#c45cff', dark: '#6f23a8', growth: 0.32, fruitSeconds: 75, indexTickets: 50 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ff3b3b', dark: '#9c1414', growth: 0.22, fruitSeconds: 120, indexTickets: 100 },
  mythic: { id: 'mythic', name: 'Mythic', color: '#ffe23d', dark: '#a38a00', growth: 0.15, fruitSeconds: 180, indexTickets: 200 },
  celestial: { id: 'celestial', name: 'Celestial', color: '#5df2ff', dark: '#108a96', growth: 0.11, fruitSeconds: 240, indexTickets: 300 },
  secret: { id: 'secret', name: 'Secret', color: '#ff7ad9', dark: '#a12a85', growth: 0.08, fruitSeconds: 300, indexTickets: 400 },
  divine: { id: 'divine', name: 'Divine', color: '#ffffff', dark: '#3a3a3a', growth: 0.06, fruitSeconds: 360, indexTickets: 500 },
};

export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'celestial', 'secret', 'divine'];

/** How a tree of this seed is built: the canopy family. */
export type TreeLook =
  | 'oak'
  | 'pine'
  | 'fruit'
  | 'blossom'
  | 'palm'
  | 'star'
  | 'glow'
  | 'bloom'
  | 'magic'
  | 'pizza'
  | 'crystal'
  | 'void'
  | 'maple'
  | 'pumpkin'
  | 'sunflower';

export interface SeedDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly rarity: Rarity;
  /** River price. 0 = FREE. */
  readonly price: number;
  /**
   * What the tree is worth at 1.00x: the price, or $5 for the free Oak (the
   * video: an Oak at 1.16x shows $5, at 3.97x $19).
   */
  readonly base: number;
  /** River odds: one in this many spawns. 0 = never on the river (event seeds). */
  readonly oneIn: number;
  readonly look: TreeLook;
  /** Trunk, canopy, fruit and accent colours. */
  readonly trunk: number;
  readonly leaf: number;
  readonly fruit: number;
  readonly accent: number;
  /** The seed block's colour (small cube on the river, in hand). */
  readonly seedColor: number;
  /** Fall Harvest seeds: bought with Harvest Tokens. */
  readonly tokens?: number;
}

const s = (
  id: number,
  key: string,
  name: string,
  rarity: Rarity,
  price: number,
  oneIn: number,
  look: TreeLook,
  colors: { trunk: number; leaf: number; fruit: number; accent?: number; seed: number },
  base = price,
  tokens?: number,
): SeedDef => ({
  id,
  key,
  name,
  rarity,
  price,
  base,
  oneIn,
  look,
  trunk: colors.trunk,
  leaf: colors.leaf,
  fruit: colors.fruit,
  accent: colors.accent ?? colors.leaf,
  seedColor: colors.seed,
  ...(tokens !== undefined ? { tokens } : {}),
});

const BARK = 0x7a4f2a;
const DARK_BARK = 0x5a3a1e;

export const SEEDS: readonly SeedDef[] = [
  s(1, 'oak', 'Oak', 'common', 0, 5, 'oak', { trunk: BARK, leaf: 0x3fae3a, fruit: 0x9b6a2f, seed: 0x8a5a2b }, 5),
  s(2, 'pine', 'Pine', 'common', 25, 5, 'pine', { trunk: DARK_BARK, leaf: 0x1f7a45, fruit: 0x8a5a2b, seed: 0x6b4a2a }),
  s(3, 'apple', 'Apple', 'rare', 200, 9, 'fruit', { trunk: BARK, leaf: 0x46b83c, fruit: 0xe02b2b, seed: 0xc81e1e }),
  s(4, 'peach', 'Peach', 'rare', 350, 9, 'fruit', { trunk: BARK, leaf: 0x55c04a, fruit: 0xff9a6b, seed: 0xe8584a }),
  s(5, 'fig', 'Fig', 'rare', 500, 9, 'fruit', { trunk: DARK_BARK, leaf: 0x3d9c3a, fruit: 0x7a2a6e, seed: 0x8a2f72 }),
  s(6, 'orange', 'Orange', 'epic', 10_000, 15, 'fruit', { trunk: BARK, leaf: 0x2f9e3a, fruit: 0xff8c1a, seed: 0xe8701a }),
  s(7, 'lemon', 'Lemon', 'epic', 15_000, 15, 'fruit', { trunk: BARK, leaf: 0x48b03a, fruit: 0xfff04a, seed: 0xe8d22a }),
  s(8, 'avocado', 'Avocado', 'epic', 20_000, 15, 'fruit', { trunk: DARK_BARK, leaf: 0x2c8a34, fruit: 0x4c7a1e, accent: 0xc9d77a, seed: 0x3a5a1a }),
  s(9, 'cherry', 'Cherry', 'legendary', 2_500_000, 120, 'blossom', { trunk: DARK_BARK, leaf: 0xff9ccf, fruit: 0xc8102e, accent: 0xffc4e2, seed: 0xb0102a }),
  s(10, 'mango', 'Mango', 'legendary', 5_000_000, 120, 'fruit', { trunk: BARK, leaf: 0x2f9a3a, fruit: 0xffb020, accent: 0xff6a2a, seed: 0xe8601a }),
  s(11, 'coconut', 'Coconut', 'legendary', 10_000_000, 120, 'palm', { trunk: 0xa0743d, leaf: 0x37b24a, fruit: 0x6b4423, seed: 0x5a3a1e }),
  s(12, 'banana', 'Banana', 'mythic', 3e9, 300, 'palm', { trunk: 0x8a9a3a, leaf: 0x4cc94a, fruit: 0xffe23d, seed: 0xf2d22a }),
  s(13, 'starfruit', 'Starfruit', 'mythic', 4.5e9, 300, 'star', { trunk: BARK, leaf: 0x7ad84a, fruit: 0xffd23d, accent: 0xfff4a0, seed: 0xf2c21a }),
  s(14, 'dragonfruit', 'Dragon Fruit', 'mythic', 7e9, 300, 'palm', { trunk: 0x3f8a3a, leaf: 0x2fae5a, fruit: 0xff2f8a, accent: 0xb6ff4a, seed: 0xe01a7a }),
  s(15, 'glowing', 'Glowing', 'celestial', 5e11, 400, 'glow', { trunk: 0x2a3a6a, leaf: 0x5df2ff, fruit: 0xb6fbff, accent: 0x2ad2ff, seed: 0x2ad2ff }),
  s(16, 'blooming', 'Blooming', 'celestial', 7.5e11, 400, 'bloom', { trunk: 0x6a8a3a, leaf: 0x7fe07a, fruit: 0xff6ad5, accent: 0xffe14a, seed: 0xff6ad5 }),
  s(17, 'magic', 'Magic', 'secret', 5e14, 660, 'magic', { trunk: 0x3a1a5a, leaf: 0x9b4dff, fruit: 0xff9cf5, accent: 0x5df2ff, seed: 0x9b4dff }),
  s(18, 'pizza', 'Pizza', 'secret', 8.5e14, 660, 'pizza', { trunk: 0xc98a3a, leaf: 0xffcf4a, fruit: 0xd8321e, accent: 0xff9a2a, seed: 0xe8a23a }),
  s(19, 'diamond', 'Diamond', 'divine', 1e18, 1000, 'crystal', { trunk: 0x7aa0b8, leaf: 0x9ff4ff, fruit: 0xe6ffff, accent: 0x4ad8ff, seed: 0x7ae8ff }),
  s(20, 'void', 'Void', 'divine', 1.75e18, 1000, 'void', { trunk: 0x1a0a2a, leaf: 0x2a0a4a, fruit: 0xb04dff, accent: 0xff3df2, seed: 0x3a0a5a }),
  // Fall Harvest (Rebirth 2): bought from the farm stand with Harvest Tokens, never on the river.
  s(21, 'maple', 'Maple', 'epic', 0, 0, 'maple', { trunk: DARK_BARK, leaf: 0xe2481e, fruit: 0xffa21a, accent: 0xffc23a, seed: 0xc8401a }, 50_000, 40),
  s(22, 'pumpkin', 'Pumpkin', 'legendary', 0, 0, 'pumpkin', { trunk: 0x4f7a2a, leaf: 0x5aa83a, fruit: 0xff8a1a, accent: 0xffb24a, seed: 0xf07a1a }, 8_000_000, 120),
  s(23, 'sunflower', 'Sunflower', 'mythic', 0, 0, 'sunflower', { trunk: 0x5a9a3a, leaf: 0x4cb84a, fruit: 0xffd21a, accent: 0x6b3a1a, seed: 0xe8c21a }, 5e9, 300),
];

const BY_ID = new Map(SEEDS.map((seed) => [seed.id, seed]));

export const seedById = (id: number): SeedDef | undefined => BY_ID.get(id);

/** The seeds the river can carry, in price order. */
export const RIVER_SEEDS: readonly SeedDef[] = SEEDS.filter((seed) => seed.oneIn > 0);

export const FALL_SEEDS: readonly SeedDef[] = SEEDS.filter((seed) => seed.tokens !== undefined);

export const rarityOf = (seed: SeedDef): RarityDef => RARITIES[seed.rarity];

export const rarityRank = (rarity: Rarity): number => RARITY_ORDER.indexOf(rarity);
