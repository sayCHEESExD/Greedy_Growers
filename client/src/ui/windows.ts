import {
  BUX_PRODUCTS,
  CAN_OF_WORMS_TICKETS,
  EGGS,
  FALL_SEEDS,
  FURNITURE,
  GEAR,
  MAX_EQUIPPED_PETS,
  MUTATIONS,
  RARITIES,
  SEEDS,
  WHEEL,
  WHEEL_SPIN_TICKETS,
  WORMS,
  dayNumber,
  deadValue,
  eggById,
  fallRequests,
  farmersRequests,
  formatMoney,
  formatMult,
  formatPercent,
  fruitValue,
  mutationLabel,
  nextRebirth,
  petById,
  petBonuses,
  petsOfEgg,
  seedById,
  treeValue,
  type RequestDef,
  type SelfState,
  type StallBuyKind,
} from '@greedy/shared';
import type { IconFactory } from './IconFactory.js';
import { Modal, closeButton, el } from './Modal.js';
import type { NetLeaderEntry, BoardId } from '../net/netTypes.js';

/**
 * THE WINDOWS: Items, Rebirth, Shop, Index, Pets, Emotes, the leaderboards,
 * and every stall's counter. Each is a brown studded board with a red X, as
 * in the reference, drawn from the latest `Self` snapshot; buttons ask the
 * server, which answers with a fresh snapshot.
 */
export class Window extends Modal {
  protected readonly box: HTMLDivElement;
  protected readonly body: HTMLDivElement;
  private readonly heading: HTMLDivElement;

  constructor(container: HTMLElement, title: string, size: '' | 'wide' | 'narrow' = '') {
    super(container);
    this.box = el('div', `gg-window${size ? ` gg-window--${size}` : ''}`);
    const head = el('div', 'gg-window__head');
    this.heading = el('div', 'gg-window__title gg-outline', title);
    head.append(this.heading, closeButton('', () => this.close()));
    this.body = el('div', 'gg-window__body');
    this.box.append(head, this.body);
    this.shade.appendChild(this.box);
  }

  protected setTitle(text: string): void {
    this.heading.textContent = text;
  }
}

const button = (text: string, act: () => void, variant = '', disabled = false): HTMLButtonElement => {
  const b = el('button', `gg-btn gg-outline-thin ${variant}`, text);
  b.type = 'button';
  b.disabled = disabled;
  b.addEventListener('click', (event) => {
    event.stopPropagation();
    act();
  });
  return b;
};

const section = (title: string, ...children: HTMLElement[]): HTMLDivElement => {
  const s = el('div', 'gg-section');
  if (title) s.appendChild(el('div', 'gg-section__title gg-outline', title));
  s.append(...children);
  return s;
};

const card = (icon: string, name: string, sub: string, opts: { on?: boolean; locked?: boolean; fav?: boolean; nameColor?: string; act?: () => void } = {}): HTMLDivElement => {
  const c = el('div', `gg-card${opts.on ? ' gg-card--on' : ''}${opts.locked ? ' gg-card--locked' : ''}`);
  if (icon) {
    const img = el('img', 'gg-card__icon');
    img.src = icon;
    img.alt = '';
    img.draggable = false;
    c.appendChild(img);
  }
  const n = el('div', 'gg-card__name gg-outline-thin', name);
  if (opts.nameColor) n.style.color = opts.nameColor;
  c.appendChild(n);
  if (sub) c.appendChild(el('div', 'gg-card__sub gg-outline-thin', sub));
  if (opts.fav) c.appendChild(el('div', 'gg-card__fav', '♥'));
  if (opts.act) c.addEventListener('click', opts.act);
  return c;
};

const seedName = (id: number): string => seedById(id)?.name ?? '?';
const rarityColor = (id: number): string => {
  const seed = seedById(id);
  return seed ? RARITIES[seed.rarity].color : '#ffffff';
};

// ===================================================================== items

export type ItemTab = 'all' | 'seeds' | 'trees' | 'fruits' | 'pets' | 'eggs' | 'gear' | 'worms' | 'furniture';

export interface ItemsActions {
  equip(ref: string): void;
  favorite(uid: number): void;
  hatch(egg: number): void;
  pet(uid: number, on: boolean): void;
  furniture(kind: number): void;
}

/** The inventory (the reference's Items: tabs, a favourite heart, search). */
export class ItemsWindow extends Window {
  private self: SelfState | null = null;
  private tab: ItemTab = 'all';
  private query = '';
  private readonly tabs: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private favMode = false;

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly on: ItemsActions) {
    super(container, 'Items', 'wide');
    this.tabs = el('div', 'gg-tabs');
    this.search = el('input', 'gg-input');
    this.search.placeholder = 'search';
    this.search.addEventListener('input', () => {
      this.query = this.search.value.trim().toLowerCase();
      this.draw();
    });
    this.search.addEventListener('keydown', (event) => event.stopPropagation());
    const fav = button('♥ Favorite', () => {
      this.favMode = !this.favMode;
      fav.classList.toggle('gg-btn--gold', this.favMode);
      this.draw();
    }, 'gg-btn--small gg-btn--red');
    const top = el('div', 'gg-row');
    top.append(this.tabs, this.search, fav);
    this.grid = el('div', 'gg-grid');
    this.body.append(top, el('div', 'gg-note gg-outline-thin', 'Click an item to hold it. Favorited items are never sold by "sell my inventory".'), this.grid);
  }

  setState(self: SelfState | null): void {
    this.self = self;
    if (this.isOpen) this.draw();
  }

  show(tab: ItemTab = 'all'): void {
    this.tab = tab;
    this.open();
  }

  override refresh(): void {
    this.draw();
  }

  private draw(): void {
    const self = this.self;
    const tabs: [ItemTab, string][] = [
      ['all', 'All'],
      ['seeds', 'Seeds'],
      ['trees', 'Trees'],
      ['fruits', 'Fruits'],
      ['pets', 'Pets'],
      ['eggs', 'Eggs'],
      ['gear', 'Gear'],
      ['worms', 'Worms'],
      ['furniture', 'Furniture'],
    ];
    this.tabs.replaceChildren(
      ...tabs.map(([id, label]) => {
        const t = el('button', `gg-tab${this.tab === id ? ' gg-tab--on' : ''}`, label);
        t.type = 'button';
        t.addEventListener('click', () => {
          this.tab = id;
          this.draw();
        });
        return t;
      }),
    );
    if (!self) return;
    const cards: HTMLElement[] = [];
    const want = (tab: ItemTab): boolean => this.tab === 'all' || this.tab === tab;
    const match = (name: string): boolean => !this.query || name.toLowerCase().includes(this.query);
    if (want('seeds'))
      for (const s of self.seeds) {
        const name = `${s.mut ? `${mutationLabel(s.mut)} ` : ''}${seedName(s.seed)} Seed`;
        if (!match(name)) continue;
        const ref = `seed:${s.seed}:${s.mut}`;
        cards.push(card(this.icons.seed(s.seed, s.mut), name, `x${s.count}`, { on: self.equipped === ref, nameColor: rarityColor(s.seed), act: () => this.on.equip(ref) }));
      }
    if (want('trees'))
      for (const t of self.trees) {
        const seed = seedById(t.seed);
        if (!seed) continue;
        const name = `${t.dead ? 'Dead ' : ''}${t.mut ? `${mutationLabel(t.mut)} ` : ''}${seed.name} Tree`;
        if (!match(name)) continue;
        const value = t.dead ? deadValue(seed, t.mult, t.mut) : treeValue(seed, t.mult, t.mut);
        const ref = `tree:${t.uid}`;
        cards.push(
          card(this.icons.tree(t.seed, t.mult, t.mut, t.dead), name, `${formatMult(t.mult)} - ${formatMoney(value)}`, {
            on: self.equipped === ref,
            fav: t.fav,
            nameColor: t.dead ? '#ff8a8a' : rarityColor(t.seed),
            act: () => (this.favMode ? this.on.favorite(t.uid) : this.on.equip(ref)),
          }),
        );
      }
    if (want('fruits'))
      for (const f of self.fruits) {
        const seed = seedById(f.seed);
        if (!seed) continue;
        const name = `${f.mut ? `${mutationLabel(f.mut)} ` : ''}${seed.name}`;
        if (!match(name)) continue;
        const ref = `fruit:${f.uid}`;
        cards.push(card(this.icons.fruit(f.seed, f.mut), name, formatMoney(fruitValue(seed, f.mult, f.mut)), { on: self.equipped === ref, fav: f.fav, nameColor: rarityColor(f.seed), act: () => (this.favMode ? this.on.favorite(f.uid) : this.on.equip(ref)) }));
      }
    if (want('pets'))
      for (const p of self.pets) {
        const pet = petById(p.pet);
        if (!pet || !match(pet.name)) continue;
        const on = self.equippedPets.includes(p.uid);
        cards.push(card(this.icons.pet(p.pet), pet.name, on ? 'Equipped' : pet.blurb, { on, act: () => this.on.pet(p.uid, !on) }));
      }
    if (want('eggs'))
      for (const e of self.eggs) {
        const egg = eggById(e.id);
        if (!egg || !match(egg.name)) continue;
        cards.push(card(this.icons.egg(e.id), egg.name, `x${e.count} - click to hatch`, { act: () => this.on.hatch(e.id) }));
      }
    if (want('gear'))
      for (const g of self.gear) {
        const gear = GEAR.find((x) => x.id === g.id);
        if (!gear || !match(gear.name)) continue;
        const ref = `gear:${g.id}`;
        cards.push(card(this.icons.gear(g.id), gear.name, gear.permanent ? 'Always on' : `x${g.count}`, { on: self.equipped === ref, act: () => (gear.permanent ? undefined : this.on.equip(ref)) }));
      }
    if (want('worms'))
      for (const w of self.worms) {
        const worm = WORMS.find((x) => x.id === w.id);
        if (!worm || !match(worm.name)) continue;
        cards.push(card(this.icons.worm(w.id), worm.name, `x${w.count} - plant with a seed`, {}));
      }
    if (want('furniture'))
      for (const f of self.furniture) {
        const def = FURNITURE.find((x) => x.id === f.id);
        if (!def || !match(def.name)) continue;
        cards.push(card(this.icons.furniture(f.id), def.name, `x${f.count} - click to place`, { act: () => this.on.furniture(f.id) }));
      }
    if (cards.length === 0) cards.push(el('div', 'gg-note gg-outline-thin', 'Nothing here yet.'));
    this.grid.replaceChildren(...cards);
  }
}

// =================================================================== rebirth

const UNLOCK_ICON: Readonly<Record<string, string>> = {
  fertilizer: '🧪',
  plot: '⬆️',
  index: '📗',
  pets: '🐾',
  farmers: '🧺',
  fall: '🍂',
  furniture: '🪑',
  stands: '🏪',
  wheel: '🎡',
  gear: '🛠️',
  worms: '🪱',
  garden: '🌳',
};

/** The reference's Rebirth board: what the next rebirth unlocks, a cash bar, the button and the warning. */
export class RebirthWindow extends Window {
  private self: SelfState | null = null;

  constructor(container: HTMLElement, private readonly onRebirth: () => void) {
    super(container, 'REBIRTH', 'narrow');
  }

  setState(self: SelfState | null): void {
    this.self = self;
    if (this.isOpen) this.refresh();
  }

  override refresh(): void {
    const self = this.self;
    if (!self) return;
    const next = nextRebirth(self.rebirths);
    if (!next) {
      this.body.replaceChildren(section('', el('div', 'gg-yellow gg-outline', `You have reached Rebirth ${self.rebirths} - the highest there is!`)));
      return;
    }
    const unlocks = el('div', 'gg-rebirth__unlocks');
    for (const u of next.unlocks) {
      const tile = el('div', 'gg-rebirth__unlock gg-outline-thin');
      tile.append(el('span', '', UNLOCK_ICON[u.key] ?? '⭐'), el('span', '', u.name));
      unlocks.appendChild(tile);
    }
    const bar = el('div', 'gg-bar');
    const fill = el('div', 'gg-bar__fill');
    fill.style.width = `${Math.min(100, (self.cash / next.cost) * 100)}%`;
    bar.append(fill, el('div', 'gg-bar__text gg-outline', `${formatMoney(self.cash)} / ${formatMoney(next.cost)}`));
    const go = button('REBIRTH', () => this.onRebirth(), self.cash >= next.cost ? '' : 'gg-btn--grey', self.cash < next.cost);
    const centred = el('div', 'gg-row');
    centred.style.justifyContent = 'center';
    centred.appendChild(go);
    this.body.replaceChildren(
      el('div', 'gg-section__title gg-yellow gg-outline', `Rebirth ${next.level} Unlocks:`),
      unlocks,
      el('div', 'gg-section__title gg-yellow gg-outline', 'Requirements:'),
      bar,
      centred,
      el('div', 'gg-warn gg-outline-thin', '[WARNING] You will lose all Cash, Seeds and carried Trees when you rebirth'),
      el('div', 'gg-note gg-outline-thin', 'Your garden, fruit, pets, Tickets and everything you unlocked stay with you.'),
    );
  }
}

// ====================================================================== shop

export interface ShopActions {
  buy(sku: string): Promise<string>;
  redeem(code: string): void;
}

/** The Shop: the Majestic Egg banner (the reference's odds), weather, Tickets and codes. */
export class ShopWindow extends Window {
  private status = '';

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly on: ShopActions) {
    super(container, 'SHOP', 'wide');
  }

  override refresh(): void {
    const buy = (sku: string, label: string): HTMLButtonElement =>
      button(label, () => {
        this.status = 'Opening the Gems store...';
        this.refresh();
        void this.on.buy(sku).then((text) => {
          this.status = text;
          if (this.isOpen) this.refresh();
        });
      }, 'gg-btn--small');
    const egg = el('div', 'gg-banner');
    const eggImg = el('img', 'gg-card__icon');
    eggImg.src = this.icons.egg(6);
    const odds = el('div', 'gg-odds');
    for (const pet of petsOfEgg(6)) {
      const o = el('div', 'gg-odd gg-outline-thin');
      const img = el('img', 'gg-card__icon');
      img.src = this.icons.pet(pet.id);
      img.style.width = 'calc(70 * var(--u))';
      img.style.height = 'calc(70 * var(--u))';
      o.append(el('div', '', formatPercent(pet.chance)), img, el('div', '', pet.name));
      odds.appendChild(o);
    }
    const eggButtons = el('div', 'gg-row');
    for (const p of BUX_PRODUCTS.filter((x) => x.section === 'eggs')) eggButtons.appendChild(buy(p.sku, p.name));
    egg.append(eggImg, el('div', 'gg-section__title gg-outline', 'MAJESTIC EGG'), odds, eggButtons);
    const weather = el('div', 'gg-banner gg-banner--green');
    for (const p of BUX_PRODUCTS.filter((x) => x.section === 'weather')) {
      const box = el('div', 'gg-odd gg-outline-thin');
      box.append(el('div', 'gg-card__name', p.name), el('div', 'gg-card__sub', p.blurb), buy(p.sku, 'Buy'));
      weather.appendChild(box);
    }
    const tickets = el('div', 'gg-banner gg-banner--gold');
    for (const p of BUX_PRODUCTS.filter((x) => x.section === 'tickets')) {
      const box = el('div', 'gg-odd gg-outline-thin');
      box.append(el('div', 'gg-card__name', p.name), el('div', 'gg-card__sub', p.blurb), buy(p.sku, 'Buy'));
      tickets.appendChild(box);
    }
    const code = el('input', 'gg-input');
    code.placeholder = 'Enter a code';
    code.addEventListener('keydown', (event) => event.stopPropagation());
    const codes = el('div', 'gg-row');
    codes.append(code, button('Redeem', () => {
      if (code.value.trim()) this.on.redeem(code.value);
      code.value = '';
    }, 'gg-btn--small gg-btn--blue'));
    this.body.replaceChildren(
      section('', egg),
      section('Weather Events', weather),
      section('Tickets', tickets),
      section('Codes', codes),
      el('div', 'gg-note gg-outline-thin', this.status || 'Purchases use Gems and arrive in a few seconds.'),
    );
  }
}

// ===================================================================== index

/** The Index (Rebirth 1): every seed and mutation discovered, and the Tickets they pay. */
export class IndexWindow extends Window {
  private self: SelfState | null = null;

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly onClaim: () => void) {
    super(container, 'INDEX', 'wide');
  }

  setState(self: SelfState | null): void {
    this.self = self;
    if (this.isOpen) this.refresh();
  }

  override refresh(): void {
    const self = this.self;
    if (!self) return;
    let pending = 0;
    const seeds = el('div', 'gg-grid');
    let found = 0;
    for (const seed of SEEDS) {
      const bit = 2 ** (seed.id - 1);
      const has = Math.floor(self.discoveredSeeds / bit) % 2 === 1;
      const claimed = Math.floor(self.claimedSeeds / bit) % 2 === 1;
      if (has) found += 1;
      if (has && !claimed) pending += RARITIES[seed.rarity].indexTickets;
      seeds.appendChild(
        card(has ? this.icons.tree(seed.id, 8, 0, false) : '', has ? seed.name : '???', `${RARITIES[seed.rarity].name}${has && !claimed ? ` - +${RARITIES[seed.rarity].indexTickets} 🎟️` : ''}`, {
          locked: !has,
          nameColor: RARITIES[seed.rarity].color,
        }),
      );
    }
    const muts = el('div', 'gg-grid');
    for (const m of MUTATIONS) {
      const has = (self.discoveredMutations & m.bit) !== 0;
      const claimed = (self.claimedMutations & m.bit) !== 0;
      if (has && !claimed) pending += m.indexTickets;
      muts.appendChild(card('', has ? m.name : '???', has ? `x${m.multiplier}${claimed ? '' : ` - +${m.indexTickets} 🎟️`}` : m.source, { locked: !has, nameColor: m.color }));
    }
    const claim = button(pending > 0 ? `Claim ${pending} Tickets` : 'Nothing to claim', () => this.onClaim(), pending > 0 ? 'gg-btn--gold' : 'gg-btn--grey', pending === 0);
    this.body.replaceChildren(section(`Seeds (${found}/${SEEDS.length})`, seeds), section('Mutations', muts), claim);
  }
}

// ====================================================================== pets

export interface PetsActions {
  hatch(egg: number): void;
  pet(uid: number, on: boolean): void;
}

/** Your pets: three out at once, their passives, and eggs to hatch. */
export class PetsWindow extends Window {
  private self: SelfState | null = null;

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly on: PetsActions) {
    super(container, 'PETS', 'wide');
  }

  setState(self: SelfState | null): void {
    this.self = self;
    if (this.isOpen) this.refresh();
  }

  override refresh(): void {
    const self = this.self;
    if (!self) return;
    const ids = self.equippedPets.map((uid) => self.pets.find((p) => p.uid === uid)?.pet ?? 0);
    const b = petBonuses(ids);
    const summary: string[] = [];
    if (b.growth) summary.push(`+${Math.round(b.growth * 100)}% growth`);
    if (b.sell) summary.push(`+${Math.round(b.sell * 100)}% sell`);
    if (b.mutationLuck > 1) summary.push(`x${b.mutationLuck.toFixed(2)} mutation luck`);
    if (b.lightningBlock) summary.push(`${Math.round(b.lightningBlock * 100)}% lightning block`);
    if (b.crash > 1) summary.push(`x${b.crash.toFixed(2)} lightning delay`);
    const equipped = el('div', 'gg-grid');
    const owned = el('div', 'gg-grid');
    for (const p of self.pets) {
      const pet = petById(p.pet);
      if (!pet) continue;
      const on = self.equippedPets.includes(p.uid);
      (on ? equipped : owned).appendChild(card(this.icons.pet(p.pet), pet.name, pet.blurb, { on, act: () => this.on.pet(p.uid, !on) }));
    }
    const eggs = el('div', 'gg-grid');
    for (const e of self.eggs) {
      const egg = eggById(e.id);
      if (egg) eggs.appendChild(card(this.icons.egg(e.id), egg.name, `x${e.count} - Hatch!`, { act: () => this.on.hatch(e.id) }));
    }
    this.body.replaceChildren(
      section(`Equipped (${self.equippedPets.length}/${MAX_EQUIPPED_PETS})`, equipped, el('div', 'gg-note gg-outline-thin', summary.join(' - ') || 'Equip pets to get their passives.')),
      section('Your Pets', owned.childElementCount ? owned : el('div', 'gg-note gg-outline-thin', self.rebirths >= 2 ? 'Buy eggs at the Pets stall with Tickets.' : 'The Pets stall unlocks at Rebirth 2.')),
      ...(eggs.childElementCount ? [section('Eggs', eggs)] : []),
    );
  }
}

// =============================================================== leaderboard

export class LeaderboardWindow extends Window {
  private board: BoardId = 'cash';

  constructor(container: HTMLElement, private readonly rows: (board: BoardId) => NetLeaderEntry[]) {
    super(container, 'LEADERBOARD', 'narrow');
  }

  override refresh(): void {
    const tabs = el('div', 'gg-tabs');
    const names: [BoardId, string][] = [
      ['cash', 'Cash'],
      ['earned', 'Total Earned'],
      ['rebirths', 'Rebirths'],
      ['best', 'Biggest Tree'],
    ];
    for (const [id, label] of names) {
      const t = el('button', `gg-tab${this.board === id ? ' gg-tab--on' : ''}`, label);
      t.type = 'button';
      t.addEventListener('click', () => {
        this.board = id;
        this.refresh();
      });
      tabs.appendChild(t);
    }
    const list = el('div', 'gg-section');
    const rows = this.rows(this.board);
    rows.forEach((row, i) => {
      const r = el('div', 'gg-row gg-outline-thin');
      r.style.justifyContent = 'space-between';
      r.append(el('span', '', `#${i + 1} ${row.name || 'Farmer'}`), el('span', 'gg-yellow', this.board === 'rebirths' ? String(row.value) : formatMoney(row.value)));
      list.appendChild(r);
    });
    if (rows.length === 0) list.appendChild(el('div', 'gg-note', 'No one yet - be the first!'));
    this.body.replaceChildren(tabs, list);
  }
}

// ==================================================================== stalls

export interface StallActions {
  buy(kind: StallBuyKind, id: number): void;
  turnIn(board: 'farmers' | 'fall', index: number): void;
}

/** One stall's counter: what it sells or wants, for Tickets or Tokens. */
export class StallWindow extends Window {
  private self: SelfState | null = null;
  private stall: 'pets' | 'farmers' | 'fall' | 'furniture' | 'gear' | 'worms' | 'wheel' | 'stands' = 'pets';
  private nowFn: () => number = () => Date.now();

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly on: StallActions) {
    super(container, 'STALL', 'wide');
  }

  show(stall: StallWindow['stall'], self: SelfState | null, now: () => number): void {
    this.stall = stall;
    this.self = self;
    this.nowFn = now;
    this.open();
    this.refresh();
  }

  setState(self: SelfState | null): void {
    this.self = self;
    if (this.isOpen) this.refresh();
  }

  get which(): string {
    return this.stall;
  }

  override refresh(): void {
    const self = this.self;
    if (!self) return;
    const tickets = el('div', 'gg-yellow gg-outline', `🎟️ ${self.tickets.toLocaleString('en-US')} Tickets`);
    switch (this.stall) {
      case 'pets': {
        this.setTitle('PETS');
        const grid = el('div', 'gg-grid');
        for (const egg of EGGS.filter((e) => !e.special)) {
          const pets = petsOfEgg(egg.id).map((p) => `${p.name} ${formatPercent(p.chance)}`).join(', ');
          const c = card(this.icons.egg(egg.id), egg.name, `${egg.tickets} Tickets`, { act: () => this.on.buy('egg', egg.id) });
          c.appendChild(el('div', 'gg-card__sub gg-outline-thin', pets));
          grid.appendChild(c);
        }
        this.body.replaceChildren(tickets, grid, el('div', 'gg-note gg-outline-thin', 'Hatch eggs from your Pets menu. Three pets can follow you at once.'));
        return;
      }
      case 'farmers':
      case 'fall': {
        const fall = this.stall === 'fall';
        this.setTitle(fall ? 'FALL HARVEST' : 'FARMERS MARKET');
        const day = dayNumber(this.nowFn());
        const requests = fall ? fallRequests(day) : farmersRequests(day);
        const done = self.requestDay === day ? (fall ? self.fallDone : self.farmersDone) : [false, false, false];
        const list = el('div', 'gg-grid');
        requests.forEach((r: RequestDef, i: number) => {
          const label = r.kind === 'fruit' ? `${r.count} ${seedName(r.seed)} fruit` : `${seedName(r.seed)} Tree ${r.minMult}x+`;
          const reward = fall ? `${r.reward} Harvest Tokens` : `${r.reward} Tickets`;
          const icon = r.kind === 'fruit' ? this.icons.fruit(r.seed) : this.icons.tree(r.seed, r.minMult, 0, false);
          list.appendChild(card(icon, label, done[i] ? 'Done! Come back tomorrow.' : `Reward: ${reward}`, { on: done[i], act: () => (done[i] ? undefined : this.on.turnIn(fall ? 'fall' : 'farmers', i)) }));
        });
        const parts: HTMLElement[] = [fall ? el('div', 'gg-yellow gg-outline', `🍂 ${self.tokens} Harvest Tokens`) : tickets, section(fall ? "Today's Harvest Requests" : "Today's Orders", list)];
        if (fall) {
          const shop = el('div', 'gg-grid');
          for (const seed of FALL_SEEDS) shop.appendChild(card(this.icons.seed(seed.id), `${seed.name} Seed`, `${seed.tokens} Tokens - ${RARITIES[seed.rarity].name}`, { nameColor: RARITIES[seed.rarity].color, act: () => this.on.buy('fallSeed', seed.id) }));
          parts.push(section('Fall Seeds', shop));
        }
        parts.push(el('div', 'gg-note gg-outline-thin', 'New requests every day. Favorited items are never handed in.'));
        this.body.replaceChildren(...parts);
        return;
      }
      case 'furniture': {
        this.setTitle('FURNITURE');
        const grid = el('div', 'gg-grid');
        for (const f of FURNITURE) grid.appendChild(card(this.icons.furniture(f.id), f.name, `${f.tickets} Tickets`, { act: () => this.on.buy('furniture', f.id) }));
        this.body.replaceChildren(tickets, grid, el('div', 'gg-note gg-outline-thin', 'Place furniture on your lawn from your Items (Furniture tab).'));
        return;
      }
      case 'gear': {
        this.setTitle('GEAR SHOP');
        const grid = el('div', 'gg-grid');
        for (const g of GEAR) {
          const owned = g.permanent && self.gear.some((x) => x.id === g.id);
          grid.appendChild(card(this.icons.gear(g.id), g.name, owned ? 'Owned' : `${g.tickets} Tickets - ${g.blurb}`, { on: owned, act: () => (owned ? undefined : this.on.buy('gear', g.id)) }));
        }
        this.body.replaceChildren(tickets, grid);
        return;
      }
      case 'worms': {
        this.setTitle('WORMS');
        const odds = el('div', 'gg-odds');
        const total = WORMS.reduce((s, w) => s + w.weight, 0);
        for (const w of WORMS) {
          const o = el('div', 'gg-odd gg-outline-thin');
          const img = el('img', 'gg-card__icon');
          img.src = this.icons.worm(w.id);
          o.append(img, el('div', '', w.name), el('div', '', formatPercent((w.weight / total) * 100)));
          odds.appendChild(o);
        }
        this.body.replaceChildren(
          tickets,
          section('Can of Worms', odds, button(`Open a Can (${CAN_OF_WORMS_TICKETS} Tickets)`, () => this.on.buy('can', 0), 'gg-btn--gold')),
          el('div', 'gg-note gg-outline-thin', 'Plant a worm with a seed: the tree gets the worm\'s mutation and lightning comes 25% later.'),
        );
        return;
      }
      case 'wheel': {
        this.setTitle('LUCKY WHEEL');
        const odds = el('div', 'gg-odds');
        const total = WHEEL.reduce((s, w) => s + w.weight, 0);
        for (const s of WHEEL) {
          const o = el('div', 'gg-odd gg-outline-thin');
          o.style.background = s.color;
          o.append(el('div', '', s.label), el('div', '', formatPercent((s.weight / total) * 100)));
          odds.appendChild(o);
        }
        this.body.replaceChildren(tickets, odds, button(`SPIN (${WHEEL_SPIN_TICKETS} Tickets)`, () => this.on.buy('spin', 0), 'gg-btn--red'));
        return;
      }
      case 'stands': {
        this.setTitle('MARKET STANDS');
        this.body.replaceChildren(
          section(
            'Sell fruit to other players',
            el('div', 'gg-note gg-outline-thin', 'Your plot now has a Market Stand by its front corner. Stand next to it and list fruit from your inventory at your own price - other players buy from it, and the cash comes straight to you.'),
          ),
        );
        return;
      }
    }
  }
}

// =================================================================== reveal

/** The hatch / prize reveal: a big picture and a title in the middle of the screen. */
export class Reveal {
  private readonly root: HTMLDivElement;
  private readonly img: HTMLImageElement;
  private readonly title: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private timer = 0;

  constructor(container: HTMLElement) {
    this.root = el('div', 'gg-reveal gg-font');
    this.root.hidden = true;
    this.img = el('img', 'gg-reveal__img');
    this.title = el('div', 'gg-reveal__title gg-outline');
    this.sub = el('div', 'gg-reveal__sub gg-outline-thin');
    this.root.append(this.img, this.title, this.sub);
    this.root.addEventListener('pointerdown', () => this.hide());
    container.appendChild(this.root);
  }

  show(img: string, title: string, sub: string, color = '#ffffff'): void {
    this.img.src = img;
    this.img.hidden = !img;
    this.title.textContent = title;
    this.title.style.color = color;
    this.sub.textContent = sub;
    this.root.hidden = false;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), 3200);
  }

  hide(): void {
    this.root.hidden = true;
  }
}

// ================================================================= dialogue

export interface DialogueOption {
  readonly text: string;
  readonly action: () => void;
}

/**
 * A KEEPER'S CONVERSATION: their name, their line, and numbered choices (the
 * number keys pick them too). One choice per opening: whichever way it is
 * made - click, tap, key - it fires once and the card is gone.
 */
export class Dialogue {
  private readonly root: HTMLDivElement;
  private readonly choices: HTMLButtonElement[] = [];
  private actions: (() => void)[] = [];
  npc = '';

  constructor(container: HTMLElement) {
    this.root = el('div', 'gg-dialogue gg-font');
    this.root.hidden = true;
    // Clicks on the card never reach the world (no pick, no camera lock).
    this.root.addEventListener('pointerdown', (event) => event.stopPropagation());
    container.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(npc: string, options: readonly DialogueOption[], who = '', line = ''): void {
    this.npc = npc;
    this.actions = options.map((option) => option.action);
    this.choices.length = 0;
    const head: HTMLElement[] = [];
    if (who) head.push(el('div', 'gg-dialogue__who gg-outline-thin', who));
    if (line) head.push(el('div', 'gg-dialogue__line gg-outline-thin', line));
    options.forEach((option, i) => {
      const b = el('button', 'gg-dialogue__opt gg-outline-thin');
      b.type = 'button';
      b.append(el('span', 'gg-dialogue__num', `${i + 1}`), document.createTextNode(option.text));
      b.addEventListener('click', (event) => {
        event.stopPropagation();
        this.choose(i);
      });
      this.choices.push(b);
    });
    this.root.replaceChildren(...head, ...this.choices);
    this.root.hidden = false;
  }

  /** Make choice `index` (a click, a tap or its number key). True if there was one. */
  choose(index: number): boolean {
    if (!this.isOpen) return false;
    const action = this.actions[index];
    if (!action) return false;
    // Spent before it runs: a second event for the same press finds nothing to do.
    this.actions = [];
    action();
    return true;
  }

  close(): void {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.choices.length = 0;
    this.actions = [];
    this.npc = '';
  }
}

// ==================================================================== stand

export interface StandActions {
  list(uid: number, slot: number, price: number): void;
  buy(plot: number, slot: number): void;
}

/** A plot's Market Stand: the owner lists fruit; a visitor buys it. */
export class StandWindow extends Window {
  private self: SelfState | null = null;
  private plot = -1;
  private mine = false;
  private listing: { slot: number; seed: number; mut: number; mult: number; price: number }[] = [];

  constructor(container: HTMLElement, private readonly icons: IconFactory, private readonly on: StandActions) {
    super(container, 'MARKET STAND');
  }

  show(plot: number, mine: boolean, listing: StandWindow['listing'], self: SelfState | null): void {
    this.plot = plot;
    this.mine = mine;
    this.listing = listing;
    this.self = self;
    this.open();
    this.refresh();
  }

  update(listing: StandWindow['listing'], self: SelfState | null): void {
    this.listing = listing;
    this.self = self;
    if (this.isOpen) this.refresh();
  }

  override refresh(): void {
    const slots = el('div', 'gg-grid');
    for (let i = 0; i < 3; i += 1) {
      const l = this.listing.find((x) => x.slot === i);
      if (l) {
        const seed = seedById(l.seed);
        const name = `${l.mut ? `${mutationLabel(l.mut)} ` : ''}${seed?.name ?? ''}`;
        slots.appendChild(card(this.icons.fruit(l.seed, l.mut), name, formatMoney(l.price), { act: () => (this.mine ? this.on.list(0, i, 0) : this.on.buy(this.plot, i)) }));
      } else slots.appendChild(card('', 'Empty', this.mine ? 'List a fruit below' : '', { locked: true }));
    }
    const parts: HTMLElement[] = [section(this.mine ? 'Your stand (click to take back)' : 'For sale (click to buy)', slots)];
    if (this.mine && this.self) {
      const price = el('input', 'gg-input');
      price.type = 'number';
      price.min = '1';
      price.placeholder = 'Price';
      price.addEventListener('keydown', (event) => event.stopPropagation());
      const fruits = el('div', 'gg-grid');
      for (const f of this.self.fruits.slice(0, 40)) {
        const seed = seedById(f.seed);
        if (!seed) continue;
        const worth = fruitValue(seed, f.mult, f.mut);
        fruits.appendChild(
          card(this.icons.fruit(f.seed, f.mut), seed.name, `worth ${formatMoney(worth)}`, {
            act: () => {
              const free = [0, 1, 2].find((s) => !this.listing.some((x) => x.slot === s));
              if (free === undefined) return;
              const value = Number(price.value) > 0 ? Number(price.value) : Math.ceil(worth * 1.5);
              this.on.list(f.uid, free, value);
            },
          }),
        );
      }
      parts.push(section('List fruit (enter a price, then click a fruit)', price, fruits));
    }
    this.body.replaceChildren(...parts);
  }
}
